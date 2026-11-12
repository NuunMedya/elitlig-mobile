package com.elitlig.live

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import com.pedro.library.base.recording.BaseRecordController
import com.pedro.library.base.recording.RecordController
import java.io.File
import java.io.FileDescriptor
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Yayına giden KODLANMIŞ H.264/AAC örneklerini son [keepUs] süre (ve en fazla
 * [maxBytes]) boyunca bellekte tutan halka tampon. RootEncoder'ın Camera2Base'i
 * her kodlanmış kareyi kayıt durumundan bağımsız olarak
 * `recordController.recordVideo/recordAudio`'ya verir (getVideoData/getAudioData);
 * bu sınıf o kancaya takılır. Durum hep STOPPED kalır: isRunning()/isRecording()
 * false döner, böylece Camera2Base'in startStream/stopStream akışı değişmez.
 *
 * [writeClip] yeniden kodlama yapmadan MediaMuxer ile MP4 yazar.
 */
class ClipRingBuffer(
  private val keepUs: Long = 16_000_000L,
  private val maxBytes: Long = 24L * 1024 * 1024
) : BaseRecordController() {

  private class Sample(
    val isVideo: Boolean,
    val data: ByteArray,
    val ptsUs: Long,
    val isKey: Boolean
  )

  class Clip(val file: File, val durationMs: Long, val width: Int, val height: Int, val sizeBytes: Long)

  class ClipException(val code: String, message: String) : Exception(message)

  private val lock = Any()
  private val samples = ArrayDeque<Sample>()
  private var totalBytes = 0L
  private var videoFormat: MediaFormat? = null
  private var audioFormat: MediaFormat? = null
  @Volatile var enabled = true

  /** Yayının tamamını telefona yazan kayıtçı (aynı kodlanmış örnekleri alır). */
  @Volatile var recorder: LocalRecorder? = null

  // --- RecordController: dosyaya kayıt desteklenmiyor (yalnız halka tampon) ---

  @Throws(IOException::class)
  override fun startRecord(path: String, listener: RecordController.Listener?) {
    throw IOException("ClipRingBuffer dosyaya kayıt desteklemez")
  }

  @Throws(IOException::class)
  override fun startRecord(fd: FileDescriptor, listener: RecordController.Listener?) {
    throw IOException("ClipRingBuffer dosyaya kayıt desteklemez")
  }

  override fun stopRecord() {}

  override fun recordVideo(videoBuffer: ByteBuffer, videoInfo: MediaCodec.BufferInfo) {
    if (videoInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) return
    if (videoInfo.size <= 0) return
    val data = copy(videoBuffer, videoInfo)
    val key = (videoInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0 || isKeyFrame(ByteBuffer.wrap(data))
    // Yerel kayıt, yayına giden tamponu kopyalamadan yazar (MediaMuxer konumu değiştirmez).
    recorder?.onVideo(videoBuffer, videoInfo, key)
    if (!enabled) return
    push(Sample(true, data, videoInfo.presentationTimeUs, key))
  }

  override fun recordAudio(audioBuffer: ByteBuffer, audioInfo: MediaCodec.BufferInfo) {
    if (audioInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) return
    if (audioInfo.size <= 0) return
    recorder?.onAudio(audioBuffer, audioInfo)
    if (!enabled) return
    push(Sample(false, copy(audioBuffer, audioInfo), audioInfo.presentationTimeUs, true))
  }

  override fun setVideoFormat(videoFormat: MediaFormat, isOnlyVideo: Boolean) {
    synchronized(lock) { this.videoFormat = videoFormat }
    recorder?.setVideoFormat(videoFormat)
  }

  override fun setAudioFormat(audioFormat: MediaFormat, isOnlyAudio: Boolean) {
    synchronized(lock) { this.audioFormat = audioFormat }
    recorder?.setAudioFormat(audioFormat)
  }

  /** Camera2Base.stopStream() çağırır: kodlayıcılar durdu, tampon geçersiz. */
  override fun resetFormats() {
    // Açık yerel kayıt varsa MP4 burada kapanır (kodlayıcı biçimleri artık geçersiz).
    recorder?.onEncodersStopped()
    synchronized(lock) {
      videoFormat = null
      audioFormat = null
      samples.clear()
      totalBytes = 0
    }
  }

  fun clear() {
    synchronized(lock) {
      samples.clear()
      totalBytes = 0
    }
  }

  private fun copy(buffer: ByteBuffer, info: MediaCodec.BufferInfo): ByteArray {
    val dup = buffer.duplicate()
    dup.position(info.offset)
    dup.limit(info.offset + info.size)
    val out = ByteArray(info.size)
    dup.get(out)
    return out
  }

  private fun push(s: Sample) {
    synchronized(lock) {
      samples.addLast(s)
      totalBytes += s.data.size
      val newest = s.ptsUs
      while (samples.isNotEmpty()) {
        val head = samples.first()
        val tooOld = newest - head.ptsUs > keepUs
        val tooBig = totalBytes > maxBytes
        if (!tooOld && !tooBig) break
        samples.removeFirst()
        totalBytes -= head.data.size
      }
    }
  }

  /** Tampondaki video süresi (µs). */
  fun bufferedVideoUs(): Long = synchronized(lock) {
    val first = samples.firstOrNull { it.isVideo } ?: return 0L
    val last = samples.lastOrNull { it.isVideo } ?: return 0L
    last.ptsUs - first.ptsUs
  }

  /**
   * Son [seconds] saniyeyi, (şimdi − seconds) anındaki ya da ondan önceki son
   * anahtar kareden başlayarak [outFile]'a yazar. Zaman damgaları 0'a çekilir.
   */
  @Throws(ClipException::class)
  fun writeClip(seconds: Double, outFile: File): Clip {
    val snapshot: List<Sample>
    val vFormat: MediaFormat
    val aFormat: MediaFormat?
    synchronized(lock) {
      vFormat = videoFormat ?: throw ClipException("NO_BUFFER", "Video biçimi henüz yok.")
      aFormat = audioFormat
      snapshot = samples.toList()
    }
    val videos = snapshot.filter { it.isVideo }
    if (videos.isEmpty()) throw ClipException("NO_BUFFER", "Tampon boş.")
    val newest = videos.maxOf { it.ptsUs }
    val target = newest - (seconds * 1_000_000).toLong()
    val keys = videos.filter { it.isKey }
    val start = keys.lastOrNull { it.ptsUs <= target } ?: keys.firstOrNull()
      ?: throw ClipException("NO_BUFFER", "Tamponda anahtar kare yok.")
    val startPts = start.ptsUs
    if (newest - startPts < 1_000_000L) throw ClipException("NO_BUFFER", "Tamponda 1 sn'den az görüntü var.")

    // Başlangıç anahtar karesinin tampondaki sırası; video bundan itibaren yazılır.
    val startIndex = snapshot.indexOf(start)
    outFile.parentFile?.mkdirs()
    val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var lastPts = 0L
    try {
      val vTrack = muxer.addTrack(vFormat)
      val aTrack = if (aFormat != null) muxer.addTrack(aFormat) else -1
      muxer.start()
      val info = MediaCodec.BufferInfo()
      var lastAudioPts = -1L
      for (i in startIndex until snapshot.size) {
        val s = snapshot[i]
        if (!s.isVideo && (aTrack < 0 || s.ptsUs < startPts)) continue
        val rel = (s.ptsUs - startPts).coerceAtLeast(0L)
        if (!s.isVideo) {
          // AAC zaman damgaları kesin artan olmalı.
          if (rel <= lastAudioPts) continue
          lastAudioPts = rel
        }
        val flags = if (s.isVideo && s.isKey) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
        info.set(0, s.data.size, rel, flags)
        muxer.writeSampleData(if (s.isVideo) vTrack else aTrack, ByteBuffer.wrap(s.data), info)
        if (s.isVideo && rel > lastPts) lastPts = rel
      }
      muxer.stop()
    } catch (e: Exception) {
      outFile.delete()
      throw ClipException("CLIP_WRITE_FAILED", "MP4 yazılamadı: ${e.message}")
    } finally {
      try {
        muxer.release()
      } catch (_: Exception) {
      }
    }
    val fps = if (vFormat.containsKey(MediaFormat.KEY_FRAME_RATE)) vFormat.getInteger(MediaFormat.KEY_FRAME_RATE) else 30
    val frameMs = if (fps > 0) 1000L / fps else 33L
    val width = if (vFormat.containsKey(MediaFormat.KEY_WIDTH)) vFormat.getInteger(MediaFormat.KEY_WIDTH) else 0
    val height = if (vFormat.containsKey(MediaFormat.KEY_HEIGHT)) vFormat.getInteger(MediaFormat.KEY_HEIGHT) else 0
    return Clip(outFile, lastPts / 1000 + frameMs, width, height, outFile.length())
  }
}
