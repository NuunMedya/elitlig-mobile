# Premium Yeniden Tasarım — Envanter ve Plan

Bu belge, yeniden tasarım briefinin **§1 (envanter)** ve **§7.1 (önce plan,
sonra kod)** maddelerinin karşılığıdır. Onay verilene kadar bu dosya dışında
hiçbir üretim dosyası değişmez.

---

## 1. Envanter

### 1.1 Hangi repo, hangi ekranlar

Brief'teki ekranların tamamı **`elitlig-mobile`** içindedir. `elitlig-client`
(React web) ve `elitlig-server` (Express/Sequelize) bu işin kapsamı dışında —
sunucuya yeni uç eklenmesi gerekirse ayrıca kararlaştırılır (bkz. §6, D maddesi).

| Brief bölümü | Repodaki dosya |
| --- | --- |
| §4.1 Onboarding | `app/hosgeldin.tsx` (tek kare, 2,2 sn otomatik geçiş) |
| §4.2 Genel bakış | `app/(tabs)/index.tsx` (798 satır) |
| §4.3 Lig sayfası | `app/(tabs)/ligler.tsx` (1539 satır) |
| §4.4 Maç detayı | `app/mac/[id].tsx` (3031 satır) |
| §4.5 Takım detayı | `app/takim/[id].tsx` (2800 satır) |
| §4.6 Oyuncu detayı | `app/oyuncu/[id].tsx` (2700 satır) |
| §5.1 Top sektirme | `app/sektir.tsx` (1214 satır) |
| §5.2 Penaltı | `app/penalti.tsx` (721 satır) |
| §5.3 Slalom | `app/slalom.tsx` (1115 satır) |

Brief'in saymadığı ama uygulamada olan ekranlar: takım paneli (`takimim/`),
yönetim paneli (`yonetim/`), teklif/sözleşme/ceza/mesaj akışları, Arena, Kim Bu?,
Günün Testi, Türkiye haritası. **Toplam 58.000 satır, 60 ekran.** Bunlar token
ve komponent katmanından otomatik pay alır; bu turda ayrıca düzen çalışması
yapılmaz. Kapsam sınırı budur.

### 1.2 Teknoloji

- Expo 54 / React Native 0.81 / React 19 / Expo Router 6 / TanStack Query 5.
- Stil: `StyleSheet.create` + `@/theme` token sözlüğü. CSS yok, Tailwind yok.
- Veri: **gerçek API** (`elitlig-server`), mock yok. Socket.io ile canlı maç.
- Grafik: `react-native-svg@15.12`, `expo-linear-gradient`. **Canvas yok, Skia
  yok, Reanimated yok, Gesture Handler yok.**
- Hareket: RN çekirdeğindeki `Animated` + `LayoutAnimation`.
- Tipografi: **sistem yazı tipi**, özel font yüklenmiyor (bilinçli karar —
  `theme/typography.ts` başlığında gerekçesi yazılı: açılış maliyeti ve skor
  listesinde FOUT).

### 1.3 Mevcut tasarım sistemi — durum tespiti

`theme/` zaten olgun ve belgelenmiş: `palette.ts` (~80 token, iki tema),
`typography.ts` (ölçek + tabular rakam kuralı + `upperTR`), `space.ts`
(uzay/yerleşim/yarıçap), `elevation.ts`, `motion.ts` (süre/easing/haptik),
`rating.ts`, `zones.ts`. `components/ui/` altında 38 bileşen, hepsi barrel'dan
dışa aktarılmış.

**Bu işin en değerli bulgusu:** mevcut palet zaten iki vurgu rengini *anlamsal
olarak* ayırmış durumda —

- `brand` (mor #6D28D9) = **aksiyon**: birincil buton, aktif sekme, seçili durum.
- `accent` (limon #C9F73D) = **veri/enerji**: panel metrikleri, ilerleme çubuğu,
  öne çıkan rakam.

Brief'in "mercan yalnız aksiyon, mavi yalnız veri" kuralı bu ayrımın birebir
karşılığıdır. Yani **60 ekranı tek tek gezmeden**, `brand → mercan` ve
`accent → mavi` eşlemesiyle kural tüm uygulamada bir anda yürürlüğe girer.
Yeniden tasarımın riskini asıl düşüren şey budur.

### 1.4 Gerçek veri modeli (brief §1.2)

`lib/types.ts` sunucunun döndürdüğü şekilleri birebir taşıyor. **Gerçekten var
olanlar:**

- Maç: takım adları, skor, tarih/saat, saha, lig, sezon, `mac_durumu`, kapak
  görseli (`match_picture`), manşet (`post_manset`), rapor (`post_rapor`), video.
- Kadro (`/maclar/:id/kadro`): oyuncu adı, fotoğrafı, forma no, pozisyon, puan
  (rating), ilk11/yedek, kaptan, misafir oyuncu.
- Olaylar (`mac_olaylari`): dakika, devre, `olay_kodu`, oyuncu, giren/çıkan.
- Puan durumu: O/G/B/M/A/Y/Av/P, `power_index`, `last5` ("WDLWW"), `display_points`.
- Oyuncu: ad, foto, pozisyon, doğum tarihi, uyruk, piyasa değeri, sezon
  toplamları (maç/gol/puan/kart).
- Takım: ad, logo, kuruluş, renkler, sezon toplamları.
- Haber akışı (`/api/news/feed`): başlık, özet, kapak görseli, kategori.

**Gerçekten YOK olanlar** (brief'in istediği ama şemada bulunmayanlar):

| Brief'in istediği | Durum | Önerim |
| --- | --- | --- |
| Topla oynama % | Yok | Yerine gerçek olay sayımları (§6-D) |
| xG / beklenen gol | Yok | Kaldır — üretilirse kullanıcıya yalan olur |
| Isı haritası | Yok (konum verisi yok) | Kaldır; yerine pozisyon+rating kartı |
| Asist | Kısmen (`olay_kodu` ile) | Var sayılır, `lib/matchStats.ts` çıkarıyor |
| 4-3-3 dizilişi | **Yanlış varsayım** | Lig **8 kişilik**: 3-3-1, 2-3-2, 4-2-1 … |

`lib/matchStats.ts` olay tablosundan şunları sayıyor ve bunlar **gerçek**:
Kurtarış, Fırsat Yaratma, Kritik Blok, Hava Topu, İkili Mücadele, Faul, Gol,
Sarı/Kırmızı.

> **Not — brief §1.2 ile ayrışma.** Brief "eksik alan varsa mock katmanında
> zenginleştirilmiş fixture üret" diyor. Bu, canlı kullanıcısı olan bir üründe
> yapılamaz: xG uydurmak, ekranda gerçek maç verisinin yanında duran sahte bir
> sayı demektir. Bunun yerine **var olan gerçek istatistikleri brief'in istediği
> gruplanmış düzene** yerleştiriyorum. Doldurma metin (`Team A`, `Player 1`)
> zaten hiçbir yerde yok — veri gerçek.

### 1.5 "Ne bozuk" listesi

| Ekran | Tespit |
| --- | --- |
| Maç detayı | 6 sekme var ama Kadro düz liste, Timeline tek sütun döküm, İstatistik 12 satır sıralı bar. Brief'in "dağınık" teşhisi doğru. Saha görünümü yalnız *düzenleme* için var (`PitchLineup`), *izleme* için yok. |
| Home | Vitrin kartı tek ve statik; manşet karuseli hiç yok. Haber akışı ayrı sekmede duruyor, açılışta görünmüyor. |
| Onboarding | Üç slayt değil, 2,2 saniyelik tek kare. Görsel yok. |
| Oyuncu/Takım | Ekranlar var ama maç detayıyla ortak komponent kullanmıyor; her biri kendi satır/kart düzenini kurmuş. |
| Top sektir | `setInterval(16ms)`, `dt` sabit varsayılmış → **kare hızına bağlı**. Vuruş noktası yönü belirliyor (iyi) ama Magnus/spin yok, top dönmüyor, halka geçişi yalnız 12. sekmeden sonra tek çember. |
| Penaltı | Üç dokunuşlu zamanlama oyunu (nişan barı → güç barı). Sürükleme jesti, falso, perspektif, ağ, kaleci gecikmesi **hiç yok**. Kaleci "okuma olasılığı" ile hile yapıyor (brief §9'da yasak). |
| Slalom | Sol/sağ yarıya **basılı tutma** — brief'in istediği "basılan noktanın yatay konumu" eğrisi yok; hassasiyet kademesi yok. Perspektif yok, koniler düz dikdörtgen. |
| Üçü de | `setInterval` + View tabanlı çizim. Sekme arka plana alınınca döngü durmuyor. |

---

## 2. Token dosyasının son hâli

Mimari korunur: `theme/palette.ts` saf veri, `theme/index.ts` aktif temayı
donduruyor. **Hiçbir token adı silinmez** (58 dosya derlenmeye devam eder),
değerler yeniden yazılır ve brief'in adları *ek* olarak gelir.

### 2.1 Varsayılan tema açık olur

`theme/index.ts` içinde tek satır:

```ts
// ÖNCE: tercih yoksa sistem teması
export const isDark = override ? override === "dark" : Appearance.getColorScheme() === "dark";
// SONRA: tercih yoksa AÇIK tema — cilalanan tema budur (brief §2)
export const isDark = override === "dark";
```

### 2.2 Açık palet (cilalanan tema)

```ts
export const light: Palette = {
  /* Zemin ve yüzeyler — brief §2.1 */
  bg:       "#F2F4F7",  // --paper
  surface1: "#FFFFFF",  // --surface
  surface2: "#F8F9FB",  // kart üstü ikinci katman
  surface3: "#EAEDF2",  // --surface-sunken (input, boş alan, skeleton)
  elevated: "#FFFFFF",
  inverse:  "#12141C",  // YENİ — --surface-inverse (hero, canlı skor şeridi)
  overlay:  "rgba(18,20,28,0.56)",
  pressed:  "#EAEDF2",
  ripple:   "rgba(18,20,28,0.06)",

  /* Mürekkep */
  textPrimary:   "#12141C",  // --ink
  textSecondary: "#454B5C",  // --ink-secondary
  textTertiary:  "#656C7D",  // --ink-muted, KOYULAŞTIRILDI (bkz. 2.4)
  textDisabled:  "#A7AEBD",
  textOnBrand:   "#12141C",  // mercan dolgu üstünde İNK (bkz. 2.4)
  textOnStatus:  "#FFFFFF",
  onDark:        "#FFFFFF",             // YENİ — --ink-onDark
  onDarkMuted:   "rgba(255,255,255,0.64)", // YENİ

  /* Çizgi */
  border:       "#E2E6EC",  // --line
  borderStrong: "#CFD5DE",  // --line-strong
  separator:    "#EBEEF3",

  /* Marka = MERCAN — yalnız aksiyon ve seçili durum */
  brand:       "#EE7F55",  // --coral
  brandStrong: "#D96B42",  // --coral-press
  brandAccent: "#B0512A",  // mercanın METİN sürümü (bkz. 2.4)
  brandDim:    "#FDF0EA",  // --coral-tint
  brandBorder: "#F6D3C3",

  /* Aksan = MAVİ — yalnız veri */
  accent:       "#2743F0",  // --blue
  accentStrong: "#1C31BE",
  accentText:   "#2743F0",
  accentDim:    "#E9ECFE",  // --blue-tint
  accentBorder: "#C3CBFB",
  textOnAccent: "#FFFFFF",

  /* Veri karşıtı — deplasman barı */
  slate:     "#7C8598",  // bar dolgusu (3.3:1, UI eşiğini geçer)
  slateSoft: "#99A1B3",  // ray/pasif

  /* Durum */
  live:  "#E0374A",  liveDim: "#FDECEE",  liveGlow: "rgba(224,55,74,0.20)",
  win:   "#14966B",  winDim:  "#E4F5EE",
  draw:  "#9AA2B1",  drawDim: "#EFF1F5",
  loss:  "#D0455A",  lossDim: "#FCEBEE",
  warn:  "#B45309",  warnDim: "#FEF3E2",
  danger:"#D0455A",  dangerDim:"#FCEBEE",
  info:  "#2743F0",  infoDim: "#E9ECFE",

  /* Futbol semantiği */
  yellowCard: "#E8B00A",
  redCard:    "#D0455A",
  star:       "#EE7F55",   // favori = aksiyon → mercan
  starEmpty:  "#CFD5DE",
  pitch:      "#EAEDF2",   // saha zemini YEŞİL DEĞİL (brief §4.4)
  chalk:      "rgba(255,255,255,0.55)", // YENİ — tebeşir çizgisi
  chalkInk:   "rgba(18,20,28,0.08)",    // YENİ — kağıt üstü tebeşir

  /* Reyting — mavi ailesine taşındı, mor kalmadı */
  ratingPoor:  "#D0455A", ratingPoorBg:  "#FCEBEE",
  ratingFair:  "#B45309", ratingFairBg:  "#FEF3E2",
  ratingGood:  "#14966B", ratingGoodBg:  "#E4F5EE",
  ratingGreat: "#0E7052", ratingGreatBg: "#DCF0E8",
  ratingElite: "#2743F0", ratingEliteBg: "#E9ECFE",
  ratingNone:  "#656C7D", ratingNoneBg:  "#EAEDF2",

  /* Sıralama bölgeleri — satır boyanmaz, 3px sol işaret olur */
  zoneChampion: "#E0A106", zonePromotion: "#14966B", zonePlayoff: "#2743F0",
  zoneRelegationPlayoff: "#B45309", zoneRelegation: "#D0455A",

  /* Yardımcı */
  skeletonBase: "#EAEDF2", skeletonHighlight: "#F5F7FA",
  tabBar: "#FFFFFF", tabBarBorder: "#E2E6EC", chartGrid: "#EAEDF2",
  scrimGradientTop: "rgba(18,20,28,0.00)", scrimGradientBottom: "rgba(18,20,28,0.88)",
};
```

### 2.3 Koyu palet (ikinci sınıf değil, aynı sistemin negatifi)

Kağıdın soğuk gri-mavi alt tonu koyuda da sürer; mercan aynı kalır, mavi
okunabilirlik için açılır.

```ts
bg "#0E1016" · surface1 "#171A22" · surface2 "#1D212A" · surface3 "#242934"
inverse "#F2F4F7" · border "#262B36" · borderStrong "#343A48"
textPrimary "#F2F4F7" · textSecondary "#A8B0BF" · textTertiary "#79808F"
brand "#EE7F55" (aynı) · brandStrong "#D96B42" · brandDim "#2A1A12" · textOnBrand "#12141C"
accent "#6E80FF" (koyuda #2743F0 okunmaz) · accentDim "#161B3A"
slate "#8A93A6" · live "#FF4759" · win "#25B37F" · loss "#F0637A"
pitch "#1A1F29" · chalk "rgba(255,255,255,0.10)"
```

### 2.4 Kontrast doğrulaması (brief §6 gereği, hesaplandı)

| Çift | Ölçüm | Karar |
| --- | --- | --- |
| `#767D8E` üzeri `#F2F4F7` | **3,74:1 — AA'yı geçmiyor** | `--ink-muted` **#656C7D**'ye koyulaştırıldı → **4,77:1** ✅ |
| Beyaz üzeri `#EE7F55` | **2,69:1 — geçmiyor** | Mercan dolgu üstündeki metin **ink #12141C** → **6,83:1** ✅ |
| `#EE7F55` metin üzeri kağıt | **2,44:1 — geçmiyor** | Mercan **metin olarak kullanılmaz**; gerekirse `brandAccent #B0512A` → **4,70:1** ✅ |
| `#2743F0` üzeri kağıt | 6,06:1 | ✅ metin ve bar olarak serbest |
| `#99A1B3` bar üzeri kağıt | 2,35:1 | Deplasman barı **#7C8598** → 3,36:1 ✅ (grafik eşiği 3:1) |
| Beyaz üzeri `#2743F0` | 6,68:1 | ✅ |

> Bunlar brief'in kendi kuralının ("geçmiyorsa koyulaştır") uygulanmasıdır;
> mercan/mavi kimliği değişmez, yalnız *metin* varyantları düzeltilir.

### 2.5 Tipografi

Ölçek brief §2.2'ye göre yeniden yazılır; **eski adlar korunur**, değerleri
düşer. Rakam token'larında `fontVariant: ["tabular-nums"]` zaten zorunlu.

```ts
overline  10 / 700 / +0.9 / UPPER     // brief'in "label"ı — zaten var
micro     10 / 600 / +0.4
caption   11 / 500
bodySm    12 / 400 / lh 17            // ← ARAYÜZÜN VARSAYILANI
body      13 / 400 / lh 18
h3        13 / 600
h2        14 / 600                    // (eski 15)
h1        16 / 600 / -0.16            // (eski 17)
display   16 / 700 / -0.16            // (eski 19) — SAYFA BAŞLIĞI
label     12 / 600                    // eski API, korunuyor

scoreSm   16 / 700 / -0.16  tabular
scoreMd   20 / 700 / -0.40  tabular
scoreLg   28 / 700 / -0.56  tabular   // maç kartı skoru   (brief: display)
scoreHero 40 / 700 / -1.20  tabular   // maç detay skoru   (brief: display-lg)

metric    20 / 700 / -0.40  tabular   // panel rakamı (eski 22)
metricSm  14 / 700 / -0.20  tabular   // (eski 16)
clock     11 / 600          tabular
tableNum  12 / 500          tabular
```

`letterSpacing` RN'de **px**'tir; `-0.02em @ 28px = -0.56`, `-0.03em @ 40px = -1.20`,
`.08em @ 10px = +0.8` diye çevrildi.

Yazı ailesi kararı §6-B'de onaya sunuluyor (sistem fontu mu, Archivo+Inter mi).

### 2.6 Uzay, yarıçap, gölge, hareket

```ts
space   4 / 8 / 12 / 16 / 20 / 24 / 32 / 48                 (mevcut ölçek yeterli)
layout.screenPadding       12 → 20    // brief §2.3
layout.screenPaddingDense  12         // YENİ — puan tablosu gibi 8 sütunlu düzenler
card padding               16

radius.md   8 → 10    // iç eleman
radius.lg  12 → 16    // kart
radius.xl  16         // sheet/hero (değişmez)
radius.pill 999

elevate(0) → yalnız 1px --line kenarlık, GÖLGE YOK   (varsayılan kart)
elevate(1) → shadow-pop: 0 1px 2px rgba(18,20,28,.04), 0 12px 32px -8px rgba(18,20,28,.12)
             (yalnız bottom sheet, sticky skor şeridi, dropdown, FAB)

duration.fast 120 · base 180 → 220 · slow 320
easing.standard  (0.2, 0, 0, 1) → (0.2, 0.8, 0.25, 1)
prefers-reduced-motion → RN'de AccessibilityInfo.isReduceMotionEnabled
                         (`useReduceMotion` kancası ZATEN var, her yere bağlanacak)
```

---

## 3. İmza öğesi — tebeşir çizgisi sistemi

Üç parça, üçü de **var olan dosyalara** girer; böylece tek yerden 60 ekrana yayılır.

**(a) Kale direği ayracı** → `components/ui/SectionHeader.tsx`
Bölüm başlığının soluna 2×12px mercan dikey işaret + altına 1px `--line`.
Tek bileşen değişikliği; her `SectionHeader` kullanan ekran otomatik alır.

```
▌ SON MAÇLAR                                    Tümü ›
────────────────────────────────────────────────────
```

**(b) Orta yuvarlak yayı** → `components/ui/ChalkArc.tsx` (YENİ, ~40 satır)
`react-native-svg` `<Path>` ile tek yay, `opacity 0.04`, resim değil geometri.
Maç detay skor bloğunun ve takım kapağının arkasında durur.

**(c) Dakika halkası** → `components/ui/ProgressRing.tsx` (VAR) + `LiveBadge.tsx`
`progress = dakika / 90`, `strokeWidth 1.5`, renk `--live`, ortada tabular dakika.
Yanıp sönen kırmızı nokta **kaldırılır** — canlılığı halka taşır. Brief §9'daki
"sürekli nabız atan öğe" yasağı da böylece kendiliğinden karşılanır.

```
   ╭───╮
   │ 67│'      ← halka 67/90 dolu, mercan değil --live
   ╰───╯
```

Bu üçü dışında dekoratif öğe eklenmez.

---

## 4. Ekran kararları ve tel çerçeveler

### 4.1 Onboarding — `app/hosgeldin.tsx`

Tek kareden **üç slayta** çıkar. Tam ekran oyuncu görseli + alttan scrim.
Başlık 16/600 (brief 22px diyor ama kendi "16 üstü yok" kuralıyla çelişiyor —
**sayfa başlığı istisnası** sayıp 16'da tutuyorum, gerekçe §6-E). Otomatik geçiş
korunur ama slayt başına; `reduced-motion`'da hiç başlamaz. Buton fiili:
**"Takımını seç"** → şehir/lig seçicisine (`ScopeSheet`) düşer, boşluğa değil.

```
┌────────────────────────────────┐
│                          Geç   │ 11px, onDarkMuted
│                                │
│        [oyuncu görseli]        │
│                                │
│░░░░░░░░ scrim ░░░░░░░░░░░░░░░░│
│ Ligini seç, maçını takip et    │ 16/600 onDark
│ Şehrindeki amatör ligin tüm    │ 13/400 onDarkMuted
│ maçları, kadroları, puanları.  │
│  ━━━  ───  ───                 │ segment göstergesi, aktif mercan
│ ┌────────────────────────────┐ │
│ │       Takımını seç         │ │ 48px pill, mercan dolgu, ink metin
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

### 4.2 Home — `app/(tabs)/index.tsx`

Ana iş: **manşet karuseli**. Kaynağı gerçek: `/api/news/feed` (kapak görseli +
başlık + özet) ve `match_picture` + `post_manset` taşıyan maçlar. Rol bazlı
bölümler (kulüp paneli, oyuncu kapıları) korunur — kaldırılırsa uygulamanın
işlevi kaybolur; karusel onların **üstüne** gelir.

```
┌────────────────────────────────┐
│ Genel Bakış        [kapsam ▾]  │ daralan başlık (var)
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │ SÜPER AMATÖR   ● CANLI     │ │ 10px overline + rozet
│ │      [kapak görseli]       │ │ 16:10, radius 16
│ │░░░░░░░░ scrim ░░░░░░░░░░░░│ │
│ │ Kartal'ın 78. dakika golü  │ │ 16/600, MAKS 2 SATIR
│ │ derbiyi ikiye katladı      │ │
│ │ ElitLig · 2 saat önce      │ │ 11px
│ │ ━━━━━━━ ─── ─── ───        │ │ dolan bar, 6sn, dokununca durur
│ └────────────────────────────┘ │
├────────────────────────────────┤
│ (◯)  Tümü  Süper  A Ligi  B …  │ arama 40px mercan daire + chip şeridi
│                                │ seçili chip: KOYU zemin + beyaz (mercan değil)
├────────────────────────────────┤
│ ▌ CANLI                        │
│ ┌──────┐ ┌──────┐ ┌──────┐    │ yatay kaydırma
│ │╭──╮  │ │      │ │      │    │ MinuteRing
│ ││67│  │ │      │ │      │    │
│ │Kartal│ │      │ │      │    │
│ │  2-1 │ │      │ │      │    │ scoreLg 28 tabular
│ │Şimşek│ │      │ │      │    │
│ │▬▬▬▬░░│ │      │ │      │    │ 2px çift renkli bar (mavi/slate)
│ └──────┘ └──────┘ └──────┘    │
├────────────────────────────────┤
│ ▌ SONRAKİ MAÇLAR         Tümü ›│
│ ┌──┬─────────────────────┬──┐  │
│ │26│ Kartal SK           │(◔)│  │ tarih dikey blok 14/600 + 10px EYL
│ │EYL│ Şimşekspor    20:00│   │  │ hatırlatıcı: 32px daire, açıkken dolu
│ └──┴─────────────────────┴──┘  │
├────────────────────────────────┤
│ ▌ PUAN DURUMU            Tümü ›│ ilk 5 satır
└────────────────────────────────┘
```

### 4.3 Lig sayfası — `app/(tabs)/ligler.tsx`

Sekmeler zaten var (Puan · Fikstür · İstatistik · Haber · Arşiv); brief'in
listesiyle örtüşüyor, **"Sonuçlar"** ayrı sekme olarak eklenir. Puan tablosu:
sticky başlık, tabular rakam, `FormChips` sütunu (var), bölge çizgisi satırı
boyamak yerine **sol kenarda 3px** işaret. Bu ekranda `screenPaddingDense` (12px)
kullanılır — 8 sütun 360px'e 20px kenarla sığmıyor.

```
   ┌ TAKIM ──────────── O  G  B  M  AV   P  SON 5 ┐ sticky, 10px overline
 ▌ │1 ⬤ Kartal SK      14 11 2  1  +24  35  ●●●○● │ 3px zone işareti solda
   │2 ⬤ Şimşekspor      14  9 3  2  +15  30  ●○●●● │
```

### 4.4 Maç detayı — `app/mac/[id].tsx` (en kritik)

Sticky tabela zaten var (96→daralan). Yeniden kurgulanan: skor bloğu, Kadro,
Timeline, İstatistik. Sekmeler: **Özet · Kadro · Akış · İstatistik · H2H · Puan**
(uygulamada "Canlı" sekmesi Akış ile birleşir — canlı maçta aynı liste zaten
canlı besleniyor, iki ayrı sekme kullanıcıya iki farklı yer olduğunu düşündürüyordu).

```
┌────────────────────────────────┐
│ ‹  Kartal SK — Şimşekspor   ⤴ │ daralan başlık
├────────────────────────────────┤
│      ╭ ChalkArc %4 ────────╮   │ arkada orta yuvarlak yayı
│   ⬤       ╭──╮        ⬤     │ armalar 48px
│ Kartal    │67│'    Şimşek    │ MinuteRing
│           ╰──╯                │
│        2  –  1                │ scoreHero 40 tabular
│ ─────────────┬─────────────── │
│ Demir  12'⚽ │ ⚽45' Yılmaz   │ EV SAĞA / DEPLASMAN SOLA hizalı
│ Ateş   78'⚽ │                │ iki sütun, ezilmiyor
├────────────────────────────────┤
│ Özet  Kadro  Akış  İst.  H2H  │ kaydırmalı alt çizgi, 12px
└────────────────────────────────┘
```

**Kadro sekmesi** — mobilde takım başına ayrı segment (brief'in tercihi).
`components/ui/PitchView.tsx` (YENİ) — `PitchLineup`'ın *izleme* kardeşi:
`--surface-sunken` zemin, %8 beyaz tebeşir çizgisi, çok hafif biçme şeridi.
**Diziliş 8 kişilik** (3-3-1 …), `FORMATIONS` sözlüğünden okunur.

```
│  [ Kartal SK ]   Şimşekspor    │ takım segmenti
│  ⬤ 3-3-1                       │ diziliş + takım rengi noktası
│ ┌────────────────────────────┐ │
│ │ ·  ·  ·  ·  ·  ·  ·  ·  ·  │ │ tebeşir çizgileri %8
│ │       (○)   (○)            │ │ 36px avatar
│ │        9     11            │ │ forma no rozeti 16px, sağ alt
│ │      DEMİR  ATEŞ           │ │ soyadı 10/600
│ │   (○)  (○)  (○)            │ │
│ │        (○)                 │ │ GK
│ └────────────────────────────┘ │
│ ▌ YEDEKLER                     │
│ ▌ TEKNİK DİREKTÖR              │
│ [ Kadroyu liste olarak gör ]   │ → tablo: oyuncu, dk, gol, puan
```
Oyuncuya dokunma → `BottomSheet` (var): foto, pozisyon, rating, maçtaki olayları,
"Oyuncu sayfasına git". **Isı haritası yok** (konum verisi yok, §1.4).

**Akış sekmesi** — ortada tek dikey hairline, olaylar takıma göre sola/sağa.
Dakika çizgi üstünde daire içinde (11px tabular). Tüm ikonlar **inline SVG**;
`@expo/vector-icons` Ionicons'ta gol için futbol topu var ama kart için yok —
`components/ui/EventIcon.tsx` (YENİ) altı olayı SVG olarak çizer. Emoji yok
(zaten yok). Gol olayları vurgulu kart + `1–2` skor değişimi; diğerleri tek satır.
Devre arası / maç sonu tam genişlik ayraç. Üstte "Yeni önce / Maç akışı" toggle.

```
│ [Yeni önce]  Maç akışı         │
│                │               │
│                ●  MAÇ SONU     │ tam genişlik ayraç
│   ┌──────────┐ │               │
│   │ ⚽ 2–1    │(78)             │ vurgulu gol kartı
│   │ Ateş     │ │               │
│   └──────────┘ │               │
│                │(45) ⚽ Yılmaz  │ 1–1
│         Demir ▮│(66)            │ sarı kart
```

**İstatistik sekmesi** — tek 4px ortadan bölünmüş bar, sol ev (mavi), sağ
deplasman (slate). Değerler dış kenarlarda, etiket ortada 11px uppercase.
Görünür alana girince 400ms'de bir kez dolar. **Üç grup** (xG yok, §1.4):

```
│ ▌ HÜCUM                        │
│  7    ▬▬▬▬▬▬▬│▬▬▬▬        4    │
│        FIRSAT YARATMA          │
│ ▌ MÜCADELE                     │  (Kurtarış, İkili Müc., Hava Topu, Blok)
│ ▌ DİSİPLİN                     │  (Faul, Sarı, Kırmızı)
```

### 4.5 Takım detayı — `app/takim/[id].tsx`

Kapak: takım renginden (`ApiTeam.colors` — gerçek alan) türetilmiş çok düşük
doygunlukta zemin + sol üstte %6 opaklıkta dev arma filigranı. Başlık altında
lig sırası (puan tablosundan), `FormChips`, kuruluş, şehir.
Sekmeler: Genel · Kadro (poza göre 3 sütun grid) · Fikstür · İstatistik.

```
┌────────────────────────────────┐
│ ⬤(filigran %6)                 │
│  ⬤ Kartal SK                   │ 16/600
│  3. sıra · ●●●○● · İstanbul    │ 11px meta
├────────────────────────────────┤
│ Genel  Kadro  Fikstür  İst.    │
│ ▌ SIRADAKİ MAÇ                 │
│ ▌ SON MAÇ                      │
│ ▌ SEZON ÖZETİ                  │
│  14    11    2    1    +24     │ 5 sayı, metric 20 tabular
│  MAÇ   G     B    M    AV      │ hairline ile bölünmüş, KUTU YOK
│ ▌ ÖNE ÇIKAN 3 OYUNCU           │ maç detayıyla AYNI PlayerRow
```

### 4.6 Oyuncu detayı — `app/oyuncu/[id].tsx`

```
┌────────────────────────────────┐
│ ┌────┐  Emre Demir             │ 88px, radius 16 KARE (arma ile çakışmasın)
│ │foto│  Forvet · 9 · 24 · 🇹🇷   │ 11px meta satırı
│ └────┘  ⬤ Kartal SK            │
├────────────────────────────────┤
│  14  │  11  │   6   │  1.240   │ 4 sütun, hairline, KUTU YOK
│  MAÇ │  GOL │ ASİST │ DAKİKA   │ 10px overline
├────────────────────────────────┤
│ ▌ FORM (son 10 maç puanı)      │ Sparkline (YENİ, svg)
│ ▌ SEZON GEÇMİŞİ                │ zaman çizgisi
│ ▌ PİYASA DEĞERİ                │ gerçek alan (market_value)
```
Isı haritası **yok** — yerine "Maçlardaki katkısı" (gol/asist/kart dağılımı).

### 4.7 Boş / hata / iskelet

`Skeleton.tsx` sekiz varyantla zaten var; her yeni bileşen kendi iskeletini
alır (layout'u birebir taklit, shimmer çok hafif). `ErrorState.errorMessage`
gözden geçirilir: "Bir şeyler ters gitti" benzeri metin **kalmayacak** —
ne oldu + nasıl düzeltilir.

---

## 5. Oyun motorları

### 5.0 Ortak altyapı — `lib/game/` (YENİ)

```
lib/game/loop.ts     Sabit zaman adımı: accumulator, dt = 1/120, render
                     interpolasyonu, requestAnimationFrame. AppState
                     'background' → döngü durur. 16ms aşılırsa parçacık
                     bütçesi otomatik düşer.
lib/game/input.ts    PanResponder sarmalayıcısı (RN çekirdeği; Gesture
                     Handler gerekmez): sürükle-fırlat + sürekli konum
                     okuma + klavye alternatifi.
lib/game/tuning.ts   Üç oyunun TÜM sabitleri tek TUNING objesinde.
lib/game/paint.ts    Oyun paleti: kağıt zemin, tebeşir, mercan, mavi —
                     doğrudan @/theme'den okur, ayrı estetik ada yok.
```

**Çizim katmanı kararı:** `react-native-svg` (kurulu). Canvas RN'de yok;
Skia/Reanimated eklemek 2 büyük bağımlılık demek. Düğüm sayıları ölçüldü —
sektir ~20, penaltı ~60, slalom ~30 — Fabric altında 60fps için yeterli.
Brief'in asıl şikâyeti *fizik ve kontrol*; o katman çizimden bağımsız ve
birebir uygulanacak. Alternatif §6-C'de onaya sunuluyor.

### 5.1 Top sektirme

Brief §5.1 birebir: temas ofseti `o`, `vx -= o*HIT_X`, `vy = -LIFT*(1-0.35|o|)`,
`spin = o*SPIN_K`, Magnus `ax += spin*vy*MAGNUS`, `spin *= 0.985`, `g = 1600`,
hava sürtünmesi `v *= 0.999^(dt*60)`, duvar `vx = -vx*0.65`. Tatlı nokta
`|o| < 0.22` → "Perfect" + combo + tek seferlik beyaz halka + haptik. Halkalar
süzülür, **yalnız yukarı geçişte** sayılır. Top `spin` kadar gerçekten döner
(SVG `transform rotate`), altında yükseklikle küçülen elips gölge, 6 karelik iz.
HUD: sol üst skor, sağ üst combo. Başka hiçbir şey.

### 5.2 Penaltı — komple yeniden

Tek jest: toptan sürükle-fırlat. Yön = yatay bileşen, güç = uzunluk
(`POWER_MIN..MAX`), yükseklik = dikey bileşen, **falso = parmağın yolunun
eğriliği** (başlangıç-bitiş doğrusuna göre orta noktanın sapması, cross product).
Uçuş 0,45sn; `z` derinlik ölçeği, `x`'e `curve*t²`.
Kaleci **dürüst**: top ayrıldıktan sonra 140–320ms gecikme, `tahmin = gerçek +
gauss(0,σ)`, **bir kez dalar, düzeltemez**, erişim yarıçapı. Koşu açısına göre
ağırlık en fazla %10. Kale 3 nokta projeksiyonu, ağ grid mesh + temas noktasından
sönümlü dalga. Son %20'de kritik mesafede 0.25x ağır çekim. 5 atışlık seri.

### 5.3 Slalom — kontrol eğrisi

Brief §5.3 birebir: `n = clamp((touchX-centerX)/(width/2), -1, 1)`,
`steer = sign(n)*|n|^1.7`, `targetVx = steer*MAX_LATERAL (520)`,
`vx = approach(vx, targetVx, accel 2400, decel 3400, dt)`. Parmak kalkınca
yumuşak merkezlenir. Gövde `steer*14°` yatar, kamera `-steer*10px` karşı kayar.
Yakınsayan perspektif (dokusuz geometri), ölçekli koni sprite'ları, sıyırma
bonusu (14px), **tasarlanmış 6 desen** (rastgele değil), çarpışma oyunu
bitirmez (hız %35 düşer, 600ms dokunulmazlık, 3 çarpma = tur biter).

---

## 6. Alınan kararlar (onaylandı)

**A. Kurumsal mor — KARAR: logoda kalır, arayüzden çıkar.** `#6D28D9`, `palette.ts` içinde "KURUMSAL MOR"
diye işaretli ve splash/logo ile ilişkili. Brief mercan+mavi istiyor; ikisi
aynı üründe yaşayamaz (brief §9: "aynı ekranda iki farklı vurgu rengi
yarışması"). **Mor tamamen kaldırılıyor.** Marka varlıkları (logo, splash,
`app.json` ikonları) bu turda değişmez — onlar da güncellenecekse ayrı iş.

**B. Yazı ailesi — KARAR: Archivo + Inter eklendi (`expo-font`).** Brief Archivo + Inter istiyor; repo bilinçli olarak sistem
fontu kullanıyor. Seçenek 1: sistem fontu + brief'in ölçeği (0 bağımlılık,
0 risk). Seçenek 2: `expo-font` + `assets/fonts/` altına Archivo/Inter .ttf
(1 bağımlılık, açılışta ~120KB, splash arkasında yüklenirse FOUT yok).

**C. Oyun çizim katmanı — KARAR: `react-native-svg`, yeni bağımlılık yok.** Seçenek 1: `react-native-svg` (kurulu, 0 bağımlılık,
ölçülen düğüm sayıları için yeterli). Seçenek 2: `@shopify/react-native-skia`
+ `react-native-reanimated` (gerçek canvas, bol parçacık, ~2 büyük bağımlılık,
EAS derleme ayarı gerekir).

**D. Olmayan veri — KARAR: kaldırılır, gerçek olay istatistikleri gruplanır.** Topla oynama %, xG ve ısı haritası sunucuda yok. Öneri:
bunları kaldırıp gerçek olay istatistiklerini (Kurtarış, Fırsat, İkili Müc.,
Hava Topu, Blok, Faul) üç grupta göstermek. Alternatif: `elitlig-server`'a yeni
uç eklemek — ayrı ve büyük bir iş.

**E. Brief'in kendi içinde çeliştiği yer.** §4.1 onboarding başlığı için 22px
diyor, §8 ise "hiçbir ekranda 16px üstü metin yok (skor ve sayfa başlığı hariç)"
diyor. Onboarding başlığını sayfa başlığı sayıp **16/600**'de tutuyorum.

**F. Sıra (brief §7.2).** tokenlar → komponentler → maç detay → takım/oyuncu →
home + karusel → lig → oyunlar. Her aşama sonunda uygulama çalışır, typecheck
temiz, ayrı commit.

**G. Ekran görüntüsü (brief §7.5).** Bu ortam başsız bir Linux konteyneri;
Expo Go ile telefonda çalışan bir uygulamanın ekran görüntüsü **alınamaz**.
Öz eleştiriyi kod ve ölçü üzerinden yapacağım (kontrast hesabı, punto tavanı,
mercan alan yüzdesi). Görüntü isterseniz siz alıp buraya bırakabilirsiniz.

---

## 7. Teslim durumu

Aşağıdaki liste, planın hangi maddesinin kodda karşılığı olduğunu gösterir.
Onay sonrası yedi aşama sırayla uygulandı; her aşama sonunda `npm run check`
temiz ve uygulama çalışır durumda bırakıldı.

| Aşama | Durum | Not |
| --- | --- | --- |
| Tokenlar | ✅ | Palet, tipografi, uzay, yükselti, hareket. Varsayılan tema açık. |
| Komponentler | ✅ | İmza öğeleri (kale direği, ChalkArc, MinuteRing) + PitchView, EventIcon, Sparkline, HeroCarousel. |
| Maç detayı | ✅ | Skor bloğu, gol atanlar, saha görünümü, gruplu istatistik, akış. |
| Takım / oyuncu detayı | ✅ | Kimlik bloğu, form grafiği, kapak filigranı. |
| Home + karusel | ✅ | Manşet karuseli haber akışından besleniyor. |
| Lig sayfası | ✅ | Bölge rayı ve sticky başlık zaten doğruydu; dar kenar eklendi. |
| Oyunlar | ✅ | Üçünün de motoru baştan yazıldı, on ölçümle doğrulandı. |

### 7.1 Yapılmayanlar ve gerekçeleri

- **Isı haritası** (oyuncu ve maç detayı): sunucu oyuncu konum verisi tutmuyor.
  Uydurulmuş bir ısı haritası, gerçek verinin yanında duran sahte bir grafik
  olurdu.
- **Topla oynama yüzdesi ve xG**: şemada karşılıkları yok (§1.4). Yerlerine
  gerçek olay istatistikleri üç blokta gruplandı.
- **Benzer oyuncular** (§4.6): böyle bir uç ya da benzerlik ölçütü yok.
- **Takım renginden türetilmiş kapak zemini** (§4.5): `ApiTeam.colors` alanı
  şemada var ama biçimi tanımsız ve kod tabanında hiçbir yerde okunmuyor.
- **Görünür klavye odak halkası** (§6): React Native'de dokunmatik arayüz için
  klavye odağı kavramı yoktur; bu bir web platformu gereğidir. Uygulama Expo
  Web'e de derleniyorsa ayrıca ele alınmalı. Ekran okuyucu erişilebilirliği
  (etiket, rol, ipucu) yeni bileşenlerin hepsinde var.
- **Ekran görüntüsüyle öz eleştiri** (§7.5): bu ortam başsız bir Linux
  konteyneri; Expo Go ile telefonda çalışan bir uygulamanın görüntüsü
  alınamıyor. Yerine ölçülebilir denetim yazıldı (bkz. 7.2) — kontrast, punto
  tavanı, çıplak hex, emoji, gradient, sonsuz animasyon ve oyun fiziği
  sayıyla sınanıyor.

### 7.3 İkinci geçiş — "premium" revizyonu

Birinci geçişin üç kararı ürünü telefonda kötü gösteriyordu ve geri alındı.
Gerekçeleri ve yerlerine konanlar:

**1. 16px punto tavanı kaldırıldı.** Kural, yoğunluk adına arayüzün
varsayılanını 12px'e, kart başlığını 14px'e, sayfa başlığını 16px'e
indiriyordu. Sonuç, hiçbir şeyin öne çıkmadığı gri bir metin duvarıydı:
kullanıcı nereye baktığını başlıktan değil ancak içeriği okuyarak
anlayabiliyordu. Yeni ölçek 11–28 (metin) ve 18–46 (skor); gövde 15, satır
başlığı 16, bölüm başlığı 18, sayfa başlığı 22. Satır ve kart ölçüleri de
büyüdü. Denetim artık tavan yerine ÖLÇEK SAĞLIĞI sınıyor: okunabilirlik
tabanı, tavan, monoton hiyerarşi, satır yüksekliği.

**2. "Gölge değil çizgi" yumuşatıldı.** Gerekçe doğruydu (her yuvarlak köşenin
altına koyu bir bulut koymak ürünü şablona çevirir) ama çözüm aşırıydı: beyaz
kart, beyaza yakın kâğıdın üstünde yalnız 1px çizgiyle durunca hiçbir şey
yüzmüyordu. Kart artık çizgi + ÇOK GENİŞ, ÇOK SÖNÜK bir gölge taşıyor
(opaklık 0,045 · yarıçap 14 · y 3). Gölge görünmez, hissedilir.

**3. Gradyan yasağı token setine çevrildi.** Serbest gradyan hâlâ yok ama
paletteki altı gradyanın her birinin bir işi var. Denetim, gradyan duraklarının
tema tokenından geldiğini sınıyor.

Buna üç yeni yapı eklendi:

- **Mürekkep blok (`inkBlock`)** — daima koyu imza yüzeyi. Maç skoru şeridi,
  takım kapağı, oyuncu kimlik kartı, vitrin kartı ve manşet karuseli aynı
  yüzeyi paylaşır. `inverse` ile karıştırılmamalı: `inverse` koyu temada AÇIK
  bir yüzeydir ve beyaz metin taşıyan bloklar orada okunmuyordu.
- **Gerçek saha** — `PitchView`, `PitchLineup` ve oyun tuvalleri artık derin
  yeşil zemin + beyaz tebeşir kullanıyor. Eski gri saha, eski uyumluluk
  katmanında `colors.pitch` EKRAN ZEMİNİ anlamına geldiği için kâğıttan ayırt
  edilemiyordu. Tuvalin üstündeki her şey (direk, top, kaleci) temadan
  bağımsız sabit renktedir.
- **Tarayıcı önizlemesi** — 7.1'de "alınamıyor" denen ekran görüntüsü artık
  alınabiliyor: uygulama `expo export --platform web` ile derlenip başsız
  Chromium'da açılıyor. Aşağıdaki kusurlar bu yolla bulundu ve düzeltildi:
  vitrin kartında "CANLI CANLI" tekrarı, kırpılan golcü adları, takım kapağını
  soluk bir dikdörtgene çeviren arma filigranı, kendi zeminini ezen yükselti
  yayılımı (manşet kartı bembeyaz çiziliyordu), sola kaçan boş-durum düğmesi,
  başlığını tekrar eden hata metni, koyu temada görünmeyen kale direği,
  penaltıda mürekkep üstüne mürekkep yazan "kurtardı" etiketi, sahayı zebraya
  çeviren biçme şeridi opaklığı ve "Sistem" seçiliyken sistem ayarını hiç
  okumayan tema mantığı.

### 7.4 Üçüncü geçiş — sadeleştirme ve kompaktlaştırma

Kullanıcının iki isteği vardı: "aynı yere farklı menü basamaklarından
erişiliyor, sadeleştir" ve "font ve kart boyutlarını baya küçült, daha fazla
içerik sığsın".

**A. Tek kapı kuralı.** Menü ile Profil arasındaki iş bölümü netleştirildi
(keşif ↔ kişisel) ve kesişim sıfıra indirildi. Ayrıntılı liste README →
"Bilgi mimarisi" bölümündedir. Özet: Menü 34 satırdan 11'e, bildirim
tercihlerinin kapı sayısı 4'ten 1'e indi; `ligler` içindeki "Oyuncular"
segmenti (Oyuncular sekmesinin birebir kopyası) ve Menü'nün kısayol ızgarası
(kendi listesinin kopyası) kaldırıldı.

**B. Kompakt ölçek.** İkinci geçişteki büyütme geri alındı ama ilk sürümün
16px tavanına dönülmedi; ölçek ikisinin ortasına yerleşti:

| | 1. sürüm | 2. sürüm | 3. sürüm |
| --- | --- | --- | --- |
| gövde | 13 | 15 | **14** |
| satır başlığı | 13 | 16 | **15** |
| kart başlığı | 14 | 18 | **16** |
| sayfa başlığı | 16 | 22 | **19** |
| tek satır yüksekliği | 48 | 56 | **46** |
| maç satırı | 56 | 66 | **56** |
| kart yarıçapı | 16 | 18 | **14** |
| ekran kenarı | 20 | 20 | **16** |

Manşet karuselinin oranı 10:16'dan 1:2'ye indi (390px ekranda 224px yerine
195px). Düğme boyları 34/40/46; 44px'in altındakiler `touchSlop` ile dokunma
hedefine tamamlanır.

**C. Bu geçişte bulunan kusurlar.**

- `Tabs` eşit dağıtım kipinde yalnız TOPLAM genişliğe bakıyordu; en geniş
  etiket eşit yuvaya sığmadığında tek bir sekme üç noktaya düşüyordu
  ("Kadrolar" → "Kadro…", "Sonuçlar" → "Sonuç…"). Karar artık etiketin DOĞAL
  genişliğine bakar — kutunun genişliği eşit kipte zorlandığı için metin
  ayrıca ölçülür — ve sığmıyorsa şerit kaydırmaya geçer.
- Sekme çubuğu 58px'e inince etiketlerin alt kesimi kırpılıyordu; 60px + 4/4
  dolgu ile ölçüldü.
- Koyu temada saha üstündeki oyuncu diskleri `surface2` olduğu için KOYU
  çiziliyordu; `Avatar` artık `onPitch` kipinde daima beyaz disk + mürekkep
  baş harf kullanıyor (kale direği ve top için verilen kararın aynısı).

### 7.5 Dördüncü geçiş — mor sistem ve tek satırlı maç

**A. Renk sistemi mora geçti.** Mercan/gri-mavi palet, açık mor ↔ koyu mor
geçişli bir sisteme çevrildi. Değişen sadece marka rengi değil, sistemin
tonudur:

| | önce | sonra |
| --- | --- | --- |
| kâğıt | #F4F6FA soğuk gri-mavi | **#F5F3FB lavanta** |
| mürekkep | #12141C nötr | **#1A1033 mor mürekkep** |
| marka | #EE7F55 mercan | **#7C3AED mor** |
| marka üstü metin | mürekkep (mercan beyazı geçmiyordu) | **beyaz** (5,70:1) |
| kart | düz `surface1` | **`gradientCard` beyaz → lavanta** |
| gölge | mürekkep #0B1020 | **mor #3B1E6E** |
| koyu tema zemini | #0B0D13 | **#0C0718 mor gece** |

İki yeni token gerekti:

- **`brandOnDark`** (#C4B5FD) — koyu mor bloğun üstünde `brand` mor üstüne mor
  olurdu (~1,8:1). Kimlik bloklarındaki marka etiketleri bu açık lavantayı
  kullanır. Denetim bunu iki temada da sınar.
- **`gradientCard`** — varsayılan kart yüzeyi. `components/ui/GradientFill.tsx`
  bunu mutlak konumlu tek bir katman olarak serer: yerleşimi etkilemez, köşe
  yarıçapını çağırandan alır (kapsayıcıya `overflow: "hidden"` vermek yüzen
  rozetleri kırpardı). Card, ListRow, MatchRow, MetricTile, ActionTile ve
  seçili gün hücresi bu katmanı taşır.

`gradientBrand`ın açık durağı #A855F7'den **#9333EA**'ya koyulaştırıldı: beyaz
metinle 3,96:1 veriyordu, AA geçmiyordu.

**B. Maç satırı tek satıra indi.** `logo · ev · SKOR · dep · logo`. Satır
yüksekliği 56 → **40**; bir ekrana neredeyse iki kat maç giriyor. Skor ortada
sabit genişlikli bir blokta durduğu için okuma ekseni liste boyunca sabittir —
iki satırlı düzende skor sağdaydı ve takım adının uzunluğuna göre kayıyordu.
`TeamLine` bileşeni ve iki satırlı skor sütunu tamamen kaldırıldı.

**C. Ölçek bir kademe daha indi.** Gövde 14 → **13**, kart başlığı 16 → **15**,
sayfa başlığı 19 → **17**, kimlik 22 → **19**, skor 38 → **30**. Satır
yükseklikleri 46/58 → **40/50**, kart yarıçapı 14 → **13**, ekran kenarı
16 → **14**. Denetimin okunabilirlik tabanları buna göre güncellendi
(gövde ≥ 13, ikincil ≥ 11, mutlak taban 10; 9px yalnız büyük-harf tokenlara).

**D. Bu geçişte düzeltilenler.**

- Favoriler kısayolu `warn` (kahverengi-turuncu) tonundaydı; mor sistemde
  yabancı duruyordu → marka tonu. Favori yıldızı zaten bir AKSİYONDUR.
- Sekme çubuğu 56px'e inince etiketler yine kırpıldı → 58px.
- `app.json` içindeki splash/uygulama zemini ve bildirim rengi eski palete
  bağlıydı → mor değerlerle eşitlendi.

### 7.2 Kalıcı denetim

```bash
npm run check          # üçünü birden çalıştırır
npm run check:tokens   # kontrast, ölçek sağlığı, hex, emoji, gradyan, animasyon
npm run check:games    # oyun fiziği: yön, Magnus, kare hızı, kontrol eğrisi
npm run typecheck
```

Bu betikler briefin "bitti sayılma kriterleri" listesinin ölçülebilir kısmını
kalıcı hâle getirir: bir sonraki değişiklik kuralı bozarsa gözle fark
edilmesini beklemek gerekmez.
