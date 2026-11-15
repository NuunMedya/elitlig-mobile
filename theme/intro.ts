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
  /** Sahnenin kenarlarına doğru koyulaşan derin mor. */
  deep: "#14062E",
  /** Merkezdeki menekşe ışık. */
  violet: "#7C3AED",
  /** Logonun hemen arkasındaki parlak çekirdek. */
  core: "#A78BFA",
  /** Işık hüzmeleri ve halkalar — açık lavanta. */
  lavender: "#C4B5FD",
  /** Işık süpürmesi beklerken logonun "sönük" tonu. */
  logoDim: "#BBA8FF",
  /** Logonun yanık hâli ve parlama çizgisi. */
  white: "#FFFFFF",
  /** Kıvılcımlar — lavanta ağırlıklı, az pembe ve camgöbeği vurgu. */
  sparks: ["#EDE9FE", "#C4B5FD", "#F0ABFC", "#A5F3FC"] as const,
  /** Alt satır metni (beyazın %72'si). */
  tagline: "rgba(237, 233, 254, 0.78)",
} as const;
