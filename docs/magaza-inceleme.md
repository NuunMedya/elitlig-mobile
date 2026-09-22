# Mağaza incelemesi (App Store / Google Play)

Bu belge uygulamanın mağaza incelemesinde takıldığı ve takılabileceği
noktaları toplar: hesap silme (5.1.1-v), kullanıcı içeriği için engelleme ve
şikayet (1.2), arka plan modları (2.5.4) ve inceleme videosu.

---

# 1) Hesap silme (App Store 5.1.1-v / Google Play)

App Store, hesap açtıran her uygulamanın hesabı **uygulama içinden** silebilmesini
ister (App Review Guideline 5.1.1-v). Google Play'in "Hesap silme" politikası aynı
şeyi ister. ElitLig bu şartı iki kapı ve bir ekranla karşılar.

## Kullanıcı nereden bulur

1. **Profil sekmesi → en alttaki kırmızı grup → "Hesabı sil"** (tek dokunuş).
2. **Profil → Tercihler → Hesap ve Güvenlik → en altta "Hesabı sil"** (aynı ekrana gider).

İki kapı da `app/hesap-sil.tsx` ekranını açar:

- Neyin silineceği ve neyin ligde kalacağı sunucudan gelir
  (`GET /api/users/me/deletion-summary`). Özet yüklenemezse ekran yine açılır;
  genel bir uyarı metniyle form gösterilir.
- Şifre + elle yazılan onay cümlesi (`HESABIMI SİL`) istenir, sonra
  `DELETE /api/users/me` çağrılır.
- Başarıda oturum kapatılır, push kaydı temizlenir, ana sekmeye dönülür.

Silme gerçektir: `Users` satırı ve kişisel kayıtlar geri dönüşsüz silinir; lig
verisi (maç, gol, puan durumu) ligin ortak kaydı olduğu için kalır, yalnız hesapla
bağı kopar. Ayrıntı: `elitlig-server/docs/account-deletion.md`.

## Hangi hesaplar silebilir

Herkes: üye, oyuncu, takım başkanı **ve yönetim rolleri** (admin, editör, il
yöneticisi...). Tek istisna sistemdeki **son admin**; ligi yönetecek kimse
kalmasın diye o hesap "önce başka bir üyeyi yönetici yap" uyarısı görür.

> Önceki reddin nedeni buydu: eski sunucu sürümü yönetim hesaplarını "yalnız
> panelden silinir" diye engelliyordu. İnceleyici, App Store Connect'e verilen
> yönetim rolündeki test hesabıyla girince "Bu hesap buradan silinemez" ekranını
> gördü ve uygulamayı "hesap silme yok" diye reddetti.

## Yeniden gönderirken yapılacaklar

1. **Sunucuyu** bu değişiklikle dağıt (Heroku). Eski sunucu kalırsa yönetim
   hesabı yine engellenir.
2. **Yeni bir build** al ve gönder (`eas build --platform ios --profile production`;
   build numarası EAS'ta otomatik artar). Değişiklik istemci kodunda olduğu için
   eski build yeniden incelemeye verilemez.
3. App Store Connect → **App Review Information** → test hesabı:
   - Sıradan bir **üye hesabı** ver (`uye` veya `oyuncu` rolü). Yönetim hesabı da
     çalışır ama sistemdeki tek admin asla verilmemeli.
   - İnceleyici hesabı silerse yeni inceleme için hesabı yeniden aç.
4. **Notes** alanına aşağıdaki metni yapıştır (İngilizce, inceleyici için):

```
Account deletion is available in-app:
Profile tab → scroll to the bottom → "Hesabı sil" (Delete account).
Alternative path: Profile → Tercihler → "Hesap ve Güvenlik" → "Hesabı sil".
The screen explains what will be deleted, asks for the account password and the
confirmation phrase "HESABIMI SİL" (Turkish for "DELETE MY ACCOUNT"), then
permanently deletes the account and all personal data on our servers.
No support contact or website visit is required.
```

5. **App Privacy** bölümünde toplanan veri türleri (ad, e-posta, telefon, konum,
   kullanıcı kimliği) ile "silinebilir" beyanı tutarlı olmalı.


---

# 2) Engelleme ve şikayet (App Store 1.2 — kullanıcı içeriği)

Üyeler birbirine mesaj yazabildiği ve sesli arama yapabildiği için Apple dört
şey ister: uygunsuz içeriği **şikayet etme**, kötüye kullanan üyeyi
**engelleme**, kurallara **rıza** ve yönetimin şikayete **müdahalesi**.

## Kullanıcı nereden bulur

- **Sohbet odası → sağ üst "⋯" menüsü**: "Şikayet et", "Engelle / Engeli
  kaldır" (birebir sohbette), "Sohbeti sil".
- **Mesaja uzun basınca**: karşı tarafın metin, sesli mesaj, konum ve arama
  kaydı balonlarında "Şikayet et".
- **Engellenince** composer yerine "Bu üyeyi engelledin" şeridi ve "Engeli
  kaldır" düğmesi çıkar; arama ikonu kaybolur.
- **Engel listesi**: Profil → Hesap ve Güvenlik → "Engellediğim üyeler"; ayrıca
  Mesajlar → ayarlar (⚙) sayfasının altında.
- **Rıza**: giriş ekranında "Giriş yaparak Lig Kuralları'nı kabul etmiş
  olursun… hakaret, taciz ve uygunsuz içeriğe hoşgörü yoktur" satırı,
  Kurallar ekranına bağlantılı.

## Ne olur

- Engel iki yönlüdür: engellenen yazamaz ve arayamaz, engelleyen de yazamaz.
  Süren arama anında kapanır. Takım ve grup sohbetleri etkilenmez. Engellenen
  tarafa "engellendin" denmez ("Bu üye sizden mesaj kabul etmiyor" görür).
- Şikayet yönetim gelen kutusuna **CHAT_REPORT** kartı olarak düşer; il
  yöneticisi kendi ilindeki üyenin şikayetini görür. Yönetim
  `GET/PATCH /api/admin/chat/reports` ile listeler ve sonuçlandırır. Sunucu
  ayrıntısı: `elitlig-server/docs/chat-api.md` (4. aşama).

## App Review notuna eklenecek metin

```
User-generated content safeguards (Guideline 1.2):
- Report: open any chat → "⋯" (top right) → "Şikayet et" (Report). Long-press
  any received message → "Şikayet et". Reports go to the ElitLig moderation
  inbox and are reviewed by league management.
- Block: any direct chat → "⋯" → "Engelle" (Block). Blocked users cannot
  message or call the user. Blocked list: Profile → "Hesap ve Güvenlik" →
  "Engellediğim üyeler" (unblock there).
- Users agree to the league rules (no tolerance for harassment or
  objectionable content) on the sign-in screen.
```

---

# 3) Arka plan modları ve bilgi anahtarları

- `UIBackgroundModes` içinden **`voip` kaldırıldı**. Uygulama CallKit/PushKit
  kullanmıyor; `voip` bildirildiği hâlde kullanılmazsa Apple 2.5.4 ile
  reddeder. `audio` kalıyor (sesli arama arka planda sürer), `remote-notification`
  kalıyor (push).
- `ITSAppUsesNonExemptEncryption: false` eklendi: yalnız HTTPS kullanıldığı
  için her build'de sorulan "export compliance" sorusu otomatik geçer.
- Kamera izni metni "Kamera bu uygulamada kullanılmaz." WebRTC eklentisinden
  geliyor; uygulama kamera açmıyor. İnceleyici sorarsa cevap bu.

---

# 3b) iOS'ta native çökme yaması (React Native 0.81)

TestFlight 1.0.0 (2), iOS 27.0: Bildirimler / Mesajlar'a girince
`EXC_BAD_ACCESS (SIGBUS)` ile çökme. Rapor: JS iş parçacığı Hermes içinde
ölürken (`BoundFunction::create` → `DictPropertyMap::lookupEntryFor`) başka
bir iş parçacığı `convertNSExceptionToJSError` çalıştırıyor. Bilinen RN hatası
(facebook/react-native#53960, #54859, reactwg/react-native-new-architecture#276):
bir native modülün **void** metodu NSException fırlatınca RN bunu modülün
kendi kuyruğunda JS hatasına çevirmeye kalkıyor, JS motoruna yanlış iş
parçacığından dokunuyor ve bellek bozuluyor. 0.81.x ve 0.82.x'te düzeltilmedi.

Çözüm: `patches/react-native+0.81.5.patch` (patch-package, `postinstall`
ile her kurulumda uygulanır). Void metotta yakalanan NSException artık JS'e
çevrilmez; modül ve metot adıyla loglanır (`[TurboModule] X.y raised an
exception…`), uygulama yaşamaya devam eder. Hangi modülün fırlattığını
görmek için cihazı Mac'e bağlayıp Console.app'te "TurboModule" araması yeter.

**Önemli:** Expo 54 iOS'ta React Native'i önceden derlenmiş XCFramework
olarak kullanır; bu durumda `patches/` altındaki RN kaynak yaması derlemeye
girmez (build 6'da yaşandı, çökme aynen sürdü). Bu yüzden `app.json`'da
`expo-build-properties` ile `buildReactNativeFromSource: true` ve
`ios.usePrecompiledModules: false` açıldı: RN kaynaktan derlenir, yama
uygulanır. Build süresi birkaç dakika uzar; kalıcı çözüm RN'in bu hatayı
kapattığı sürüme (0.83+) geçmektir.

# 4) İnceleme videosu — çekim listesi

Apple, sesli arama ve sohbet gibi ikinci bir hesap/cihaz gerektiren
özellikler için video ister ("App Review Information → Attachment"). İki
telefonla (ya da telefon + simülatör) şu sırayla çek; her adım ekranda net
görünsün, kesme yapma:

1. **Giriş**: giriş ekranındaki kural rızası satırı görünsün, test hesabıyla gir.
2. **Mesaj**: Mesajlar → yeni mesaj → bir üyeye yaz; ikinci cihazda gelsin.
3. **Sesli arama**: sohbet odasında telefon ikonu → ikinci cihazda zil çalsın,
   kabul et, birkaç saniye konuş, kapat. Mikrofon izni penceresi çıkarsa
   göster ve izin ver.
4. **Şikayet**: karşı tarafın mesajına uzun bas → "Şikayet et" → neden seç →
   gönder → "Şikayetin alındı" bildirimi.
5. **Engelle**: "⋯" → "Engelle" → onay → composer yerine "Bu üyeyi engelledin"
   şeridi; ikinci cihazdan mesaj göndermeyi dene, gitmediğini göster.
6. **Engeli kaldır**: Profil → Hesap ve Güvenlik → Engellediğim üyeler → Kaldır.
7. **Hesap silme**: Profil → en altta "Hesabı sil" → şifre + `HESABIMI SİL` →
   "Hesabımı kalıcı olarak sil" → ana ekrana dönüş ve "Hesabın silindi" mesajı.
   (Bu adımı en sona koy; hesap gerçekten silinir, videodan sonra inceleme
   hesabını yeniden aç.)
8. **Bildirim izni**: uygulama ilk açılışta izin istiyorsa reddedildiğinde de
   çalıştığını göster (Bildirim Tercihleri ekranı).

Video 1080p dikey, 2–3 dakika yeterli. Aynı akışı App Review Information →
Notes'a adım adım yaz (yukarıdaki İngilizce metinler).

# 5) Kontrol listesi

- [ ] Sunucu dağıtıldı (hesap silme + engelleme/şikayet uçları canlı).
- [ ] Yeni iOS build alındı ve gönderildi.
- [ ] Test hesabı sıradan üye (tek admin değil); ikinci bir test hesabı da ver
      (mesajlaşma/arama için).
- [ ] App Review Notes: hesap silme + engelleme/şikayet metinleri yapıştırıldı.
- [ ] Video eklendi.
- [ ] App Privacy: ad, e-posta, telefon, konum, kullanıcı içeriği (mesaj, ses),
      kullanıcı kimliği beyan edildi.
- [ ] Gizlilik politikası ve destek URL'si (elitlig.com) dolu.
