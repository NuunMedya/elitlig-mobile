# elitlig-live

Telefon kamerasından **RTMP / RTMPS** canlı yayın yapan yerel Expo modülü. Skorbord
PNG'si videonun **içine gömülür**: izleyici YouTube'da skorbordu görür, sonradan
eklenen bir katman değildir. Hedef YouTube'un RTMP girişi
(`rtmp://a.rtmp.youtube.com/live2/<anahtar>` ya da `rtmps://a.rtmps.youtube.com:443/live2/<anahtar>`),
ama her standart RTMP sunucusuyla çalışır.

| Platform | Kütüphane | Sürüm |
|---|---|---|
| Android | [RootEncoder](https://github.com/pedroSG94/RootEncoder) (`RtmpCamera2` + `OpenGlView`, overlay için `ImageObjectFilterRender`) | `com.github.pedroSG94.RootEncoder:library:2.6.1` (JitPack) |
| iOS | [HaishinKit](https://github.com/HaishinKit/HaishinKit.swift) (`RTMPConnection`, `RTMPStream`, `MTHKView`, offscreen `Screen` + `ImageScreenObject`) | `~> 1.9.9` (CocoaPods) |

Sürüm notları:
- **RootEncoder 2.6.1**, Kotlin 2.1.20 ile derlenmiş son sürüm; Expo 54 / RN 0.81 de Kotlin 2.1.20 kullanıyor.
  2.6.2 ve sonrası Kotlin 2.2, 2.7.3 ve sonrası Kotlin 2.3/2.4 ile derlenmiş. Bunlara yükseltmeden önce projenin `kotlinVersion`'ını da yükseltin.
- **HaishinKit 1.9.x**: 2.x tamamen farklı, actor tabanlı bir API. Podspec'teki `~> 1.9.9` kısıtını koruyun.

## JS API

```ts
import {
  LiveCameraView, isLiveAvailable, requestLivePermissions,
  startStream, stopStream, switchCamera, setMuted, setOverlay,
} from "@/modules/elitlig-live"; // ya da göreli yol

isLiveAvailable();                 // Expo Go / web / modül derlenmemişse false
await requestLivePermissions();    // kamera + mikrofon → boolean

<LiveCameraView
  style={{ flex: 1 }}               // 16:9 alanı doldurur (aspect-fill)
  facing="back"
  onStateChange={(e) => e.nativeEvent.state /* idle|previewing|connecting|live|reconnecting|failed|stopped */}
  onStats={(e) => e.nativeEvent /* { bitrateKbps, fps, droppedFrames? } — yayındayken ~1 sn */}
/>

await startStream("rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx", { videoBitrateKbps: 2500 });
await setOverlay("file:///.../scoreboard.png", { x: 0.02, y: 0.03, width: 0.42, height: 0.12 });
await setOverlay(null);            // kaldır
await setMuted(true);
await switchCamera();
await stopStream();
```

Varsayılanlar: 1280x720, 30 fps, H.264 2500 kbps, AAC 128 kbps (44.1 kHz stereo), keyframe aralığı 2 sn (YouTube bunu şart koşuyor).

`startStream` Promise'i bağlantı denemesi **başlayınca** çözülür. Bağlantının kurulduğunu `onStateChange` → `"live"` bildirir.
Geçersiz URL, izin yok, kodlayıcı desteklemiyor, görünüm yok gibi durumlarda Promise reddedilir.

### Durumlar ve `message`

| state | ne zaman | message |
|---|---|---|
| `idle` | izin yok | `permission_missing` |
| `previewing` | kamera açık, yayın yok | – |
| `connecting` | `startStream` çağrıldı | – |
| `live` | sunucu yayını kabul etti | – |
| `reconnecting` | ağ koptu, yeniden deneniyor | `(n/5) <neden>` |
| `reconnecting` | uygulama arka planda | `app_background` |
| `failed` | 5 deneme bitti / kimlik doğrulama / anahtar hatası / kamera hatası | neden (`auth_error`, `bad_stream_key`, `camera_error: …`) |
| `stopped` | `stopStream` çağrıldı | – |

Yeniden bağlanma en fazla 5 deneme yapar. Bekleme süresi artarak gider: 2, 4, 8, 16, 16 sn.
Bağlantı başarılı olunca sayaç sıfırlanır.

## Yakınlaştırma, fener, cihaz durumu (sonradan eklendi)

```ts
import { supportsCameraControls, getCameraCapabilities, setZoom, setTorch, getDeviceStatus } from "@/modules/elitlig-live";

supportsCameraControls();            // yerel modül bu işlevleri içeriyor mu (eski mağaza derlemesinde false)
await getCameraCapabilities();       // { minZoom, maxZoom, zoom, torch, torchOn } | null
await setZoom(2);                    // uygulanan düzey | null  (Android: Camera2 zoom aralığı; iOS: 1..min(8, cihaz))
await setTorch(true);                // son durum | null        (ön kamerada genellikle false)
await getDeviceStatus();             // { batteryLevel 0..1 | -1, charging, lowPower, network } | null
```

Bu dört işlev eski derlemede yoktur; JS sarmalayıcıları varlığı denetler ve yoksa `null` döner
(OTA ile giden JS, eski yerel modülle de çalışır). Kamera değişince yakınlaştırma ve fener sıfırlanır.
Android'de ağ türü için `ACCESS_NETWORK_STATE` (normal izin) manifest'e eklenir.

## Gol klibi ve tekrar (replay)

```ts
import { saveClip, playReplay, stopReplay, clearClips } from "@/modules/elitlig-live";

// GOL: yayına gidenin son ~10 sn'si (kamera + gömülü skorbord + ses) → MP4
const clip = await saveClip({ seconds: 10, afterSeconds: 2 });
// { uri: "file:///…/cache/elitlig-clips/clip-<ts>.mp4", durationMs, width, height, sizeBytes }

// Tekrar: klip yayına ve önizlemeye tam kare girer, skorbord üstte kalır, ses mikrofondan sürer.
await playReplay(clip.uri, { label: "TEKRAR", rate: 0.5 /* yalnız Android */ });
await stopReplay();     // ya da klip bitince kendiliğinden kameraya dönülür
await clearClips();     // yüklemeler bitince / ekrandan çıkışta
```

`<LiveCameraView onReplayStateChange={(e) => e.nativeEvent /* { playing, uri? } */} />`

`saveClip` hata kodları (`error.code`):
- `NOT_STREAMING`: durum `live` / `reconnecting` değil.
- `NO_BUFFER`: tamponda 1 sn'den az görüntü var.
- `CLIP_WRITE_FAILED`: MP4 yazılamadı.

`seconds` 1..13 aralığına, `afterSeconds` 0..10 aralığına kırpılır.
`playReplay` önizleme sırasında da çalışır.
Modül açılışında 24 saatten eski klipler silinir.

**Android: yeniden kodlama yok.**
- `ClipRingBuffer`, RootEncoder'ın `Camera2Base.setRecordController` kancasına takılır. Camera2Base her kodlanmış kareyi (kayıt yapılmasa da) `recordController.recordVideo/recordAudio`'ya verir.
- Tampon kodlanmış H.264 + AAC örneklerini son 16 sn boyunca tutar (en fazla 24 MB).
- `saveClip`, (şimdi − seconds) anındaki ya da ondan önceki son anahtar kareden başlar. MediaMuxer ile MP4 yazar ve zaman damgalarını 0'a çeker.
- Klip anahtar karede başladığı için istenenden en fazla ~2 sn uzun olabilir. faststart (moov başta) yok.
- Tekrar: `SurfaceFilterRender` (OES dokusu) + sessiz `MediaPlayer`. Filtre zinciri şöyle: `[tekrar videosu, etiket, skorbord]`.
- GL yeniden başlarsa tekrar durur: arka plana geçiş, yayın başlangıcında çözünürlük değişimi gibi.

**iOS: segmentli yeniden kodlama.**
- HaishinKit 1.9.9 kodlanmış örnekleri dışarı vermiyor. `IOStreamObserver` yalnız bileşik ham kare + PCM alıyor.
- `ClipRecorder`, yayın sürerken bu kareleri AVAssetWriter ile 2 sn'lik MP4 segmentlerine yazar (H.264 3 Mbps, AAC 128 kbps). Son 8 segment tutulur.
- `saveClip` açık segmenti kapatır ve gereken son segmentleri AVMutableComposition ile birleştirir. AVAssetExportSession passthrough ile dışa aktarır; faststart açık.
- Klip segment sınırında başlar: 10–12 sn.
- İkinci bir donanım kodlayıcı çalıştığı için ısınma ve pil kullanımı artar.
- Tekrar: HaishinKit `AssetScreenObject` ile gerçek zamanlı oynatılır. `rate` (ağır çekim) iOS'ta yok sayılır.

Ortak notlar:
- Klip, o anda **yayınlanan** görüntüdür. O andaki skorbord ve varsa o sırada oynayan tekrar da klibin içindedir.
- Tekrar sırasında güncel skorbord, klipteki eski skorbordun üstüne çizilir. Konum aynıysa eskisini örter.

## Yerel kayıt: yayının tamamı telefon hafızasına

```ts
import {
  supportsLocalRecording, getStorageInfo,
  startLocalRecording, stopLocalRecording, getLocalRecordingStatus,
} from "@/modules/elitlig-live";

supportsLocalRecording();              // yerel modül bu işlevleri içeriyor mu (eski derlemede false)
await getStorageInfo();                // { freeBytes, totalBytes, minFreeBytes, location, gallery } | null
await startStream(url, options);
await startLocalRecording("ElitLig_Ev-Deplasman_2026-11-12_20-30"); // { path, uri? } — yayın sürerken
await getLocalRecordingStatus();       // { recording, paused, bytes, durationMs, parts, path, freeBytes } | null
await stopLocalRecording();            // { path, uri?, bytes, durationMs, parts } | null
```

`<LiveCameraView onRecordingStateChange={(e) => e.nativeEvent} />`:

| state | ne zaman | alanlar |
|---|---|---|
| `started` | bir parça yazılmaya başladı | `path`, `part` |
| `saved` | bir parça güvenle kapatıldı | `reason`, `final`, `path`, `uri`, `part`, `parts`, `bytes`, `durationMs` (toplam) |
| `error` | yazılamadı / kapatılamadı | `reason` (`disk_full`, `error`, `finalize_failed`), `message`, `final` |

`saved.reason`: `stopped` (stopLocalRecording), `stream_end` (stopStream), `stream_failed` (yayın 5 denemeden sonra düştü),
`disk_full`, `released` (görünüm kaldırıldı), `background` ve `split` (`final: false`, kayıt sürüyor).

Davranış (iki platform):
- Kayıt, yayına giden görüntüdür: gömülü skorbord, altyazı, tekrar ve ses dosyanın içindedir.
- **RTMP yeniden bağlanmaları kaydı kesmez** (kodlayıcılar / gözlemci bağlantıdan bağımsız çalışır).
  Yayın tümüyle durunca (`stopStream`, `failed`) ya da görünüm kaldırılınca dosya kendiliğinden kapatılır.
- **Arka plan:** MP4'ün dizini dosya kapanırken yazılır; süreç ölürse dosya okunmaz kalır. Bu yüzden uygulama arka
  plana geçince açık parça kapatılır (`saved`, `reason: "background"`), ön plana dönünce `_p2`, `_p3`… adıyla yeni
  parça açılır. Arka plandaki süre kayıtta yoktur.
- **Boş alan tabanı 300 MB:** altındaysa kayıt başlamaz; sürerken altına inerse düzgünce kapatılır (`disk_full`).
- Uygulama zorla öldürülürse (çökme, sistem) o an açık olan parça kaybedilebilir.

**Android: yeniden kodlama yok.** `LocalRecorder`, `ClipRingBuffer` ile aynı `recordController` kancasından gelen
kodlanmış H.264/AAC örneklerini MediaMuxer ile doğrudan yazar (ek ısınma / pil yükü yok denecek kadar az).
- Android 10+ (API 29+): MediaStore → **`Movies/ElitLig/<ad>.mp4`**, Galeri'de görünür, depolama izni gerekmez
  (yazım sürerken `IS_PENDING=1`).
- Android 7–9: `Android/data/<paket>/files/Movies/ElitLig/` (izin gerekmez; Galeri'de görünmez).
- Parça ~3,5 GB'ı aşınca bir sonraki anahtar karede yeni parçaya geçilir (`split`): eski Android'de MediaMuxer 4 GB sınırı.
- Not: `Camera2Base.startRecord()` KULLANILMAZ; modülün kendi `recordController`'ı (`ClipRingBuffer`) takılı olduğu için
  o çağrı zaten reddedilir. Yayın olmadan "yalnız kayıt" bu yüzden yok.

**iOS: ikinci kodlama.** HaishinKit 1.9.9 `IOStreamRecorder` (bir `IOStreamObserver`) bileşik kareyi AVAssetWriter ile
yeniden kodlar (yayınla aynı görüntü bit hızı, `movieFragmentInterval = 10 sn`). Gol klibi kaydıyla birlikte üç
H.264 kodlaması çalışır: ısınma ve pil tüketimi artar.
- Dosya uygulamanın **Belgeler** klasörüne yazılır (IOStreamRecorder'da sabit). Eklenti `UIFileSharingEnabled` ve
  `LSSupportsOpeningDocumentsInPlace` ekler: **Dosyalar ▸ iPhone'umda ▸ ElitLig**.
- Boş alan `volumeAvailableCapacityForImportantUsage` ile okunur (gizlilik bildirimi: DiskSpace `E174.1`; Expo/RN
  şablonundaki `PrivacyInfo.xcprivacy` bunu zaten içerir).

## Kurulum (app.json)

```jsonc
"plugins": [
  // ...
  // ÖNEMLİ: @config-plugins/react-native-webrtc ve expo-image-picker'dan ÖNCE yazın.
  // Expo'da listede sonra gelen eklentinin modu önce çalışır. Bu eklentinin modu
  // en son çalışmalı ki:
  //  - expo-image-picker { cameraPermission: false } eklentisinin koyduğu
  //    CAMERA tools:node="remove" engelini kaldırabilsin,
  //  - iOS NSCameraUsageDescription metni webrtc eklentisinin metniyle ezilmesin.
  "./modules/elitlig-live/app.plugin.js",
  ["@config-plugins/react-native-webrtc", { ... }],
  // ...
  ["expo-image-picker", { ... }]
]
```

Eklenti seçenekleri (isteğe bağlı): `{ "cameraPermission": "...", "microphonePermission": "...", "exposeRecordings": true }`.

Eklentinin yaptıkları:
- **Android:** `CAMERA`, `RECORD_AUDIO`, `INTERNET` ve `WAKE_LOCK` izinlerini ekler; CAMERA/RECORD_AUDIO üzerindeki `tools:node="remove"` engelini kaldırır; `android/build.gradle` içindeki `allprojects.repositories`'e JitPack'i ekler (Expo şablonunda zaten varsa dokunmaz). Modülün kendi `build.gradle`'ında da JitPack tanımlı.
- **iOS:** `NSCameraUsageDescription` = "Maçı canlı yayınlamak için kamera kullanılır." `NSMicrophoneUsageDescription` zaten tanımlıysa ezilmez, yoksa eklenir. `UIBackgroundModes`'e dokunulmaz. Yerel yayın kaydı Dosyalar uygulamasında görünsün diye `UIFileSharingEnabled` ve `LSSupportsOpeningDocumentsInPlace` açılır (`"exposeRecordings": false` ile kapatılır).

minSdk: RootEncoder minSdk 16 istiyor, Expo 54 varsayılanı 24. Ek bir ayar gerekmiyor.
iOS: HaishinKit iOS 13+ istiyor, Expo 54 varsayılanı 15.1. Swift 5.10, yani Xcode 15.3+ gerekiyor.

Expo Go'da çalışmaz. Development build ya da EAS build gerekir:
`npx expo prebuild --clean && npx expo run:android` (veya `eas build`).

## Yönlendirme

Yayın her zaman **yatay 16:9**.
- **Önerilen:** yayın ekranını yataya kilitleyin, örneğin `expo-screen-orientation` ile
  `lockAsync(OrientationLock.LANDSCAPE)`; çıkışta `PORTRAIT_UP`'a geri dönün. Uygulama `app.json`'da `"orientation": "portrait"`.
- Android: açı, yayın başlarken ekran yönünden alınır (yatay → 0°, ters yatay → 180°).
  Arayüz dikey kalırsa telefonun sola yatırılarak tutulduğu (ROTATION_90) varsayılır ve önizleme dikey arayüzde yan görünür.
  Yayın sürerken açı değişmez.
- iOS: yayın açısı cihazın fiziksel yatay yönünü izler. Cihaz dikey tutulursa son yatay yön korunur.

## Bilinen sınırlamalar

- **Overlay güncelleme sıklığı:** her `setOverlay` çağrısı PNG'yi diskten çözer.
  - Android: aynı GL oturumunda dokuyu yerinde günceller.
  - iOS: görseli hedef piksel boyutuna ölçekler, ardından CPU (vImage) ile karıştırır.
  - Saniyede 1–2 güncelleme rahat. Saat/sayaç gibi saniyede birden sık değişen içerik için PNG'yi sık üretmeyin.
- **Konum:** `frame` 0..1 aralığında ve sol-üst orijinli. Kaynak, yayın karesi.
  - Android'de önizleme aspect-fill ile kırpıldığı için overlay önizlemede birkaç piksel farklı yerde görünebilir. Yayın doğrudur.
  - iOS'ta önizleme, bileşik (overlay'li) kareyi gösterir.
- **Arka plan:** ön plan servisi yok, bilinçli olarak.
  - Android: SurfaceView yok edilince yayın, ekran dışı GL arayüzüne taşınır ve bağlantı korunur. Ancak Android 9+ arka planda kamerayı keser: görüntü donar ya da kesilir, ses devam edebilir. Durum `reconnecting` / `app_background` olur. Ön plana dönünce önizlemeye geri bağlanır ve `live` bildirilir.
  - iOS: arka planda kamera durur (HaishinKit `setBackgroundMode`). Bağlantı düşerse ön plana dönüşte yeniden bağlanmayı dener.
  - Uzun süre arka planda kalınırsa YouTube yayını "bağlantı kesildi" sayabilir.
- **Isınma / pil:** 720p30 donanım H.264 + kamera + (iOS'ta) CPU bileşimi telefonu ısıtır.
  - Uzun maçlarda şarjda tutun ve doğrudan güneşten koruyun.
  - Gerekirse `videoBitrateKbps: 1500–2000` ya da `fps: 25` kullanın.
  - 1080p (`width: 1920, height: 1080`) desteklenir ama daha çok ısınır.
- **Uyarlanabilir bitrate yok:** bitrate sabit (`average`). Zayıf ağda kare düşer; Android'de bu `droppedFrames` ile görülür.
- **Ekran kilidi:**
  - Android'de görünüm yayın sürerken `keepScreenOn` tutar.
  - iOS'ta `isIdleTimerDisabled` yayın süresince açık, `stop` ya da `failed` olunca kapanır.
- **Ses oturumu (iOS):** önizleme başlarken `AVAudioSession` `.playAndRecord` / `.videoRecording` moduna alınır. WebRTC sesli arama ile aynı anda kullanılmamalı.
- **Ön kamera:** yayında aynalanmaz. Overlay yazısı ters çıkmasın diye iOS önizlemesi de aynalanmaz.
- Tek seferde tek `LiveCameraView`. Görünüm kaldırılınca yayın ve kamera kapanır (Android `OnViewDestroys`, iOS `didMoveToSuperview(nil)`).

## Test adımları

1. Bir YouTube Studio → "Canlı yayın" → "Yayın" anahtarı alın.
   Gecikme: "Düşük gecikme" önerilir. Test için yayını "Liste dışı" yapın.
2. app.json'a eklenti satırını ekleyin (yukarıdaki sıraya dikkat), ardından
   `npx expo prebuild --clean` ve `npx expo run:android` (veya `run:ios`) çalıştırın. Gerçek cihaz gerekir; emülatörde kamera ve kodlayıcı güvenilmez.
3. Yayın ekranında `isLiveAvailable()` true olmalı. `requestLivePermissions()` → true olmalı, ardından durum `previewing` olmalı.
4. `startStream("rtmp://a.rtmp.youtube.com/live2/<anahtar>")` → durum `connecting` → `live` olmalı. `onStats` ~1 sn'de bir 2000–2700 kbps / ~30 fps göstermeli.
   YouTube Studio'da 10–20 sn içinde "Mükemmel" bağlantı ve görüntü görünmeli.
5. `setOverlay(<file:// png>, { x: 0.02, y: 0.03, width: 0.4, height: 0.12 })`:
   skorbord YouTube önizlemesinde sol üstte görünmeli. Yeni skorla tekrar çağırın; değişiklik 1–2 sn içinde yayına yansımalı (YouTube gecikmesi hariç).
6. Wi-Fi'yi 10 sn kapatıp açın: önce `reconnecting (1/5) …`, sonra `live` görülmeli.
   Uçak modunda 1 dakikadan uzun bekleyin: `failed` görülmeli.
7. Ana ekrana çıkıp dönün: `reconnecting/app_background` → `live` görülmeli.
8. `rtmps://a.rtmps.youtube.com:443/live2/<anahtar>` ile 4. adımı tekrarlayın.
9. Yanlış anahtarla deneyin: birkaç `reconnecting` → `failed` görülmeli.
10. `stopStream()` → `stopped` olmalı ve YouTube yayını "sona erdi" göstermeli. Ekrandan çıkınca kamera ışığı sönmeli.
