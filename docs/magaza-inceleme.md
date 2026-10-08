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
  reddeder. İkinci turda Apple aynı gerekçeyle **`audio`** modunu da istedi
  (2.5.4: "persistent audio" özelliği bulunamadı); o da kaldırıldı. Sonuç:
  sesli arama yalnızca uygulama öndeyken sürer, ana ekrana çıkınca ses kesilir.
  Geriye yalnız `remote-notification` (push) kaldı.
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
`expo-build-properties` ile `ios.buildReactNativeFromSource: true` açıldı
(anahtar `ios` altında olmalı; üst seviyede yok sayılır, build 7'de yaşandı).
`npx expo prebuild` sonrası `ios/Podfile.properties.json` içinde
`"ios.buildReactNativeFromSource": "true"` görünmeli; o zaman RN kaynaktan
derlenir ve yama uygulanır. Kaynaktan derleme 15-25 dakika sürer; 4-5
dakikada biten build hazır paketi kullanmış demektir. Build süresi birkaç dakika uzar; kalıcı çözüm RN'in bu hatayı
kapattığı sürüme (0.83+) geçmektir.

**Kök neden (build 11'de hata ekranıyla görüldü):** `app/mesajlarim.tsx`
içindeki `categoryIcon(thread.category_label)` sunucudan `null` gelen
kategori etiketinde `null.toLocaleLowerCase` ile patlıyordu ("Talebiniz
onaylandı" gibi otomatik mesajlar kategori taşımıyor). Üretimde ölümcül JS
hatası → RN'in native fatal yolu (void TurboModule metodu NSException
fırlatır) → yukarıdaki bellek bozulması. Mesajlar karosu ve bildirimden
mesaja gidiş aynı ekrana çıktığı için ikisi de çöküyordu. Düzeltme:
`normalize` ve `categoryIcon` null'a dayanıklı, `PanelThread.category_label`
tipi `string | null`. RN yaması ve CrashCatcher koruma olarak kalıyor.

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

# 7) Uygulama içi üyelik (App Store 4 — Design)

Üçüncü turda (2 Ekim) Apple, "Üye ol" düğmesinin kullanıcıyı tarayıcıya
(elitlig.com) götürmesini reddetti. Çözüm:

- `app/kayit.tsx`: uygulama içi kayıt ekranı. `POST /api/users/register`
  ucunu kullanır; sunucu jeton döndürdüğü için kayıt biter bitmez oturum
  kurulur (`AuthProvider.signUp`). Zorunlu alanlar yalnız ad soyad, kullanıcı
  adı, e-posta, şehir ve şifre; telefon isteğe bağlı (5.1.1(v)).
- `app/giris.tsx`: "elitlig.com üzerinden üye olabilirsiniz" cümlesi kalktı,
  altında "Üye ol" düğmesi var. Şifre sıfırlama notu uygulama içi İletişim
  ekranına bağlanır.
- `app/(tabs)/profil.tsx`: misafir kartındaki "Üye ol" artık siteyi değil
  `/kayit` ekranını açar.
- Hesap silme zaten uygulama içinde (`/hesap-sil`); Apple'ın "kayıt varsa
  silme de olmalı" notu karşılanıyor.

# 8) Üçüncü tur sonrası genel tarama (2 Ekim)

Apple'ın bir sonraki turda takılabileceği yerler önceden kapatıldı:

- **Şifre yönetimi uygulama içinde**: `app/sifre-degistir.tsx`
  (`PATCH /api/users/me/password`, taze jeton saklanır) ve
  `app/sifremi-unuttum.tsx` (`/password/forgot` → kod → `/password/reset`).
  Giriş ekranındaki "Şifreni mi unuttun? Sıfırla" ve Hesabım'daki "Şifre
  değiştir" artık siteye değil bu ekranlara gider.
- **Gizlilik politikası uygulama içinden erişilebilir** (5.1.1(i)): Hesabım →
  "Gizlilik Politikası" satırı, giriş ve kayıt onay metinlerindeki bağlantı.
  Hepsi `openLink` ile uygulama içi tarayıcıda (SFSafariViewController) açılır.
  App Store Connect → App Information → Privacy Policy URL alanında da
  `https://elitlig.com/gizlilik-politikasi` yazmalı.
- **Kamera izni metni**: WebRTC eklentisi NSCameraUsageDescription'ı zorunlu
  ekliyor; "kullanılmaz" yazan metin yerine olası kullanımı anlatan metin.
- **Siteye kalan bağlantılar** (profil fotoğrafı talebi, oyuncu profili
  sahiplenme, takım yönetimi başvurusu): yönetim onayı gerektiren akışlar;
  `openLink` uygulama içi tarayıcı kullandığı için Apple'ın 4. maddede açıkça
  izin verdiği yöntemle açılır. İnceleme notunda belirtilir.
- Kontrol edildi, sorun yok: ödeme/abonelik yok (3.1.1 kapsamı dışı), üçüncü
  taraf giriş yok (4.8 Apple ile giriş gerekmiyor), izleme SDK'sı yok (ATT
  gerekmiyor), push izni açılışta değil kullanıcı istediğinde soruluyor
  (4.5.4), iPad desteği kapalı (iPhone uyumluluk modunda çalışır).

# 9) Dördüncü tur (7 Ekim, build 15)

- **2.3.6 yaş sınırı**: sohbette konum paylaşımı olduğu için Apple 18+ istedi.
  Kod değişikliği yok; App Store Connect → App Information → Age Ratings →
  "Override to a Higher Age Rating" → 18+.
- **2.1(a) "Üye Ol penceresi kapanıyor"**: inceleyici giriş modalındaki
  "Üye ol" düğmesini kullanmış. Modal içinden `router.replace` başka bir modala
  geçerken iOS'ta ilk pencereyi kapatıp yenisini açmıyordu. Düzeltme: giriş →
  kayıt ve giriş → şifremi unuttum artık `router.push`; geri dönüşler
  `router.dismissTo("/giris")`. Ayrıca kayıt ve sıfırlama modallarında aşağı
  çekerek kapatma (`gestureEnabled: false`) kapatıldı; uzun formda listeyi
  yukarı çekerken pencere kapanmasın.
- Test ederken her iki giriş yolunu da dene: Profil → Üye ol **ve** Giriş yap
  → Üye ol.
