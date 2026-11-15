/**
 * Açılış sahnesi renkleri (components/IntroSplash.tsx).
 *
 * TEMADAN BAĞIMSIZDIR: açılış bir marka anıdır ve açık/koyu temada aynı
 * koyu mor sahnede oynar. Bu yüzden `Palette`e değil buraya yazılır.
 *
 * `stage` DEĞERİ app.json'daki `expo-splash-screen` arka planıyla (açık VE
 * koyu mod) BİREBİR AYNI olmak zorundadır: yerel splash kapanır kapanmaz
 * açılış sahnesinin ilk karesi aynı renkle başlar, kullanıcı geçişi görmez.
 * Birini değiştiren ötekini de değiştirmelidir.
 */
export const introColors = {
  /** Yerel splash zemini — app.json ile eş. */
  stage: "#2E1065",
  /** Vinyetin kenarı: neredeyse siyah mor. */
  deep: "#0C0420",
  /** Merkezdeki menekşe ışık. */
  violet: "#7C3AED",
  /** Logonun hemen arkasındaki parlak çekirdek. */
  core: "#A78BFA",
  /** Projektör ışığı, şok dalgası, ışık çizgisi — açık lavanta. */
  lavender: "#DDD6FE",
  /** Logo ve parlama. */
  white: "#FFFFFF",
  /** Çarpma anındaki renk sapması (kromatik kenar) kopyaları. */
  chromaCyan: "#22D3EE",
  chromaPink: "#F472B6",
  /** "Elit" vurgusu — mor sahnede altın. */
  gold: "#FCD34D",
  goldGlow: "rgba(252, 211, 77, 0.55)",
  /** Alt satırın geri kalanı. */
  tagline: "rgba(237, 233, 254, 0.92)",
} as const;
