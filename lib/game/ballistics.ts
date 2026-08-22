/**
 * TOP FİZİĞİ — saf fonksiyonlar, React'tan ve çizimden bağımsız.
 *
 * NEDEN AYRI DOSYA: fizik ekran bileşeninin içindeyken doğrulanamıyordu.
 * Buradaki iki fonksiyon durum nesnesini yerinde günceller ve hiçbir şeye
 * bağlı değildir; `scripts/check-games.mjs` bunları başsız çalıştırıp
 * şu iddiaları ÖLÇER:
 *
 *   · Topun soluna vurmak topu sağa gönderir (ve tersi).
 *   · Dönen top havada eğri çizer (Magnus) ve eğrinin yönü dönüşün yönüdür.
 *   · Aynı girdi, farklı kare hızlarında AYNI yörüngeyi verir.
 *
 * Üçü de briefin "bitti sayılma kriterleri" listesindeki maddelerdir; gözle
 * bakarak değil sayıyla doğrulanırlar.
 */

import { clamp } from "./math";
import { TUNING } from "./tuning";

const T = TUNING.sektir;

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Dönüş. İşareti kavisin yönünü belirler. */
  spin: number;
}

/**
 * Fiziği bir sabit adım ilerletir. `dt` DAİMA çağıranın sabit adımıdır.
 *
 * Sıra önemlidir: önce yerçekimi (dikey hız güncellenir), sonra Magnus (yeni
 * dikey hızla yatay ivme üretilir), sonra sürtünme, en sonra konum. Magnus'u
 * yerçekiminden önce uygulamak, topun yükseliş ve düşüş kavislerini bir kare
 * geciktirir ve tepe noktasında görünür bir kırılma bırakır.
 */
export function stepBall(ball: BallState, dt: number): void {
  ball.vy += T.gravity * dt;

  // MAGNUS: dönüş × dikey hız = yatay ivme. Top yükselirken bir yana,
  // düşerken diğer yana kıvrılır — gerçek bir kavis böyle görünür.
  ball.vx += ball.spin * ball.vy * T.magnus * dt;

  const drag = T.drag ** (dt * 60);
  ball.vx *= drag;
  ball.vy *= drag;
  ball.spin *= T.spinDamp ** (dt * 60);

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
}

/**
 * Topa vuruş. `offset` dokunuşun top merkezine göre yatay konumudur:
 * -1 sol kenar, 0 merkez, +1 sağ kenar.
 *
 * Üç sonuç birden üretir ve üçü de aynı sayıdan gelir — oyunun tek girdisi
 * budur:
 *   vx  -= o * HIT_X            sola vurursan sağa gider
 *   vy   = -LIFT * (1 - .35|o|) kenardan vurursan az yükselir
 *   spin = o * SPIN_K           temas noktası dönüş üretir
 */
export function applyHit(ball: BallState, offset: number): void {
  const o = clamp(offset, -1, 1);
  ball.vx -= o * T.hitX;
  ball.vy = -T.lift * (1 - 0.35 * Math.abs(o));
  ball.spin = o * T.spinK;
}

/** Vuruşun "tam isabet" olup olmadığı — combo bundan büyür. */
export const isSweetSpot = (offset: number): boolean => Math.abs(offset) < T.sweetSpot;
