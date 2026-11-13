# Gece Teması — Kasım 2026

Uygulamanın görsel dili, @ui_motion_prompts hesabındaki (ui-motion-prompts.pages.dev)
mikro etkileşim desenleri temel alınarak baştan yenilendi. Bu belge neyin
değiştiğini ve yeni bileşenlerin nasıl kullanılacağını özetler. Genel kurallar
için `docs/arena-tasarim-dili.md` geçerliliğini korur; renk ve hareket değerleri
artık bu belgedekilerdir.

## Renk

İki tema `theme/palette.ts` içindedir ve her çift `npm run check:tokens` ile
iki temada da kontrast testinden geçer.

| Rol | Koyu · Gece Moru | Açık · Lavanta Sis |
| --- | --- | --- |
| Zemin | `#100F1A` (mora çalan gece) | `#F4F3FB` |
| Kart | `#1A1929` | `#FFFFFF` |
| Marka / seçili (mor) | `#6E5BFF` | `#5A46F0` |
| Veri (camgöbeği) | `#38C6FF` | `#0776AA` |
| Canlı (pembe) | `#FF5C9A` | `#DB2E6B` |
| Galibiyet · beraberlik · mağlubiyet | nane · altın · kırmızı | aynı aile, koyulaştırılmış |

Yeni tokenlar:

- `gradientSignature` — mor → camgöbeği **imza degradesi**. Yalnız grafik
  işarette kullanılır (alt menü kapsülü, solucan çizgi, ilerleme, halkalar).
  Üstüne metin yazılmaz; metin taşıyan dolgu `gradientBrand`tır.
- `auroraViolet/Cyan/Pink` — atmosfer ışıkları.
- `glass`, `glassLine` — yüzen cam yüzeyler.
- `glow` — mor parıltı rengi (`glowStyle()` ile kullanılır).
- `shineGradient`, `knob`.

Mesajlar bölümünün kendi paleti (`lib/chatPalette.ts`) de aynı aileye geçti:
giden balon lavanta/derin mor, vurgu mor.

## Hareket

`theme/motion.ts`: yeni yaylar `spring.slide` (seçim göstergeleri) ve
`spring.pop` (top, rozet, ✓); `stretch` (kayarken esneme) ve `ambient`
(sürekli atmosfer süreleri). Buton ve kart basılınca çöker (`press.buttonScale`,
`press.cardScale`). Tüm hareketler "hareketi azalt" açıkken durur ya da anında
yer değiştirir.

Sürekli döngüler yalnız şu bileşenlerde serbesttir (bkz. `scripts/check-tokens.mjs`
`AMBIENT_LOOP_ALLOWED`): `Aurora`, `Button` (parlama), `GlowRim`, `LiveBadge`,
`Skeleton`.

## Bileşenler ve karşılık gelen desenler

| Bileşen | Desen |
| --- | --- |
| `GlowTabBar` | Yüzen cam bar + **Sliding Pill** (kapsül esneyerek kayar); yönetim modunda altın kapsül |
| `Tabs` | **Worm Underline** — iki ucu ayrı yaylı degrade çizgi |
| `SegmentedControl` | **Sliding Thumb** — aşmalı yay, hafif esneme |
| `ScreenHeader` | Kâğıt başlıkta `Aurora`; sahne başlığında parlak aurora; cam eylem düğmeleri |
| `Aurora` (yeni) | **Aurora / Mesh Gradient** arka plan |
| `Button` | **Press Down**, degrade dolgu + mor parıltı, **Shine Sweep** |
| `Input` | **Glow Border** (odakta degrade kenar), **Floating Label** (`floating`), **Shake Input** (hata) |
| `Toggle` | **Liquid Toggle** — sistem anahtarı yerine özel çizim |
| `Toast` | **Island Pop** — yaylanarak büyüyerek açılır |
| `Badge` | **Badge Hop** — sayı değişince zıplar |
| `LiveBadge` | Sürekli **Ping** nabzı |
| `GlowRim` (yeni) | **Neon Edge** — canlı kartın kenarında dolaşan ışık |
| `MatchCard` | Canlı kartta `GlowRim` |
| `FAB`, `EmptyState`, `Chip` | Degrade dolgu ve parıltı |
| `PasswordRules` | **Flow Fill** şifre güç çubuğu |
| Sekme gezgini | `animation: "shift"` — sekmeler arası kayma |
| Tema değişimi | **Portal Open** — `lib/themeTransition.ts` + `components/ThemeSwitchOverlay.tsx` |

## Tema değişimi

Palet modül yüklenirken donduğu için tema değişince JS yeniden yüklenir.
Artık yayında da anında olur (`expo-updates` `reloadAsync`); öncesinde ekranın
görüntüsü alınır ve yeni tema, eski görüntünün altından büyüyerek açılır.

## Bilinen sınırlar

- **Gerçek bulanıklık yok.** `expo-blur` kurulu değil ve yerel paket eklemek
  mağaza sürümü ister. Cam yüzeyler yarı saydam dolgu + ışıklı kenarla
  taklit edilir. İleride `expo-blur` eklenirse `GlowTabBar` ve `ScreenHeader`
  eylem düğmeleri `BlurView`'e geçirilebilir.
- **Paylaşılan öğe geçişi** (maç kartından detaya büyüme) yerel yığın
  gezgininde desteklenmediği için yapılmadı; sayfa geçişleri yerel kaydırmadır.

## Detay rehberi (ikinci tur)

İlk tur renkleri ve ortak bileşenleri değiştirdi. İkinci turda her ekranın
**içeriği ve kurgusu** bu kurallara göre yeniden düzenlenir.

### Sayfa kurgusu
1. `ScreenHeader` (aurora otomatik) → **özet bloğu** → gruplanmış bölümler.
2. Özet bloğu: sayfanın en önemli 2-4 bilgisi. Kimlik sayfalarında (takım,
   oyuncu, maç, lig) `gradientInk` + `<Aurora variant="stage" />` üzerinde
   beyaz metin; liste/araç sayfalarında `MetricTile`/`MetricGrid` ya da
   tek satır cam kart. Önemli sayılar `Odometer` ile döner.
3. Bölümler: `SectionHeader` (başlık + sağda "Tümü ›" eylemi), aralarında
   `space.xl`; ekran kenar boşluğu `layout.screenPadding`.
4. İçerik kartları `Card`/`Surface` (radius `xl`). Aynı bölümde tek kart
   içinde satırlar + iç ayraç; kart içinde kart yok.

### Liste satırı anatomisi
- Öndeki görsel: `TeamLogo` / `Avatar` / `IconTile` (36-40 px).
- Başlık `type.h4`/semibold `textPrimary`; altında meta satırı `textTertiary`.
- Sondaki değer: sayı (Archivo, `tabular-nums`), `Badge` ya da chevron.
- Satır yüksekliği 56-64; ayraç `dividers.inset`.
- Kullanıcının kendisi / takımı / seçili satır: `brandDim` zemin + solda
  3 px `gradientSignature` şerit.
- Sıralama listeleri: ilk üç `RankBadge`, bölge rengi solda 3 px şerit,
  form `FormChips`.

### Sayılar ve durum
- Rakamlar `fonts.bold`/`fonts.display` (Archivo), tablo hizalı.
- Artış/azalış: `win`/`loss` renginde ▲/▼ ya da `+`/`−`.
- Durum hapları `Badge` (soft): canlı = live, tamam = win, bekliyor = warn,
  iptal/ret = danger, taslak = neutral.
- İlerleme: `GradientBar`; karşılaştırma: `StatBar`.

### Etkileşim ve hareket
- Basılabilir kart `Touchable feedback="card"`, satır `feedback="row"`.
- İlk açılışta listenin ilk 6-8 öğesi `Reveal index={i}` ile sırayla gelir.
- Filtre ≤4 seçenek: `SegmentedControl`; daha fazlası: yatay `Chip` şeridi;
  sayfa bölümleri: `Tabs`.
- Yükleniyor: içeriğin şeklinde `Skeleton`; boş: `EmptyState` (ikon + tek
  cümle + eylem).
- Kategori/araç menüleri: `IconTile` (tonlar: violet, cyan, pink, mint, gold,
  red, signature, neutral) + başlık + kısa açıklama; ızgara `HubGrid`.

### Formlar (yönetim dahil)
- Alanlar gruplu kartlarda; grup başlığı `type.overline`.
- Önemli formlarda `Input floating`; seçimler `OptionSheet`/`DateSheet`.
- Birincil eylem altta tam genişlik `Button size="lg"`; yıkıcı eylem
  `variant="danger"` ve onay ister.

### Yasaklar
- Çıplak hex, `fontSize` sayısı, `fontWeight` yok (`npm run check:tokens`).
- Veri çekme, API çağrısı, gezinme ve yetki mantığı değişmez; yalnız sunum.
- Erişilebilirlik etiketleri korunur.
