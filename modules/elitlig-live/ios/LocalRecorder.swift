import AVFoundation
import Foundation
import HaishinKit
import UIKit

/// Yayının TAMAMINI telefon hafızasına MP4 olarak yazar (iOS).
///
/// HaishinKit 1.9.9'un `IOStreamRecorder`'ı kullanılır: `IOStreamObserver` olarak
/// yayına giden bileşik kareyi (kamera + gömülü skorbord) ve mikser sesini alır,
/// AVAssetWriter ile ikinci bir H.264/AAC kodlamasıyla dosyaya yazar. Gözlemci,
/// RTMP bağlantısından bağımsız beslenir: yeniden bağlanmalar kaydı kesmez.
///
/// Dosya yeri: uygulamanın Belgeler (Documents) klasörü (IOStreamRecorder'da sabit).
/// Eklenti `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` ekler; dosya
/// Dosyalar uygulamasında "iPhone'umda ▸ ElitLig" altında görünür.
///
/// Güvenlik: uygulama arka plana geçince parça kapatılır (`pause`), ön plana dönünce
/// yeni parça (`_p2`…) açılır (`resume`). `movieFragmentInterval` 10 sn: süreç ölürse
/// o ana kadarki bölüm okunabilir kalır. Boş alan `minFreeBytes` altına inerse kayıt
/// düzgünce kapatılır. Bütün durum ANA iş parçacığında tutulur.
final class LocalRecorder: IOStreamRecorderDelegate {
  static let minFreeBytes: Int64 = 300 * 1024 * 1024

  private struct Closing {
    let recorder: IOStreamRecorder
    let url: URL
    let part: Int
    let startedAt: Date
    let reason: String
    let isFinal: Bool
    let backgroundTask: UIBackgroundTaskIdentifier
  }

  /// Ana iş parçacığında çağrılır.
  var onEvent: (([String: Any]) -> Void)?

  private weak var stream: IOStream?
  private var current: IOStreamRecorder?
  private var currentURL: URL?
  private var currentPart = 0
  private var currentStartedAt = Date()
  private var closing: [Closing] = []
  private var finishCallbacks: [([String: Any]?) -> Void] = []

  private(set) var active = false
  private var paused = false
  private var baseName = ""
  private var videoBitrate = 2_500_000
  private var savedParts = 0
  private var savedBytes: Int64 = 0
  private var savedDurationMs: Double = 0
  private var lastURL: URL?
  private var spaceTimer: Timer?

  // MARK: - Depolama

  static var documentsDirectory: URL {
    URL(fileURLWithPath: NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)[0])
  }

  /// Kullanılabilir alan (bayt); okunamazsa -1.
  static func freeBytes() -> Int64 {
    let url = URL(fileURLWithPath: NSHomeDirectory())
    if let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
       let free = values.volumeAvailableCapacityForImportantUsage {
      return free
    }
    if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()),
       let free = attrs[.systemFreeSize] as? NSNumber {
      return free.int64Value
    }
    return -1
  }

  static func totalBytes() -> Int64 {
    if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()),
       let total = attrs[.systemSize] as? NSNumber {
      return total.int64Value
    }
    return -1
  }

  /// ASCII güvenli dosya adı (uzantısız).
  static func sanitize(_ raw: String) -> String {
    var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if name.lowercased().hasSuffix(".mp4") { name = String(name.dropLast(4)) }
    let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
    var out = ""
    var lastUnderscore = false
    for ch in name {
      if allowed.contains(ch) && ch != "_" {
        out.append(ch)
        lastUnderscore = false
      } else if !lastUnderscore {
        out.append("_")
        lastUnderscore = true
      }
    }
    out = out.trimmingCharacters(in: CharacterSet(charactersIn: "_.-"))
    if out.count > 96 { out = String(out.prefix(96)) }
    return out.isEmpty ? "ElitLig_\(Int(Date().timeIntervalSince1970))" : out
  }

  // MARK: - Denetim (ana iş parçacığı)

  /// Kaydı başlatır. Dönen: { path, uri }.
  func start(stream: IOStream, fileName: String, videoBitrate: Int, startPaused: Bool) throws -> [String: Any] {
    guard !active else { throw LiveCodedException(code: "ERR_RECORD", message: "Yerel kayıt zaten sürüyor.") }
    let free = LocalRecorder.freeBytes()
    if free >= 0 && free < LocalRecorder.minFreeBytes {
      throw LiveCodedException(code: "ERR_RECORD", message: "Telefonda yeterli boş alan yok (en az 300 MB gerekir).")
    }
    self.stream = stream
    self.videoBitrate = videoBitrate
    baseName = LocalRecorder.sanitize(fileName)
    savedParts = 0
    savedBytes = 0
    savedDurationMs = 0
    lastURL = nil
    active = true
    paused = startPaused
    let url: URL
    if startPaused {
      url = LocalRecorder.documentsDirectory.appendingPathComponent(baseName).appendingPathExtension("mp4")
    } else {
      url = openPart()
    }
    startSpaceTimer()
    return ["path": url.path, "uri": url.absoluteString]
  }

  /// Kaydı bitirir; `completion` ana iş parçacığında özetle ({ path, uri, bytes, durationMs, parts })
  /// ya da hiçbir şey yazılmadıysa nil ile çağrılır.
  func stop(reason: String, completion: (([String: Any]?) -> Void)? = nil) {
    guard active else {
      completion?(nil)
      return
    }
    active = false
    paused = false
    stopSpaceTimer()
    if let completion { finishCallbacks.append(completion) }
    if current != nil {
      closeCurrent(reason: reason, isFinal: true)
    } else {
      flushFinishIfIdle()
    }
  }

  /// Arka plan: açık parçayı güvenle kapat; oturum `resume` ile sürer.
  func pause(reason: String) {
    guard active, !paused else { return }
    paused = true
    if current != nil { closeCurrent(reason: reason, isFinal: false) }
  }

  /// Ön plana dönüş: yeni parçayla sürdür.
  func resume() {
    guard active, paused else { return }
    paused = false
    _ = openPart()
  }

  /// { recording, paused, bytes, durationMs, parts, path, freeBytes }
  func status() -> [String: Any] {
    var bytes = savedBytes
    var durationMs = savedDurationMs
    var parts = savedParts
    if current != nil, let url = currentURL {
      bytes += LocalRecorder.fileSize(url)
      durationMs += Date().timeIntervalSince(currentStartedAt) * 1000
      parts += 1
    }
    return [
      "recording": active,
      "paused": active && paused,
      "bytes": Double(bytes),
      "durationMs": durationMs.rounded(),
      "parts": Double(parts),
      "path": (currentURL ?? lastURL)?.path ?? "",
      "freeBytes": Double(LocalRecorder.freeBytes())
    ]
  }

  // MARK: - Parça aç / kapat

  @discardableResult
  private func openPart() -> URL {
    let part = savedParts + closing.count + 1
    let stem = part > 1 ? "\(baseName)_p\(part)" : baseName
    let dir = LocalRecorder.documentsDirectory
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var name = stem
    var n = 2
    while FileManager.default.fileExists(atPath: dir.appendingPathComponent(name).appendingPathExtension("mp4").path) {
      name = "\(stem)_\(n)"
      n += 1
    }
    let url = dir.appendingPathComponent(name).appendingPathExtension("mp4")

    let recorder = IOStreamRecorder()
    recorder.delegate = self
    recorder.fileName = name // IOStreamRecorder ".mp4" uzantısını kendisi ekler
    recorder.settings = [
      .audio: [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 0,
        AVNumberOfChannelsKey: 0
      ],
      .video: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoHeightKey: 0,
        AVVideoWidthKey: 0,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: videoBitrate,
          AVVideoMaxKeyFrameIntervalDurationKey: 2.0,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoAllowFrameReorderingKey: false
        ] as [String: Any]
      ]
    ]
    recorder.movieFragmentInterval = 10
    current = recorder
    currentURL = url
    currentPart = part
    currentStartedAt = Date()
    stream?.addObserver(recorder)
    recorder.startRunning()
    onEvent?(["state": "started", "path": url.path, "part": Double(part)])
    return url
  }

  private func closeCurrent(reason: String, isFinal: Bool) {
    guard let recorder = current, let url = currentURL else { return }
    current = nil
    currentURL = nil
    stream?.removeObserver(recorder)
    // Arka plana geçerken dosyanın kapanmasına süre tanı.
    var task = UIBackgroundTaskIdentifier.invalid
    task = UIApplication.shared.beginBackgroundTask(withName: "elitlig-local-recording") { [weak self] in
      self?.endBackgroundTask(task)
    }
    closing.append(Closing(
      recorder: recorder,
      url: url,
      part: currentPart,
      startedAt: currentStartedAt,
      reason: reason,
      isFinal: isFinal,
      backgroundTask: task
    ))
    recorder.stopRunning() // kendi kuyruğunda finishWriting → temsilci çağrısı
    // Temsilci hiç çağrılmazsa (beklenmeyen durum) oturum askıda kalmasın.
    DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
      self?.resolveClosing(recorder, succeeded: true)
    }
  }

  private func endBackgroundTask(_ task: UIBackgroundTaskIdentifier) {
    guard task != .invalid else { return }
    if Thread.isMainThread {
      UIApplication.shared.endBackgroundTask(task)
    } else {
      DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
    }
  }

  /// Kapanan parçanın sonucu (ana iş parçacığı).
  private func resolveClosing(_ recorder: IOStreamRecorder, succeeded: Bool) {
    guard let index = closing.firstIndex(where: { $0.recorder === recorder }) else { return }
    let item = closing.remove(at: index)
    let size = LocalRecorder.fileSize(item.url)
    if succeeded && size > 0 {
      savedParts += 1
      savedBytes += size
      savedDurationMs += (Date().timeIntervalSince(item.startedAt) * 1000).rounded()
      lastURL = item.url
      onEvent?([
        "state": "saved",
        "reason": item.reason,
        "final": item.isFinal,
        "path": item.url.path,
        "uri": item.url.absoluteString,
        "part": Double(item.part),
        "parts": Double(savedParts),
        "bytes": Double(savedBytes),
        "durationMs": savedDurationMs
      ])
    } else {
      // Hiç kare yazılmadı ya da dosya kapatılamadı.
      try? FileManager.default.removeItem(at: item.url)
      if item.reason != "stopped" && item.reason != "stream_end" && item.reason != "released" && item.reason != "background" {
        onEvent?(["state": "error", "reason": item.reason, "message": "MP4 kapatılamadı", "final": item.isFinal])
      }
    }
    endBackgroundTask(item.backgroundTask)
    flushFinishIfIdle()
  }

  private func flushFinishIfIdle() {
    guard !active, closing.isEmpty, current == nil, !finishCallbacks.isEmpty else { return }
    let callbacks = finishCallbacks
    finishCallbacks.removeAll()
    var summary: [String: Any]?
    if savedParts > 0, let url = lastURL {
      summary = [
        "path": url.path,
        "uri": url.absoluteString,
        "bytes": Double(savedBytes),
        "durationMs": savedDurationMs,
        "parts": Double(savedParts)
      ]
    }
    callbacks.forEach { $0(summary) }
  }

  private static func fileSize(_ url: URL) -> Int64 {
    let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attrs?[.size] as? NSNumber)?.int64Value ?? 0
  }

  // MARK: - Boş alan güvenlik tabanı

  private func startSpaceTimer() {
    stopSpaceTimer()
    let timer = Timer(timeInterval: 5.0, repeats: true) { [weak self] _ in
      guard let self, self.active else { return }
      let free = LocalRecorder.freeBytes()
      if free >= 0 && free < LocalRecorder.minFreeBytes {
        self.stop(reason: "disk_full")
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    spaceTimer = timer
  }

  private func stopSpaceTimer() {
    spaceTimer?.invalidate()
    spaceTimer = nil
  }

  // MARK: - IOStreamRecorderDelegate (HaishinKit kuyruklarından gelir)

  func recorder(_ recorder: IOStreamRecorder, errorOccured error: IOStreamRecorder.Error) {
    NSLog("[ElitligLive] local recording: \(error)")
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if self.closing.contains(where: { $0.recorder === recorder }) {
        // Kapanış başarısız (çoğunlukla hiç kare yazılmadı).
        if case .failedToFinishWriting = error { self.resolveClosing(recorder, succeeded: false) }
        return
      }
      guard self.current === recorder, self.active else { return }
      if case .failedToCreateAssetWriter = error {
        // Dosya hiç açılamadı: kapatılacak bir şey yok.
        self.stream?.removeObserver(recorder)
        self.current = nil
        self.currentURL = nil
        self.active = false
        self.paused = false
        self.stopSpaceTimer()
        self.onEvent?(["state": "error", "reason": "error", "message": "Kayıt dosyası açılamadı", "final": true])
        self.flushFinishIfIdle()
        return
      }
      // Yazma hatası (çoğunlukla disk doldu): o ana kadar yazılanı kapatmayı dene.
      let free = LocalRecorder.freeBytes()
      self.stop(reason: free >= 0 && free < LocalRecorder.minFreeBytes ? "disk_full" : "error")
    }
  }

  func recorder(_ recorder: IOStreamRecorder, finishWriting writer: AVAssetWriter) {
    let ok = writer.status == .completed
    DispatchQueue.main.async { [weak self] in
      self?.resolveClosing(recorder, succeeded: ok)
    }
  }
}
