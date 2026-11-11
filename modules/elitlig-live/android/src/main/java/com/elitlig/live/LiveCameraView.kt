package com.elitlig.live

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.SurfaceHolder
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.SurfaceFilterRender
import com.pedro.encoder.input.video.CameraCallbacks
import com.pedro.encoder.input.video.CameraHelper
import com.pedro.encoder.utils.gl.AspectRatioMode
import com.pedro.library.rtmp.RtmpCamera2
import com.pedro.library.view.OpenGlView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors

/**
 * Kamera önizlemesi + RTMP yayıncısı. Tek seferde tek bir örnek varsayılır;
 * modül fonksiyonları [ElitligLiveModule.activeView] üzerinden buna ulaşır.
 *
 * Akış: yüzey hazır + izin var → önizleme ("previewing"). startStream →
 * "connecting" → "live". Ağ koparsa artan beklemeyle [MAX_RETRIES] deneme
 * ("reconnecting"), olmazsa "failed". stopStream → "stopped".
 * Uygulama arka plana geçince (SurfaceView yok edilince) yayın, ekran dışı
 * GL arayüzüne taşınır ve "reconnecting" (message = "app_background")
 * bildirilir; ön plana dönünce görünüme geri bağlanır ve "live" bildirilir.
 */
@SuppressLint("ViewConstructor")
class LiveCameraView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), ConnectChecker, SurfaceHolder.Callback {

  companion object {
    private const val TAG = "ElitligLive"
    const val MAX_RETRIES = 5
    private const val AUDIO_SAMPLE_RATE = 44100
    private const val KEYFRAME_INTERVAL_SEC = 2
    /** MP4 yazımı için tek arka plan iş parçacığı (görünümler arasında paylaşılır). */
    private val clipExecutor = Executors.newSingleThreadExecutor()
  }

  private val onStateChange by EventDispatcher()
  private val onStats by EventDispatcher()
  private val onReplayStateChange by EventDispatcher()

  override val shouldUseAndroidLayout: Boolean = true

  private val main = Handler(Looper.getMainLooper())
  private val glView = OpenGlView(context)
  private val camera: RtmpCamera2

  // Yapılandırma
  private var facing = CameraHelper.Facing.BACK
  private var streamWidth = 1280
  private var streamHeight = 720
  private var streamFps = 30
  private var videoKbps = 2500
  private var audioKbps = 128
  private var rotation = 0
  private var muted = false

  // Durum
  private var state = "idle"
  private var surfaceReady = false
  private var offscreen = false // yayın arka planda, GlStreamInterface üzerinde
  private var released = false
  private var userStopped = true
  private var connected = false
  private var attempts = 0
  @Volatile private var lastFps = 0

  // Overlay
  private var overlayBitmap: Bitmap? = null
  private val overlayFrame = RectF(0f, 0f, 1f, 1f)
  private var overlayFilter: ImageObjectFilterRender? = null
  /** GL arayüzü yeniden başladıysa (filtre listesi boşalır) yeni filtre gerekir. */
  private var overlayNeedsNewFilter = true

  // Gol klibi: kodlanmış örneklerin halka tamponu (yeniden kodlama yok).
  private val clipBuffer = ClipRingBuffer()
  private val clipHandler = Handler(Looper.getMainLooper())

  // Tekrar (replay): filtre zinciri = [replay video, replay etiketi?, skorbord overlay?]
  private var replayPlayer: MediaPlayer? = null
  private var replayFilter: SurfaceFilterRender? = null
  private var replayLabelFilter: ImageObjectFilterRender? = null
  private var replayUri: String? = null

  init {
    glView.setAspectRatioMode(AspectRatioMode.Fill)
    // Kamera kare vermeyi kısa süre keserse son kareyi tekrar çiz (YouTube akışı düşmesin).
    glView.setForceRender(true, 10)
    addView(
      glView,
      LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    // OpenGlView kendi callback'ini kurucuda ekledi; bizimki ondan sonra çağrılır.
    glView.holder.addCallback(this)

    camera = RtmpCamera2(glView, this)
    camera.setFpsListener { fps -> lastFps = fps }
    camera.setCameraCallbacks(object : CameraCallbacks {
      override fun onCameraChanged(facing: CameraHelper.Facing) {
        this@LiveCameraView.facing = facing
      }

      override fun onCameraOpened() {
        if (camera.isStreaming && connected && state == "reconnecting" && !offscreen) {
          emitState("live")
        }
      }

      override fun onCameraDisconnected() {
        Log.w(TAG, "camera disconnected")
      }

      override fun onCameraError(error: String) {
        Log.e(TAG, "camera error: $error")
        if (camera.isStreaming) {
          if (!offscreen) emitState("reconnecting", "camera_error: $error")
        } else {
          emitState("failed", "camera_error: $error")
        }
      }
    })
    camera.getStreamClient().setReTries(MAX_RETRIES)
    camera.setRecordController(clipBuffer)

    ElitligLiveModule.setActiveView(this)
  }

  // ---------------------------------------------------------------------------
  // Props

  fun setFacing(value: String?) {
    val wanted = if (value == "front") CameraHelper.Facing.FRONT else CameraHelper.Facing.BACK
    if (wanted == facing) return
    if (camera.isOnPreview || camera.isStreaming) {
      try {
        camera.switchCamera()
        facing = camera.cameraFacing
      } catch (e: Exception) {
        Log.e(TAG, "switchCamera failed", e)
      }
    } else {
      facing = wanted
    }
  }

  // ---------------------------------------------------------------------------
  // SurfaceHolder.Callback (OpenGlView'in kendi callback'inden sonra çalışır)

  override fun surfaceCreated(holder: SurfaceHolder) {}

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    surfaceReady = true
    if (released) return
    if (offscreen) {
      // Ön plana dönüldü: GL'i yeniden görünüme bağla (yayın sürüyorsa kesilmeden).
      val wasStreaming = camera.isStreaming
      try {
        camera.replaceView(glView)
      } catch (e: Exception) {
        Log.e(TAG, "replaceView(glView) failed", e)
      }
      offscreen = false
      markGlCleared()
      if (wasStreaming) {
        applyOverlayToGl()
        keepScreenOn = true
        if (connected) emitState("live")
        return
      }
    }
    if (!camera.isStreaming && camera.isOnPreview && desiredRotation() != rotation) {
      // Ekran döndü (yatay ↔ ters yatay): önizlemeyi yeni açıyla yeniden başlat.
      camera.stopPreview()
      markGlCleared()
    }
    startPreviewIfPossible()
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    surfaceReady = false
    if (released) return
    if (camera.isStreaming) {
      // Arka plan: yayını kesmeden ekran dışı GL'ye taşı. Android 9+ arka planda
      // kamerayı kesebilir; bu durumda son kare tekrarlanır ya da görüntü donar.
      try {
        camera.replaceView(context)
        offscreen = true
        onGlRestarted()
        emitState("reconnecting", "app_background")
      } catch (e: Exception) {
        Log.e(TAG, "replaceView(context) failed", e)
      }
    } else if (camera.isOnPreview) {
      camera.stopPreview()
      markGlCleared()
    } else {
      markGlCleared()
    }
  }

  // ---------------------------------------------------------------------------
  // Önizleme

  private fun hasPermissions(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  /**
   * Yayın her zaman yatay (16:9). Ekran ters yatay ise 180, aksi halde 0
   * (yatay; ekran dikey kilitliyse de telefonun sola yatırılmış tutulduğu varsayılır).
   */
  private fun desiredRotation(): Int =
    if (CameraHelper.getCameraOrientation(context) == 180) 180 else 0

  fun onPermissionsGranted() {
    main.post { startPreviewIfPossible() }
  }

  private fun startPreviewIfPossible() {
    if (released || !surfaceReady || camera.isOnPreview || camera.isStreaming) return
    if (!hasPermissions()) {
      emitState("idle", "permission_missing")
      return
    }
    try {
      rotation = desiredRotation()
      camera.startPreview(facing, streamWidth, streamHeight, streamFps, rotation)
      onGlRestarted()
      if (muted) camera.disableAudio()
      emitState("previewing")
    } catch (e: Exception) {
      Log.e(TAG, "startPreview failed", e)
      emitState("failed", "camera_error: ${e.message}")
    }
  }

  // ---------------------------------------------------------------------------
  // Yayın (ana iş parçacığında çağrılır)

  @Throws(Exception::class)
  fun start(url: String, width: Int, height: Int, fps: Int, videoBitrateKbps: Int, audioBitrateKbps: Int) {
    if (released) throw IllegalStateException("Görünüm kaldırıldı.")
    if (camera.isStreaming) throw IllegalStateException("Yayın zaten sürüyor.")
    if (!hasPermissions()) throw IllegalStateException("Kamera/mikrofon izni yok.")
    if (!surfaceReady) throw IllegalStateException("Kamera önizlemesi hazır değil (uygulama ön planda olmalı).")

    streamWidth = width
    streamHeight = height
    streamFps = fps
    videoKbps = videoBitrateKbps
    audioKbps = audioBitrateKbps
    rotation = if (camera.isOnPreview) rotation else desiredRotation()
    val wasPreview = camera.isOnPreview

    // prepareVideo çözünürlük/fps/açı değişirse önizlemeyi durdurur; startStream
    // GL'i ve kamerayı yeniden açar (filtreler sıfırlanır → overlay yeniden uygulanır).
    val videoOk = camera.prepareVideo(width, height, fps, videoBitrateKbps * 1000, KEYFRAME_INTERVAL_SEC, rotation)
    // prepareVideo ayar farkında önizlemeyi durdurur → GL (ve filtreler) startStream'de yeniden kurulur.
    val glRestarts = !(wasPreview && camera.isOnPreview)
    if (glRestarts) markGlCleared()
    if (!videoOk) throw IllegalStateException("H.264 kodlayıcı bu ayarları desteklemiyor (${width}x$height@$fps).")
    // Maç ortamı: yankı/gürültü bastırma kapalı (seyirci sesi bozulmasın).
    val audioOk = camera.prepareAudio(audioBitrateKbps * 1000, AUDIO_SAMPLE_RATE, true, false, false)
    if (!audioOk) throw IllegalStateException("AAC kodlayıcı/mikrofon hazırlanamadı.")

    userStopped = false
    connected = false
    attempts = 0
    camera.getStreamClient().setReTries(MAX_RETRIES)
    emitState("connecting")
    clipBuffer.clear()
    camera.startStream(url)
    if (muted) camera.disableAudio() else camera.enableAudio()
    if (glRestarts) applyOverlayToGl()
    keepScreenOn = true
  }

  fun stop() {
    userStopped = true
    connected = false
    keepScreenOn = false
    if (camera.isStreaming) {
      camera.stopStream()
      emitState("stopped")
    } else if (state == "connecting" || state == "reconnecting" || state == "live") {
      emitState("stopped")
    }
    // Arka planda (ekran dışı GL) durdurulduysa stopStream kamerayı da kapatır;
    // görünüme geri bağlanma surfaceChanged'de yapılır.
  }

  @Throws(Exception::class)
  fun switchCameraNow() {
    camera.switchCamera()
    facing = camera.cameraFacing
  }

  /** Anında etkili (mikrofon verisi sıfırlanır); yeniden bağlanma ve tekrar boyunca korunur. */
  fun setMutedNow(value: Boolean) {
    muted = value
    if (value) camera.disableAudio() else camera.enableAudio()
  }

  // ---------------------------------------------------------------------------
  // Yakınlaştırma / fener (kamera açıkken; kamera değişince sıfırlanır)

  /** { minZoom, maxZoom, zoom, torch, torchOn } — kamera kapalıysa 1×, fener yok. */
  fun cameraCapabilities(): Map<String, Any> {
    var minZoom = 1f
    var maxZoom = 1f
    var zoom = 1f
    var torch = false
    var torchOn = false
    if (!released && (camera.isOnPreview || camera.isStreaming)) {
      try {
        val range = camera.getZoomRange()
        minZoom = range.lower.toFloat()
        maxZoom = range.upper.toFloat()
        zoom = camera.getZoom()
        torch = camera.isLanternSupported()
        torchOn = camera.isLanternEnabled()
      } catch (e: Exception) {
        Log.w(TAG, "cameraCapabilities failed", e)
      }
    }
    if (maxZoom < minZoom) maxZoom = minZoom
    return mapOf(
      "minZoom" to minZoom.toDouble(),
      "maxZoom" to maxZoom.toDouble(),
      "zoom" to zoom.coerceIn(minZoom, maxZoom).toDouble(),
      "torch" to torch,
      "torchOn" to torchOn
    )
  }

  /** İstenen düzeyi kameranın aralığına kırpıp uygular; uygulanan düzeyi döndürür. */
  @Throws(Exception::class)
  fun setZoomNow(level: Float): Float {
    if (released || !(camera.isOnPreview || camera.isStreaming)) throw IllegalStateException("Kamera açık değil.")
    val range = camera.getZoomRange()
    val lower = range.lower.toFloat()
    val upper = range.upper.toFloat()
    val clamped = if (upper > lower) level.coerceIn(lower, upper) else lower
    camera.setZoom(clamped)
    return clamped
  }

  /** Feneri açar / kapatır; son durumu döndürür (desteklenmiyorsa false). */
  @Throws(Exception::class)
  fun setTorchNow(on: Boolean): Boolean {
    if (released || !(camera.isOnPreview || camera.isStreaming)) throw IllegalStateException("Kamera açık değil.")
    if (!camera.isLanternSupported()) return false
    if (on) camera.enableLantern() else camera.disableLantern()
    return camera.isLanternEnabled()
  }

  // ---------------------------------------------------------------------------
  // Overlay

  /** bitmap null → kaldır. frame: 0..1 normalize (sol-üst orijin). */
  fun setOverlay(bitmap: Bitmap?, x: Float, y: Float, w: Float, h: Float) {
    overlayBitmap = bitmap
    overlayFrame.set(x, y, x + w, y + h)
    applyOverlayToGl()
  }

  /**
   * GL arayüzü durdu/değişti: MainRender.release() filtre listesini boşalttı.
   * Referansları bırak (eski filtreler için kaldırma eylemi KUYRUKLANMAZ — serbest
   * bırakılmış GL nesnelerini ikinci kez silmemek için). Tekrar varsa durur.
   */
  private fun markGlCleared() {
    if (replayFilter != null || replayPlayer != null) stopReplayInternal(glCleared = true)
    overlayFilter = null
    overlayNeedsNewFilter = true
  }

  /** GL yeni başladı (filtre listesi boş): overlay'i yeniden kur. */
  private fun onGlRestarted() {
    markGlCleared()
    applyOverlayToGl()
  }

  private fun applyOverlayToGl() {
    val gl = camera.getGlInterface()
    val bmp = overlayBitmap
    if (overlayNeedsNewFilter) overlayFilter = null
    val existing = overlayFilter
    if (bmp == null) {
      if (existing != null) gl.removeFilter(existing)
      overlayFilter = null
      overlayNeedsNewFilter = false
      return
    }
    val scaleX = overlayFrame.width() * 100f
    val scaleY = overlayFrame.height() * 100f
    val posX = overlayFrame.left * 100f
    val posY = overlayFrame.top * 100f
    if (existing != null) {
      // Aynı GL oturumu: dokuyu ve konumu yerinde güncelle (shader yeniden derlenmez).
      existing.setImage(bmp)
      existing.setScale(scaleX, scaleY) // önce ölçek (Sprite.scale konumu yeniden ölçekler)
      existing.setPosition(posX, posY)
      return
    }
    val filter = ImageObjectFilterRender()
    filter.setImage(bmp)
    filter.setScale(scaleX, scaleY)
    filter.setPosition(posX, posY)
    // Sona ekle: overlay her zaman zincirin en üstünde (tekrar videosunun üstünde) kalır.
    gl.addFilter(filter)
    overlayFilter = filter
    overlayNeedsNewFilter = false
  }

  // ---------------------------------------------------------------------------
  // Tekrar (replay) — klip, yayına ve önizlemeye tam kare olarak girer

  val isReplaying: Boolean
    get() = replayFilter != null

  @Throws(Exception::class)
  fun playReplay(uri: String, path: String, label: String?, rate: Float) {
    if (released) throw IllegalStateException("Görünüm kaldırıldı.")
    if (!camera.isOnPreview && !camera.isStreaming) {
      throw IllegalStateException("Kamera önizlemesi yok (önce önizleme ya da yayın başlamalı).")
    }
    if (!File(path).isFile) throw IllegalArgumentException("Klip dosyası yok: $path")
    if (replayFilter != null) stopReplayInternal(glCleared = false, emit = false)

    val gl = camera.getGlInterface()
    var created: SurfaceFilterRender? = null
    val filter = SurfaceFilterRender { _ ->
      // initGl sonrası ana iş parçacığında: yüzey hazır → oynatıcıyı başlat.
      val f = created
      if (f != null && replayFilter === f) startReplayPlayer(f, path, rate)
    }
    created = filter
    filter.setScale(100f, 100f)
    filter.setPosition(0f, 0f)
    // Zincirin başına: kamera görüntüsünün üstünde, etiket ve skorbordun altında.
    gl.addFilter(0, filter)
    replayFilter = filter
    if (!label.isNullOrBlank()) {
      val bmp = renderLabel(label)
      val hPct = 7f
      val wPct = hPct * (bmp.width.toFloat() / bmp.height) * (streamHeight.toFloat() / streamWidth)
      val lf = ImageObjectFilterRender()
      lf.setImage(bmp)
      lf.setScale(wPct, hPct)
      lf.setPosition(100f - wPct - 2f, 3f)
      gl.addFilter(1, lf)
      replayLabelFilter = lf
    }
    replayUri = uri
    emitReplay(true, uri)
  }

  private fun startReplayPlayer(filter: SurfaceFilterRender, path: String, rate: Float) {
    val surface = filter.getSurface() ?: run {
      stopReplay()
      return
    }
    try {
      val mp = MediaPlayer()
      replayPlayer = mp
      mp.setDataSource(path)
      mp.setSurface(surface)
      mp.setVolume(0f, 0f) // klip sesi karışmaz; yayın sesi mikrofondan sürer
      mp.isLooping = false
      mp.setOnPreparedListener { p ->
        if (replayPlayer !== p) return@setOnPreparedListener
        try {
          if (rate != 1f) p.playbackParams = p.playbackParams.setSpeed(rate)
        } catch (e: Exception) {
          Log.w(TAG, "replay rate unsupported", e)
        }
        p.start()
      }
      mp.setOnCompletionListener { p -> if (replayPlayer === p) stopReplay() }
      mp.setOnErrorListener { p, what, extra ->
        Log.e(TAG, "replay error $what/$extra")
        if (replayPlayer === p) stopReplay()
        true
      }
      mp.prepareAsync()
    } catch (e: Exception) {
      Log.e(TAG, "replay start failed", e)
      stopReplay()
    }
  }

  fun stopReplay() {
    stopReplayInternal(glCleared = false)
  }

  private fun stopReplayInternal(glCleared: Boolean, emit: Boolean = true) {
    val wasActive = replayFilter != null || replayPlayer != null
    val p = replayPlayer
    replayPlayer = null
    if (p != null) {
      try {
        p.stop()
      } catch (_: Exception) {
      }
      try {
        p.release()
      } catch (_: Exception) {
      }
    }
    if (!glCleared) {
      val gl = camera.getGlInterface()
      replayLabelFilter?.let { gl.removeFilter(it) }
      replayFilter?.let { gl.removeFilter(it) }
    }
    replayFilter = null
    replayLabelFilter = null
    val uri = replayUri
    replayUri = null
    if (emit && wasActive) emitReplay(false, uri)
  }

  private fun renderLabel(text: String): Bitmap {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 56f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val padH = 28f
    val padV = 14f
    val textW = paint.measureText(text)
    val fm = paint.fontMetrics
    val w = (textW + padH * 2).toInt().coerceAtLeast(1)
    val h = (fm.descent - fm.ascent + padV * 2).toInt().coerceAtLeast(1)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(200, 200, 16, 46) }
    c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), h / 4f, h / 4f, bg)
    c.drawText(text, padH, padV - fm.ascent, paint)
    return bmp
  }

  private fun emitReplay(playing: Boolean, uri: String?) {
    val payload = HashMap<String, Any>()
    payload["playing"] = playing
    if (uri != null) payload["uri"] = uri
    if (Looper.myLooper() == Looper.getMainLooper()) {
      if (!released) onReplayStateChange(payload)
    } else {
      main.post { if (!released) onReplayStateChange(payload) }
    }
  }

  // ---------------------------------------------------------------------------
  // Gol klibi

  /**
   * Yayın sürerken son [seconds] saniyeyi MP4'e yazar ([afterSeconds] sonra).
   * Sonuç [onDone] ile (ana iş parçacığında değil) bildirilir.
   */
  fun saveClip(
    seconds: Double,
    afterSeconds: Double,
    outDir: File,
    onDone: (ClipRingBuffer.Clip?, ClipRingBuffer.ClipException?) -> Unit
  ) {
    if (!isStreamingForClip()) {
      onDone(null, ClipRingBuffer.ClipException("NOT_STREAMING", "Klip yalnız yayın sürerken alınabilir."))
      return
    }
    val delayMs = (afterSeconds * 1000).toLong().coerceIn(0L, 10_000L)
    clipHandler.postDelayed({
      if (released || !camera.isStreaming) {
        onDone(null, ClipRingBuffer.ClipException("NOT_STREAMING", "Yayın klip yazılmadan durdu."))
        return@postDelayed
      }
      val file = File(outDir, "clip-${System.currentTimeMillis()}.mp4")
      clipExecutor.execute {
        try {
          onDone(clipBuffer.writeClip(seconds, file), null)
        } catch (e: ClipRingBuffer.ClipException) {
          onDone(null, e)
        } catch (e: Exception) {
          onDone(null, ClipRingBuffer.ClipException("CLIP_WRITE_FAILED", e.message ?: "Klip yazılamadı."))
        }
      }
    }, delayMs)
  }

  private fun isStreamingForClip(): Boolean =
    !released && camera.isStreaming && !userStopped && (state == "live" || state == "reconnecting")

  // ---------------------------------------------------------------------------
  // ConnectChecker

  override fun onConnectionStarted(url: String) {
    if (state != "reconnecting") emitState("connecting")
  }

  override fun onConnectionSuccess() {
    connected = true
    attempts = 0
    camera.getStreamClient().setReTries(MAX_RETRIES)
    if (!offscreen) emitState("live") else emitState("reconnecting", "app_background")
  }

  override fun onConnectionFailed(reason: String) {
    main.post {
      if (userStopped) return@post
      connected = false
      attempts += 1
      val delay = minOf(2000L shl (attempts - 1), 16000L) // 2, 4, 8, 16, 16 sn
      val willRetry = attempts <= MAX_RETRIES && camera.getStreamClient().reTry(delay, reason)
      if (willRetry) {
        emitState("reconnecting", "($attempts/$MAX_RETRIES) $reason")
      } else {
        userStopped = true
        keepScreenOn = false
        if (camera.isStreaming) camera.stopStream()
        emitState("failed", reason)
      }
    }
  }

  override fun onDisconnect() {
    // stopStream sonrası gelir; durum stop()/failed tarafından zaten bildirildi.
    connected = false
  }

  override fun onAuthError() {
    main.post {
      userStopped = true
      connected = false
      keepScreenOn = false
      if (camera.isStreaming) camera.stopStream()
      emitState("failed", "auth_error")
    }
  }

  override fun onAuthSuccess() {}

  override fun onNewBitrate(bitrate: Long) {
    if (!camera.isStreaming) return
    val dropped = try {
      camera.getStreamClient().getDroppedVideoFrames()
    } catch (_: Exception) {
      0L
    }
    val payload = mapOf<String, Any>(
      "bitrateKbps" to Math.round(bitrate / 1000.0).toDouble(),
      "fps" to lastFps.toDouble(),
      "droppedFrames" to dropped.toDouble()
    )
    main.post { if (!released) onStats(payload) }
  }

  // ---------------------------------------------------------------------------

  private fun emitState(newState: String, message: String? = null) {
    state = newState
    val payload = HashMap<String, Any>()
    payload["state"] = newState
    if (message != null) payload["message"] = message
    if (Looper.myLooper() == Looper.getMainLooper()) {
      if (!released) onStateChange(payload)
    } else {
      main.post { if (!released) onStateChange(payload) }
    }
  }

  /** Görünüm RN ağacından kaldırıldı: yayını ve kamerayı kapat. */
  fun release() {
    if (released) return
    userStopped = true
    main.removeCallbacksAndMessages(null)
    try {
      if (camera.isStreaming) camera.stopStream()
    } catch (e: Exception) {
      Log.e(TAG, "stopStream on release failed", e)
    }
    try {
      if (camera.isOnPreview) camera.stopCamera()
    } catch (e: Exception) {
      Log.e(TAG, "stopCamera on release failed", e)
    }
    stopReplayInternal(glCleared = true, emit = false)
    // Bekleyen saveClip çağrıları iptal edilmez: çalışınca `released` görüp NOT_STREAMING ile döner.
    released = true
    keepScreenOn = false
    glView.holder.removeCallback(this)
    overlayBitmap = null
    overlayFilter = null
    ElitligLiveModule.clearActiveView(this)
  }
}
