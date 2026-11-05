package com.elitlig.live

import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
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
      Events("onStateChange", "onStats")

      Prop("facing") { view: LiveCameraView, facing: String? ->
        view.setFacing(facing)
      }

      OnViewDestroys { view ->
        view.release()
      }
    }

    OnDestroy {
      activeView?.release()
    }
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
