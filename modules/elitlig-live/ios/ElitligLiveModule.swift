import AVFoundation
import ExpoModulesCore
import Network
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

struct SaveClipOptions: Record {
  @Field var seconds: Double = 10
  @Field var afterSeconds: Double = 0
}

struct ReplayOptions: Record {
  @Field var label: String?
  @Field var rate: Double = 1
}

struct LocalRecordingOptions: Record {
  @Field var fileName: String = ""
}

final class LiveException: GenericException<String> {
  override var reason: String { param }
}

/// JS tarafında `error.code` olarak görünen kodla (ör. "NOT_STREAMING", "NO_BUFFER").
final class LiveCodedException: GenericException<(code: String, message: String)> {
  convenience init(code: String, message: String) {
    self.init((code: code, message: message))
  }

  override var code: String { param.code }
  override var reason: String { param.message }
}

public class ElitligLiveModule: Module {
  /// Tek seferde tek LiveCameraView varsayılır; modül fonksiyonları buna yönlenir.
  static weak var activeView: LiveCameraView?

  /// cache/elitlig-clips — saveClip çıktıları.
  static var clipsDirectory: URL {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    return caches.appendingPathComponent("elitlig-clips", isDirectory: true)
  }

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

    // MARK: Yakınlaştırma / fener / cihaz durumu (JS varlığını denetleyerek çağırır)

    AsyncFunction("getCameraCapabilities") { () -> [String: Any] in
      if let view = ElitligLiveModule.activeView {
        return view.cameraCapabilities()
      }
      return ["minZoom": 1.0, "maxZoom": 1.0, "zoom": 1.0, "torch": false, "torchOn": false]
    }.runOnQueue(.main)

    AsyncFunction("setZoom") { (level: Double) throws -> Double in
      return try ElitligLiveModule.requireView().setZoom(level)
    }.runOnQueue(.main)

    AsyncFunction("setTorch") { (on: Bool) throws -> Bool in
      return try ElitligLiveModule.requireView().setTorch(on)
    }.runOnQueue(.main)

    AsyncFunction("getDeviceStatus") { (promise: Promise) in
      DispatchQueue.main.async {
        let device = UIDevice.current
        let wasMonitoring = device.isBatteryMonitoringEnabled
        device.isBatteryMonitoringEnabled = true
        let level = Double(device.batteryLevel) // bilinmiyorsa -1
        let charging = device.batteryState == .charging || device.batteryState == .full
        if !wasMonitoring { device.isBatteryMonitoringEnabled = false }
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled

        // Ağ türü: tek seferlik yol sorgusu (ilk güncellemede sonuçlanır; 1.5 sn'de yanıt yoksa "unknown").
        let monitor = NWPathMonitor()
        var finished = false
        let finish: (String) -> Void = { network in
          DispatchQueue.main.async {
            guard !finished else { return }
            finished = true
            monitor.cancel()
            promise.resolve([
              "batteryLevel": level,
              "charging": charging,
              "lowPower": lowPower,
              "network": network
            ])
          }
        }
        monitor.pathUpdateHandler = { path in
          let network: String
          if path.status != .satisfied {
            network = "none"
          } else if path.usesInterfaceType(.wifi) {
            network = "wifi"
          } else if path.usesInterfaceType(.cellular) {
            network = "cellular"
          } else if path.usesInterfaceType(.wiredEthernet) {
            network = "ethernet"
          } else {
            network = "unknown"
          }
          finish(network)
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { finish("unknown") }
      }
    }

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

    // MARK: Gol klibi / tekrar

    AsyncFunction("saveClip") { (options: SaveClipOptions, promise: Promise) in
      guard let view = ElitligLiveModule.activeView else {
        promise.reject(LiveCodedException(code: "NOT_STREAMING", message: "Ekranda LiveCameraView yok."))
        return
      }
      let seconds = min(max(options.seconds, 1), 13)
      let after = min(max(options.afterSeconds, 0), 10)
      view.saveClip(seconds: seconds, afterSeconds: after) { result in
        switch result {
        case .success(let clip):
          promise.resolve([
            "uri": clip.url.absoluteString,
            "durationMs": clip.durationMs,
            "width": clip.width,
            "height": clip.height,
            "sizeBytes": clip.sizeBytes
          ])
        case .failure(let failure):
          promise.reject(LiveCodedException(code: failure.code, message: failure.message))
        }
      }
    }.runOnQueue(.main)

    // iOS: options.rate yok sayılır (AssetScreenObject gerçek zamanlı oynatır).
    AsyncFunction("playReplay") { (uri: String, options: ReplayOptions) throws in
      let view = try ElitligLiveModule.requireView()
      try view.playReplay(uri: uri, label: options.label)
    }.runOnQueue(.main)

    AsyncFunction("stopReplay") { () -> Void in
      if let view = ElitligLiveModule.activeView {
        view.stopReplay()
      }
    }.runOnQueue(.main)

    AsyncFunction("clearClips") { () -> Void in
      let fm = FileManager.default
      let dir = ElitligLiveModule.clipsDirectory
      for url in (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] {
        try? fm.removeItem(at: url)
      }
    }

    // MARK: Yerel kayıt: yayının tamamı telefon hafızasına (JS varlığını denetleyerek çağırır)

    AsyncFunction("getStorageInfo") { () -> [String: Any] in
      return [
        "freeBytes": Double(LocalRecorder.freeBytes()),
        "totalBytes": Double(LocalRecorder.totalBytes()),
        "minFreeBytes": Double(LocalRecorder.minFreeBytes),
        "location": "Dosyalar ▸ iPhone'umda ▸ ElitLig",
        "gallery": false
      ]
    }

    AsyncFunction("startLocalRecording") { (options: LocalRecordingOptions) throws -> [String: Any] in
      guard let view = ElitligLiveModule.activeView else {
        throw LiveCodedException(code: "NOT_STREAMING", message: "Ekranda LiveCameraView yok.")
      }
      return try view.startLocalRecording(fileName: options.fileName)
    }.runOnQueue(.main)

    AsyncFunction("stopLocalRecording") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let view = ElitligLiveModule.activeView else {
          promise.resolve(nil)
          return
        }
        view.stopLocalRecording { summary in
          promise.resolve(summary)
        }
      }
    }

    AsyncFunction("getLocalRecordingStatus") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(ElitligLiveModule.activeView?.localRecordingStatus())
      }
    }

    OnCreate {
      // 24 saatten eski klipleri temizle.
      let fm = FileManager.default
      let cutoff = Date().addingTimeInterval(-24 * 3600)
      let dir = ElitligLiveModule.clipsDirectory
      let urls = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
      for url in urls {
        let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        if let date, date < cutoff { try? fm.removeItem(at: url) }
      }
    }

    View(LiveCameraView.self) {
      Events("onStateChange", "onStats", "onReplayStateChange", "onRecordingStateChange")

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
