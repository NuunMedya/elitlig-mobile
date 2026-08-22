/**
 * PitchView — kadroyu GÖSTEREN saha. `PitchLineup`'ın izleme kardeşi.
 *
 * İKİ AYRI BİLEŞEN NEDEN: `components/PitchLineup.tsx` diziliş KURAR (boş
 * yuvalar, havuz, dokun-yerleştir); bu bileşen kurulmuş bir kadroyu OKUTUR.
 * İkisini tek bileşende toplamak, izleme ekranına hiç kullanılmayan yuva
 * seçimi mantığını ve düzenleme ekranına hiç kullanılmayan olay rozetlerini
 * taşımak demekti.
 *
 * SAHA YEŞİL DEĞİL. Zemin `surface3` (sunken yüzey), çizgiler `chalkInk`
 * tebeşiri. Gerçek çim yeşili telefonda iki sorun üretiyor: (1) beyaz forma
 * numaraları ve oyuncu adları yeşil üstünde okunurluğunu kaybediyor,
 * (2) uygulamanın geri kalanı soğuk gri-mavi bir kağıtken tek bir ekranın
 * doygun yeşile dönmesi "bu ekran başka bir uygulamadan" hissi veriyor.
 * Biçme şeritleri yalnız %2 opaklıkta iki tonla ima edilir — saha okunur,
 * ekran sakin kalır.
 *
 * LİG 8 KİŞİLİK: dizilişler 3-3-1, 2-3-2, 4-2-1 … (bkz. lib/api/team.ts →
 * FORMATIONS). 11 kişilik varsayımıyla yazılmış hiçbir yerleşim burada
 * çalışmaz; hatlar oyuncu sayısına göre kendiliğinden dağılır.
 *
 * DİKEY SAHA, TEK TAKIM: mobilde iki takımı aynı sahaya koymak 36px avatarları
 * 22px'e indirmeyi gerektiriyordu ve isimler okunmaz oluyordu. Bunun yerine
 * takım başına bir segment kullanılır — okunurluk kazanır, bilgi kaybolmaz.
 */

import { memo, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
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

const AVATAR = 36;

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
 * çizgisi, orta yuvarlak, iki ceza sahası, iki kale alanı. Doku, resim ya da
 * gradient yok; hepsi tek `Svg` içinde tek geçişte çizilir.
 */
const PitchLines = memo(function PitchLines({ width, height }: { width: number; height: number }) {
  const c = colors.chalkInk;
  const sw = 1;
  const boxW = width * 0.56;
  const boxH = height * 0.16;
  const smallW = width * 0.28;
  const smallH = height * 0.07;
  const inset = 6;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Biçme şeritleri: dört bant, %2 opaklıkta. Doku değil geometri. */}
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.mowStripe,
            { top: (height / 4) * i, height: height / 4, opacity: i % 2 === 0 ? 0.5 : 0 },
          ]}
        />
      ))}

      <Svg width={width} height={height}>
        <Rect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={height - inset * 2}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />
        <Line x1={inset} y1={height / 2} x2={width - inset} y2={height / 2} stroke={c} strokeWidth={sw} />
        <Circle cx={width / 2} cy={height / 2} r={width * 0.15} stroke={c} strokeWidth={sw} fill="none" />
        <Circle cx={width / 2} cy={height / 2} r={1.5} fill={c} />

        {/* Ceza sahaları */}
        <Rect x={(width - boxW) / 2} y={inset} width={boxW} height={boxH} stroke={c} strokeWidth={sw} fill="none" />
        <Rect
          x={(width - boxW) / 2}
          y={height - inset - boxH}
          width={boxW}
          height={boxH}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />
        {/* Kale alanları */}
        <Rect x={(width - smallW) / 2} y={inset} width={smallW} height={smallH} stroke={c} strokeWidth={sw} fill="none" />
        <Rect
          x={(width - smallW) / 2}
          y={height - inset - smallH}
          width={smallW}
          height={smallH}
          stroke={c}
          strokeWidth={sw}
          fill="none"
        />
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
        <Avatar name={player.name} image={player.photo} size={AVATAR} />

        {player.number != null && player.number !== "" ? (
          <View style={styles.numberBadge}>
            <Text style={styles.number} {...textScale.badge}>
              {player.number}
            </Text>
          </View>
        ) : null}

        {player.events?.length ? (
          <View style={styles.events}>
            {player.events.slice(0, 3).map((kind, i) => (
              <EventIcon key={`${kind}-${i}`} kind={kind} size={11} />
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

const SLOT_W = 60;

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
    backgroundColor: colors.pitch,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  mowStripe: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.chalkInk,
  },
  slot: {
    position: "absolute",
    width: SLOT_W,
    marginLeft: -SLOT_W / 2,
    marginTop: -(AVATAR + 14) / 2,
    alignItems: "center",
    gap: 2,
  },
  numberBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
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
    top: -4,
    right: -8,
    flexDirection: "row",
    gap: 1,
  },
  name: {
    ...type.overline,
    letterSpacing: 0,
    color: colors.textPrimary,
    textAlign: "center",
    width: SLOT_W,
  },
});
