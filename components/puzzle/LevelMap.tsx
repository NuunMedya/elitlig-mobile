/**
 * LİG YOLU HARİTASI — renkli bölgelerden geçen, aşağıdan yukarı kıvrılan yol.
 *
 * NE: her satır bir seviye. İnce kenarlı yumuşak bir yol düğümden düğüme S
 * kıvrımlarla akar; geçilen kısmın orta çizgisi ışıklıdır. Zemin biçilmiş
 * saha gibi şeritlidir ve her 20 seviyede bölge değişir (lib/puzzle/
 * mapPalette): Amatör Lig'in güneşli parkı … Elit Lig'in altını. "Canlı ama
 * sade": yol kenarında seyrek (satır başına en çok bir) bölge dekoru.
 *
 * Düğümler temiz, konturu olmayan yuvarlak düğmelerdir (yumuşak gölge + ince
 * alt dudak): geçilenler bölge renginde ve üstünde üç yıldız; sıradaki büyük,
 * beyaz, yeşil numaralı, üstünde iğne ve altında yeşil OYNA; kilitliler gri.
 * Her 10. seviye ince altın halkalı kupa düğümü.
 *
 * NEDEN TERS FLATLIST: yol aşağıdan yukarı okunur (seviye 1 en altta) ve
 * açılışta oyuncunun bulunduğu yere kaydırılır; sabit satır yüksekliği
 * (getItemLayout) 300+ seviyede de akıcı tutar. Her satır yolun kendi
 * parçasını çizer (alt komşuyla orta noktada, dikey teğetle birleşir; ek
 * yoktur).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, FlatList, StyleSheet, Text, View, useWindowDimensions, type CellRendererProps } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from "react-native-svg";

import { Touchable, useReduceMotion } from "@/components/ui";
import { MAP_COMMON as M, zoneOf, type MapDecor, type MapZone } from "@/lib/puzzle/mapPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const ROW = 118;
const NODE = 62;
const NODE_CURRENT = 76;
const ROAD = 38;
/** Bölge başlangıcındaki satırın altına eklenen pankart şeridi. */
const BANNER = 44;
const rowHeight = (level: number) => ((level - 1) % 20 === 0 ? ROW + BANNER : ROW);
/** index (0 = 1. seviye) satırının listedeki ofseti: her 20 satırda bir pankart şeridi. */
const rowOffset = (index: number) => ROW * index + BANNER * Math.floor((index + 19) / 20);
/** Haritada açık seviyenin ötesinde gösterilen kilitli seviye sayısı. */
const AHEAD = 25;

/** Lig basamakları — her 20 seviye bir basamak. */
export const LEAGUE_TIERS = [
  "Amatör Lig",
  "Mahalle Kupası",
  "Bölgesel Amatör Lig",
  "3. Lig",
  "2. Lig",
  "1. Lig",
  "Süper Lig",
  "Şampiyonlar Gecesi",
  "Elit Lig",
];

export const tierOf = (level: number) => LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, Math.floor((level - 1) / 20))];

interface Row {
  level: number;
  stars: number;
  state: "done" | "current" | "locked";
}

export function LevelMap({
  cleared,
  stars,
  onPlay,
  header,
  contentTop = 0,
}: {
  /** Geçilmiş son seviye. */
  cleared: number;
  stars: Record<string, number>;
  onPlay: (level: number) => void;
  /** Eski imza (kullanılmıyor): düğüm rengi artık bölgeden gelir. */
  tone?: string;
  header?: React.ReactElement | null;
  /** Üst şeridin altında kalan boşluk (harita şeridin altından kayar). */
  contentTop?: number;
}) {
  const { width } = useWindowDimensions();
  const current = cleared + 1;
  const data = useMemo<Row[]>(() => {
    const total = current + AHEAD;
    return Array.from({ length: total }, (_, i) => {
      const level = i + 1;
      return { level, stars: Number(stars[String(level)] || 0), state: level < current ? "done" : level === current ? "current" : "locked" };
    });
  }, [current, stars]);

  const listRef = useRef<FlatList<Row>>(null);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => <LevelRow row={item} width={width} current={current} onPlay={onPlay} />,
    [current, onPlay, width]
  );
  const zone = zoneOf(current);

  return (
    <FlatList
      ref={listRef}
      data={data}
      inverted
      keyExtractor={(item) => String(item.level)}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: rowHeight(index + 1), offset: rowOffset(index), index })}
      // Alt seviyenin satırı üsttekinin üstünde çizilsin: "SEN" iğnesi ve yıldızlar komşu satıra taşar.
      CellRendererComponent={RowCell}
      initialScrollIndex={Math.max(0, current - 3)}
      initialNumToRender={12}
      removeClippedSubviews={false}
      windowSize={7}
      style={{ backgroundColor: zone.ground[1] }}
      contentContainerStyle={{ paddingTop: 0, paddingBottom: contentTop }}
      ListHeaderComponent={<StartGate width={width} />}
      ListFooterComponent={header ?? <View style={{ height: ROW, backgroundColor: zoneOf(current + AHEAD).ground[0] }} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

/** Alt seviyenin satırı üsttekinin üstünde çizilsin: "SEN" iğnesi ve yıldızlar komşu satıra taşar. */
function RowCell({ index, style, children, onLayout }: CellRendererProps<Row>) {
  return (
    <View style={[style, { zIndex: 100000 - index }]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/* ═══════════════════════ geometri ═══════════════════════ */

/** Düğümün yatay konumu: yumuşak bir yılan yolu (-1…1). */
const sway = (level: number) => Math.sin(level * 0.85) * 0.64;
const nodeX = (level: number, w: number) => w * (0.5 + sway(level) * 0.34);

/** Satırdaki yol parçası: alt orta nokta → düğüm → üst orta nokta (dikey teğetli S). */
function roadPaths(level: number, w: number) {
  const h = rowHeight(level);
  const xn = nodeX(level, w);
  const xb = level === 1 ? xn : (nodeX(level - 1, w) + xn) / 2;
  const xa = (xn + nodeX(level + 1, w)) / 2;
  const m = (h + ROW * 0.5) / 2;
  const lower = `M ${xb} ${h} C ${xb} ${m}, ${xn} ${m}, ${xn} ${ROW * 0.5}`;
  const upper = `M ${xn} ${ROW * 0.5} C ${xn} ${ROW * 0.25}, ${xa} ${ROW * 0.25}, ${xa} 0`;
  return { h, xn, lower, upper, full: `${lower} C ${xn} ${ROW * 0.25}, ${xa} ${ROW * 0.25}, ${xa} 0` };
}

/** Tohumlu küçük rastgele (dekor yerleşimi her açılışta aynı). */
function rand(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════ satır ═══════════════════════ */

const LevelRow = React.memo(function LevelRow({ row, width, current, onPlay }: { row: Row; width: number; current: number; onPlay: (level: number) => void }) {
  const zone = zoneOf(row.level);
  const { h, xn, lower, upper, full } = roadPaths(row.level, width);
  const lowerDone = row.level <= current;
  const upperDone = row.level < current;
  const tierStart = (row.level - 1) % 20 === 0;
  const ground = zone.ground[row.level % 2];

  // Dekor: seyrek — satırların ancak üçte birinde, yolun boş tarafına tek parça.
  const decor = useMemo(() => {
    const r = rand(row.level * 31 + 7);
    if (r() > 0.36) return [];
    const right = xn < width / 2;
    const kind = zone.decor[Math.floor(r() * zone.decor.length)];
    const span = right ? [width * 0.7, width * 0.9] : [width * 0.1, width * 0.3];
    return [{ kind, x: span[0] + r() * (span[1] - span[0]), y: ROW * (0.35 + r() * 0.35), s: 0.8 + r() * 0.25 }];
  }, [row.level, width, xn, zone]);

  return (
    <View style={[styles.row, { height: h, backgroundColor: ground }]}>
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        {tierStart ? <Rect x={0} y={ROW} width={width} height={BANNER} fill={zoneOf(Math.max(1, row.level - 1)).ground[(row.level - 1) % 2]} /> : null}
        {zone.night ? <NightSky level={row.level} width={width} /> : null}
        {/* yol: yumuşak gölge, ince kenar, dolgu, orta çizgi */}
        <Path d={full} stroke={M.shadowSoft} strokeWidth={ROAD + 4} fill="none" strokeLinecap="butt" transform="translate(0 3)" />
        <Path d={full} stroke={zone.roadEdge} strokeWidth={ROAD + 3} fill="none" strokeLinecap="butt" />
        <Path d={full} stroke={zone.road} strokeWidth={ROAD} fill="none" strokeLinecap="butt" />
        <Path d={lower} stroke={lowerDone ? zone.roadDone : zone.roadLine} strokeWidth={lowerDone ? 5 : 3} strokeDasharray={lowerDone ? "12 10" : "6 12"} fill="none" strokeLinecap="round" opacity={lowerDone ? 0.95 : 0.55} />
        <Path d={upper} stroke={upperDone ? zone.roadDone : zone.roadLine} strokeWidth={upperDone ? 5 : 3} strokeDasharray={upperDone ? "12 10" : "6 12"} fill="none" strokeLinecap="round" opacity={upperDone ? 0.95 : 0.55} />
        {decor.map((d, i) => (
          <Decor key={i} kind={d.kind} x={d.x} y={d.y} s={d.s} zone={zone} />
        ))}
      </Svg>
      {tierStart ? <TierBanner level={row.level} zone={zone} /> : null}
      <LevelNode row={row} x={xn} zone={zone} onPlay={onPlay} pinLeft={xn > width / 2} />
    </View>
  );
});

/* ═══════════════════════ düğüm ═══════════════════════ */

function LevelNode({ row, x, zone, onPlay, pinLeft }: { row: Row; x: number; zone: MapZone; onPlay: (level: number) => void; pinLeft: boolean }) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const isCurrent = row.state === "current";
  const locked = row.state === "locked";
  const cup = row.level % 10 === 0;

  useEffect(() => {
    if (!isCurrent || reduce) return;
    // Sonlu nabız: dikkat çeker ama pil yemez (tasarım kuralı: sonsuz döngü yok).
    const beat = Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const anim = Animated.loop(beat, { iterations: 8 });
    anim.start();
    return () => anim.stop();
  }, [isCurrent, pulse, reduce]);

  const size = isCurrent ? NODE_CURRENT : NODE;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const bob = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const fill = locked ? M.locked : isCurrent ? M.current : zone.node;
  const gid = `n${row.level}`;

  return (
    // Bulunduğun seviye: düğme + "OYNA" etiketi satırın İÇİNDE kalır, "SEN"
    // iğnesi düğmenin yanında durur. Liste satırı dışına taşan çizim telefonda
    // kesiliyordu (Android liste hücreleri taşanı kırpar).
    <View pointerEvents="box-none" style={[styles.nodeWrap, { left: x - 60, top: isCurrent ? ROW / 2 - size / 2 - 8 : ROW / 2 - size / 2 }]}>
      {isCurrent ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pin, pinLeft ? { left: 60 - size / 2 - 50 } : { left: 60 + size / 2 + 4 }, { top: size / 2 - 30, transform: [{ translateY: bob }] }]}
        >
          <Svg width={46} height={54}>
            <Path d="M23 52 C 16 40, 3 33, 3 21 A 20 20 0 1 1 43 21 C 43 33, 30 40, 23 52 Z" fill={M.shadowSoft} transform="translate(0 3)" />
            <Path d="M23 52 C 16 40, 3 33, 3 21 A 20 20 0 1 1 43 21 C 43 33, 30 40, 23 52 Z" fill={M.pin} />
          </Svg>
          <View style={styles.pinIcon}>
            <Ionicons name="football" size={22} color={M.pinInk} />
          </View>
        </Animated.View>
      ) : row.state === "done" ? (
        <View pointerEvents="none" style={styles.starArc}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={n === 2 ? styles.starMid : styles.starSide}>
              <StarShape size={n === 2 ? 24 : 19} lit={n <= row.stars} />
            </View>
          ))}
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Touchable
          onPress={() => !locked && onPlay(row.level)}
          disabled={locked}
          haptic="selection"
          style={{ width: size, height: size + 6 }}
          accessibilityRole="button"
          accessibilityLabel={`${row.level}. seviye${cup ? ", kupa maçı" : ""}${row.state === "done" ? `, ${row.stars} yıldız` : locked ? ", kilitli" : ", oyna"}`}
        >
          <Svg width={size} height={size + 6}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fill[0]} />
                <Stop offset="1" stopColor={fill[1]} />
              </LinearGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2 + 5} r={size / 2 - 1} fill={M.shadowSoft} />
            <Circle cx={size / 2} cy={size / 2 + 3} r={size / 2 - 1} fill={isCurrent ? M.currentLip : fill[1]} />
            <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${gid})`} />
            {cup && !locked ? <Circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="none" stroke={M.cup} strokeWidth={2.5} /> : null}
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.nodeCenter, { height: size }]}>
            {locked ? (
              <Ionicons name={cup ? "trophy" : "lock-closed"} size={22} color={M.lockedInk} />
            ) : cup ? (
              <Ionicons name="trophy" size={isCurrent ? 34 : 26} color={isCurrent ? M.currentInk : M.white} />
            ) : (
              <Text style={[styles.nodeText, isCurrent && styles.nodeTextCurrent]} {...textScale.badge}>
                {row.level}
              </Text>
            )}
          </View>
        </Touchable>
      </Animated.View>
      {isCurrent ? (
        <Touchable onPress={() => onPlay(row.level)} style={styles.playTag} haptic="medium" accessibilityRole="button" accessibilityLabel={`${row.level}. seviyeyi oyna`}>
          <Text style={styles.playText} {...textScale.badge}>OYNA</Text>
        </Touchable>
      ) : null}
    </View>
  );
}

function StarShape({ size, lit }: { size: number; lit: boolean }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? size * 0.22 : size * 0.5;
    pts.push(`${size / 2 + Math.cos(a) * r},${size / 2 + Math.sin(a) * r + 1}`);
  }
  return (
    <Svg width={size} height={size + 2}>
      <Polygon points={pts.join(" ")} fill={lit ? M.star : M.starEmpty} stroke={lit ? M.starEdge : M.starEmpty} strokeWidth={1} strokeLinejoin="round" />
    </Svg>
  );
}

/* ═══════════════════════ pankart, başlangıç kapısı ═══════════════════════ */

function TierBanner({ level, zone }: { level: number; zone: MapZone }) {
  const idx = Math.floor((level - 1) / 20);
  return (
    <View pointerEvents="none" style={styles.banner}>
      <View style={[styles.bannerBody, { backgroundColor: zone.banner[1] }]}>
        <Ionicons name={idx >= 6 ? "trophy" : idx >= 3 ? "shield" : "flag"} size={13} color={M.star} />
        <Text style={styles.bannerText} numberOfLines={1} {...textScale.badge}>
          {tierOf(level).toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.bannerSub} {...textScale.badge}>
          {level}–{level + 19}
        </Text>
      </View>
    </View>
  );
}

function StartGate({ width }: { width: number }) {
  const zone = zoneOf(1);
  const x = nodeX(1, width);
  return (
    <View style={[styles.gate, { backgroundColor: zone.ground[0] }]}>
      <Svg width={width} height={96} style={StyleSheet.absoluteFill}>
        <Rect x={x - ROAD / 2 - 1.5} y={0} width={ROAD + 3} height={40} fill={zone.roadEdge} />
        <Rect x={x - ROAD / 2} y={0} width={ROAD} height={40} fill={zone.road} />
        <Rect x={x - 70} y={40} width={140} height={10} rx={5} fill={zone.roadEdge} />
        <Rect x={x - 62} y={14} width={8} height={36} fill={M.white} />
        <Rect x={x + 54} y={14} width={8} height={36} fill={M.white} />
        <Rect x={x - 66} y={8} width={132} height={14} rx={7} fill={M.white} />
      </Svg>
      <View style={[styles.gateLabel, { left: x - 60 }]}>
        <Text style={styles.gateText} {...textScale.badge}>BAŞLANGIÇ</Text>
      </View>
    </View>
  );
}

/* ═══════════════════════ zemin ve dekor ═══════════════════════ */

function NightSky({ level, width }: { level: number; width: number }) {
  const r = rand(level * 17 + 11);
  const stars = Array.from({ length: 3 }, () => ({ x: r() * width, y: r() * ROW, s: 0.6 + r() * 1.1 }));
  return (
    <G>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.s} fill={M.white} opacity={0.4} />
      ))}
    </G>
  );
}

function Decor({ kind, x, y, s, zone }: { kind: MapDecor; x: number; y: number; s: number; zone: MapZone }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  switch (kind) {
    case "tree":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={22} rx={16} ry={5} fill={M.shadow} />
          <Rect x={-4} y={4} width={8} height={18} rx={3} fill={zone.wood} />
          <Circle cx={0} cy={-6} r={17} fill={zone.leaf[1]} />
          <Circle cx={-8} cy={-2} r={11} fill={zone.leaf[0]} />
          <Circle cx={7} cy={-12} r={10} fill={zone.leaf[0]} />
          <Circle cx={-3} cy={-14} r={5} fill={M.white} opacity={0.25} />
        </G>
      );
    case "pine":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={24} rx={13} ry={4} fill={M.shadow} />
          <Rect x={-3} y={14} width={6} height={10} fill={zone.wood} />
          <Polygon points="0,-26 16,2 -16,2" fill={zone.leaf[1]} />
          <Polygon points="0,-14 19,16 -19,16" fill={zone.leaf[0]} />
        </G>
      );
    case "bush":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={10} rx={20} ry={5} fill={M.shadow} />
          <Circle cx={-10} cy={2} r={9} fill={zone.leaf[1]} />
          <Circle cx={8} cy={2} r={10} fill={zone.leaf[1]} />
          <Circle cx={0} cy={-4} r={11} fill={zone.leaf[0]} />
          <Circle cx={-6} cy={-2} r={2.5} fill={zone.accent} />
          <Circle cx={6} cy={-6} r={2.5} fill={zone.accent} />
        </G>
      );
    case "flower":
      return (
        <G transform={t}>
          {[-10, 0, 10].map((dx, i) => (
            <G key={i} transform={`translate(${dx} ${i === 1 ? -4 : 2})`}>
              <Line x1={0} y1={0} x2={0} y2={10} stroke={zone.leaf[1]} strokeWidth={2} />
              <Circle cx={0} cy={0} r={4.5} fill={i === 1 ? M.white : zone.accent} />
              <Circle cx={0} cy={0} r={1.8} fill={M.star} />
            </G>
          ))}
        </G>
      );
    case "flag":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={22} rx={8} ry={3} fill={M.shadow} />
          <Line x1={0} y1={22} x2={0} y2={-24} stroke={M.white} strokeWidth={3} strokeLinecap="round" />
          <Path d="M 1 -24 L 22 -17 L 1 -9 Z" fill={zone.accent} />
          <Circle cx={0} cy={-25} r={2.5} fill={M.star} />
        </G>
      );
    case "ball":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={11} rx={10} ry={3} fill={M.shadow} />
          <Circle cx={0} cy={0} r={10} fill={M.white} stroke={M.black} strokeWidth={1.2} />
          <Polygon points="0,-4 4,-1 2.5,4 -2.5,4 -4,-1" fill={M.black} />
          <Circle cx={-6} cy={-5} r={1.6} fill={M.black} />
          <Circle cx={6} cy={-5} r={1.6} fill={M.black} />
        </G>
      );
    case "goal":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={14} rx={30} ry={4} fill={M.shadow} />
          <Rect x={-26} y={-14} width={52} height={26} fill={M.net} opacity={0.35} />
          {[-16, -6, 4, 14].map((gx) => (
            <Line key={gx} x1={gx} y1={-14} x2={gx} y2={12} stroke={M.net} strokeWidth={1} />
          ))}
          <Line x1={-26} y1={-2} x2={26} y2={-2} stroke={M.net} strokeWidth={1} />
          <Path d="M -26 12 L -26 -14 L 26 -14 L 26 12" stroke={M.white} strokeWidth={4} fill="none" strokeLinejoin="round" />
        </G>
      );
    case "lamp":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={26} rx={8} ry={3} fill={M.shadow} />
          <Circle cx={0} cy={-26} r={14} fill={M.glow} />
          <Line x1={0} y1={26} x2={0} y2={-20} stroke={M.rockDeep} strokeWidth={3.5} />
          <Rect x={-10} y={-30} width={20} height={9} rx={2} fill={M.rockDeep} />
          <Rect x={-8} y={-28} width={16} height={5} rx={1} fill={M.star} />
        </G>
      );
    case "stand":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={18} rx={32} ry={4} fill={M.shadow} />
          <Rect x={-30} y={-2} width={60} height={20} rx={3} fill={zone.banner[1]} />
          <Rect x={-26} y={-12} width={52} height={12} rx={3} fill={zone.banner[0]} />
          <Rect x={-22} y={-20} width={44} height={9} rx={3} fill={zone.accent} />
          {[-20, -10, 0, 10, 20].map((sx) => (
            <Circle key={sx} cx={sx} cy={6} r={2.4} fill={M.white} opacity={0.8} />
          ))}
        </G>
      );
    case "cone":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={10} rx={10} ry={3} fill={M.shadow} />
          <Rect x={-9} y={7} width={18} height={4} rx={1.5} fill={M.cone} />
          <Polygon points="0,-12 7,8 -7,8" fill={M.cone} />
          <Polygon points="-3.5,-2 3.5,-2 4.8,2 -4.8,2" fill={M.white} />
        </G>
      );
    case "house":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={16} rx={24} ry={4} fill={M.shadow} />
          <Rect x={-18} y={-6} width={36} height={22} fill={M.wall} />
          <Polygon points="-22,-6 0,-24 22,-6" fill={M.roof} />
          <Rect x={-5} y={4} width={10} height={12} fill={zone.wood} />
          <Rect x={-15} y={-1} width={7} height={7} fill={M.star} />
          <Rect x={8} y={-1} width={7} height={7} fill={M.star} />
        </G>
      );
    case "rock":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={9} rx={16} ry={4} fill={M.shadow} />
          <Path d="M -15 8 L -10 -6 L 2 -10 L 13 -2 L 15 8 Z" fill={M.rockDeep} />
          <Path d="M -10 -6 L 2 -10 L 6 -2 L -6 0 Z" fill={M.rock} />
        </G>
      );
    case "star":
      return (
        <G transform={t}>
          <Circle cx={0} cy={0} r={12} fill={M.glow} opacity={0.6} />
          <Polygon points="0,-11 3,-3 11,-3 5,2 7,10 0,5 -7,10 -5,2 -11,-3 -3,-3" fill={M.star} />
        </G>
      );
    case "trophy":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={18} rx={14} ry={3.5} fill={M.shadow} />
          <Rect x={-10} y={10} width={20} height={7} rx={2} fill={zone.wood} />
          <Rect x={-3} y={2} width={6} height={9} fill={M.cupDeep} />
          <Path d="M -12 -16 L 12 -16 L 9 -2 Q 0 6 -9 -2 Z" fill={M.cup} />
          <Path d="M -12 -13 Q -20 -12 -15 -4 L -10 -4" stroke={M.cup} strokeWidth={3} fill="none" />
          <Path d="M 12 -13 Q 20 -12 15 -4 L 10 -4" stroke={M.cup} strokeWidth={3} fill="none" />
          <Ellipse cx={-4} cy={-11} rx={2.5} ry={4} fill={M.white} opacity={0.5} />
        </G>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  row: { height: ROW, overflow: "visible" },
  nodeWrap: { position: "absolute", width: 120, alignItems: "center" },
  nodeCenter: { alignItems: "center", justifyContent: "center" },
  nodeText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: M.ink,
    textShadowColor: M.inkShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  nodeTextCurrent: { ...type.display, fontFamily: fonts.bold, color: M.currentInk, textShadowColor: M.clear },
  starArc: { position: "absolute", top: -22, flexDirection: "row", alignItems: "flex-end", gap: 1 },
  starMid: { marginBottom: 5 },
  starSide: {},
  pin: { position: "absolute", width: 46, height: 56, alignItems: "center" },
  pinIcon: { position: "absolute", top: 10, width: 46, alignItems: "center" },
  playTag: {
    marginTop: -18,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: M.play,
    borderBottomWidth: 3,
    borderBottomColor: M.currentLip,
  },
  playText: { ...type.label, fontFamily: fonts.bold, color: M.white, letterSpacing: 1.2 },
  banner: { position: "absolute", top: ROW + 8, left: 0, right: 0, alignItems: "center" },
  bannerBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  bannerText: { ...type.label, fontFamily: fonts.bold, color: M.ink, letterSpacing: 1.2 },
  bannerSub: { ...type.micro, color: M.ink, opacity: 0.8 },
  gate: { height: 96 },
  gateLabel: { position: "absolute", top: 6, width: 120, alignItems: "center" },
  gateText: { ...type.micro, fontFamily: fonts.bold, color: M.black, letterSpacing: 1.5 },
});
