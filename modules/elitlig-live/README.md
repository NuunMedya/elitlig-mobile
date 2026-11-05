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

Eklenti seçenekleri (isteğe bağlı): `{ "cameraPermission": "...", "microphonePermission": "..." }`.

Eklentinin yaptıkları:
- **Android:** `CAMERA`, `RECORD_AUDIO`, `INTERNET` ve `WAKE_LOCK` izinlerini ekler; CAMERA/RECORD_AUDIO üzerindeki `tools:node="remove"` engelini kaldırır; `android/build.gradle` içindeki `allprojects.repositories`'e JitPack'i ekler (Expo şablonunda zaten varsa dokunmaz). Modülün kendi `build.gradle`'ında da JitPack tanımlı.
- **iOS:** `NSCameraUsageDescription` = "Maçı canlı yayınlamak için kamera kullanılır." `NSMicrophoneUsageDescription` zaten tanımlıysa ezilmez, yoksa eklenir. `UIBackgroundModes`'e dokunulmaz.

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
