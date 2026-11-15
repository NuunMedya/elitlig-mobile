/**
 * ELİT ÜÇLÜ — seviye tablosu (VERİ) + ayrıştırıcı + yeni seviye üreteci.
 *
 * Bu dosya BAĞIMSIZDIR (hiçbir içe aktarma yok): hem uygulama (Metro) hem de
 * denetim betiği (node --experimental-strip-types) doğrudan yükler. Tohumlu
 * rastgele üreteç (mulberry32) burada kopyalanır; lib/puzzle/types.ts içindeki
 * `seededRandom` ile birebir aynıdır.
 *
 * ── SEVİYE BİÇİMİ (sürüm 1) ──────────────────────────────────────────────
 * Her seviye TEK SATIRLIK bir dizedir; alanlar "|" ile ayrılır:
 *
 *   "1|24|5|Z,t2|c3x20,crate|........ / ...b.... / … (8 satır, "/" ile)"
 *    │  │  │  │    │          └ yerleşim: 8 satır × 8 karakter (boşluk yok sayılır)
 *    │  │  │  │    └ hedefler (virgülle): c<renk>x<sayı> = o taştan topla;
 *    │  │  │  │      mud · crate · snow · net · turf · cone · trophy = tahtadaki
 *    │  │  │  │      engelin TAMAMI (sayı yerleşimden çıkar); "crate:8" gibi
 *    │  │  │  │      açık sayı da verilebilir.
 *    │  │  │  └ bayraklar (virgülle, yoksa "-"): Z zor · S süper zor · N nefes ·
 *    │  │  │    t<n> sonradan yukarıdan gelecek kupa · s<n> tohum (yoksa
 *    │  │  │    seviye numarasından türetilir).
 *    │  │  └ taş türü sayısı (4–6)
 *    │  └ hamle sınırı
 *    └ biçim sürümü (bugün 1; ileride 2 eklenirse ayrıştırıcı ikisini de okur)
 *
 * Yerleşim karakterleri:
 *   .  rastgele taş              #  boş hücre (şekilli tahta)
 *   0–5 sabit renkli taş         R / V  yatay / dikey füze
 *   D  dron                      O  Röveşata (bomba)       G  Altın Top
 *   m / M  1 / 2 kat çamur       b / B / C  1 / 2 / 3 katlı krampon kutusu
 *   s  kar kaplı taş (buz)       n  kale ağındaki (zincirli) taş
 *   k / K  1 / 2 katlı antrenman konisi (düşer; komşu eşleşmeyle kırılır)
 *   g  çıplak toprak (çimlenecek) *  çimli hücre (çim buradan yayılır)
 *   t  şampiyonluk kupası (en alt sıraya indirilecek)
 *
 * ── YENİ SEVİYE EKLEMEK ──────────────────────────────────────────────────
 *   1. `UCLU_LEVELS` dizisinin SONUNA satır ekle (var olan satırlara DOKUNMA:
 *      oyuncuların yıldızları seviye numarasına bağlıdır). Elle yazılabilir ya
 *      da üreteçten aday alınabilir:
 *        node --experimental-strip-types --no-warnings scripts/check-puzzle-uclu.mjs --uret 121 140
 *      komutu 121–140 için botla hamlesi ayarlanmış satırlar basar.
 *   2. Yeni bir mekanik tanıtılıyorsa `UCLU_TIPS`'e o seviyenin ipucunu ekle.
 *   3. `npm run check:puzzles` — tüm satırlar (hazır eşleşme yok, hamle var,
 *      hedefler tahtada, botla kanıtlı çözülebilir) doğrulanır.
 * Tablo bitince üreteç (aynı biçimde) belirlenimci seviye üretmeye devam eder;
 * tabloya eklenen satır, o numaralı üretilmiş seviyenin yerini alır.
 */

export const UCLU_W = 8;
export const UCLU_H = 8;
export const UCLU_LEVEL_FORMAT = 1;
export const UCLU_MAX_LEVEL = 2000;

/** Taş türleri — sıra renk dizinidir (0..5). */
export const UCLU_PIECES = [
  { key: "top", name: "Top", plural: "top", icon: "football" },
  { key: "forma", name: "Forma", plural: "forma", icon: "shirt" },
  { key: "krampon", name: "Krampon", plural: "krampon", icon: "footsteps" },
  { key: "eldiven", name: "Eldiven", plural: "eldiven", icon: "hand-left" },
  { key: "duduk", name: "Düdük", plural: "düdük", icon: "volume-high" },
  { key: "bayrak", name: "Köşe bayrağı", plural: "bayrak", icon: "flag" },
] as const;

export type UcluGoalType = "color" | "mud" | "crate" | "snow" | "net" | "turf" | "cone" | "trophy";

export interface UcluGoalDef {
  type: UcluGoalType;
  /** Yalnız "color" için taş dizini. */
  color?: number;
  count: number;
}

export type UcluHardness = "normal" | "zor" | "super";

export interface UcluLevel {
  level: number;
  seed: number;
  moves: number;
  /** Taş türü sayısı (4–6). */
  colors: number;
  /** 8 satır × 8 karakter. */
  layout: string[];
  goals: UcluGoalDef[];
  /** Bu seviyede tanıtılan mekanik (ipucu balonu). */
  tip: string | null;
  /** Zor ya da süper zor seviye (rozet, kupa maçı). */
  cup: boolean;
  hardness: UcluHardness;
  /** "Nefes" seviyesi (kolay ara). */
  breather: boolean;
  /** Sahada beklemeyen, sonradan yukarıdan gelecek kupa sayısı. */
  trophySpawn: number;
  /** Tablodan mı (true) üreteçten mi geldi. */
  fixed: boolean;
}

/** mulberry32 — lib/puzzle/types.ts `seededRandom` kopyası. */
export function ucluRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SALT = 0x0c1a;
export const ucluSeed = (n: number) => (n * 7919 + SALT) >>> 0;

/* ───────────────────────────── ipuçları ───────────────────────────── */

export const UCLU_TIPS: Record<number, string> = {
  1: "Komşu iki taşı kaydır: aynı türden 3 taşı yan yana ya da alt alta diz.",
  2: "Düşen taşlar yeni eşleşmeler kurar. Zincirleme eşleşmeler kombo getirir!",
  3: "4 taşı düz diz: Füze oluşur. Kaydırdığın yöne doğru satırı ya da sütunu temizler.",
  4: "4 taşı kare yap: Dron oluşur. Çevresini temizler, sonra hedefe uçar!",
  5: "L ya da T şekli kur: Röveşata oluşur, 3×3 alanı patlatır.",
  6: "5 taşı düz diz: Altın Top oluşur. Bir taşla kaydır, o türdeki bütün taşları toplar.",
  7: "Çamur! Üstündeki taşı eşleştir, zemini temizle.",
  8: "İki özel taşı birbirine kaydır: dev kombo! Özel taşa dokunarak da patlatabilirsin.",
  9: "Koyu çamur iki katlıdır: iki kez temizlemen gerekir.",
  11: "Krampon kutusu düşmeyi engeller. Yanında eşleşme yap ya da patlat.",
  16: "Buzlu taş yerinden oynamaz. Onu bir eşleşmeye kat ya da patlat: buz kırılır.",
  21: "Şampiyonluk kupasını en alt sıraya indir: altındaki taşları temizle.",
  26: "Kale ağındaki taş zincirli. Onu bir eşleşmeye kat ya da patlat: ağ yırtılır.",
  31: "Yeni taş: Köşe bayrağı! Şekilli sahalar ve altı taş türü başlıyor.",
  36: "Çim ek! Çimli hücreye değen eşleşme, dizinin altını da çimlendirir.",
  41: "Antrenman konisi düşer ama kaydırılamaz. Yanında eşleşme yap ya da patlat.",
};

/* ───────────────────────────── TABLO ───────────────────────────── */

/**
 * SEVİYELER — sona ekle, var olanı değiştirme. 1–10 elle kurulmuş öğretici;
 * 11+ üreteçten alınıp botla hamlesi ayarlanmış, sonra donmuş satırlar.
 */
export const UCLU_LEVELS: readonly string[] = [
  /* 1 */ "1|20|5|-|c0x10|......../......../......../......../......../......../......../........",
  /* 2 */ "1|22|5|-|c1x14,c2x14|......../......../......../......../......../......../......../........",
  /* 3 */ "1|20|5|-|c3x18|......../......../......../......../......../......../....3.../..3303..",
  /* 4 */ "1|20|5|-|c2x16,c0x12|......../......../......../......../......../......../...22.../...212..",
  /* 5 */ "1|22|5|N|c4x16,c0x14|......../......../......../......../......../...4..../...4..../.4414...",
  /* 6 */ "1|22|5|-|c1x24|......../......../......../......../......../......../...1..../.11211..",
  /* 7 */ "1|22|5|-|mud|......../......../......../......../mmmmmmmm/mmmmmmmm/......../........",
  /* 8 */ "1|20|5|-|mud|......../......../...RO.../......../......../..mmmm../..mmmm../..mmmm..",
  /* 9 */ "1|28|5|-|mud|......../......../......../......../......../......../mMmMmMmM/MMMMMMMM",
  /* 10 */ "1|32|5|Z|mud,c3x14|m......m/m......m/m......m/m......m/m......m/m......m/MMMMMMMM/MMMMMMMM",
  /* 11–120: üreteç + bot ayarı (scripts/check-puzzle-uclu.mjs --uret), donmuş. */
  /* 11 */ "1|22|5|-|crate|......../......../......../......../bbbCbBCb/bBBBbbCB/......../........",
  /* 12 */ "1|17|5|-|crate|......../......../......../......../BC....b./CB....B./bC....B./.b....bb",
  /* 13 */ "1|17|5|-|c4x33,mud|......../......../......../.mmmmmmm/mmmmm.mm/mmmmmmmm/mmmmmmmm/mmmmmmmm",
  /* 14 */ "1|19|5|-|crate|......../......../......../......../bb....bb/bb....Bb/BB....b./bB....Bb",
  /* 15 */ "1|22|5|N|c4x24|......../......../......../......../......../......../......../........",
  /* 16 */ "1|12|5|-|snow|......../......../.....sss/.ss...s./s..s..../.sss.s../.ssss.ss/.s..sss.",
  /* 17 */ "1|17|5|-|snow|......../......../s......./sss.ss.s/..s.s..s/ss.s.s../s....s.s/ss...sss",
  /* 18 */ "1|20|5|-|snow|......../......../s...ss../s.sss.ss/s.s.sss./..s.ss../..s..ss./...s...s",
  /* 19 */ "1|15|5|-|snow|......../......../.s.ssss./sss.ss.s/....s.s./......s./.ss.s.ss/....sss.",
  /* 20 */ "1|16|5|Z|c3x32,mud|mmmmmmmm/m......m/m......m/m......m/m......m/m......m/m......m/mmm.mmmm",
  /* 21 */ "1|23|5|t1|trophy|.....t../....t..t/......../......../......../......../......../........",
  /* 22 */ "1|21|5|t2|trophy|t......./t......./......../......../......../......../......../........",
  /* 23 */ "1|17|5|-|c2x44|......../......../......../......../......../......../......../........",
  /* 24 */ "1|19|5|-|c0x47|......../......../......../......../......../......../......../........",
  /* 25 */ "1|24|5|S,t3|snow,trophy|....t.../t......./..sss.../.sssss.s/s.sss.../...s.ss./...s..ss/.......s",
  /* 26 */ "1|15|5|-|net|......../n......n/n..nn.../.nn.n.../..nn..../n...nnn./...nn.../.nnn.n..",
  /* 27 */ "1|19|5|-|net|......../n...n.../n...n..n/n....nnn/.nn.n.../.n.n.n../...nn.n./.n....n.",
  /* 28 */ "1|17|5|-|c2x28,net|......../.n..nn../nnn...n./.n....../..nn..nn/nn....nn/.....nn./..n...n.",
  /* 29 */ "1|15|5|-|c0x38,net|......../....n.n./.n.n..nn/nn..nn../......n./nn...n../n.nn..../.n...nn.",
  /* 30 */ "1|18|5|S|c2x33,c3x23,crate,net|......../..n.nnnn/nbn..bn./...nnnnn/Cn....n./BbbBbBCb/bbbBBCCb/nBnnb...",
  /* 31 */ "1|27|6|-|c5x30|##....##/#......#/......../......../......../......../#......#/##....##",
  /* 32 */ "1|26|6|-|c2x16,net|......../.nn...n./......../...##.../.n.##..n/......../.n.n..nn/.n.n..n.",
  /* 33 */ "1|23|6|-|c1x20,snow|##....##/#......#/s.ss..ss/s.ss.s../..s..s.s/...sssss/#s.....#/##....##",
  /* 34 */ "1|18|5|-|trophy|#t.....#/..t...t./......../......../......../......../......../#......#",
  /* 35 */ "1|12|5|N|c0x12,mud|.......m/m......./m......m/......../.......m/m......m/......../m.mm...m",
  /* 36 */ "1|28|5|-|turf|gg.g...g/ggg..gg./.*g....g/..g.g..g/g.g...gg/.g.g.*gg/g.gggggg/.g*...g.",
  /* 37 */ "1|18|5|-|turf|......../....ggg./.gggg.g./.*gggg../..g.ggg./.gg*gg*./...g..g./.ggg.g..",
  /* 38 */ "1|20|5|-|snow|##....##/##....##/.ss..ss./s.s..s../ssssss.s/s..s..../##s.ss##/##.sss##",
  /* 39 */ "1|18|5|-|snow|##....##/##....##/.sss.s../.ss....s/..ssss../s.ss..s./##.sss##/##..s.##",
  /* 40 */ "1|24|5|Z|c2x23,c4x16,crate,net|......../#n..nnn#/#..nn.n#/.b..nn../Bbb...BB/#bn...B#/#Bnn.bb#/BC...nbB",
  /* 41 */ "1|12|5|-|cone|......../......../....kk.k/...K..k./....kK.K/.kKK..K./.K.k..../........",
  /* 42 */ "1|12|5|-|cone|......../......../..Kkkkk./.k..kkK./......../kk.....k/.k.k..../........",
  /* 43 */ "1|23|5|-|turf|..g..g../gnggnggg/gggnnggg/gggggggg/g..gggg./gg.ggg.*/.gggngn*/gggggn.g",
  /* 44 */ "1|22|5|-|c4x38,cone|......../......../...Kk.../##k...##/##KkKK##/K.....kk/..k.kk.k/........",
  /* 45 */ "1|19|5|S|c2x30,mud,snow|###..###/##....##/#ssssss#/ssssssss/mssssmss/mmmmmmmm/mmmmmmmm/mmmmmmmm",
  /* 46 */ "1|24|6|-|c4x21,net|......../nn....n./.....nnn/..n...../.n.n.n../......../.nn.n..n/........",
  /* 47 */ "1|13|6|-|snow|......../......../.s.s.s.s/s...s.s./.s.sss.s/.ss..s../.s...ss./ss..ss..",
  /* 48 */ "1|32|5|-|turf|..gggg**/g.g.ggg./gg.gggg./ggg...../.g...g../gg.ggggg/gggg.ggg/g.gggg..",
  /* 49 */ "1|31|5|-|mud|......../......../#.mmmm.#/##mMmm##/##mmmm##/#Mmmmm.#/m.MMmmmm/mmmmmmmM",
  /* 50 */ "1|27|5|S|snow,net|##....##/#..nnn.#/nnssnssn/snsnsssn/s.snn.ns/ssnsnsss/#nnsnss#/##n.ns##",
  /* 51 */ "1|14|5|t2|trophy|.....tt./..t...../......../......../......../......../......../........",
  /* 52 */ "1|22|5|t2|c2x25,trophy|..t...t./......../......../......../......../......../......../........",
  /* 53 */ "1|20|5|-|c2x46|......../n......./nn....../......../......../......../..nn..../........",
  /* 54 */ "1|18|5|t1|c4x27,trophy|...t.t.t/#..n...#/#......#/.....n../n......./#.....n#/#.....n#/........",
  /* 55 */ "1|13|5|N|c3x16,crate|......../......../......../..BC.b../..B.B.../..BBB.../...b..../........",
  /* 56 */ "1|21|6|-|snow|......../......../ssss.ss./s..s..s./..sss.ss/...ss.s./ss..s.../s.s.....",
  /* 57 */ "1|12|5|-|cone|......../#......#/#K..KKk#/.....K.k/.kk.K..k/#....kK#/#..KK..#/........",
  /* 58 */ "1|31|6|-|c2x25|##....##/##..n.##/......../......../......../......n./##n...##/##....##",
  /* 59 */ "1|40|6|-|turf|*.g...g./....n.g./#......#/##..g.##/##.gg*##/#.g..*.#/...g.g.g/..n...ng",
  /* 60 */ "1|32|6|Z|turf|.....g../g.gg.g*./......g./..g..g.g/*g....../#...g..#/##..g.##/###..###",
  /* 61 */ "1|19|6|-|c1x20,net|......../nn...n.n/.n....../.....n.n/..n.nn../......n./..n..nnn/........",
  /* 62 */ "1|27|6|-|c2x21,mud|......../......../m.m.m.m./.m.m.m.m/m.m.mmm./.mmm.m.m/mmm.m.m./.m.m.M.m",
  /* 63 */ "1|24|6|-|mud|##....##/#......#/m.m.M.m./.M.mMmmm/m.m.m.m./mmmM.m.m/#mm.mmm#/##mm.m##",
  /* 64 */ "1|34|6|-|c1x35|##....##/##....##/nn....../.......n/......n./...n..../##....##/##....##",
  /* 65 */ "1|15|5|N|cone|......../......../..Kk..../......../.k....../.......k/K..Kk.../........",
  /* 66 */ "1|19|5|-|c1x36|......../......../......../......../......../......../......../........",
  /* 67 */ "1|14|5|-|net|......../nn.nnnn./.n.nn.n./.n....../.....n../.nn....n/..n.n.n./....n.n.",
  /* 68 */ "1|23|5|t2|c4x25,trophy|..t...../#t..t..#/#......#/......../......../#......#/#......#/........",
  /* 69 */ "1|18|5|-|mud,net|##mmmm##/##nnnn##/mnnnnnnm/mmnMmnMM/mMnnMMmm/mmnnnmMm/##mmmm##/##mMmm##",
  /* 70 */ "1|30|5|Z|c2x44,c1x31,snow|......../...n..../.s...sns/.s.##.s./...##..s/nssn.sss/n.ss..../ss..sss.",
  /* 71 */ "1|24|5|-|c4x38,c2x27,cone|#......#/nn...nnn/Kk.K...K/......K./.kk.K..K/n...kk../.K.K...k/#.n....#",
  /* 72 */ "1|30|5|-|turf|##*g..##/#gg.gg.#/g.g.gg.g/g.gg..gg/..g.g.gg/ggg.g..g/#ggggg.#/##*g.g##",
  /* 73 */ "1|21|5|-|c1x41|......../......../......../......../......../......../......../........",
  /* 74 */ "1|13|5|-|c0x38,net|......../n...nn../....nnn./..nn.n../.n..nn../...n.n../n.nn..../.nn.n...",
  /* 75 */ "1|25|5|S|turf,net|gggggggg/nn*ggg*g/ggnggggn/nngggggg/gngg*ggg/#gggggg#/##gngg##/###gg###",
  /* 76 */ "1|22|6|-|c0x31|......../......../......../......../......../......../......../........",
  /* 77 */ "1|27|5|-|c2x46,snow|......../.....nn./s..s..ss/.sss.n.s/.s.s..s./n.n.s.../..ssss.s/.ss...s.",
  /* 78 */ "1|20|5|-|c4x64|#......#/......../......../......../......../......../......../#......#",
  /* 79 */ "1|28|5|-|c1x24,turf|##g*g.##/##.gg.##/g.gggg../.g.g.gg./ggggg.g./g...ggg./##g.*.##/##ggg.##",
  /* 80 */ "1|25|5|S|c3x56,c0x39,mud|#mmMMmm#/m......m/m......m/m......m/m..m.mmm/Mm.....m/m.m.m..m/#mmmmmm#",
  /* 81 */ "1|15|5|-|net|......../.nn.n.n./nn.n.nn./..nn..../.nn.nn../.....n../..n....n/n...n...",
  /* 82 */ "1|23|5|-|net|......../..n....n/.n.n.n.n/.n..n.n./n...n..n/#nn.n..#/##.nnn##/###.n###",
  /* 83 */ "1|20|5|-|c1x32,cone|......../......../k..KkK../..K.k.../.....kkK/...K.k.k/..K...../........",
  /* 84 */ "1|20|5|-|mud|mmmmMMmm/#......#/#......#/m.m.m..m/m....m.m/#mm.m.m#/#m..mm.#/mMmmmmmm",
  /* 85 */ "1|22|6|N|turf|......../#......#/#......#/....ngg./gngg*g../#.....g#/#.gg.*n#/g.g..g..",
  /* 86 */ "1|31|5|-|c1x37,cone,snow|......../......../kKs.sks./kskkKsKs/KsskKsss/...kssss/sks..K.s/s.s.s.s.",
  /* 87 */ "1|24|5|-|c2x33,net|......../....nnn./.nn...../n.....n./n...nn../.n..n..n/nnnn...n/.......n",
  /* 88 */ "1|20|5|-|c1x32,cone|......../......../.kK...k./...##.../.k.##k../.kKk..k./.Kkkk..k/........",
  /* 89 */ "1|22|5|-|c3x27,crate|......../......../#...b..#/##....##/##...b##/#b.b.b.#/b.B.b.C./CbCB.B.b",
  /* 90 */ "1|26|5|Z,t2|turf,trophy|###.t###/##nttg##/#.ggggg#/ngg*.gg./n.ggggnn/.ggg.g*./..g.gg../.g.ggg..",
  /* 91 */ "1|28|6|-|c2x20,snow|......../......../.s...s../.s....../sss.sss./s.s....s/.ss.s.../...ss..s",
  /* 92 */ "1|35|5|-|c1x30,turf,net|......../nngggngn/ngg.n.g./ng.gngg./.g...gg./nggggggn/nn*gng.n/.ng*gggn",
  /* 93 */ "1|22|5|-|c0x46,net|......../....n.../..nn..n./n......./.nnn..../...n.n../.n.nnn../nn.n..n.",
  /* 94 */ "1|22|5|t2|trophy|.....t../......tt/......../......../......../......../......../........",
  /* 95 */ "1|21|5|S,t2|c0x24,net,trophy|#...t.t#/#tn....#/....n.n./....nnn./.nnnn..n/......nn/#..nnn.#/#...n..#",
  /* 96 */ "1|22|5|-|c2x30,cone|......../#......#/#kk.KK.#/.K.k..../.kkk...K/#......#/#..k.k.#/........",
  /* 97 */ "1|20|5|-|turf|......../.gggggg./...gg.g./.ggg..../.*.*..g./.gg.gg../...gggg./..g...g.",
  /* 98 */ "1|23|5|t3|c4x32,trophy|......t./.......t/......../......../......../......../......../........",
  /* 99 */ "1|32|5|-|c0x14,crate,net|......../.....n../...n..../..n##b../..b##B../n.B.B..n/..CBBC../nn...n..",
  /* 100 */ "1|24|5|S|c3x57,mud|##....##/##....##/......../mmmmmmmm/mmmmmmmm/mmmmmmmm/##mmmm##/##mmmm##",
  /* 101 */ "1|30|5|-|c0x38,mud,snow|......../mnmmmnmm/smmmsMms/smmmmmMm/sssmmmms/mssmmmms/mmsmsssm/smmmmmmm",
  /* 102 */ "1|19|5|-|c4x24,crate|......../......../......../..bBCb../..CbBb../..bBbb../..bb.b../........",
  /* 103 */ "1|14|5|-|crate|......../......../.b.b..../.....b../bbB.B.Bb/bb...Bbb/bb....bb/Bb....bB",
  /* 104 */ "1|21|5|-|c3x53|......../......../......../......../......../......../......../........",
  /* 105 */ "1|15|5|N|c0x26|......../......../......../......../......../......../......../........",
  /* 106 */ "1|24|5|-|c1x64|......../......../......../......../......../......../......../........",
  /* 107 */ "1|35|5|-|mud,snow|MmmMmmmM/M......m/m.s.s..m/ssss.s.m/m..ssssM/ms.s.ssM/s...sssm/mMmmmmmm",
  /* 108 */ "1|32|5|-|crate|##....##/##....##/b..b..../.C..b.../...BbB../.b.b.BbC/##B.b.##/##.bCb##",
  /* 109 */ "1|22|5|t3|c1x26,c2x18,trophy|...t..../t......./......../......../......../......../......../........",
  /* 110 */ "1|24|5|Z|c3x54,mud,snow|##....##/##nnnn##/ssssssss/mmmsMsss/mMsMmmsm/MmMMmmmm/##MMmM##/##MmMm##",
  /* 111 */ "1|22|5|-|mud|#......#/#......#/m.m.m.m./mm.mMmmM/mmmmmmmM/mmMMmMmm/#mmMmmm#/#m.mmmM#",
  /* 112 */ "1|22|6|-|turf|......../......../......../.gggggg./.ggggg.g/g...gg*./.g.g..gg/..*gg.gg",
  /* 113 */ "1|24|5|-|c2x28,crate,net|......../n.nn..../nnnn.n.n/.....n.n/Cb.nnnbb/bb.n..Bb/bB...nBC/Cbn...bB",
  /* 114 */ "1|28|6|-|net|......../..n....n/.n...n../nn.n.nnn/...n..nn/.n.n..../n...nn../..n....n",
  /* 115 */ "1|24|5|N|c2x19,turf|......../.....n../..n...../n...g..g/.g..g..g/...g.g*g/.g.gggg./gg...*..",
  /* 116 */ "1|12|5|-|turf,snow|*g.gggg./gggg*ggg/gggggsgg/ggggsggg/gggggggg/#ggsgsg#/##ssgg##/###gg###",
  /* 117 */ "1|22|5|t2|cone,trophy|.t.t..../.t....../......k./.k..kKk./...K...k/..K...K./.kk....K/........",
  /* 118 */ "1|17|5|-|turf|......../.gg*gg*./.gggggg./.gggggg./.gggggg./.gggggg./.gggggg./.gggggg.",
  /* 119 */ "1|32|6|-|c2x18,snow|......../.nn....n/s.sss..s/.s.s.s../s.....ss/.....s../.ssss.../sns..s.s",
  /* 120 */ "1|18|5|Z|c4x38,cone,mud|##....##/#......#/K....K.K/mKmkmkKm/kmmkKmkm/KkmmmMmM/#mkmmmm#/##Mmmm##",
];

/* ───────────────────────────── ayrıştırıcı ───────────────────────────── */

const OBSTACLE: Record<Exclude<UcluGoalType, "color" | "trophy">, string> = {
  mud: "mM",
  crate: "bBC",
  snow: "s",
  net: "n",
  turf: "g",
  cone: "kK",
};

const countIn = (layout: string[], set: string) => layout.reduce((n, row) => n + [...row].filter((ch) => set.includes(ch)).length, 0);

/** Tek satırı seviyeye çevirir. Bozuk satırda hata fırlatır (denetim yakalar). */
export function parseUcluLevel(n: number, line: string, fixed = true): UcluLevel {
  const parts = line.split("|");
  const version = Number(parts[0]);
  if (version !== 1 || parts.length !== 6) throw new Error(`Elit Üçlü seviye ${n}: bilinmeyen biçim "${parts[0]}"`);
  const [, movesS, colorsS, flagsS, goalsS, rowsS] = parts;
  const flags = flagsS === "-" ? [] : flagsS.split(",").map((f) => f.trim()).filter(Boolean);
  const flag = (p: string) => flags.find((f) => f[0] === p);
  const layout = rowsS.split("/").map((r) => r.replace(/\s+/g, ""));
  const trophySpawn = Number(flag("t")?.slice(1) ?? 0) || 0;
  const goals: UcluGoalDef[] = goalsS.split(",").map((tok) => {
    const t = tok.trim();
    const cm = /^c(\d)x(\d+)$/.exec(t);
    if (cm) return { type: "color", color: Number(cm[1]), count: Number(cm[2]) };
    const [name, explicit] = t.split(":");
    if (name === "trophy") return { type: "trophy", count: explicit ? Number(explicit) : countIn(layout, "t") + trophySpawn };
    if (name in OBSTACLE) {
      const type = name as keyof typeof OBSTACLE;
      return { type, count: explicit ? Number(explicit) : countIn(layout, OBSTACLE[type]) };
    }
    throw new Error(`Elit Üçlü seviye ${n}: bilinmeyen hedef "${t}"`);
  });
  const hardness: UcluHardness = flags.includes("S") ? "super" : flags.includes("Z") ? "zor" : "normal";
  const seedFlag = flag("s");
  return {
    level: n,
    seed: seedFlag ? Number(seedFlag.slice(1)) >>> 0 : ucluSeed(n),
    moves: Number(movesS),
    colors: Number(colorsS),
    layout,
    goals,
    tip: UCLU_TIPS[n] ?? null,
    cup: hardness !== "normal",
    hardness,
    breather: flags.includes("N"),
    trophySpawn,
    fixed,
  };
}

/* ───────────────────────────── üreteç ───────────────────────────── */

type Grid = string[][];

const blank = (): Grid => Array.from({ length: UCLU_H }, () => Array.from({ length: UCLU_W }, () => "."));
const toRows = (g: Grid): string[] => g.map((row) => row.join(""));

/** Şekilli tahta kalıpları (yalnız '#' ve '.'). Simetrik, her hücre 3'lü dizilebilir. */
const MASKS: string[][] = [
  ["##....##", "#......#", "........", "........", "........", "........", "#......#", "##....##"],
  ["........", "........", "#......#", "##....##", "##....##", "#......#", "........", "........"],
  ["##....##", "##....##", "........", "........", "........", "........", "##....##", "##....##"],
  ["........", "........", "........", "...##...", "...##...", "........", "........", "........"],
  ["#......#", "........", "........", "........", "........", "........", "........", "#......#"],
  ["........", "#......#", "#......#", "........", "........", "#......#", "#......#", "........"],
  ["###..###", "##....##", "#......#", "........", "........", "........", "........", "........"],
  ["........", "........", "........", "........", "........", "#......#", "##....##", "###..###"],
  ["........", "........", "........", "##....##", "##....##", "........", "........", "........"],
  ["#......#", "#......#", "........", "........", "........", "........", "#......#", "#......#"],
];

const isHole = (g: Grid, r: number, c: number) => g[r][c] === "#";

function cellsWhere(g: Grid, pred: (r: number, c: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < UCLU_H; r++) for (let c = 0; c < UCLU_W; c++) if (!isHole(g, r, c) && g[r][c] === "." && pred(r, c)) out.push([r, c]);
  return out;
}

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function placeMud(g: Grid, rng: () => number, amount: number, layers2: number): number {
  const kind = Math.floor(rng() * 5);
  let pool: [number, number][];
  if (kind === 0) pool = cellsWhere(g, (r) => r >= UCLU_H - 3);
  else if (kind === 1) pool = cellsWhere(g, (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5);
  else if (kind === 2) pool = cellsWhere(g, (r, c) => (r + c) % 2 === 0 && r >= 2);
  else if (kind === 3) pool = cellsWhere(g, (r, c) => r === 0 || r === UCLU_H - 1 || c === 0 || c === UCLU_W - 1);
  else pool = cellsWhere(g, (r) => r >= 1);
  if (pool.length < amount) {
    const more = cellsWhere(g, (r) => r >= 3).filter(([r, c]) => !pool.some(([a, b]) => a === r && b === c));
    pool = pool.concat(pickN(rng, more, amount - pool.length));
  }
  const chosen = pickN(rng, pool, amount);
  chosen.forEach(([r, c], i) => {
    g[r][c] = i < layers2 ? "M" : "m";
  });
  return chosen.length;
}

function placeCrates(g: Grid, rng: () => number, amount: number, d: number): number {
  const kind = Math.floor(rng() * 4);
  let pool: [number, number][];
  if (kind === 0) {
    const row = 3 + Math.floor(rng() * 3);
    pool = cellsWhere(g, (r) => r === row || r === row + 1);
  } else if (kind === 1) pool = cellsWhere(g, (r, c) => r >= 4 && (c <= 1 || c >= UCLU_W - 2));
  else if (kind === 2) pool = cellsWhere(g, (r, c) => r >= 3 && r <= 6 && c >= 2 && c <= 5);
  else pool = cellsWhere(g, (r, c) => r >= 5 && (c + r) % 2 === 0);
  if (pool.length < amount) {
    const more = cellsWhere(g, (r) => r >= 2).filter(([r, c]) => !pool.some(([a, b]) => a === r && b === c));
    pool = pool.concat(pickN(rng, more, amount - pool.length));
  }
  const chosen = pickN(rng, pool, amount);
  for (const [r, c] of chosen) {
    const x = rng();
    const hp = x < 0.3 + d * 0.4 ? (x < 0.05 + d * 0.25 ? 3 : 2) : 1;
    g[r][c] = hp === 3 ? "C" : hp === 2 ? "B" : "b";
  }
  return chosen.length;
}

function placeScatter(g: Grid, rng: () => number, ch: string, amount: number, minRow: number): number {
  const chosen = pickN(rng, cellsWhere(g, (r) => r >= minRow), amount);
  for (const [r, c] of chosen) g[r][c] = ch;
  return chosen.length;
}

function placeTrophies(g: Grid, rng: () => number, amount: number): number {
  const chosen = pickN(rng, cellsWhere(g, (r) => r <= 1), amount);
  for (const [r, c] of chosen) g[r][c] = "t";
  return chosen.length;
}

/** Çim: bir bölge çıplak toprak, içinde birkaç çimli tohum. */
function placeTurf(g: Grid, rng: () => number, d: number, load: number): number {
  const kind = Math.floor(rng() * 3);
  const region =
    kind === 0 ? cellsWhere(g, (r) => r >= 3) : kind === 1 ? cellsWhere(g, (r, c) => c >= 1 && c <= 6 && r >= 1) : cellsWhere(g, () => true);
  const size = Math.round(clamp(region.length * (0.45 + d * 0.4) * load, 14, 44));
  const chosen = pickN(rng, region, size);
  for (const [r, c] of chosen) g[r][c] = "g";
  const seeds = pickN(rng, chosen, Math.max(1, Math.round(3 - d * 2)));
  for (const [r, c] of seeds) g[r][c] = "*";
  return chosen.length - seeds.length;
}

function placeCones(g: Grid, rng: () => number, amount: number, d: number): number {
  const chosen = pickN(rng, cellsWhere(g, (r) => r >= 2 && r <= 6), amount);
  for (const [r, c] of chosen) g[r][c] = rng() < 0.2 + d * 0.5 ? "K" : "k";
  return chosen.length;
}

/** Hedeflerin "iş yükü"nden kaba hamle tahmini (botla ayar yapılmamış seviyeler için). */
function estimateMoves(goals: UcluGoalDef[], colors: number, d: number, layout: string[], hard: UcluHardness): number {
  const count = (set: string) => countIn(layout, set);
  const parts: number[] = [];
  for (const g of goals) {
    if (g.type === "color") parts.push(g.count / 3.2);
    else if (g.type === "mud") parts.push((g.count + count("M")) / 1.6);
    else if (g.type === "crate") parts.push((count("b") + count("B") * 2 + count("C") * 3) / 1.4);
    else if (g.type === "snow" || g.type === "net") parts.push(g.count / 1.0);
    else if (g.type === "turf") parts.push(g.count / 2.2);
    else if (g.type === "cone") parts.push((count("k") + count("K") * 2) / 1.3);
    else if (g.type === "trophy") parts.push(g.count * 5);
  }
  parts.sort((a, b) => b - a);
  let work = parts.reduce((sum, p, i) => sum + p * (i === 0 ? 1 : 0.55), 0);
  if (colors >= 6) work *= 1.6;
  const slack = hard === "super" ? 1.05 : hard === "zor" ? 1.2 : 1.6 - 0.4 * d;
  return Math.round(clamp(work * slack + 4, 14, 45));
}

/** 0..1 — dalgalı artış; zor seviyeler belirgin zor, nefes seviyeleri hafif. */
export function ucluDifficulty(n: number): number {
  if (n <= 10) return 0.05 + n * 0.02;
  const base = 0.22 + 0.55 * Math.pow(Math.min(n, 400) / 400, 0.65);
  const wave = 0.1 * Math.sin(n * 0.83) + 0.05 * Math.sin(n * 0.29);
  const cup = n % 10 === 0 ? 0.18 : 0;
  const rest = n % 5 === 0 && n % 10 !== 0 ? -0.2 : 0;
  return clamp(base + wave + cup + rest, 0.05, 1);
}

/** Süper zor seviyeler (üreteç için): her 25'te bir ve bazı kupa maçları. */
export const ucluIsSuper = (n: number) => n > 20 && (n % 25 === 0 || n % 50 === 30 || n % 50 === 45);
const hardnessOf = (n: number): UcluHardness => (ucluIsSuper(n) ? "super" : n % 10 === 0 ? "zor" : "normal");

type Mech = "color" | "mud" | "crate" | "snow" | "trophy" | "net" | "turf" | "cone";

/**
 * Üretilmiş seviye satırı (biçim 1). Tablo bitince ve yeni satır adayı
 * üretirken kullanılır. `moves` verilirse tahmin yerine o yazılır; `boost` iş
 * yükünü (engel ve hedef miktarı) ölçekler — denetim betiği botla ayar yaparken
 * kullanır (tablodaki satır, ayarlanmış sonucun donmuş hâlidir).
 */
export function ucluGenerate(n: number, moves?: number, boost = 1): string {
  const rng = ucluRandom(ucluSeed(n));
  const d = ucluDifficulty(n);
  const hard = hardnessOf(n);
  const breather = n % 5 === 0 && n % 10 !== 0 && hard === "normal";
  const load = (hard === "super" ? 1.15 : breather ? 0.7 : 1) * boost;
  const g = blank();

  if (n >= 31 && (n === 31 || hard !== "normal" || rng() < 0.45)) {
    const mask = n === 31 ? MASKS[0] : MASKS[Math.floor(rng() * MASKS.length)];
    mask.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "#") g[r][c] = "#"; }));
  }

  const avail: Mech[] = ["color", "mud"];
  if (n >= 11) avail.push("crate");
  if (n >= 16) avail.push("snow");
  if (n >= 21) avail.push("trophy");
  if (n >= 26) avail.push("net");
  if (n >= 36) avail.push("turf");
  if (n >= 41) avail.push("cone");

  const intro: Record<number, Mech> = {
    11: "crate", 12: "crate", 16: "snow", 17: "snow", 21: "trophy", 22: "trophy", 26: "net", 27: "net",
    31: "color", 36: "turf", 37: "turf", 41: "cone", 42: "cone",
  };
  const main: Mech = intro[n] ?? avail[Math.floor(rng() * avail.length)];
  const mechs = new Set<Mech>([main]);
  const extra = hard !== "normal" ? 1 + (d > 0.6 ? 1 : 0) : d > 0.45 && rng() < 0.55 ? 1 : 0;
  for (let i = 0; i < extra && !(n in intro); i++) {
    const m = avail[Math.floor(rng() * avail.length)];
    if (!(m === "turf" && mechs.has("mud")) && !(m === "mud" && mechs.has("turf"))) mechs.add(m);
  }

  const heavy = mechs.has("crate") || mechs.has("trophy") || mechs.has("cone") || mechs.size > 1;
  const colors = n === 31 || (n > 31 && !heavy && rng() < clamp(0.3 + (n - 31) / 500, 0.3, 0.55)) ? 6 : 5;

  const goals: string[] = [];
  const free = () => cellsWhere(g, () => true).length;

  if (mechs.has("turf")) {
    if (placeTurf(g, rng, d, load) > 0) goals.push("turf");
  }
  if (mechs.has("crate")) {
    const amount = Math.round(clamp((9 + d * 11 + rng() * 4) * load, 8, 22));
    if (placeCrates(g, rng, amount, d) > 0) goals.push("crate");
  }
  if (mechs.has("cone")) {
    const amount = Math.round(clamp((6 + d * 7 + rng() * 3) * load, 5, 14));
    if (placeCones(g, rng, amount, d) > 0) goals.push("cone");
  }
  if (mechs.has("mud")) {
    const amount = Math.round(clamp((14 + d * 18 + rng() * 6) * load, 10, Math.min(38, free() - 14)));
    const layers2 = Math.round(amount * clamp(d - 0.2, 0, 0.6) * rng());
    if (placeMud(g, rng, amount, layers2) > 0) goals.push("mud");
  }
  if (mechs.has("snow")) {
    const amount = Math.round(clamp((12 + d * 12 + rng() * 4) * load, 8, 22));
    if (placeScatter(g, rng, "s", amount, 2) > 0) goals.push("snow");
  }
  if (mechs.has("net")) {
    const amount = Math.round(clamp((10 + d * 10 + rng() * 3) * load, 8, 20));
    if (placeScatter(g, rng, "n", amount, 1) > 0) goals.push("net");
  } else if (n >= 26 && rng() < 0.3) {
    // Kale ağı hedef olmadan da ek engel olarak serpilir.
    placeScatter(g, rng, "n", Math.round(clamp((3 + d * 4) * load, 3, 7)), 1);
  }
  let trophySpawn = 0;
  if (mechs.has("trophy")) {
    const total = Math.round(clamp((2.5 + d * 2.5 + rng() * 1.2) * load, 2, 5));
    const onBoard = Math.min(total, 2 + (rng() < 0.4 ? 1 : 0));
    const placed = placeTrophies(g, rng, onBoard);
    trophySpawn = total - placed;
    goals.push("trophy");
  }
  const side = goals.length > 0 && !(n in intro) && rng() < 0.35 + d * 0.4;
  if (mechs.has("color") || goals.length === 0 || side) {
    const scale = (colors === 6 ? 0.75 : 1) * (mechs.has("color") || goals.length === 0 ? 1 : 0.6);
    const count = Math.round(clamp((26 + d * 32 + rng() * 8) * load, 16, 64) * scale);
    const c1 = Math.floor(rng() * colors);
    goals.unshift(`c${c1}x${count}`);
    if (d > 0.5 && rng() < 0.5) {
      const c2 = (c1 + 1 + Math.floor(rng() * (colors - 1))) % colors;
      goals.splice(1, 0, `c${c2}x${Math.round(count * 0.7)}`);
    }
  }

  const layout = toRows(g);
  const flags = [hard === "super" ? "S" : hard === "zor" ? "Z" : "", breather ? "N" : "", trophySpawn ? `t${trophySpawn}` : ""].filter(Boolean);
  const head = `1|0|${colors}|${flags.length ? flags.join(",") : "-"}|${goals.join(",")}|${layout.join("/")}`;
  const parsed = parseUcluLevel(n, head, false);
  const m = moves ?? estimateMoves(parsed.goals, colors, d, layout, hard);
  return head.replace(/^1\|0\|/, `1|${m}|`);
}

/* ───────────────────────────── dışa açık API ───────────────────────────── */

/** Tablodaki seviye sayısı (elle ayarlı + donmuş). */
export const UCLU_LEVEL_COUNT = UCLU_LEVELS.length;

const cache = new Map<number, UcluLevel>();

/** Seviye tanımı — aynı `level` her cihazda aynı sonucu verir. */
export function ucluLevel(level: number): UcluLevel {
  const n = clamp(Math.floor(level) || 1, 1, UCLU_MAX_LEVEL);
  const hit = cache.get(n);
  if (hit) return hit;
  const out = n <= UCLU_LEVELS.length ? parseUcluLevel(n, UCLU_LEVELS[n - 1], true) : parseUcluLevel(n, ucluGenerate(n), false);
  cache.set(n, out);
  return out;
}
