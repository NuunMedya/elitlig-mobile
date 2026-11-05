import AVFoundation
import CoreMedia
import Foundation
import HaishinKit

/// Gol klibi için dönen kayıt (iOS).
///
/// HaishinKit 1.9.9 kodlanmış örnekleri dışarı vermiyor: `IOStreamObserver`
/// yalnız bileşik (Screen offscreen: kamera + skorbord) ham video kareleri ve
/// mikser çıkışı PCM ses alır. Bu yüzden kareler AVAssetWriter ile ~2 sn'lik
/// MP4 segmentlerine sürekli yazılır (her segment anahtar kareyle başlar), son
/// [keepSegments] segment tutulur. `cut` çağrılınca açık segment kapatılır,
/// gereken son segmentler AVMutableComposition ile birleştirilip
/// AVAssetExportSession (passthrough, yeniden kodlama yok) ile tek MP4 olur.
final class ClipRecorder: IOStreamObserver {
  struct Result {
    let url: URL
    let durationMs: Double
    let width: Double
    let height: Double
    let sizeBytes: Double
  }

  struct Failure: Error {
    let code: String
    let message: String
  }

  private struct Segment {
    let url: URL
    let start: CMTime
    let end: CMTime
    var duration: Double { (end - start).seconds }
  }

  var segmentDuration: Double = 2.0
  var keepSegments = 8 // ≈ 16 sn
  var videoBitrate = 3_000_000
  var audioBitrate = 128_000

  private let queue = DispatchQueue(label: "com.elitlig.live.clip-recorder")
  private let finishing = DispatchGroup()
  private let workDir: URL
  private let outDir: URL

  private var running = false
  private var writer: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?
  private var currentURL: URL?
  private var currentStart: CMTime = .invalid
  private var lastVideoPts: CMTime = .invalid
  private var audioFormat: CMFormatDescription?
  private var segments: [Segment] = []
  private var pinned = Set<URL>()
  private var deferredDeletes = Set<URL>()

  init(outDir: URL) {
    self.outDir = outDir
    workDir = FileManager.default.temporaryDirectory.appendingPathComponent("elitlig-clip-segments", isDirectory: true)
  }

  // MARK: - Yaşam döngüsü

  func start() {
    queue.async {
      self.discardAll()
      try? FileManager.default.createDirectory(at: self.workDir, withIntermediateDirectories: true)
      self.running = true
    }
  }

  func stop() {
    queue.async {
      self.running = false
      self.discardAll()
    }
  }

  private func discardAll() {
    if let w = writer {
      videoInput?.markAsFinished()
      audioInput?.markAsFinished()
      w.cancelWriting()
    }
    writer = nil
    videoInput = nil
    audioInput = nil
    if let url = currentURL { try? FileManager.default.removeItem(at: url) }
    currentURL = nil
    currentStart = .invalid
    lastVideoPts = .invalid
    for seg in segments where !pinned.contains(seg.url) {
      try? FileManager.default.removeItem(at: seg.url)
    }
    segments.removeAll()
  }

  // MARK: - IOStreamObserver

  func stream(_ stream: IOStream, didOutput video: CMSampleBuffer) {
    queue.async { self.appendVideo(video) }
  }

  func stream(_ stream: IOStream, didOutput audio: AVAudioBuffer, when: AVAudioTime) {
    // PCM tamponu çağrıdan sonra yeniden kullanılabilir: veriyi hemen kopyala.
    guard let pcm = audio as? AVAudioPCMBuffer, let sample = ClipRecorder.makeSampleBuffer(pcm, when) else { return }
    queue.async { self.appendAudio(sample) }
  }

  // MARK: - Yazma (queue üzerinde)

  private func appendVideo(_ sample: CMSampleBuffer) {
    guard running else { return }
    let pts = sample.presentationTimeStamp
    guard pts.isValid else { return }
    if writer == nil || (pts - currentStart).seconds >= segmentDuration {
      finishCurrent(endAt: pts)
      openWriter(at: pts, format: sample.formatDescription)
    }
    guard let input = videoInput, input.isReadyForMoreMediaData else { return }
    if input.append(sample) {
      lastVideoPts = pts
    }
  }

  private func appendAudio(_ sample: CMSampleBuffer) {
    if audioFormat == nil { audioFormat = sample.formatDescription }
    guard running, let w = writer, w.status == .writing, let input = audioInput,
          input.isReadyForMoreMediaData, sample.presentationTimeStamp >= currentStart else { return }
    input.append(sample)
  }

  private func openWriter(at pts: CMTime, format: CMFormatDescription?) {
    guard let format else { return }
    let dims = CMVideoFormatDescriptionGetDimensions(format)
    let url = workDir.appendingPathComponent("seg-\(UUID().uuidString).mp4")
    do {
      let w = try AVAssetWriter(outputURL: url, fileType: .mp4)
      let vSettings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: Int(dims.width),
        AVVideoHeightKey: Int(dims.height),
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: videoBitrate,
          AVVideoMaxKeyFrameIntervalDurationKey: segmentDuration,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoAllowFrameReorderingKey: false
        ]
      ]
      let v = AVAssetWriterInput(mediaType: .video, outputSettings: vSettings, sourceFormatHint: format)
      v.expectsMediaDataInRealTime = true
      guard w.canAdd(v) else { return }
      w.add(v)
      var a: AVAssetWriterInput?
      if let af = audioFormat, let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(af)?.pointee {
        let aSettings: [String: Any] = [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: asbd.mSampleRate,
          AVNumberOfChannelsKey: Int(min(max(asbd.mChannelsPerFrame, 1), 2)),
          AVEncoderBitRateKey: audioBitrate
        ]
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: aSettings, sourceFormatHint: af)
        input.expectsMediaDataInRealTime = true
        if w.canAdd(input) {
          w.add(input)
          a = input
        }
      }
      guard w.startWriting() else {
        try? FileManager.default.removeItem(at: url)
        return
      }
      w.startSession(atSourceTime: pts)
      writer = w
      videoInput = v
      audioInput = a
      currentURL = url
      currentStart = pts
    } catch {
      NSLog("[ElitligLive] clip writer: \(error)")
    }
  }

  /// Açık segmenti kapatır; tamamlanınca segment listesine eklenir.
  private func finishCurrent(endAt end: CMTime) {
    guard let w = writer, let url = currentURL else { return }
    let start = currentStart
    writer = nil
    currentURL = nil
    videoInput?.markAsFinished()
    audioInput?.markAsFinished()
    videoInput = nil
    audioInput = nil
    var endTime = end
    if !(endTime > start) { endTime = start + CMTime(value: 1, timescale: 30) }
    guard w.status == .writing else {
      w.cancelWriting()
      try? FileManager.default.removeItem(at: url)
      return
    }
    w.endSession(atSourceTime: endTime)
    finishing.enter()
    w.finishWriting { [weak self] in
      guard let self else { return }
      self.queue.async {
        if w.status == .completed {
          self.segments.append(Segment(url: url, start: start, end: endTime))
          self.prune()
        } else {
          try? FileManager.default.removeItem(at: url)
        }
        self.finishing.leave()
      }
    }
  }

  private func prune() {
    while segments.count > keepSegments {
      let old = segments.removeFirst()
      if pinned.contains(old.url) {
        deferredDeletes.insert(old.url)
      } else {
        try? FileManager.default.removeItem(at: old.url)
      }
    }
  }

  // MARK: - Klip

  func cut(seconds: Double, completion: @escaping (Swift.Result<Result, Failure>) -> Void) {
    queue.async {
      guard self.running else {
        completion(.failure(Failure(code: "NOT_STREAMING", message: "Klip yalnız yayın sürerken alınabilir.")))
        return
      }
      if self.lastVideoPts.isValid {
        self.finishCurrent(endAt: self.lastVideoPts + CMTime(value: 1, timescale: 30))
      }
      // Bir sonraki video karesi yeni segment açar.
      self.finishing.notify(queue: self.queue) {
        var chosen: [Segment] = []
        var total = 0.0
        for seg in self.segments.reversed() {
          chosen.insert(seg, at: 0)
          total += seg.duration
          if total >= seconds { break }
        }
        guard total >= 1.0 else {
          completion(.failure(Failure(code: "NO_BUFFER", message: "Tamponda 1 sn'den az görüntü var.")))
          return
        }
        chosen.forEach { self.pinned.insert($0.url) }
        self.export(chosen) { result in
          self.queue.async {
            chosen.forEach { self.pinned.remove($0.url) }
            for url in self.deferredDeletes where !self.pinned.contains(url) {
              try? FileManager.default.removeItem(at: url)
            }
            self.deferredDeletes = self.deferredDeletes.filter { self.pinned.contains($0) }
          }
          completion(result)
        }
      }
    }
  }

  private func export(_ chosen: [Segment], completion: @escaping (Swift.Result<Result, Failure>) -> Void) {
    let comp = AVMutableComposition()
    guard let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
          let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      completion(.failure(Failure(code: "CLIP_WRITE_FAILED", message: "Kompozisyon oluşturulamadı.")))
      return
    }
    var cursor = CMTime.zero
    var hasAudio = false
    var size = CGSize.zero
    for seg in chosen {
      let asset = AVURLAsset(url: seg.url)
      guard let sv = asset.tracks(withMediaType: .video).first else { continue }
      let range = sv.timeRange
      do {
        try vTrack.insertTimeRange(range, of: sv, at: cursor)
        if size == .zero {
          size = sv.naturalSize
          vTrack.preferredTransform = sv.preferredTransform
        }
        if let sa = asset.tracks(withMediaType: .audio).first {
          let ar = CMTimeRangeGetIntersection(sa.timeRange, otherRange: range)
          if ar.duration > .zero {
            try aTrack.insertTimeRange(ar, of: sa, at: cursor + (ar.start - range.start))
            hasAudio = true
          }
        }
      } catch {
        NSLog("[ElitligLive] clip compose: \(error)")
        continue
      }
      cursor = cursor + range.duration
    }
    if !hasAudio { comp.removeTrack(aTrack) }
    guard cursor.seconds >= 1.0 else {
      completion(.failure(Failure(code: "NO_BUFFER", message: "Tamponda 1 sn'den az görüntü var.")))
      return
    }
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let out = outDir.appendingPathComponent("clip-\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
    guard let session = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough) else {
      completion(.failure(Failure(code: "CLIP_WRITE_FAILED", message: "Dışa aktarma oturumu açılamadı.")))
      return
    }
    session.outputURL = out
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true // moov başta (faststart)
    let duration = cursor
    session.exportAsynchronously {
      guard session.status == .completed else {
        try? FileManager.default.removeItem(at: out)
        completion(.failure(Failure(
          code: "CLIP_WRITE_FAILED",
          message: "MP4 yazılamadı: \(session.error?.localizedDescription ?? "bilinmeyen hata")"
        )))
        return
      }
      let bytes = (try? FileManager.default.attributesOfItem(atPath: out.path)[.size] as? NSNumber)?.doubleValue ?? 0
      completion(.success(Result(
        url: out,
        durationMs: (duration.seconds * 1000).rounded(),
        width: Double(size.width),
        height: Double(size.height),
        sizeBytes: bytes
      )))
    }
  }

  /// HaishinKit'in iç `AVAudioPCMBuffer.makeSampleBuffer` yardımcısının eşdeğeri (o internal).
  static func makeSampleBuffer(_ buffer: AVAudioPCMBuffer, _ when: AVAudioTime) -> CMSampleBuffer? {
    var sampleBuffer: CMSampleBuffer?
    let pts = CMTime(seconds: AVAudioTime.seconds(forHostTime: when.hostTime), preferredTimescale: 1_000_000_000)
    var status = CMAudioSampleBufferCreateWithPacketDescriptions(
      allocator: nil,
      dataBuffer: nil,
      dataReady: false,
      makeDataReadyCallback: nil,
      refcon: nil,
      formatDescription: buffer.format.formatDescription,
      sampleCount: Int(buffer.frameLength),
      presentationTimeStamp: pts,
      packetDescriptions: nil,
      sampleBufferOut: &sampleBuffer
    )
    guard status == noErr, let sampleBuffer else { return nil }
    status = CMSampleBufferSetDataBufferFromAudioBufferList(
      sampleBuffer,
      blockBufferAllocator: kCFAllocatorDefault,
      blockBufferMemoryAllocator: kCFAllocatorDefault,
      flags: 0,
      bufferList: buffer.audioBufferList
    )
    return status == noErr ? sampleBuffer : nil
  }
}
