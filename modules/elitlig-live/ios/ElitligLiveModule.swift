import AVFoundation
import ExpoModulesCore
import UIKit

struct StartStreamOptions: Record {
  @Field var width: Int = 1280
  @Field var height: Int = 720
  @Field var fps: Int = 30
  @Field var videoBitrateKbps: Int = 2500
  @Field var audioBitrateKbps: Int = 128
}

struct OverlayFrame: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 1
  @Field var height: Double = 1
}

final class LiveException: GenericException<String> {
  override var reason: String { param }
}

public class ElitligLiveModule: Module {
  /// Tek seferde tek LiveCameraView varsayılır; modül fonksiyonları buna yönlenir.
  static weak var activeView: LiveCameraView?

  private static func requireView() throws -> LiveCameraView {
    guard let view = activeView else {
      throw LiveException("Ekranda LiveCameraView yok.")
    }
    return view
  }

  public func definition() -> ModuleDefinition {
    Name("ElitligLive")

    AsyncFunction("requestPermissions") { (promise: Promise) in
      AVCaptureDevice.requestAccess(for: .video) { videoGranted in
        AVCaptureDevice.requestAccess(for: .audio) { audioGranted in
          let granted = videoGranted && audioGranted
          if granted {
            DispatchQueue.main.async {
              ElitligLiveModule.activeView?.onPermissionsGranted()
            }
          }
          promise.resolve(granted)
        }
      }
    }

    AsyncFunction("startStream") { (url: String, options: StartStreamOptions) throws in
      let lower = url.lowercased()
      guard lower.hasPrefix("rtmp://") || lower.hasPrefix("rtmps://") else {
        throw LiveException("Yayın adresi rtmp:// ya da rtmps:// ile başlamalı.")
      }
      let view = try ElitligLiveModule.requireView()
      try view.start(
        url: url,
        width: min(max(options.width, 320), 1920),
        height: min(max(options.height, 240), 1080),
        fps: min(max(options.fps, 15), 60),
        videoBitrateKbps: min(max(options.videoBitrateKbps, 300), 8000),
        audioBitrateKbps: min(max(options.audioBitrateKbps, 32), 320)
      )
    }.runOnQueue(.main)

    AsyncFunction("stopStream") { () -> Void in
      if let view = ElitligLiveModule.activeView {
        view.stop()
      }
    }.runOnQueue(.main)

    AsyncFunction("switchCamera") { () throws in
      try ElitligLiveModule.requireView().switchCamera()
    }.runOnQueue(.main)

    AsyncFunction("setMuted") { (muted: Bool) throws in
      try ElitligLiveModule.requireView().setMuted(muted)
    }.runOnQueue(.main)

    // Görsel arka planda çözülür, ekrana (Screen) ana iş parçacığında eklenir.
    AsyncFunction("setOverlay") { (uri: String?, frame: OverlayFrame?, promise: Promise) in
      guard let view = ElitligLiveModule.activeView else {
        promise.reject(LiveException("Ekranda LiveCameraView yok."))
        return
      }
      var image: CGImage?
      if let uri {
        guard let decoded = ElitligLiveModule.decodeImage(uri) else {
          promise.reject(LiveException("Overlay görseli okunamadı: \(uri)"))
          return
        }
        image = decoded
      }
      let f = frame ?? OverlayFrame()
      let rect = CGRect(x: f.x, y: f.y, width: f.width, height: f.height)
      let finalImage = image
      DispatchQueue.main.async {
        view.setOverlay(finalImage, frame: rect)
        promise.resolve(nil)
      }
    }

    View(LiveCameraView.self) {
      Events("onStateChange", "onStats")

      Prop("facing") { (view: LiveCameraView, facing: String?) in
        view.setFacing(facing)
      }
    }
  }

  private static func decodeImage(_ uri: String) -> CGImage? {
    let url: URL?
    if uri.hasPrefix("/") {
      url = URL(fileURLWithPath: uri)
    } else {
      url = URL(string: uri)
    }
    guard let url else { return nil }
    if url.isFileURL {
      return UIImage(contentsOfFile: url.path)?.cgImage
    }
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)?.cgImage
  }
}
