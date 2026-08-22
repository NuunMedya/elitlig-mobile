/**
 * OYUN AYARLARI — üç oyunun bütün sabitleri tek yerde.
 *
 * NEDEN TEK DOSYA: oynanabilirlik ancak DENEYEREK bulunur ve sabitler oyun
 * dosyalarının içine dağılmışken bir değeri denemek, üç yerde arayıp bulmak
 * demekti. Burada hepsi yan yana; "top biraz ağır" hissi tek satırla düzelir.
 *
 * BİRİMLER: uzunluk piksel, süre saniye. Hız px/sn, ivme px/sn². Fizik sabit
 * 120Hz adımda işlendiği için bu değerler cihazdan bağımsızdır.
 */

export const TUNING = {
  /* ═══════════════ TOP SEKTİR ═══════════════ */
  sektir: {
    /** Yerçekimi. Briefin verdiği değer. */
    gravity: 1600,
    /** Hava sürtünmesi — her 1/60 sn'de hızın korunan payı. */
    drag: 0.999,
    /** Dik vuruşun kazandırdığı yukarı hız. */
    lift: 760,
    /** Temas ofsetinin yatay hıza katkısı. */
    hitX: 420,
    /** Temas ofsetinin ürettiği dönüş. */
    spinK: 8,
    /** Magnus katsayısı — dönen top havada eğri çizer. İVMEDİR (px/sn²). */
    magnus: 0.05,
    /** Dönüşün her adımda korunan payı (sürtünmeyle söner). */
    spinDamp: 0.985,
    /** Yan duvardan sekmede korunan hız. */
    wallBounce: 0.65,
    /** |o| bu değerin altındaysa "tam isabet": combo artar. */
    sweetSpot: 0.22,
    /**
     * Vuruş sayılan uzaklık, top yarıçapının katı olarak. Cömert olmalı:
     * hedefi ıskalamak bir beceri sınavı değil, dokunmatik ekranın hatasıdır.
     */
    hitRadius: 3,
    /** Halkalar: başlangıç yarıçapı ve her 10 dokunuşta küçülme oranı. */
    ringRadius: 62,
    ringShrink: 0.94,
    ringMinRadius: 30,
    /** Halkaların yatay süzülme hızı ve zorlukla artışı. */
    ringDrift: 26,
    ringDriftGrowth: 1.08,
    /** Aynı anda ekranda duran halka sayısı. */
    ringCount: 2,
    /** İz uzunluğu (kare). Parçacık bütçesi bunu çarpar. */
    trail: 6,
  },

  /* ═══════════════ PENALTI ═══════════════ */
  penalti: {
    /** Sürükleme uzunluğunun güce eşlendiği aralık (piksel). */
    dragMin: 40,
    dragMax: 260,
    powerMin: 0.35,
    powerMax: 1,
    /** Uçuş süresi (sn). */
    flight: 0.45,
    /** Falso katsayısı: parmağın eğriliği × bu = yatay sapma (piksel). */
    curveK: 260,
    /** Kalecinin tepki gecikmesi (sn) — zorlukla kısalır. AMA SIFIRLANMAZ. */
    keeperDelayEasy: 0.32,
    keeperDelayHard: 0.14,
    /** Kalecinin yön okuma hatası (0–1 kale genişliği cinsinden). */
    keeperSigmaEasy: 0.34,
    keeperSigmaHard: 0.13,
    /** Kalecinin erişim yarıçapı (kale genişliğinin payı). */
    keeperReach: 0.17,
    /** Koşu açısının kalecinin tahminine katkısı — %10'u GEÇMEZ. */
    keeperReadBias: 0.1,
    /** Kalecinin dalış süresi (sn) — bu süre boyunca yön DEĞİŞTİREMEZ. */
    keeperDive: 0.28,
    /** Bir seride kaç atış. */
    shots: 5,
    /** Ağ dalgasının sönümü ve yayılma hızı. */
    netDamp: 0.86,
    netSpread: 0.22,
  },

  /* ═══════════════ SLALOM ═══════════════ */
  slalom: {
    /** Kontrol eğrisinin üssü: 1 doğrusal, >1 merkezde hassas. */
    steerExp: 1.7,
    /** En yüksek yatay hız (px/sn). */
    maxLateral: 520,
    /** Yatay ivme ve yavaşlama. Yavaşlama daha hızlıdır: durmak kolay olmalı. */
    accel: 2400,
    decel: 3400,
    /** Gövdenin yatma açısı (derece), steer ile çarpılır. */
    tilt: 14,
    /** Kameranın karşı kayması (piksel), steer ile çarpılır. */
    cameraShift: 10,
    /** Taban ilerleme hızı ve mesafeyle artışı. */
    baseSpeed: 260,
    speedGrowth: 0.045,
    maxSpeed: 620,
    /** Kapı genişliği: başlangıç ve en dar. */
    gateWide: 0.62,
    gateNarrow: 0.3,
    /** Koninin bu kadar yakınından geçmek "sıyırma" sayılır (piksel). */
    grazeDistance: 14,
    /** Çarpışmada korunan hız payı. */
    crashSpeedKeep: 0.65,
    /** Çarpışma sonrası dokunulmazlık (sn). */
    invulnerable: 0.6,
    /** Kaç çarpışmada tur biter. */
    lives: 3,
  },
} as const;

export type Tuning = typeof TUNING;
