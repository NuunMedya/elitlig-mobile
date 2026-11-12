package com.elitlig.live

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.PowerManager
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.lang.ref.WeakReference

class StartStreamOptions : Record {
  @Field val width: Int = 1280
  @Field val height: Int = 720
  @Field val fps: Int = 30
  @Field val videoBitrateKbps: Int = 2500
  @Field val audioBitrateKbps: Int = 128
}

class OverlayFrameRecord : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 1.0
  @Field val height: Double = 1.0
}

class SaveClipOptions : Record {
  @Field val seconds: Double = 10.0
  @Field val afterSeconds: Double = 0.0
}

class ReplayOptions : Record {
  @Field val label: String? = null
  @Field val rate: Double = 1.0
}

class LocalRecordingOptions : Record {
  @Field val fileName: String = ""
}

class LiveException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

class ElitligLiveModule : Module() {

  companion object {
    @Volatile private var activeViewRef: WeakReference<LiveCameraView>? = null

    fun setActiveView(view: LiveCameraView) {
      activeViewRef = WeakReference(view)
    }

    fun clearActiveView(view: LiveCameraView) {
      if (activeViewRef?.get() === view) activeViewRef = null
    }

    val activeView: LiveCameraView?
      get() = activeViewRef?.get()
  }

  private fun requireView(): LiveCameraView =
    activeView ?: throw LiveException("ERR_NO_VIEW", "Ekranda LiveCameraView yok.")

  override fun definition() = ModuleDefinition {
    Name("ElitligLive")

    AsyncFunction("requestPermissions") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      permissions.askForPermissions(
        { result: Map<String, PermissionsResponse> ->
          val granted = result.isNotEmpty() && result.values.all { it.status == PermissionsStatus.GRANTED }
          if (granted) activeView?.onPermissionsGranted()
          promise.resolve(granted)
        },
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
      )
    }

    AsyncFunction("startStream") { url: String, options: StartStreamOptions ->
      val lower = url.lowercase()
      if (!lower.startsWith("rtmp://") && !lower.startsWith("rtmps://")) {
        throw LiveException("ERR_URL", "Yayın adresi rtmp:// ya da rtmps:// ile başlamalı.")
      }
      val view = requireView()
      try {
        view.start(
          url,
          options.width.coerceIn(320, 1920),
          options.height.coerceIn(240, 1080),
          options.fps.coerceIn(15, 60),
          options.videoBitrateKbps.coerceIn(300, 8000),
          options.audioBitrateKbps.coerceIn(32, 320)
        )
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw LiveException("ERR_START", e.message ?: "Yayın başlatılamadı.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopStream") {
      activeView?.stop()
      Unit
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("switchCamera") {
      try {
        requireView().switchCameraNow()
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw LiveException("ERR_CAMERA", e.message ?: "Kamera değiştirilemedi.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setMuted") { muted: Boolean ->
      requireView().setMutedNow(muted)
    }.runOnQueue(Queues.MAIN)

    // ---- Yakınlaştırma / fener / cihaz durumu (JS tarafı varlığını denetleyerek çağırır) ----

    AsyncFunction("getCameraCapabilities") {
      activeView?.cameraCapabilities()
        ?: mapOf("minZoom" to 1.0, "maxZoom" to 1.0, "zoom" to 1.0, "torch" to false, "torchOn" to false)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setZoom") { level: Double ->
      try {
        requireView().setZoomNow(level.toFloat()).toDouble()
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw LiveException("ERR_CAMERA", e.message ?: "Yakınlaştırma uygulanamadı.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setTorch") { on: Boolean ->
      try {
        requireView().setTorchNow(on)
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw LiveException("ERR_CAMERA", e.message ?: "Fener açılamadı.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getDeviceStatus") {
      deviceStatus()
    }

    // Görsel çözme arka planda; GL'e uygulama ana iş parçacığında.
    AsyncFunction("setOverlay") { uri: String?, frame: OverlayFrameRecord?, promise: Promise ->
      val view = activeView
      if (view == null) {
        promise.reject(LiveException("ERR_NO_VIEW", "Ekranda LiveCameraView yok."))
        return@AsyncFunction
      }
      var bitmap: Bitmap? = null
      if (uri != null) {
        try {
          bitmap = decodeBitmap(uri)
        } catch (e: Exception) {
          promise.reject(LiveException("ERR_OVERLAY", "Overlay görseli okunamadı: ${e.message}", e))
          return@AsyncFunction
        }
        if (bitmap == null) {
          promise.reject(LiveException("ERR_OVERLAY", "Overlay görseli çözülemedi: $uri"))
          return@AsyncFunction
        }
      }
      val f = frame ?: OverlayFrameRecord()
      val decoded = bitmap
      view.post {
        view.setOverlay(decoded, f.x.toFloat(), f.y.toFloat(), f.width.toFloat(), f.height.toFloat())
        promise.resolve(null)
      }
    }

    View(LiveCameraView::class) {
      Events("onStateChange", "onStats", "onReplayStateChange", "onRecordingStateChange")

      Prop("facing") { view: LiveCameraView, facing: String? ->
        view.setFacing(facing)
      }

      OnViewDestroys { view ->
        view.release()
      }
    }

    // ---- Gol klibi / tekrar ----

    AsyncFunction("saveClip") { options: SaveClipOptions, promise: Promise ->
      val view = activeView
      if (view == null) {
        promise.reject(LiveException("NOT_STREAMING", "Ekranda LiveCameraView yok."))
        return@AsyncFunction
      }
      val seconds = options.seconds.coerceIn(1.0, 13.0)
      val after = options.afterSeconds.coerceIn(0.0, 10.0)
      view.saveClip(seconds, after, clipsDir()) { clip, error ->
        if (clip != null) {
          promise.resolve(
            mapOf(
              "uri" to Uri.fromFile(clip.file).toString(),
              "durationMs" to clip.durationMs.toDouble(),
              "width" to clip.width.toDouble(),
              "height" to clip.height.toDouble(),
              "sizeBytes" to clip.sizeBytes.toDouble()
            )
          )
        } else {
          val e = error ?: ClipRingBuffer.ClipException("CLIP_WRITE_FAILED", "Klip yazılamadı.")
          promise.reject(LiveException(e.code, e.message ?: e.code))
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("playReplay") { uri: String, options: ReplayOptions ->
      val view = requireView()
      val path = Uri.parse(uri).let { if (it.scheme == null || it.scheme == "file") it.path ?: uri else null }
        ?: throw LiveException("ERR_REPLAY", "Yalnız file:// klipler oynatılabilir: $uri")
      try {
        view.playReplay(uri, path, options.label, options.rate.toFloat().coerceIn(0.25f, 2f))
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw LiveException("ERR_REPLAY", e.message ?: "Tekrar oynatılamadı.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopReplay") {
      activeView?.stopReplay()
      Unit
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearClips") {
      clipsDir().listFiles()?.forEach { it.delete() }
      Unit
    }

    // ---- Yerel kayıt: yayının tamamı telefon hafızasına (JS varlığını denetleyerek çağırır) ----

    AsyncFunction("getStorageInfo") {
      val ctx = appContext.reactContext ?: throw LiveException("ERR_CONTEXT", "context yok")
      mapOf<String, Any>(
        "freeBytes" to LocalRecorder.freeBytes(ctx).toDouble(),
        "totalBytes" to LocalRecorder.totalBytes(ctx).toDouble(),
        "minFreeBytes" to LocalRecorder.MIN_FREE_BYTES.toDouble(),
        "location" to LocalRecorder.locationLabel(ctx),
        "gallery" to (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q)
      )
    }

    AsyncFunction("startLocalRecording") { options: LocalRecordingOptions ->
      val view = activeView ?: throw LiveException("NOT_STREAMING", "Ekranda LiveCameraView yok.")
      try {
        view.startLocalRecording(options.fileName)
      } catch (e: CodedException) {
        throw e
      } catch (e: IllegalStateException) {
        throw LiveException("NOT_STREAMING", e.message ?: "Yerel kayıt başlatılamadı.", e)
      } catch (e: Exception) {
        throw LiveException("ERR_RECORD", e.message ?: "Yerel kayıt başlatılamadı.", e)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopLocalRecording") {
      activeView?.stopLocalRecording()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getLocalRecordingStatus") {
      activeView?.localRecordingStatus()
    }.runOnQueue(Queues.MAIN)

    OnCreate {
      // 24 saatten eski klipleri temizle.
      val cutoff = System.currentTimeMillis() - 24L * 3600 * 1000
      try {
        clipsDir().listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
      } catch (_: Exception) {
      }
    }

    OnDestroy {
      activeView?.release()
    }
  }

  /** { batteryLevel 0..1 (-1 bilinmiyor), charging, lowPower, network: wifi|cellular|ethernet|none|unknown } */
  private fun deviceStatus(): Map<String, Any> {
    val ctx = appContext.reactContext
    var level = -1.0
    var charging = false
    var lowPower = false
    var network = "unknown"
    if (ctx != null) {
      try {
        val intent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (intent != null) {
          val raw = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
          if (raw >= 0 && scale > 0) level = raw.toDouble() / scale.toDouble()
          val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
          charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        }
      } catch (_: Exception) {
      }
      try {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        lowPower = pm?.isPowerSaveMode == true
      } catch (_: Exception) {
      }
      try {
        // ACCESS_NETWORK_STATE yoksa SecurityException → "unknown" kalır.
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val active = cm?.activeNetwork
        val caps = if (cm != null && active != null) cm.getNetworkCapabilities(active) else null
        network = when {
          cm == null -> "unknown"
          active == null || caps == null -> "none"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "unknown"
        }
      } catch (_: Exception) {
      }
    }
    return mapOf(
      "batteryLevel" to level,
      "charging" to charging,
      "lowPower" to lowPower,
      "network" to network
    )
  }

  private fun clipsDir(): File {
    val ctx = appContext.reactContext ?: throw LiveException("ERR_CONTEXT", "context yok")
    return File(ctx.cacheDir, "elitlig-clips").apply { mkdirs() }
  }

  private fun decodeBitmap(uriString: String): Bitmap? {
    val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      null, "file" -> {
        val path = uri.path ?: uriString
        if (!File(path).exists()) throw IllegalArgumentException("dosya yok: $path")
        BitmapFactory.decodeFile(path, opts)
      }
      else -> {
        val ctx = appContext.reactContext ?: throw IllegalStateException("context yok")
        ctx.contentResolver.openInputStream(uri).use { input ->
          BitmapFactory.decodeStream(input, null, opts)
        }
      }
    }
  }
}
