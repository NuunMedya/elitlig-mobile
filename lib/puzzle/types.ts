/**
 * LİG YOLU — seviyeli bulmaca oyunlarının ortak sözleşmesi.
 *
 * Her oyun (components/puzzle/games/<anahtar>/) bir `PuzzleGameModule` dışa
 * aktarır. Çerçeve (app/lig-yolu/*) seviye haritasını, can / jeton /
 * güçlendirici cüzdanını, seviye başlangıç ve sonuç pencerelerini, sunucu
 * eşitlemesini (/api/puzzle) yönetir; oyun YALNIZ tahtayı çizer ve sonucu
 * bildirir.
 *
 * KURALLAR
 *   · Seviye üretimi BELİRLENİMCİDİR: aynı `level` her cihazda aynı tahtayı
 *     üretir (tohumlu rastgele: `seededRandom(level * K + oyunTuzu)`).
 *   · Zorluk eğrisi: 1–10 öğretici ve kolay; sonra dalgalı artar (her 10.
 *     seviye "kupa maçı": belirgin zor, ödülü büyük); 5'in katlarında kısa
 *     "nefes" seviyeleri. Yeni mekanik/engel belirli seviyelerde tanıtılır ve
 *     tanıtıldığı seviyede kısa bir ipucu balonu gösterilir.
 *   · Yıldız: kalan hamle/süre/hata payına göre 1–3 (oyun kendisi hesaplar).
 *   · Güçlendirici kullanımı `useBooster(key)` ile istenir; çerçeve stoğu
 *     kontrol eder, true dönerse oyun etkisini uygular. Seviye öncesi seçilen
 *     güçlendiriciler `preBoosters` ile gelir (stoktan çerçeve düşer).
 *   · Oyun `maxWidth` × `maxHeight` alanını TAM doldurur (tam ekran): tahta
 *     alana göre büyür, boş kalan alt bölge bırakılmaz. Telefon dikey kullanımı esas.
 */

export type PuzzleGameKey = "uclu" | "ucle" | "soyunma" | "kantin" | "kariyer";

export interface PuzzleResult {
  won: boolean;
  /** Kazanınca 1–3; kaybedince 0. */
  stars: 0 | 1 | 2 | 3;
  /** İsteğe bağlı skor / açıklama (sonuç penceresinde gösterilir). */
  score?: number;
  summary?: string;
}

export interface PuzzleBoosterDef {
  key: string;
  title: string;
  description: string;
  icon: string; // Ionicons adı
  /** "pre": seviye başlamadan seçilir; "live": oyun sırasında kullanılır. */
  kind: "pre" | "live";
}

export interface PuzzleGoalSummary {
  /** "28 hamle", "2:00", "6 sipariş" gibi kısıt metni. */
  limit: string;
  /** Hedef satırları — başlangıç penceresinde ikonla çizilir. */
  goals: { icon: string; label: string; count?: number }[];
  /** Kupa maçı (her 10. seviye) gibi rozet. */
  badge?: string | null;
  /** Bu seviyede tanıtılan yeni mekanik (ilk görüldüğü seviye). */
  tip?: string | null;
}

export interface PuzzleGameProps {
  level: number;
  /** Ekran genişliğinden kenar boşlukları düşülmüş kullanılabilir genişlik. */
  maxWidth: number;
  /**
   * Oyun alanının kullanılabilir yüksekliği (üst şerit ve alt güvenli alan
   * düşülmüş). Oyun bu yüksekliği DOLDURMALIDIR: tahta / sahne büyür, hedef
   * çubuğu üste, güçlendiriciler alta yaslanır; ekranın altı boş kalmaz.
   */
  maxHeight: number;
  /** Seviye öncesi seçilen güçlendiriciler (stoktan düşülmüş). */
  preBoosters: string[];
  /** Oyun içi güçlendirici stoğu (gösterim için). */
  boosterStock: Record<string, number>;
  /** Oyun içi güçlendirici kullan: stok yoksa false (çerçeve mağazayı önerir). */
  useBooster: (key: string) => boolean;
  /** Oyun bitti (kazanç ya da kayıp). Bir kez çağrılır. */
  onFinish: (result: PuzzleResult) => void;
  /** Duraklatıldı mı (ayarlar penceresi açıkken süreli oyunlar durur). */
  paused: boolean;
}

export interface PuzzleGameModule {
  key: PuzzleGameKey;
  title: string;
  /** Kart ve harita alt yazısı. */
  tagline: string;
  /** Ionicons adı. */
  icon: string;
  /** Tema tonu (components/ui HubTone). */
  tone: "brand" | "accent" | "live" | "warn" | "win" | "info";
  boosters: PuzzleBoosterDef[];
  goalSummary: (level: number) => PuzzleGoalSummary;
  Game: React.ComponentType<PuzzleGameProps>;
}

/** Tohumlu rastgele sayı üreteci (mulberry32) — seviyeler belirlenimci. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
