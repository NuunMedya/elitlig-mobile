import AVFoundation
import ExpoModulesCore
import HaishinKit
import UIKit
import VideoToolbox

/// Kamera önizlemesi + RTMP yayıncısı (HaishinKit 1.9.x).
///
/// Video, `IOVideoMixerSettings.mode = .offscreen` ile HaishinKit'in `Screen`
/// bileşiminden geçer; skorbord bir `ImageScreenObject` olarak bu bileşime
/// eklenir, böylece yayına gömülür (önizlemede de görünür).
final class LiveCameraView: ExpoView {
  let onStateChange = EventDispatcher()
  let onStats = EventDispatcher()

  static let maxRetries = 5

  private let connection = RTMPConnection()
  private lazy var stream = RTMPStream(connection: connection)
  private let hkView = MTHKView(frame: .zero)

  // Yapılandırma
  private var position: AVCaptureDevice.Position = .back
  private var streamSize = CGSize(width: 1280, height: 720)
  private var muted = false

  // Durum
  private var state = "idle"
  private var cameraAttached = false
  private var released = true
  private var appUrl = ""
  private var streamKey = ""
  private var userStopped = true
  private var connected = false
  private var publishing = false
  private var attempts = 0
  private var retryPending = false
  private var expectingSelfClose = false
  private var inBackground = false
  private var statsTimer: Timer?

  // Overlay
  private let overlayObject = ImageScreenObject()
  private var overlayAdded = false
  private var overlaySource: CGImage?
  private var overlayFrame = CGRect(x: 0, y: 0, width: 1, height: 1)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black

    hkView.videoGravity = .resizeAspectFill
    hkView.frame = bounds
    hkView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hkView)

    overlayObject.horizontalAlignment = .left
    overlayObject.verticalAlignment = .top

    var mixer = stream.videoMixerSettings
    mixer.mode = .offscreen
    stream.videoMixerSettings = mixer
    stream.videoOrientation = .landscapeRight
    configureEncoders(width: 1280, height: 720, fps: 30, videoKbps: 2500, audioKbps: 128)

    connection.addEventListener(.rtmpStatus, selector: #selector(rtmpStatusHandler(_:)), observer: self)
    connection.addEventListener(.ioError, selector: #selector(rtmpErrorHandler(_:)), observer: self)
    stream.addEventListener(.rtmpStatus, selector: #selector(streamStatusHandler(_:)), observer: self)

    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
    nc.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    nc.addObserver(self, selector: #selector(orientationDidChange), name: UIDevice.orientationDidChangeNotification, object: nil)
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
    statsTimer?.invalidate()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hkView.frame = bounds
  }

  // MARK: - Yaşam döngüsü

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview == nil {
      release()
    } else {
      released = false
      ElitligLiveModule.activeView = self
      DispatchQueue.main.async { [weak self] in self?.startPreviewIfPossible() }
    }
  }

  /// Görünüm RN ağacından kaldırıldı: yayını ve kamerayı kapat.
  func release() {
    guard !released else { return }
    stop()
    released = true
    stream.attachCamera(nil, track: 0)
    stream.attachAudio(nil)
    hkView.attachStream(nil)
    stream.screen.stopRunning()
    cameraAttached = false
    if ElitligLiveModule.activeView === self {
      ElitligLiveModule.activeView = nil
    }
  }

  // MARK: - Props

  func setFacing(_ value: String?) {
    let wanted: AVCaptureDevice.Position = value == "front" ? .front : .back
    guard wanted != position else { return }
    position = wanted
    if cameraAttached { attachCamera() }
  }

  // MARK: - Önizleme

  private var hasPermissions: Bool {
    AVCaptureDevice.authorizationStatus(for: .video) == .authorized &&
      AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
  }

  func onPermissionsGranted() {
    startPreviewIfPossible()
  }

  private func configureAudioSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)
    } catch {
      NSLog("[ElitligLive] AVAudioSession: \(error)")
    }
  }

  private func attachCamera() {
    let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
    stream.attachCamera(device, track: 0) { [weak self] _, error in
      guard let error else { return }
      DispatchQueue.main.async {
        self?.emitState("failed", message: "camera_error: \(error)")
      }
    }
  }

  private func startPreviewIfPossible() {
    guard !released, !cameraAttached else { return }
    guard hasPermissions else {
      emitState("idle", message: "permission_missing")
      return
    }
    configureAudioSession()
    updateVideoOrientation()
    stream.screen.startRunning()
    attachCamera()
    stream.attachAudio(AVCaptureDevice.default(for: .audio)) { _, error in
      if let error { NSLog("[ElitligLive] attachAudio: \(error)") }
    }
    hkView.attachStream(stream) // görünüm bağlanınca yakalama oturumu başlar
    cameraAttached = true
    applyMute()
    emitState("previewing")
  }

  @objc private func orientationDidChange() {
    updateVideoOrientation()
  }

  /// Yayın her zaman yatay. Cihaz yatay tutuluyorsa ona göre çevir, dikeyse son yatay yönü koru.
  private func updateVideoOrientation() {
    switch UIDevice.current.orientation {
    case .landscapeLeft:
      stream.videoOrientation = .landscapeRight
    case .landscapeRight:
      stream.videoOrientation = .landscapeLeft
    default:
      break
    }
  }

  private func configureEncoders(width: Int, height: Int, fps: Int, videoKbps: Int, audioKbps: Int) {
    streamSize = CGSize(width: width, height: height)
    stream.sessionPreset = (width > 1280 || height > 720) ? .hd1920x1080 : .hd1280x720
    stream.frameRate = Float64(fps)
    stream.screen.frameRate = fps
    stream.screen.size = streamSize
    stream.videoSettings = VideoCodecSettings(
      videoSize: streamSize,
      bitRate: videoKbps * 1000,
      profileLevel: kVTProfileLevel_H264_Main_AutoLevel as String,
      scalingMode: .trim,
      bitRateMode: .average,
      maxKeyFrameIntervalDuration: 2 // YouTube: keyframe ≤ 2 sn
    )
    stream.audioSettings = AudioCodecSettings(bitRate: audioKbps * 1000)
    layoutOverlay()
  }

  // MARK: - Yayın

  func start(url: String, width: Int, height: Int, fps: Int, videoBitrateKbps: Int, audioBitrateKbps: Int) throws {
    guard !released else { throw LiveException("Görünüm kaldırıldı.") }
    guard userStopped else { throw LiveException("Yayın zaten sürüyor.") }
    guard hasPermissions else { throw LiveException("Kamera/mikrofon izni yok.") }
    guard let parts = LiveCameraView.splitUrl(url) else {
      throw LiveException("Yayın adresi çözümlenemedi (beklenen: rtmp://sunucu/uygulama/anahtar).")
    }
    let (app, key) = parts
    configureEncoders(width: width, height: height, fps: fps, videoKbps: videoBitrateKbps, audioKbps: audioBitrateKbps)
    if !cameraAttached { startPreviewIfPossible() }

    appUrl = app
    streamKey = key
    stream.fcPublishName = key
    userStopped = false
    connected = false
    publishing = false
    attempts = 0
    retryPending = false
    emitState("connecting")
    connection.connect(appUrl)
    UIApplication.shared.isIdleTimerDisabled = true
    startStatsTimer()
  }

  func stop() {
    let wasActive = !userStopped
    userStopped = true
    retryPending = false
    connected = false
    publishing = false
    stopStatsTimer()
    stream.close()
    connection.close()
    UIApplication.shared.isIdleTimerDisabled = false
    if wasActive { emitState("stopped") }
  }

  func switchCamera() throws {
    position = position == .back ? .front : .back
    attachCamera()
  }

  func setMuted(_ value: Bool) throws {
    muted = value
    applyMute()
  }

  private func applyMute() {
    var settings = stream.audioMixerSettings
    settings.isMuted = muted
    stream.audioMixerSettings = settings
  }

  /// "rtmp://a.rtmp.youtube.com/live2/ANAHTAR" → ("rtmp://a.rtmp.youtube.com/live2", "ANAHTAR")
  static func splitUrl(_ url: String) -> (String, String)? {
    let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let slash = trimmed.lastIndex(of: "/") else { return nil }
    let app = String(trimmed[..<slash])
    let key = String(trimmed[trimmed.index(after: slash)...])
    guard !key.isEmpty, let parsed = URL(string: app), parsed.host != nil, !parsed.path.isEmpty, parsed.path != "/" else {
      return nil
    }
    return (app, key)
  }

  // MARK: - RTMP olayları

  @objc private func rtmpStatusHandler(_ notification: Notification) {
    let e = Event.from(notification)
    guard let data = e.data as? ASObject, let code = data["code"] as? String else { return }
    let description = (data["description"] as? String) ?? code
    DispatchQueue.main.async { [weak self] in
      self?.handleConnectionCode(code, description: description)
    }
  }

  @objc private func streamStatusHandler(_ notification: Notification) {
    let e = Event.from(notification)
    guard let data = e.data as? ASObject, let code = data["code"] as? String else { return }
    DispatchQueue.main.async { [weak self] in
      self?.handleStreamCode(code)
    }
  }

  @objc private func rtmpErrorHandler(_ notification: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.userStopped else { return }
      self.connected = false
      self.publishing = false
      self.scheduleRetry(reason: "io_error")
    }
  }

  private func handleConnectionCode(_ code: String, description: String) {
    guard !userStopped else { return }
    switch code {
    case RTMPConnection.Code.connectSuccess.rawValue:
      connected = true
      stream.publish(streamKey)
    case RTMPConnection.Code.connectClosed.rawValue:
      if expectingSelfClose {
        expectingSelfClose = false
        return
      }
      connected = false
      publishing = false
      scheduleRetry(reason: code)
    case RTMPConnection.Code.connectFailed.rawValue,
         RTMPConnection.Code.connectRejected.rawValue,
         RTMPConnection.Code.connectIdleTimeOut.rawValue,
         RTMPConnection.Code.connectAppshutdown.rawValue,
         RTMPConnection.Code.connectInvalidApp.rawValue:
      connected = false
      publishing = false
      scheduleRetry(reason: description)
    default:
      break
    }
  }

  private func handleStreamCode(_ code: String) {
    guard !userStopped else { return }
    switch code {
    case RTMPStream.Code.publishStart.rawValue:
      publishing = true
      attempts = 0
      if inBackground {
        emitState("reconnecting", message: "app_background")
      } else {
        emitState("live")
      }
    case RTMPStream.Code.publishBadName.rawValue:
      fail(reason: "bad_stream_key")
    case RTMPStream.Code.failed.rawValue:
      publishing = false
      scheduleRetry(reason: code)
    default:
      break
    }
  }

  private func scheduleRetry(reason: String) {
    guard !userStopped, !retryPending else { return }
    attempts += 1
    guard attempts <= LiveCameraView.maxRetries else {
      fail(reason: reason)
      return
    }
    let delay = min(pow(2.0, Double(attempts)), 16.0) // 2, 4, 8, 16, 16 sn
    retryPending = true
    emitState("reconnecting", message: "(\(attempts)/\(LiveCameraView.maxRetries)) \(reason)")
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      guard let self, self.retryPending, !self.userStopped else { return }
      if self.connection.connected {
        self.expectingSelfClose = true
        self.connection.close()
      }
      self.connection.connect(self.appUrl)
      self.retryPending = false
    }
  }

  private func fail(reason: String) {
    userStopped = true
    retryPending = false
    connected = false
    publishing = false
    stopStatsTimer()
    stream.close()
    connection.close()
    UIApplication.shared.isIdleTimerDisabled = false
    emitState("failed", message: reason)
  }

  // MARK: - Arka plan

  @objc private func didEnterBackground() {
    inBackground = true
    // iOS arka planda kamerayı keser (HaishinKit video yakalamayı durdurur).
    if !userStopped {
      emitState("reconnecting", message: "app_background")
    }
  }

  @objc private func willEnterForeground() {
    inBackground = false
    guard !userStopped else { return }
    if publishing {
      emitState("live")
    } else if !retryPending {
      // Bağlantı arka planda düştüyse yeniden dene.
      attempts = 0
      scheduleRetry(reason: "app_foreground")
    }
  }

  // MARK: - İstatistik

  private func startStatsTimer() {
    stopStatsTimer()
    let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
      guard let self, self.publishing else { return }
      let kbps = Double(self.connection.currentBytesOutPerSecond) * 8.0 / 1000.0
      self.onStats([
        "bitrateKbps": kbps.rounded(),
        "fps": Double(self.stream.currentFPS)
      ])
    }
    RunLoop.main.add(timer, forMode: .common)
    statsTimer = timer
  }

  private func stopStatsTimer() {
    statsTimer?.invalidate()
    statsTimer = nil
  }

  // MARK: - Overlay

  /// image nil → kaldır. frame: 0..1 normalize, sol-üst orijin.
  func setOverlay(_ image: CGImage?, frame: CGRect) {
    let x = min(max(frame.origin.x, 0), 1)
    let y = min(max(frame.origin.y, 0), 1)
    let w = min(max(frame.size.width, 0), 1 - x)
    let h = min(max(frame.size.height, 0), 1 - y)
    overlayFrame = CGRect(x: x, y: y, width: w, height: h)
    overlaySource = image
    layoutOverlay()
  }

  /// ScreenRendererByCPU görseli ölçeklemez (kendi piksel boyutunda çizer), bu yüzden
  /// görsel hedef piksel boyutuna burada önceden ölçeklenir.
  private func layoutOverlay() {
    guard let source = overlaySource else {
      if overlayAdded {
        stream.screen.removeChild(overlayObject)
        overlayAdded = false
      }
      overlayObject.cgImage = nil
      return
    }
    let canvas = streamSize
    // floor: konum + boyut tuval dışına taşmasın (renderer sınır denetimi yapmaz).
    let left = (overlayFrame.origin.x * canvas.width).rounded(.down)
    let top = (overlayFrame.origin.y * canvas.height).rounded(.down)
    let px = min(Int((overlayFrame.width * canvas.width).rounded(.down)), Int(canvas.width - left))
    let py = min(Int((overlayFrame.height * canvas.height).rounded(.down)), Int(canvas.height - top))
    guard px > 0, py > 0, let scaled = LiveCameraView.scale(source, width: px, height: py) else { return }
    overlayObject.size = CGSize(width: px, height: py)
    overlayObject.layoutMargin = UIEdgeInsets(top: top, left: left, bottom: 0, right: 0)
    overlayObject.cgImage = scaled
    overlayObject.invalidateLayout()
    if !overlayAdded {
      do {
        try stream.screen.addChild(overlayObject)
        overlayAdded = true
      } catch {
        NSLog("[ElitligLive] overlay addChild: \(error)")
      }
    }
  }

  private static func scale(_ image: CGImage, width: Int, height: Int) -> CGImage? {
    if image.width == width && image.height == height { return image }
    guard let ctx = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .high
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return ctx.makeImage()
  }

  // MARK: - Olaylar

  private func emitState(_ newState: String, message: String? = nil) {
    state = newState
    var payload: [String: Any] = ["state": newState]
    if let message { payload["message"] = message }
    onStateChange(payload)
  }
}
