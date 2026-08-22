/**
 * PitchView — kadroyu GÖSTEREN saha. `PitchLineup`'ın izleme kardeşi.
 *
 * İKİ AYRI BİLEŞEN NEDEN: `components/PitchLineup.tsx` diziliş KURAR (boş
 * yuvalar, havuz, dokun-yerleştir); bu bileşen kurulmuş bir kadroyu OKUTUR.
 * İkisini tek bileşende toplamak, izleme ekranına hiç kullanılmayan yuva
 * seçimi mantığını ve düzenleme ekranına hiç kullanılmayan olay rozetlerini
 * taşımak demekti.
 *
 * SAHA DERİN YEŞİLDİR. Önceki sürüm sahayı gri bir yüzey yapıyordu ve iki
 * sorun üretiyordu: (1) `colors.pitch` eski uyumluluk katmanında EKRAN ZEMİNİ
 * anlamına geldiği için saha, üstünde durduğu kâğıtla neredeyse aynı renkti —
 * kadro ekranı "boş bir dikdörtgene dağılmış avatarlar" gibi görünüyordu;
 * (2) tebeşir çizgileri %8 opaklıkta gri üstünde gri kalıyor, saha geometrisi
 * hiç okunmuyordu.
 *
 * Şimdi zemin `gradientPitch` (derin, doygunluğu düşük yeşil) ve çizgiler
 * `chalk` (beyaz, %22). Doygun çim yeşilinden kaçınma gerekçesi hâlâ geçerli
 * olduğu için yeşil KOYU ve SOĞUK tutulur: uygulamanın gri-mavi kâğıdıyla
 * kavga etmez, üstündeki beyaz metin 12:1 üstü kontrast alır. Biçme şeritleri
 * beyazın %3'ü ile ima edilir.
 *
 * LİG 8 KİŞİLİK: dizilişler 3-3-1, 2-3-2, 4-2-1 … (bkz. lib/api/team.ts →
 * FORMATIONS). 11 kişilik varsayımıyla yazılmış hiçbir yerleşim burada
 * çalışmaz; hatlar oyuncu sayısına göre kendiliğinden dağılır.
 *
 * DİKEY SAHA, TEK TAKIM: mobilde iki takımı aynı sahaya koymak 36px avatarları
 * 22px'e indirmeyi gerektiriyordu ve isimler okunmaz oluyordu. Bunun yerine
 * takım başına bir segment kullanılır — okunurluk kazanır, bilgi kaybolmaz.
 */

import { LinearGradient } from "expo-linear-gradient";
import { memo, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { positionLine } from "@/lib/api/team";
import { Avatar } from "./Avatar";
import { EventIcon, type EventIconKind } from "./EventIcon";
import { Touchable } from "./Pressable";

/** Hatların sahadaki dikey konumu (%). Kendi kalemiz ALTTA. */
const LINE_Y: Record<string, number> = { GK: 88, DEF: 66, MID: 42, FWD: 18 };
const LINE_ORDER = ["GK", "DEF", "MID", "FWD"] as const;

/** Saha en/boy oranı. Gerçek oran (68:105) telefonda yuvaları birbirine
 *  yapıştırıyor; 3:4 hem "saha" okunuyor hem sekiz oyuncuyu rahat taşıyor. */
const ASPECT = 4 / 3;

const AVATAR = 30;

/** Saha gradyanının yönü: üstten alta, kalenin derinliğini ima eder. */
const GRADIENT_START = { x: 0.5, y: 0 } as const;
const GRADIENT_END = { x: 0.5, y: 1 } as const;

export interface PitchPlayerView {
  /** Kadro satırının kimliği — liste anahtarı. */
  key: string;
  name: string;
  photo?: string | null;
  /** Forma numarası; yoksa rozet çizilmez. */
  number?: number | string | null;
  /** Pozisyon kodu ("STP") ya da serbest metin ("Stoper"). */
  position?: string | null;
  /** Avatarın sağ üstündeki olay rozetleri (gol, kart, değişiklik). */
  events?: EventIconKind[];
  onPress?: () => void;
}

export interface PitchViewProps {
  players: PitchPlayerView[];
  /** Ölçüyü çağıran belirler; saha genişliğe göre 3:4 yükselir. */
  width: number;
  /** "3-3-1" — sahanın üstünde takım renginin noktasıyla yazılır. */
  formation?: string | null;
  /** Diziliş satırındaki takım rengi noktası. */
  teamColor?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Soyadı — yuvaya tam ad sığmaz, ayırt edici olan da soyadıdır. */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? name;
}

export const PitchView = memo(function PitchView({
  players,
  width,
  formation,
  teamColor,
  style,
}: PitchViewProps) {
  const height = Math.round(width * ASPECT);

  /**
   * Oyuncuları hatlara dağıt. Aynı hattaki n oyuncudan i.'sinin merkezi
   * (i+1)/(n+1) oranındadır: kenara yapışma olmaz, hat kalabalıklaştıkça
   * aralık kendiliğinden daralır.
   */
  const placed = useMemo(() => {
    const byLine = new Map<string, PitchPlayerView[]>();
    for (const p of players) {
      const line = positionLine(p.position);
      const group = byLine.get(line);
      if (group) group.push(p);
      else byLine.set(line, [p]);
    }

    const out: { player: PitchPlayerView; x: number; y: number }[] = [];
    for (const line of LINE_ORDER) {
      const group = byLine.get(line);
      if (!group) continue;
      group.forEach((player, i) => {
        out.push({
          player,
          x: ((i + 1) / (group.length + 1)) * 100,
          y: LINE_Y[line],
        });
      });
    }
    return out;
  }, [players]);

  return (
    <View style={style}>
      {formation ? (
        <View style={styles.formationRow}>
          <View style={[styles.teamDot, teamColor ? { backgroundColor: teamColor } : null]} />
          <Text style={styles.formation} {...textScale.dense}>
            {formation}
          </Text>
        </View>
      ) : null}

      <View style={[styles.pitch, { width, height }]}>
        <LinearGradient
          colors={colors.gradientPitch}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <PitchLines width={width} height={height} />

        {placed.map(({ player, x, y }) => (
          <PitchSlot key={player.key} player={player} x={x} y={y} />
        ))}
      </View>
    </View>
  );
});

/**
 * Sahanın çizgileri — tebeşir. Yalnız geometri: kenar çizgisi, orta saha
 * çizgisi, orta yuvarlak ve nokta, iki ceza sahası, iki kale alanı, iki
 * penaltı noktası + yayı, dört köşe yayı. Doku ya da resim yok; hepsi tek
 * `Svg` içinde tek geçişte çizilir.
 *
 * PENALTI VE KÖŞE YAYLARI NEDEN EKLENDİ: sahayı "saha" yapan şey dikdörtgenler
 * değil bu iki eğridir. Onlar olmadan grafik, üstüne avatar konmuş bir kutu
 * gibi görünüyordu.
 */
const PitchLines = memo(function PitchLines({ width, height }: { width: number; height: number }) {
  const c = colors.chalk;
  const sw = 1.25;
  const inset = 10;
  const boxW = width * 0.58;
  const boxH = height * 0.155;
  const smallW = width * 0.28;
  const smallH = height * 0.068;
  const centerR = width * 0.155;
  const spotR = width * 0.11; // penaltı yayının yarıçapı
  const cornerR = width * 0.055;

  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;
  const midX = width / 2;

  /** Ceza sahasının dışına taşan penaltı yayı — sahanın en tanınır detayı. */
  const arc = (y: number, down: boolean) =>
    `M ${midX - spotR * 0.86} ${y} A ${spotR} ${spotR} 0 0 ${down ? 1 : 0} ${midX + spotR * 0.86} ${y}`;

  /** Köşe yayı — dört köşenin her birinde çeyrek daire. */
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `M ${x + dx * cornerR} ${y} A ${cornerR} ${cornerR} 0 0 ${dx * dy > 0 ? 0 : 1} ${x} ${y + dy * cornerR}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Biçme şeritleri: altı bant, beyazın %3'ü. Doku değil geometri. */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.mowStripe,
            /* Satır içi `opacity`, stil sayfasındaki değeri EZER: burada 1
               yazıldığında biçme şeritleri %3 yerine tam tebeşir opaklığında
               çiziliyor ve saha zebra desenine dönüyordu. */
            { top: (height / 6) * i, height: height / 6, opacity: i % 2 === 0 ? 0.14 : 0 },
          ]}
        />
      ))}

      <Svg width={width} height={height}>
        {/* Kenar çizgisi */}
        <Rect
          x={left}
          y={top}
          width={right - left}
          height={bottom - top}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />

        {/* Orta saha çizgisi + orta yuvarlak + orta nokta */}
        <Line x1={left} y1={height / 2} x2={right} y2={height / 2} stroke={c} strokeWidth={sw} />
        <Circle cx={midX} cy={height / 2} r={centerR} stroke={c} strokeWidth={sw} fill="none" />
        <Circle cx={midX} cy={height / 2} r={2.5} fill={c} />

        {/* Ceza sahaları */}
        <Rect x={(width - boxW) / 2} y={top} width={boxW} height={boxH} stroke={c} strokeWidth={sw} fill="none" />
        <Rect
          x={(width - boxW) / 2}
          y={bottom - boxH}
          width={boxW}
          height={boxH}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />

        {/* Kale alanları */}
        <Rect x={(width - smallW) / 2} y={top} width={smallW} height={smallH} stroke={c} strokeWidth={sw} fill="none" />
        <Rect
          x={(width - smallW) / 2}
          y={bottom - smallH}
          width={smallW}
          height={smallH}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />

        {/* Penaltı noktaları ve yayları */}
        <Circle cx={midX} cy={top + boxH * 0.66} r={2} fill={c} />
        <Circle cx={midX} cy={bottom - boxH * 0.66} r={2} fill={c} />
        <Path d={arc(top + boxH, true)} stroke={c} strokeWidth={sw} fill="none" />
        <Path d={arc(bottom - boxH, false)} stroke={c} strokeWidth={sw} fill="none" />

        {/* Köşe yayları */}
        <Path d={corner(left, top, 1, 1)} stroke={c} strokeWidth={sw} fill="none" />
        <Path d={corner(right, top, -1, 1)} stroke={c} strokeWidth={sw} fill="none" />
        <Path d={corner(left, bottom, 1, -1)} stroke={c} strokeWidth={sw} fill="none" />
        <Path d={corner(right, bottom, -1, -1)} stroke={c} strokeWidth={sw} fill="none" />
      </Svg>
    </View>
  );
});

/** Sahadaki tek oyuncu: avatar + forma no rozeti + soyadı + olay rozetleri. */
const PitchSlot = memo(function PitchSlot({
  player,
  x,
  y,
}: {
  player: PitchPlayerView;
  x: number;
  y: number;
}) {
  const label = surname(player.name);
  const speech = player.number ? `${player.name}, forma ${player.number}` : player.name;

  return (
    <Touchable
      feedback={player.onPress ? "card" : "none"}
      haptic="none"
      onPress={player.onPress}
      disabled={!player.onPress}
      accessibilityRole={player.onPress ? "button" : "text"}
      accessibilityLabel={speech}
      style={[styles.slot, { left: `${x}%`, top: `${y}%` }]}
    >
      <View>
        <Avatar name={player.name} image={player.photo} size={AVATAR} onPitch />

        {player.number != null && player.number !== "" ? (
          <View style={styles.numberBadge}>
            <Text style={styles.number} {...textScale.badge}>
              {player.number}
            </Text>
          </View>
        ) : null}

        {player.events?.length ? (
          <View style={styles.events}>
            {/* Koyu pul: beyaz olay ikonu beyaz avatarın kenarında kayboluyordu. */}
            <View style={styles.eventsBacking} pointerEvents="none" />
            {player.events.slice(0, 3).map((kind, i) => (
              <EventIcon key={`${kind}-${i}`} kind={kind} size={10} onDark />
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </Touchable>
  );
});

const SLOT_W = 56;

const styles = StyleSheet.create({
  formationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingBottom: space.sm,
  },
  teamDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },
  formation: {
    ...type.overline,
    color: colors.textSecondary,
  },
  pitch: {
    // Gradyan yüklenemezse düz derin yeşil altta durur.
    backgroundColor: colors.pitchGreen,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  mowStripe: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.chalk,
  },
  slot: {
    position: "absolute",
    width: SLOT_W,
    marginLeft: -SLOT_W / 2,
    marginTop: -(AVATAR + 16) / 2,
    alignItems: "center",
    gap: 3,
  },
  numberBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8.5,
    backgroundColor: colors.surface1,
    borderWidth: 1.5,
    borderColor: colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: type.tableNumStrong.fontFamily,
    fontVariant: ["tabular-nums"],
    color: colors.textPrimary,
  },
  events: {
    position: "absolute",
    top: -5,
    right: -9,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  eventsBacking: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  /*
   * Ad derin sahanın üstünde durur: beyaz metin + koyu kapsül. Kapsül olmadan
   * ad, biçme şeridinin açık bandına denk geldiğinde okunurluğunu kaybediyordu.
   */
  name: {
    ...type.micro,
    letterSpacing: 0.2,
    color: colors.onPitch,
    textAlign: "center",
    overflow: "hidden",
    borderRadius: radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: colors.overlay,
    maxWidth: SLOT_W,
  },
});
