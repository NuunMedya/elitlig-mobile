package com.elitlig.live

import android.app.usage.StorageStatsManager
import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.os.StatFs
import android.os.SystemClock
import android.os.storage.StorageManager
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Yayının TAMAMINI telefon hafızasına MP4 olarak yazar (yeniden kodlama yok).
 *
 * Kaynak, [ClipRingBuffer] ile aynı kancadır: RootEncoder'ın Camera2Base'i yayına
 * giden her KODLANMIŞ H.264/AAC örneğini `recordController.recordVideo/recordAudio`
 * ile verir. Örnekler GL filtre zincirinden (skorbord, tekrar) geçtikten SONRA
 * kodlandığı için dosyadaki görüntü, yayındakiyle bire bir aynıdır. RTMP bağlantısı
 * kopup yeniden kurulurken kodlayıcılar çalışmayı sürdürür; kayıt kesilmez.
 *
 * Dosya yeri:
 *  - Android 10+ (API 29+): MediaStore → `Movies/ElitLig/<ad>.mp4` (Galeri'de görünür,
 *    depolama izni gerekmez). Yazım sürerken IS_PENDING=1; kapanınca 0 yapılır.
 *  - Android 7–9: uygulamanın harici dizini `Android/data/<paket>/files/Movies/ElitLig/`.
 *
 * Güvenlik:
 *  - MP4'ün dizini (moov) dosya KAPANIRKEN yazılır; kapanmadan ölen süreç dosyayı
 *    okunmaz bırakır. Bu yüzden uygulama arka plana geçince parça kapatılır
 *    ([pause]) ve ön plana dönünce yeni parça (`_p2`, `_p3`…) açılır ([resume]).
 *  - Boş alan [MIN_FREE_BYTES] altına inerse kayıt düzgünce kapatılır ("disk_full").
 *  - Parça [MAX_PART_BYTES]'ı aşınca bir sonraki anahtar karede yeni parçaya geçilir
 *    (eski Android sürümlerinde MediaMuxer 4 GB üstünü yazamaz).
 *
 * Bütün durum [lock] ile korunur: video ve ses örnekleri ayrı kodlayıcı iş
 * parçacıklarından, başlat/durdur ana iş parçacığından gelir.
 */
class LocalRecorder(private val context: Context, private val host: Host) {

  interface Host {
    /** Herhangi bir iş parçacığından çağrılabilir. */
    fun onLocalRecordingEvent(payload: Map<String, Any>)

    /** Kayıt anahtar kare bekliyor; herhangi bir iş parçacığından çağrılabilir. */
    fun requestKeyFrameForRecording()
  }

  companion object {
    private const val TAG = "ElitligLive"
    const val FOLDER = "ElitLig"
    const val MIN_FREE_BYTES = 300L * 1024 * 1024
    const val MAX_PART_BYTES = 3500L * 1024 * 1024
    private const val SPACE_CHECK_US = 5_000_000L
    private const val AUDIO_WAIT_MS = 5_000L
    private const val KEY_REQUEST_MS = 1_000L

    private fun storageDir(context: Context): File = context.getExternalFilesDir(null) ?: context.filesDir

    /** Kaydın yazılacağı birimde kullanılabilir alan; okunamazsa -1. */
    fun freeBytes(context: Context): Long = try {
      StatFs(storageDir(context).path).availableBytes
    } catch (_: Exception) {
      -1L
    }

    /** Telefonun toplam depolaması (varsa "128 GB" gibi yuvarlak üretici değeri); okunamazsa -1. */
    fun totalBytes(context: Context): Long {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        try {
          val stats = context.getSystemService(Context.STORAGE_STATS_SERVICE) as? StorageStatsManager
          val total = stats?.getTotalBytes(StorageManager.UUID_DEFAULT) ?: 0L
          if (total > 0L) return total
        } catch (_: Exception) {
        }
      }
      return try {
        StatFs(storageDir(context).path).totalBytes
      } catch (_: Exception) {
        -1L
      }
    }

    /** Kullanıcıya gösterilecek klasör. */
    fun locationLabel(context: Context): String =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        "${Environment.DIRECTORY_MOVIES}/$FOLDER"
      } else {
        legacyDir(context).absolutePath
      }

    private fun legacyDir(context: Context): File =
      File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: File(context.filesDir, "Movies"), FOLDER)

    /** ASCII güvenli dosya adı (uzantısız). */
    fun sanitize(raw: String): String {
      var name = raw.trim()
      if (name.lowercase().endsWith(".mp4")) name = name.substring(0, name.length - 4)
      name = name.replace(Regex("[^A-Za-z0-9._-]"), "_").replace(Regex("_{2,}"), "_").trim('_', '.', '-')
      if (name.length > 96) name = name.substring(0, 96)
      return if (name.isEmpty()) "ElitLig_${System.currentTimeMillis()}" else name
    }
  }

  private class Output(
    val muxer: MediaMuxer,
    val pfd: ParcelFileDescriptor?,
    val uri: Uri?,
    val file: File?,
    val displayPath: String,
    val part: Int
  ) {
    var videoTrack = -1
    var audioTrack = -1
    var started = false
    var startPtsUs = 0L
    var lastVideoUs = -1L
    var lastAudioUs = -1L
    var bytes = 0L
  }

  private val lock = Any()
  private val videoInfo = MediaCodec.BufferInfo()
  private val audioInfo = MediaCodec.BufferInfo()

  private var videoFormat: MediaFormat? = null
  private var audioFormat: MediaFormat? = null

  // Oturum (startLocalRecording … stopLocalRecording / yayın sonu)
  private var active = false
  private var paused = false
  private var baseName = ""
  private var output: Output? = null
  private var savedParts = 0
  private var savedBytes = 0L
  private var savedDurationMs = 0L
  private var lastPath = ""
  private var lastUri = ""
  private var waitingSinceMs = 0L
  private var lastKeyRequestMs = 0L
  private var lastSpaceCheckUs = 0L

  // ---------------------------------------------------------------------------
  // Kodlayıcı biçimleri (ClipRingBuffer iletir)

  fun setVideoFormat(format: MediaFormat?) {
    synchronized(lock) { videoFormat = format }
  }

  fun setAudioFormat(format: MediaFormat?) {
    synchronized(lock) { audioFormat = format }
  }

  /** Kodlayıcılar durdu (Camera2Base.stopStream): açık parça kapatılır, oturum biter. */
  fun onEncodersStopped() {
    stop("stream_end")
    synchronized(lock) {
      videoFormat = null
      audioFormat = null
    }
  }

  // ---------------------------------------------------------------------------
  // Denetim (ana iş parçacığı)

  val isActive: Boolean
    get() = synchronized(lock) { active }

  /** Kaydı kurar; yazım ilk anahtar karede başlar. Dönen: { path, uri? }. */
  @Throws(Exception::class)
  fun start(fileName: String): Map<String, Any> {
    val result: Map<String, Any>
    synchronized(lock) {
      if (active) throw IllegalStateException("Yerel kayıt zaten sürüyor.")
      val free = freeBytes(context)
      if (free in 0 until MIN_FREE_BYTES) {
        throw IOException("Telefonda yeterli boş alan yok (en az ${MIN_FREE_BYTES / (1024 * 1024)} MB gerekir).")
      }
      baseName = sanitize(fileName)
      savedParts = 0
      savedBytes = 0L
      savedDurationMs = 0L
      lastPath = ""
      lastUri = ""
      val out = openOutput(1)
      output = out
      active = true
      paused = false
      waitingSinceMs = SystemClock.elapsedRealtime()
      lastKeyRequestMs = 0L
      lastSpaceCheckUs = 0L
      val map = HashMap<String, Any>()
      map["path"] = out.displayPath
      (out.uri ?: out.file?.let { Uri.fromFile(it) })?.let { map["uri"] = it.toString() }
      result = map
    }
    host.requestKeyFrameForRecording()
    return result
  }

  /**
   * Kaydı bitirir. Dönen özet: { path, uri?, bytes, durationMs, parts } — hiç kare
   * yazılmadıysa ya da kayıt yoksa null.
   */
  fun stop(reason: String): Map<String, Any>? {
    val events = ArrayList<Map<String, Any>>()
    val summary: Map<String, Any>?
    synchronized(lock) {
      if (!active) return null
      summary = finishLocked(reason, events)
    }
    events.forEach { host.onLocalRecordingEvent(it) }
    return summary
  }

  /** Arka plan: açık parçayı güvenle kapat; oturum [resume] ile sürer. */
  fun pause(reason: String) {
    val events = ArrayList<Map<String, Any>>()
    synchronized(lock) {
      if (!active || paused) return
      paused = true
      val out = output
      output = null
      if (out != null) closeOutput(out, reason, false, events)
    }
    events.forEach { host.onLocalRecordingEvent(it) }
  }

  /** Ön plana dönüş: yeni parçayla sürdür. */
  fun resume() {
    val events = ArrayList<Map<String, Any>>()
    var needKey = false
    synchronized(lock) {
      if (!active || !paused) return
      paused = false
      try {
        output = openOutput(savedParts + 1)
        waitingSinceMs = SystemClock.elapsedRealtime()
        lastKeyRequestMs = waitingSinceMs
        needKey = true
      } catch (e: Exception) {
        Log.e(TAG, "local recording resume failed", e)
        failLocked("error", e.message, events)
      }
    }
    events.forEach { host.onLocalRecordingEvent(it) }
    if (needKey) host.requestKeyFrameForRecording()
  }

  /** { recording, paused, bytes, durationMs, parts, path, freeBytes } */
  fun status(): Map<String, Any> {
    val free = freeBytes(context)
    return synchronized(lock) {
      val out = output
      val currentMs = if (out != null && out.started) out.lastVideoUs.coerceAtLeast(0L) / 1000 else 0L
      mapOf<String, Any>(
        "recording" to active,
        "paused" to (active && paused),
        "bytes" to (savedBytes + (out?.bytes ?: 0L)).toDouble(),
        "durationMs" to (savedDurationMs + currentMs).toDouble(),
        "parts" to (savedParts + if (out != null && out.started) 1 else 0).toDouble(),
        "path" to (out?.displayPath ?: lastPath),
        "freeBytes" to free.toDouble()
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Örnekler (kodlayıcı iş parçacıkları)

  fun onVideo(buffer: ByteBuffer, info: MediaCodec.BufferInfo, isKey: Boolean) {
    var events: ArrayList<Map<String, Any>>? = null
    var needKey = false
    synchronized(lock) {
      if (active && !paused && output != null) {
        val list = ArrayList<Map<String, Any>>(2)
        needKey = writeVideoLocked(buffer, info, isKey, list)
        if (list.isNotEmpty()) events = list
      }
    }
    events?.forEach { host.onLocalRecordingEvent(it) }
    if (needKey) host.requestKeyFrameForRecording()
  }

  /** true → anahtar kare istenmeli. */
  private fun writeVideoLocked(
    buffer: ByteBuffer,
    info: MediaCodec.BufferInfo,
    isKey: Boolean,
    events: MutableList<Map<String, Any>>
  ): Boolean {
    var out = output ?: return false

    // Parça sınırı: anahtar karede yeni dosyaya geç.
    if (out.started && isKey && out.bytes >= MAX_PART_BYTES) {
      closeOutput(out, "split", false, events)
      output = null
      try {
        out = openOutput(savedParts + 1)
        output = out
        waitingSinceMs = SystemClock.elapsedRealtime()
      } catch (e: Exception) {
        Log.e(TAG, "local recording split failed", e)
        failLocked("error", e.message, events)
        return false
      }
    }

    if (!out.started) {
      val vFormat = videoFormat ?: return false
      val aFormat = audioFormat
      val now = SystemClock.elapsedRealtime()
      // Ses biçimi gelmediyse kısa süre bekle; hiç gelmezse yalnız görüntü yazılır.
      val audioReady = aFormat != null || now - waitingSinceMs > AUDIO_WAIT_MS
      if (!isKey || !audioReady) {
        if (audioReady && now - lastKeyRequestMs > KEY_REQUEST_MS) {
          lastKeyRequestMs = now
          return true
        }
        return false
      }
      try {
        out.videoTrack = out.muxer.addTrack(vFormat)
        if (aFormat != null) out.audioTrack = out.muxer.addTrack(aFormat)
        out.muxer.start()
        out.started = true
        out.startPtsUs = info.presentationTimeUs
        lastSpaceCheckUs = info.presentationTimeUs
      } catch (e: Exception) {
        Log.e(TAG, "local recording muxer start failed", e)
        failLocked("error", e.message, events)
        return false
      }
      val started = HashMap<String, Any>()
      started["state"] = "started"
      started["path"] = out.displayPath
      started["part"] = out.part.toDouble()
      events.add(started)
    }

    // Boş alan güvenlik tabanı.
    if (info.presentationTimeUs - lastSpaceCheckUs >= SPACE_CHECK_US) {
      lastSpaceCheckUs = info.presentationTimeUs
      val free = freeBytes(context)
      if (free in 0 until MIN_FREE_BYTES) {
        finishLocked("disk_full", events)
        return false
      }
    }

    val rel = info.presentationTimeUs - out.startPtsUs
    if (rel < 0 || rel <= out.lastVideoUs) return false
    videoInfo.set(info.offset, info.size, rel, if (isKey) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
    try {
      out.muxer.writeSampleData(out.videoTrack, buffer, videoInfo)
      out.bytes += info.size.toLong()
      out.lastVideoUs = rel
    } catch (e: Exception) {
      Log.e(TAG, "local recording video write failed", e)
      onWriteFailedLocked(e, events)
    }
    return false
  }

  fun onAudio(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
    var events: ArrayList<Map<String, Any>>? = null
    synchronized(lock) {
      val out = output
      if (!active || paused || out == null || !out.started || out.audioTrack < 0) return
      val rel = info.presentationTimeUs - out.startPtsUs
      // AAC zaman damgaları kesin artan olmalı; ilk video karesinden önceki ses atılır.
      if (rel < 0 || rel <= out.lastAudioUs) return
      audioInfo.set(info.offset, info.size, rel, 0)
      try {
        out.muxer.writeSampleData(out.audioTrack, buffer, audioInfo)
        out.bytes += info.size.toLong()
        out.lastAudioUs = rel
      } catch (e: Exception) {
        Log.e(TAG, "local recording audio write failed", e)
        val list = ArrayList<Map<String, Any>>(2)
        onWriteFailedLocked(e, list)
        events = list
      }
    }
    events?.forEach { host.onLocalRecordingEvent(it) }
  }

  // ---------------------------------------------------------------------------
  // Kapatma (lock altında)

  /** Yazma hatası: çoğunlukla disk doldu. O ana kadar yazılanı kurtarmayı dene. */
  private fun onWriteFailedLocked(error: Exception, events: MutableList<Map<String, Any>>) {
    val free = freeBytes(context)
    val reason = if (free in 0 until MIN_FREE_BYTES) "disk_full" else "error"
    val summary = finishLocked(reason, events)
    if (summary == null) {
      val failed = HashMap<String, Any>()
      failed["state"] = "error"
      failed["reason"] = reason
      failed["message"] = error.message ?: "write_failed"
      failed["final"] = true
      events.add(failed)
    }
  }

  /** Oturumu, açık parçayı kaydetmeden kapatır ve "error" olayı ekler. */
  private fun failLocked(reason: String, message: String?, events: MutableList<Map<String, Any>>) {
    val out = output
    output = null
    if (out != null) discardOutput(out)
    active = false
    paused = false
    val failed = HashMap<String, Any>()
    failed["state"] = "error"
    failed["reason"] = reason
    failed["message"] = message ?: reason
    failed["final"] = true
    failed["bytes"] = savedBytes.toDouble()
    failed["parts"] = savedParts.toDouble()
    if (lastPath.isNotEmpty()) failed["path"] = lastPath
    events.add(failed)
  }

  /** Oturumu bitirir: açık parçayı kapatır, özet döndürür (hiçbir parça yoksa null). */
  private fun finishLocked(reason: String, events: MutableList<Map<String, Any>>): Map<String, Any>? {
    val out = output
    output = null
    active = false
    paused = false
    if (out != null) closeOutput(out, reason, true, events)
    if (savedParts == 0) return null
    val summary = HashMap<String, Any>()
    summary["path"] = lastPath
    if (lastUri.isNotEmpty()) summary["uri"] = lastUri
    summary["bytes"] = savedBytes.toDouble()
    summary["durationMs"] = savedDurationMs.toDouble()
    summary["parts"] = savedParts.toDouble()
    return summary
  }

  /**
   * Parçayı kapatır (moov yazılır) ve Galeri'ye yayımlar. Hiç kare yazılmadıysa ya da
   * kapanış başarısızsa dosya silinir. Başarılıysa "saved" olayı eklenir.
   */
  private fun closeOutput(out: Output, reason: String, isFinal: Boolean, events: MutableList<Map<String, Any>>) {
    var ok = out.started
    if (out.started) {
      try {
        out.muxer.stop()
      } catch (e: Exception) {
        Log.e(TAG, "local recording muxer stop failed", e)
        ok = false
      }
    }
    try {
      out.muxer.release()
    } catch (_: Exception) {
    }
    var size = 0L
    if (out.pfd != null) {
      size = try {
        out.pfd.statSize
      } catch (_: Exception) {
        0L
      }
      try {
        out.pfd.close()
      } catch (_: Exception) {
      }
    }
    if (out.file != null) size = out.file.length()
    if (size <= 0L) size = out.bytes

    if (!ok) {
      deleteOutputFile(out)
      if (out.started) {
        val failed = HashMap<String, Any>()
        failed["state"] = "error"
        failed["reason"] = "finalize_failed"
        failed["message"] = "MP4 kapatılamadı"
        failed["final"] = isFinal
        failed["part"] = out.part.toDouble()
        events.add(failed)
      }
      return
    }

    try {
      if (out.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        context.contentResolver.update(out.uri, values, null, null)
      } else if (out.file != null) {
        MediaScannerConnection.scanFile(context, arrayOf(out.file.absolutePath), arrayOf("video/mp4"), null)
      }
    } catch (e: Exception) {
      Log.w(TAG, "local recording publish failed", e)
    }

    val durationMs = out.lastVideoUs.coerceAtLeast(0L) / 1000
    savedParts += 1
    savedBytes += size
    savedDurationMs += durationMs
    lastPath = out.displayPath
    lastUri = (out.uri ?: out.file?.let { Uri.fromFile(it) })?.toString() ?: ""

    val saved = HashMap<String, Any>()
    saved["state"] = "saved"
    saved["reason"] = reason
    saved["final"] = isFinal
    saved["path"] = out.displayPath
    if (lastUri.isNotEmpty()) saved["uri"] = lastUri
    saved["part"] = out.part.toDouble()
    saved["parts"] = savedParts.toDouble()
    saved["bytes"] = savedBytes.toDouble()
    saved["durationMs"] = savedDurationMs.toDouble()
    events.add(saved)
  }

  private fun discardOutput(out: Output) {
    try {
      out.muxer.release()
    } catch (_: Exception) {
    }
    try {
      out.pfd?.close()
    } catch (_: Exception) {
    }
    deleteOutputFile(out)
  }

  private fun deleteOutputFile(out: Output) {
    try {
      if (out.uri != null) context.contentResolver.delete(out.uri, null, null)
      out.file?.delete()
    } catch (e: Exception) {
      Log.w(TAG, "local recording delete failed", e)
    }
  }

  // ---------------------------------------------------------------------------
  // Dosya açma

  @Throws(Exception::class)
  private fun openOutput(part: Int): Output {
    val name = if (part > 1) "${baseName}_p$part" else baseName
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) openMediaStore(name, part) else openLegacy(name, part)
  }

  /** API 29+: Movies/ElitLig (MediaStore, kapsamlı depolama; izin gerekmez). */
  @RequiresApi(Build.VERSION_CODES.Q)
  @Throws(Exception::class)
  private fun openMediaStore(name: String, part: Int): Output {
    val resolver = context.contentResolver
    val relative = "${Environment.DIRECTORY_MOVIES}/$FOLDER"
    val values = ContentValues()
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, "$name.mp4")
    values.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
    values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative)
    values.put(MediaStore.MediaColumns.IS_PENDING, 1)
    val collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = resolver.insert(collection, values) ?: throw IOException("MediaStore kaydı oluşturulamadı.")
    var pfd: ParcelFileDescriptor? = null
    try {
      pfd = resolver.openFileDescriptor(uri, "rw") ?: throw IOException("Kayıt dosyası açılamadı.")
      val muxer = MediaMuxer(pfd.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      return Output(muxer, pfd, uri, null, "$relative/$name.mp4", part)
    } catch (e: Exception) {
      try {
        pfd?.close()
      } catch (_: Exception) {
      }
      try {
        resolver.delete(uri, null, null)
      } catch (_: Exception) {
      }
      throw e
    }
  }

  /** API 24–28: uygulamanın harici dizini (izin gerekmez). */
  @Throws(Exception::class)
  private fun openLegacy(name: String, part: Int): Output {
    val dir = legacyDir(context)
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Kayıt klasörü oluşturulamadı: ${dir.absolutePath}")
    var file = File(dir, "$name.mp4")
    var n = 2
    while (file.exists()) {
      file = File(dir, "${name}_$n.mp4")
      n += 1
    }
    val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    return Output(muxer, null, null, file, file.absolutePath, part)
  }
}
