# Tasarım yenilemesi — Ekim 2026

Bu belge üç adımın kaydıdır: (1) piyasa araştırması, (2) uygulamanın
baştan sona değerlendirmesi, (3) yapılan düzeltmeler ve sıradaki işler.
Tasarım dilinin güncel kuralları `docs/arena-tasarim-dili.md` içindedir.

## 1. Piyasa araştırması — özet

İncelenen uygulamalar: FotMob, Sofascore, OneFootball, Flashscore, 365Scores,
theScore, Apple Sports, Premier League; takım yönetimi tarafında TeamSnap,
Heja, Spond; Türkiye'de halı saha/amatör lig uygulamaları.

**Navigasyon**
- 4–5 sekmeli alt çubuk standart; ilk sekme her zaman Maçlar/Skorlar.
- Profil, ayarlar ve ikincil özellikler son sekmede ("Diğer/Menü") toplanır
  (FotMob "More", Sofascore "Menu"). Hamburger menüler kaldırıldı.
- Fantasy/oyunlar ya kendi sekmesinde (Sofascore, PL) ya da tek bir oyun
  merkezinde; birden fazla yere dağıtılmaz.
- Takım yönetimi uygulamalarında sohbet birinci sınıf bir sekmedir.

**Görsel dil**
- Nötr zemin + tek bir marka rengi. Renk aksiyon, seçili durum ve canlıyı
  söyler; süs değildir. Accent oranı ekranın ~%10'unu geçmez.
- Kartlar gölge yerine yüzey farkıyla ayrılır (açık temada beyaz kart, çok
  açık gri zemin; 1px ayraç). Köşe 12–16px.
- Sekme kökünde 28–34px büyük başlık; kaydırınca kompakt başlık.
- Satırlar 48–56px; skor sütunu sabit genişlik, rakamlar tabular.
- Başlık eylemleri halkasız çizgi ikon; aktif sekmede dolu ikon.
- Koyu temada saf siyah yerine derin renkli gece; kart bir kademe açık.
- Apple Sports'un dersi: "sade yüzey, derin detay" — az şey göster, ama
  kusursuz hizala.

Kaynaklar: ixd.prattsi.org (FotMob eleştirisi), sofascore.com/news (2025 ana
sayfa), lickability.com/blog/apple-sports, daringfireball.net (Apple Sports),
designrush.com (OneFootball), sbcnews.co.uk (Flashscore 2025), help.heja.io,
helpme.teamsnap.com, madegooddesigns.com (Inter vs Manrope).

## 2. Uygulamanın değerlendirmesi (yenileme öncesi)

**Görsel**
- Her ekranın dibinde koyu mor bir alt menü şeridi; sayfanın en baskın
  yüzeyi içerik değil menüydü.
- Kâğıt neredeyse saf beyaz (#FDFCFF), bu yüzden her kart mor bir gölgeyle
  "kaldırılıyordu" — listeler kabarık ve gürültülü görünüyordu.
- Sekme kökü başlıkları 22px; büyük başlık gibi değil, bir kart başlığı gibi
  duruyordu. Başlık eylemleri beyaz halkalı düğme dizisiydi.
- Başlık ailesi Archivo (rakam ailesi) idi; ekran adı skorla aynı sesle
  konuşuyordu. Inter nötr ama markasız.
- Yönetim sekmesinde "Kulüp, kariyer, lig" üst satırı başlığı sıkıştırıyordu.
- Misafir kimlik kartında anlamsız "0 · 0 · 0" sayı satırı.
- Ayarlar'daki "Sistem" teması, sistem koyuyken bile açık açılıyordu.

**Bilgi mimarisi**
- Oyunlar üç yere dağılmıştı: Menü karoları, Menü ▸ Keşfet satırları
  (Kariyer, Tahmin Ligi, Fantezi, Kulüp Arenası, Rekor tablosu) ve Oyun
  merkezi — aynı öğeler iki listede.
- Menü ▸ Keşfet futbol araçlarını (karşılaştırma, borsa) oyunlarla karıştırıyordu;
  "Canlı maçlar" ve "Ara" sekmelerdeki kontrollerin kopyasıydı.
- Ayarlar parçalıydı: Menü hem Ayarlar'ı hem içindekileri (Bildirim türleri,
  Takip bildirimleri, Hesabım) ayrı satır olarak listeliyordu; başlıkta ikinci
  bir Ayarlar çarkı vardı.
- "Türkiye sıralaması" (gerçek gol/asist liderleri) oyunların altındaydı.
- "Kariyerim" üç farklı ekranın adıydı (Yönetim rolü, oyuncu kariyeri, XP).
- Yönetim sekmesinde Mesajlar'ın kopyası iki başlık ikonu, "Diğer ▸ Takip
  ettiklerin" satırı ve lig rolünde araçların birebir tekrarı olan
  "Sık kullanılanlar" vardı.
- Takip ettiklerin ekranında geri düğmesi yoktu (çıkmaz).

## 3. Yapılanlar

**Tasarım temeli** (`theme/`)
- Yazı: arayüz ve başlıklar **Plus Jakarta Sans** (Türkçe glifler + `tnum`
  doğrulandı), skor/rakam **Archivo**. Yeni `fonts.heading` kesimi.
- Ölçek: `largeTitle` 28 (sekme kökü) · `display` 24 · `h1` 19 · `h2` 17 ·
  `h3` 15 · `body` 14 · `bodySm` 12 · `caption` 11; `overline` harf aralığı
  sakinleşti (1.2 → 0.8).
- Açık tema: kâğıt #F7F5FB, kart beyaz ve gölgesiz, marka derin mor #6D28D9,
  kimlik koyu mor #2A0E5E, vurgu pembe #DB2777.
- Koyu tema: koyu mor gece #100820, kart #190F2E, metin saf beyaz, pembe
  vurgu #F472B6 ve pembe seçili sekme.
- Alt menü açık temada beyaz + mor seçim; koyu temada kart yüzeyi + pembe.
- Kenar boşluğu 16px, bölüm arası 24px, kart köşesi 16, sahne köşesi 20.
- Gölge yalnız yüzen katmanlarda (sheet, toast, FAB).
- "Sistem" teması gerçekten sistemi izliyor.

**Bileşenler**
- `ScreenHeader`: 28px büyük başlık, çıplak eylem ikonları, gri üst satır.
- `SegmentedControl`: göstergedeki elle yazılmış gölge kaldırıldı.
- `Badge`/`ProgressRing`: pembe `accent` tonu.
- `ProfileHero`: misafirde boş sayı satırı çizilmiyor.

**Menü hiyerarşisi**
- Menü: kimlik kartı → Günün Testi + Oyun merkezi → **Takip** → **Lig ve
  istatistik** (Haftanın enleri, Türkiye sıralaması, Takım/Oyuncu
  karşılaştır, Transfer borsası, Kurul kararları) → **Destek** (Kurallar,
  İletişim) → **Hesap** (tek Ayarlar kapısı + mağaza kuralı gereği Hesabı sil).
- Oyun merkezi: **Rekabet** (Fantezi, Tahmin Ligi, Kulüp Arenası) → **Mini
  oyunlar** → **Kariyer ve sıralamalar** (Elit Kariyer, Saha Sıralaması,
  Rekor tablosu, Sezon Özeti).
- XP ekranının adı "Elit Kariyer"; "Kariyerim" yalnız oyuncunun gerçek
  kariyeri (Yönetim ▸ Kariyerim).
- Yönetim: kopya başlık ikonları, "Diğer" ve "Sık kullanılanlar" kaldırıldı.
- Takip ettiklerin: geri düğmesi.

Alt menünün beş sekmesi (Maçlar · Lig · Yönetim · Mesajlar · Menü) bilinçli
olarak korundu: 14 Ekim'de belirlenmiş bir karardır ve araştırmayla da
uyumludur (takım yönetimi uygulamalarında sohbet sekmesi standarttır).

## 4. Sıradaki işler (öneri)

1. **Ham punto temizliği** — 34 dosyada 112 ham `fontSize`; en çok
   `components/league/*`, `ui/MatchCard`, `app/oyuncu/[id].tsx`. Hepsi ölçek
   tokenlarına bağlanmalı; `check-tokens` bunu da denetlemeli.
2. **Bildirim rotaları** — `lib/notifications.ts` hâlâ `/bildirimler` ve
   `/mesajlarim` eski adreslerine gidiyor (iki-üç yönlendirme atlaması).
   Doğrudan `/(tabs)/mesajlar?kutu=…` yazılmalı — DİKKAT: aynı dosyadaki
   `AUTH_REQUIRED_PREFIXES` giriş kapısı bu eski adreslere bakıyor; hedef
   değişirken kapı da güncellenmeli.
3. ~~Ad çakışmaları~~ — yapıldı: Yönetim araçlarında "Davetler",
   "Giden teklif", "Gelen teklif" ve lig rolünde "Mesajlar" (hedef ekranların
   adlarıyla aynı).
4. **Hesabım ↔ Kariyerim tekrarları** — sözleşme, teklif ve ceza kapıları
   hem Hesabım'da hem Yönetim ▸ Kariyerim'de; Hesabım yalnız hesap ve
   güvenliğe inmeli.
5. **Kullanılmayan bileşenler** — `Frame`, `HeroCarousel`, `ActionTile`,
   `ActionBar`, `DateStrip`, `Refresh`; `lib/themeToggle.ts`,
   `constants/theme.ts`; `theme/legacy.ts` takma adlarının son 8 kullanımı.
6. **Form ekranları** — `sifre-degistir`, `oyuncum/duzenle`,
   `takimim/bilgiler`, `teklif-ver` giriş ekranının marka kabuğunu
   (`AuthShell`) kullanıyor; düz kâğıt başlığa geçmeli.
