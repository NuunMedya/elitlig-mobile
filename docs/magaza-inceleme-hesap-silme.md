# Mağaza incelemesi: hesap silme (App Store 5.1.1-v / Google Play)

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
