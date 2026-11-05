# Yönetim paneli — yerel (native) ekranlar rehberi

Web yönetim panelinin (elitlig-client) her sayfası mobilde **yerel ekran**dır.
WebView kullanılmaz. Ekranlar aynı sunucu uçlarına (elitlig-server) gider,
mobil oturum jetonuyla (Authorization: Bearer) çalışır.

## Kayıt defteri
`lib/adminModules.ts` — her modülün başlığı, ikonu, yetkisi ve rotası.
Yönetim paneli (`app/yonetim/index.tsx`) bu listeyi yetkiye göre süzer.

## Ortak kit — `@/components/admin`
- `AdminScreen` — güvenli alan + başlık + **yetki kapısı** (`permission`, `roles`).
  `scroll={false}` ile kendi FlatList'ini çizen ekranlar.
- `AdminList` — arama (300 ms gecikmeli), filtre çipleri, sonsuz sayfa,
  iskelet / boş / hata durumları, aşağı çekip yenileme.
- `RecordCard` — tek kayıt kartı (ikon/avatar, başlık, alt metin, meta,
  rozetler, sağda değer). `Panel`, `InfoLine`, `StatRow` ayrıntı ekranları için.
- `FormSheet` / `FormFields` — şemadan form (text, multiline, number, money,
  email, phone, password, url, date, datetime, select, multiselect, chips,
  segment, toggle, color). Zorunlu alan denetimi, sunucu hatası gösterimi.
- `OptionSheet`, `SelectField` (yerel ya da `loadOptions` ile uzak arama),
  `DateSheet` / `DateField` (paket gerektirmeyen tarih + saat seçici).
- `ActionSheet`, `confirmAction()` (Alert ile onay), `useAdminMutation()`
  (toast + sorgu tazeleme).

Yardımcılar: `@/lib/admin/format` (para, tarih, göreli zaman, telefon),
`@/lib/admin/access` (hasAnyPermission), `@/lib/admin/errors` (errorText).

## Kurallar (npm run check)
- Renk, boşluk, yarıçap, punto **tema tokenı**: `colors.*`, `space.*`,
  `radius.*`, `type.*`. `app/` ve `components/` altında çıplak hex,
  `fontWeight`, `fontSize: <sayı>`, `borderRadius: <5+ sayı>` yasak.
  Veri renkleri (not rengi gibi) `lib/` altındaki paletten gelir.
- Emoji ikon yok (Ionicons). Sonsuz `Animated.loop` yok.
- "Bir şeyler ters gitti" gibi belirsiz hata metni yok; `errorText()` kullan.
- Geri alınamayan eylemler `confirmAction` ister; sonuç toast ile söylenir.
