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
  let onStateChange = ExpoModulesCore.EventDispatcher()
  let onStats = ExpoModulesCore.EventDispatcher()
  let onReplayStateChange = ExpoModulesCore.EventDispatcher()
  let onRecordingStateChange = ExpoModulesCore.EventDispatcher()

  static let maxRetries = 5

  private let connection = RTMPConnection()
  private lazy var stream = RTMPStream(connection: connection)
  private let hkView = MTHKView(frame: .zero)

  // Yapılandırma
  private var position: AVCaptureDevice.Position = .back
  private var streamSize = CGSize(width: 1280, height: 720)
  private var videoKbps = 2500
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

  // Yakınlaştırma / fener için etkin kamera
  private var cameraDevice: AVCaptureDevice?
  private var torchOn = false

  // Overlay
  private let overlayObject = ImageScreenObject()
  private var overlayAdded = false

  // Gol klibi (dönen segment kaydı) ve tekrar (replay)
  private lazy var clipRecorder = ClipRecorder(outDir: ElitligLiveModule.clipsDirectory)
  private var clipRecorderAttached = false
  private var replayObject: AssetScreenObject?
  private let replayLabelObject = ImageScreenObject()
  private var replayLabelShown = false
  private var replayUri: String?
  private var replayTimer: Timer?
  private var overlaySource: CGImage?

  // Yayının tamamını telefona yazan kayıt (bkz. LocalRecorder).
  private lazy var localRecorder: LocalRecorder = {
    let recorder = LocalRecorder()
    recorder.onEvent = { [weak self] payload in
      guard let self, !self.released else { return }
      self.onRecordingStateChange(payload)
    }
    return recorder
  }()
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
    stopReplay(emit: false)
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
    cameraDevice = device
    if torchOn {
      stream.torch = false
      torchOn = false
    }
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
    self.videoKbps = videoKbps
    stream.sessionPreset = (width > 1280 || height > 720) ? .hd1920x1080 : .hd1280x720
    stream.frameRate = Float64(fps)
    stream.screen.frameRate = fps
    stream.screen.size = streamSize
    stream.videoSettings = VideoCodecSettings(
      videoSize: streamSize,
      bitRate: videoKbps * 1000,
      // High profil: aynı bit hızında Main'den daha temiz (çim / hızlı hareket).
      // Tüm A-serisi donanım kodlayıcıları destekler.
      profileLevel: kVTProfileLevel_H264_High_AutoLevel as String,
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
    attachClipRecorder()
  }

  func stop() {
    let wasActive = !userStopped
    userStopped = true
    retryPending = false
    connected = false
    publishing = false
    stopStatsTimer()
    detachClipRecorder()
    // Yerel kayıt açıksa MP4'ü kapat (olay: saved / reason = stream_end).
    localRecorder.stop(reason: "stream_end")
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

  // MARK: - Yakınlaştırma / fener

  /// Dijital yakınlaştırma üst sınırı (kalite için kameranın sınırı 8× ile kırpılır).
  private var maxZoom: CGFloat {
    guard let device = cameraDevice else { return 1 }
    return max(1, min(device.activeFormat.videoMaxZoomFactor, 8))
  }

  func cameraCapabilities() -> [String: Any] {
    guard cameraAttached, let device = cameraDevice else {
      return ["minZoom": 1.0, "maxZoom": 1.0, "zoom": 1.0, "torch": false, "torchOn": false]
    }
    return [
      "minZoom": 1.0,
      "maxZoom": Double(maxZoom),
      "zoom": Double(min(max(device.videoZoomFactor, 1), maxZoom)),
      "torch": device.hasTorch && device.isTorchAvailable,
      "torchOn": torchOn
    ]
  }

  func setZoom(_ level: Double) throws -> Double {
    guard cameraAttached, let device = cameraDevice else {
      throw LiveException("Kamera açık değil.")
    }
    let clamped = min(max(CGFloat(level), 1), maxZoom)
    do {
      try device.lockForConfiguration()
      device.videoZoomFactor = clamped
      device.unlockForConfiguration()
    } catch {
      throw LiveException("Yakınlaştırma uygulanamadı: \(error.localizedDescription)")
    }
    return Double(clamped)
  }

  func setTorch(_ on: Bool) throws -> Bool {
    guard cameraAttached, let device = cameraDevice else {
      throw LiveException("Kamera açık değil.")
    }
    guard device.hasTorch, device.isTorchAvailable else { return false }
    stream.torch = on
    torchOn = on
    return on
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
    detachClipRecorder()
    localRecorder.stop(reason: "stream_failed")
    stream.close()
    connection.close()
    UIApplication.shared.isIdleTimerDisabled = false
    emitState("failed", message: reason)
  }

  // MARK: - Arka plan

  @objc private func didEnterBackground() {
    inBackground = true
    // Arka planda süreç askıya alınır / öldürülebilir: MP4'ü şimdi güvenle kapat.
    localRecorder.pause(reason: "background")
    // iOS arka planda kamerayı keser (HaishinKit video yakalamayı durdurur).
    if !userStopped {
      emitState("reconnecting", message: "app_background")
    }
  }

  @objc private func willEnterForeground() {
    inBackground = false
    guard !userStopped else { return }
    localRecorder.resume() // arka planda kapatılan kayıt yeni parçayla sürer
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
    if overlayAdded && overlayObject.parent == nil { overlayAdded = false }
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
      overlayAdded = true
      restackScreenObjects()
    }
  }

  /// Ekran nesnesi sırası: [kamera (HaishinKit iç nesnesi), tekrar videosu, tekrar etiketi, skorbord].
  /// ScreenObjectContainer ekleme sırasına göre çizer; araya eklemek için üsttekiler çıkarılıp yeniden eklenir.
  private func restackScreenObjects() {
    let screen = stream.screen
    screen.removeChild(overlayObject)
    screen.removeChild(replayLabelObject)
    if let replayObject { screen.removeChild(replayObject) }
    do {
      if let replayObject { try screen.addChild(replayObject) }
      if replayLabelShown { try screen.addChild(replayLabelObject) }
      if overlayAdded { try screen.addChild(overlayObject) }
    } catch {
      NSLog("[ElitligLive] restack: \(error)")
    }
  }

  // MARK: - Tekrar (replay)

  /// Klibi yayına ve önizlemeye tam kare oynatır (HaishinKit AssetScreenObject, gerçek zamanlı).
  func playReplay(uri: String, label: String?) throws {
    guard !released, cameraAttached else {
      throw LiveCodedException(code: "ERR_REPLAY", message: "Kamera önizlemesi yok (önce önizleme ya da yayın başlamalı).")
    }
    let url: URL? = uri.hasPrefix("/") ? URL(fileURLWithPath: uri) : URL(string: uri)
    guard let url, url.isFileURL, FileManager.default.fileExists(atPath: url.path) else {
      throw LiveCodedException(code: "ERR_REPLAY", message: "Klip dosyası yok: \(uri)")
    }
    stopReplay(emit: false)
    let object = AssetScreenObject()
    object.videoGravity = .resizeAspectFill
    object.size = .zero // tüm kareyi kapla
    do {
      try object.startReading(AVURLAsset(url: url))
    } catch {
      throw LiveCodedException(code: "ERR_REPLAY", message: "Klip okunamadı: \(error.localizedDescription)")
    }
    replayObject = object
    if let label, !label.trimmingCharacters(in: .whitespaces).isEmpty, let image = LiveCameraView.renderLabel(label, canvasHeight: streamSize.height) {
      replayLabelObject.cgImage = image
      replayLabelObject.size = CGSize(width: image.width, height: image.height)
      replayLabelObject.horizontalAlignment = .right
      replayLabelObject.verticalAlignment = .top
      replayLabelObject.layoutMargin = UIEdgeInsets(
        top: (streamSize.height * 0.03).rounded(.down),
        left: 0,
        bottom: 0,
        right: (streamSize.width * 0.02).rounded(.down)
      )
      replayLabelObject.invalidateLayout()
      replayLabelShown = true
    }
    replayUri = uri
    restackScreenObjects()
    let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
      guard let self, let object = self.replayObject else { return }
      // AssetScreenObject son kareden sonra okuyucuyu kapatır → isReading false.
      if !object.isReading { self.stopReplay() }
    }
    RunLoop.main.add(timer, forMode: .common)
    replayTimer = timer
    onReplayStateChange(["playing": true, "uri": uri])
  }

  func stopReplay(emit: Bool = true) {
    replayTimer?.invalidate()
    replayTimer = nil
    let wasActive = replayObject != nil
    if let object = replayObject {
      object.cancelReading()
      stream.screen.removeChild(object)
    }
    replayObject = nil
    if replayLabelShown {
      stream.screen.removeChild(replayLabelObject)
      replayLabelShown = false
      replayLabelObject.cgImage = nil
    }
    let uri = replayUri
    replayUri = nil
    if emit && wasActive {
      var payload: [String: Any] = ["playing": false]
      if let uri { payload["uri"] = uri }
      onReplayStateChange(payload)
    }
  }

  private static func renderLabel(_ text: String, canvasHeight: CGFloat) -> CGImage? {
    let fontSize = max(18, (canvasHeight * 0.045).rounded())
    let font = UIFont.boldSystemFont(ofSize: fontSize)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
    let textSize = (text as NSString).size(withAttributes: attrs)
    let padH = (fontSize * 0.5).rounded()
    let padV = (fontSize * 0.25).rounded()
    let size = CGSize(width: (textSize.width + padH * 2).rounded(.up), height: (textSize.height + padV * 2).rounded(.up))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1 // piksel = nokta (yayın karesi pikseli)
    format.opaque = false
    let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      UIColor(red: 0.78, green: 0.06, blue: 0.18, alpha: 0.8).setFill()
      UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: size.height / 4).fill()
      (text as NSString).draw(at: CGPoint(x: padH, y: padV), withAttributes: attrs)
    }
    return image.cgImage
  }

  // MARK: - Yerel kayıt (yayının tamamı → telefon hafızası)

  /// Yayın sürerken çağrılır. RTMP yeniden bağlanmaları kaydı kesmez. Dönen: { path, uri }.
  func startLocalRecording(fileName: String) throws -> [String: Any] {
    guard !released, !userStopped else {
      throw LiveCodedException(code: "NOT_STREAMING", message: "Yerel kayıt yalnız yayın sürerken başlatılabilir.")
    }
    return try localRecorder.start(
      stream: stream,
      fileName: fileName,
      videoBitrate: videoKbps * 1000,
      startPaused: inBackground
    )
  }

  /// Kaydı kapatır; özet { path, uri, bytes, durationMs, parts } ya da nil.
  func stopLocalRecording(completion: @escaping ([String: Any]?) -> Void) {
    localRecorder.stop(reason: "stopped", completion: completion)
  }

  func localRecordingStatus() -> [String: Any] {
    localRecorder.status()
  }

  // MARK: - Gol klibi

  private func attachClipRecorder() {
    guard !clipRecorderAttached else { return }
    clipRecorder.start()
    stream.addObserver(clipRecorder)
    clipRecorderAttached = true
  }

  private func detachClipRecorder() {
    guard clipRecorderAttached else { return }
    stream.removeObserver(clipRecorder)
    clipRecorder.stop()
    clipRecorderAttached = false
  }

  /// Yayın sürerken (live / reconnecting) son `seconds` saniyeyi MP4'e yazar.
  func saveClip(
    seconds: Double,
    afterSeconds: Double,
    completion: @escaping (Swift.Result<ClipRecorder.Result, ClipRecorder.Failure>) -> Void
  ) {
    guard isStreamingForClip else {
      completion(.failure(.init(code: "NOT_STREAMING", message: "Klip yalnız yayın sürerken alınabilir.")))
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, afterSeconds)) { [weak self] in
      guard let self, self.isStreamingForClip else {
        completion(.failure(.init(code: "NOT_STREAMING", message: "Yayın klip yazılmadan durdu.")))
        return
      }
      self.clipRecorder.cut(seconds: seconds, completion: completion)
    }
  }

  private var isStreamingForClip: Bool {
    !released && !userStopped && clipRecorderAttached && (state == "live" || state == "reconnecting")
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
