/**
 * OYUN MATEMATİĞİ — saf fonksiyonlar, hiçbir şeye bağlı değil.
 *
 * NEDEN `loop.ts`'ten AYRI: `loop.ts` React ve React Native içe aktarıyor
 * (kanca ve `AppState`). Bu dosyadaki fonksiyonlar hiçbirine ihtiyaç duymuyor
 * ve ayrı durdukları için Node'da başsız çalıştırılıp DOĞRULANABİLİYORLAR
 * (bkz. scripts/check-games.mjs). Fizik iddialarını sayıyla sınayabilmenin
 * bedeli tek bir dosya bölmesi.
 */

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/** Doğrusal ara değer — render interpolasyonu. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Bir değeri hedefe doğru, ivme/yavaşlama sınırlarıyla yaklaştırır.
 *
 * Slalom'un kontrol hissi buradan gelir: hedefe ANINDA atlamak (`vx = target`)
 * oyunu ışınlanma gibi gösteriyordu; momentum, yön değiştirmeye bir ağırlık
 * verir ve dönüşü öğrenilebilir bir beceriye çevirir. Hızlanma ile yavaşlama
 * ayrı katsayılardır: durmak, hızlanmaktan çabuk olmalı ki oyuncu kaçınmayı
 * kontrol edebilsin.
 */
export function approach(
  current: number,
  target: number,
  accel: number,
  decel: number,
  dt: number,
): number {
  const diff = target - current;
  if (diff === 0) return current;

  // Hedefe doğru mu (hızlan) yoksa sıfıra/karşı yöne mi (yavaşla)?
  const speeding = Math.sign(target) === Math.sign(current) && Math.abs(target) > Math.abs(current);
  const rate = (speeding || current === 0 ? accel : decel) * dt;

  return Math.abs(diff) <= rate ? target : current + Math.sign(diff) * rate;
}

/**
 * Kutu-Muller ile normal dağılım. Kaleci nişan hatası için: hata düzgün
 * dağılımlı olsaydı kaleci ya hep doğru ya hep saçma tahmin ederdi; normal
 * dağılım "çoğu zaman yakın, bazen çok yanlış" davranışı verir — insan
 * refleksi böyle görünür.
 */
export function gauss(mean: number, sigma: number): number {
  const u = Math.max(Number.EPSILON, Math.random());
  const v = Math.random();
  return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Bir dokunuşun tuval içindeki konumu. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Başlangıç–bitiş doğrusuna göre yolun işaretli en büyük sapması.
 *
 * Penaltıda FALSO budur. Çapraz çarpım (cross product) kullanılır: doğrunun
 * bir yanındaki noktalar pozitif, diğer yanındakiler negatif işaret verir. En
 * büyük MUTLAK sapmanın işareti alınır — böylece "S" çizen bir parmakta
 * baskın kavis kazanır.
 *
 * Sonuç doğru uzunluğuna bölünür: aynı kavis, uzun bir sürüklemede de kısa
 * bir sürüklemede de aynı falsoyu vermeli.
 */
export function curvatureOf(path: Point[]): number {
  if (path.length < 3) return 0;

  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return 0;

  let best = 0;
  for (let i = 1; i < path.length - 1; i += 1) {
    const p = path[i];
    // (b-a) × (p-a) — doğruya olan işaretli uzaklık × uzunluk
    const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
    const signed = cross / len;
    if (Math.abs(signed) > Math.abs(best)) best = signed;
  }
  return best / len;
}
