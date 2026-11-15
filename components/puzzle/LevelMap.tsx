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
 * 2026-11 SADELEŞTİRME (oyun ana sayfası, sözleşme §6): parlak şeker
 * düğümler, çim tutamları ve satır başına iki dekor göz yoruyordu. Şimdi:
 *   · düğümler DÜZ daire: geçilen = bölge renginde, ince beyaz halka, altında
 *     üç küçük yıldız; sıradaki = büyük beyaz daire, kalın yeşil halka, yanında
 *     baş harflerinle "SEN" rozeti; kilitli = soluk gri, kilit ikonu.
 *   · her 10. bölüm ince altın halka + yolun boş yanında küçük BÖLÜM SANDIĞI.
 *   · dekor seyrek: satır başına en çok bir, küçük, yolun boş yanında.
 *   · her şey satırın İÇİNDE çizilir (yıldızlar düğümün altında, rozet
 *     yanında): liste hücreleri taşanı kırpıyordu.
 * Açılışta harita bulunduğun bölüme yumuşakça kayar.
 *
 * NEDEN TERS FLATLIST: yol aşağıdan yukarı okunur (seviye 1 en altta) ve
 * açılışta oyuncunun bulunduğu yere kaydırılır; sabit satır yüksekliği
 * (getItemLayout) 300+ seviyede de akıcı tutar. Her satır yolun kendi
 * parçasını çizer (alt komşuyla orta noktada, dikey teğetle birleşir; ek
 * yoktur).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions, type CellRendererProps } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";

import { Touchable } from "@/components/ui";
import { MAP_COMMON as M, zoneOf, type MapDecor, type MapZone } from "@/lib/puzzle/mapPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const ROW = 104;
const NODE = 50;
const NODE_CURRENT = 62;
const ROAD = 30;
/** Bölge başlangıcındaki satırın altına eklenen pankart şeridi. */
const BANNER = 40;
const rowHeight = (level: number) => ((level - 1) % 20 === 0 ? ROW + BANNER : ROW);
/** index (0 = 1. seviye) satırının listedeki ofseti: her 20 satırda bir pankart şeridi. */
const rowOffset = (index: number) => ROW * index + BANNER * Math.floor((index + 19) / 20);
/** Başlangıç kapısının yüksekliği (listenin en altı). */
const GATE = 96;
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
  contentBottom = 0,
  avatar,
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
  /** Alt şeridin (büyük OYNA düğmesi) kapladığı boşluk. */
  contentBottom?: number;
  /** Bulunduğun bölümün iğnesindeki baş harfler (yoksa top ikonu). */
  avatar?: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const current = cleared + 1;
  const data = useMemo<Row[]>(() => {
    const total = current + AHEAD;
    return Array.from({ length: total }, (_, i) => {
      const level = i + 1;
      return { level, stars: Number(stars[String(level)] || 0), state: level < current ? "done" : level === current ? "current" : "locked" };
    });
  }, [current, stars]);

  const listRef = useRef<FlatList<Row>>(null);
  const avatarRef = useRef(avatar ?? null);
  avatarRef.current = avatar ?? null;
  const renderItem = useCallback(
    ({ item }: { item: Row }) => <LevelRow row={item} width={width} current={current} onPlay={onPlay} avatar={item.state === "current" ? avatarRef.current : null} />,
    [current, onPlay, width]
  );
  // Bulunduğun bölüme yumuşak kaydırma: açılışta ve bölüm ilerleyince.
  // scrollToIndex başlangıç kapısını (GATE) ve alt şerit boşluğunu bilmiyordu;
  // düğüm üst şeridin altına sıkışıyordu. Ofset elle: düğüm, iki şerit
  // arasındaki boş alanın ortasına (biraz altına) gelir.
  useEffect(() => {
    const id = setTimeout(() => {
      const free = Math.max(ROW, height - contentTop - contentBottom);
      const offset = rowOffset(current - 1) + GATE + rowHeight(current) - ROW / 2 - free * 0.45;
      listRef.current?.scrollToOffset({ offset: Math.max(0, offset), animated: true });
    }, 350);
    return () => clearTimeout(id);
  }, [contentBottom, contentTop, current, height]);
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
      contentContainerStyle={{ paddingTop: contentBottom, paddingBottom: contentTop }}
      onScrollToIndexFailed={() => undefined}
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

const LevelRow = React.memo(function LevelRow({ row, width, current, onPlay, avatar }: { row: Row; width: number; current: number; onPlay: (level: number) => void; avatar: string | null }) {
  const zone = zoneOf(row.level);
  const { h, xn, lower, upper, full } = roadPaths(row.level, width);
  const lowerDone = row.level <= current;
  const upperDone = row.level < current;
  const tierStart = (row.level - 1) % 20 === 0;
  const ground = zone.ground[row.level % 2];
  const right = xn < width / 2;

  // Dekor: satırların ~üçte birinde, yolun BOŞ yanında tek küçük parça.
  // Bölüm sandığı olan satırda (her 10.) o yan sandığındır.
  const chestRow = row.level % 10 === 0;
  const decor = useMemo(() => {
    const r = rand(row.level * 31 + 7);
    if (chestRow || r() > 0.36) return null;
    const lo = right ? width * 0.76 : width * 0.1;
    const hi = right ? width * 0.9 : width * 0.24;
    return { kind: zone.decor[Math.floor(r() * zone.decor.length)], x: lo + r() * (hi - lo), y: ROW * (0.4 + r() * 0.2), s: 0.62 + r() * 0.14 };
  }, [chestRow, right, row.level, width, zone]);

  return (
    <View style={[styles.row, { height: h, backgroundColor: ground }]}>
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        {tierStart ? <Rect x={0} y={ROW} width={width} height={BANNER} fill={zoneOf(Math.max(1, row.level - 1)).ground[(row.level - 1) % 2]} /> : null}
        {/* yol: ince kenar, dolgu, orta çizgi (geçilen kısım dolu, kalan soluk kesik) */}
        <Path d={full} stroke={zone.roadEdge} strokeWidth={ROAD + 3} fill="none" strokeLinecap="butt" opacity={0.7} />
        <Path d={full} stroke={zone.road} strokeWidth={ROAD} fill="none" strokeLinecap="butt" />
        <Path d={lower} stroke={lowerDone ? zone.roadDone : zone.roadLine} strokeWidth={lowerDone ? 4 : 2.5} strokeDasharray={lowerDone ? undefined : "5 10"} fill="none" strokeLinecap="round" opacity={lowerDone ? 0.85 : 0.45} />
        <Path d={upper} stroke={upperDone ? zone.roadDone : zone.roadLine} strokeWidth={upperDone ? 4 : 2.5} strokeDasharray={upperDone ? undefined : "5 10"} fill="none" strokeLinecap="round" opacity={upperDone ? 0.85 : 0.45} />
        {decor ? <Decor kind={decor.kind} x={decor.x} y={decor.y} s={decor.s} zone={zone} /> : null}
        {chestRow ? <LevelChest x={right ? width * 0.8 : width * 0.2} y={ROW * 0.5} open={row.level < current} /> : null}
      </Svg>
      {tierStart ? <TierBanner level={row.level} zone={zone} /> : null}
      <LevelNode row={row} x={xn} zone={zone} onPlay={onPlay} pinLeft={!right} avatar={avatar} />
    </View>
  );
});

/* ═══════════════════════ düğüm ═══════════════════════ */

/** Düğüm kutusu genişliği: rozet yan tarafa sığsın diye geniş. */
const BOX = 150;

function LevelNode({ row, x, zone, onPlay, pinLeft, avatar }: { row: Row; x: number; zone: MapZone; onPlay: (level: number) => void; pinLeft: boolean; avatar: string | null }) {
  const isCurrent = row.state === "current";
  const locked = row.state === "locked";
  const done = row.state === "done";
  const cup = row.level % 10 === 0;
  const size = isCurrent ? NODE_CURRENT : NODE;
  const fill = locked ? M.locked[0] : isCurrent ? M.current[0] : zone.node[1];
  const ring = isCurrent ? M.play : cup && !locked ? M.cup : locked ? M.lockedRing : M.rim;
  const ringW = isCurrent ? 4 : cup ? 3 : 2;
  // Düğüm satırda dikey ortalı; geçilende altına yıldız sırası (satırın içinde kalır).
  const top = ROW / 2 - size / 2 - (done ? 7 : 0);

  return (
    <View pointerEvents="box-none" style={[styles.nodeWrap, { left: x - BOX / 2, top }]}>
      {isCurrent ? <View pointerEvents="none" style={[styles.halo, { width: size + 14, height: size + 14, top: -7, left: BOX / 2 - size / 2 - 7 }]} /> : null}
      <Touchable
        onPress={() => !locked && onPlay(row.level)}
        disabled={locked}
        haptic="selection"
        style={[styles.node, { width: size, height: size, backgroundColor: fill, borderColor: ring, borderWidth: ringW }]}
        accessibilityRole="button"
        accessibilityLabel={`${row.level}. bölüm${cup ? ", süper zor, bölüm sandığı" : row.level % 5 === 0 ? ", zor" : ""}${done ? `, ${row.stars} yıldız` : locked ? ", kilitli" : ", oyna"}`}
      >
        {locked ? (
          <Ionicons name={cup ? "trophy" : "lock-closed"} size={16} color={M.lockedInk} />
        ) : (
          <Text style={[styles.nodeText, isCurrent && styles.nodeTextCurrent]} numberOfLines={1} {...textScale.badge}>
            {row.level}
          </Text>
        )}
      </Touchable>
      {done ? (
        <View pointerEvents="none" style={styles.stars}>
          {[1, 2, 3].map((n) => (
            <StarShape key={n} size={13} lit={n <= row.stars} />
          ))}
        </View>
      ) : null}
      {isCurrent ? (
        <View pointerEvents="none" style={[styles.pin, { top: size / 2 - 16 }, pinLeft ? { right: BOX / 2 + size / 2 + 8 } : { left: BOX / 2 + size / 2 + 8 }]}>
          <View style={styles.pinDot}>
            {avatar ? (
              <Text style={styles.pinText} numberOfLines={1} {...textScale.badge}>{avatar}</Text>
            ) : (
              <Ionicons name="football" size={16} color={M.pinInk} />
            )}
          </View>
          <Text style={styles.pinLabel} {...textScale.badge}>SEN</Text>
        </View>
      ) : null}
    </View>
  );
}

function StarShape({ size, lit }: { size: number; lit: boolean }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? size * 0.21 : size * 0.48;
    pts.push(`${size / 2 + Math.cos(a) * r},${size / 2 + Math.sin(a) * r + 0.5}`);
  }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Polygon points={pts.join(" ")} fill={lit ? M.star : M.starEmpty} strokeLinejoin="round" />
    </Svg>
  );
}

/** Bölüm sandığı — her 10. bölümün yanında, küçük; bölüm geçilince kapak açık. */
function LevelChest({ x, y, open }: { x: number; y: number; open: boolean }) {
  return (
    <G transform={`translate(${x - 15} ${y - 15}) scale(0.7)`} opacity={open ? 1 : 0.85}>
      <Ellipse cx={22} cy={40} rx={16} ry={3} fill={M.shadowSoft} />
      <Rect x={5} y={19} width={34} height={20} rx={3} fill={M.chest} />
      {open ? <Path d="M 5 17 L 10 4 L 39 4 L 39 10 L 10 17 Z" fill={M.chest} /> : <Path d="M 5 20 Q 5 7 22 7 Q 39 7 39 20 Z" fill={M.chest} />}
      <Rect x={19} y={open ? 4 : 7} width={6} height={open ? 13 : 32} fill={M.chestBand} />
      <Rect x={18} y={22} width={8} height={8} rx={2} fill={M.chestBand} />
      <Rect x={20.5} y={24.5} width={3} height={3} rx={1} fill={M.chestDeep} />
    </G>
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
      <Svg width={width} height={GATE} style={StyleSheet.absoluteFill}>
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
  nodeWrap: { position: "absolute", width: BOX, alignItems: "center" },
  node: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  nodeText: { ...type.h2, fontFamily: fonts.bold, color: M.ink },
  nodeTextCurrent: { ...type.display, fontFamily: fonts.bold, color: M.currentInk },
  stars: { flexDirection: "row", gap: 1, marginTop: space.xxs },
  halo: { position: "absolute", borderRadius: radius.pill, backgroundColor: M.halo },
  pin: { position: "absolute", alignItems: "center", gap: 1 },
  pinDot: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: M.avatar, borderWidth: 2, borderColor: M.white },
  pinText: { ...type.labelXs, fontFamily: fonts.bold, color: M.white },
  pinLabel: { ...type.micro, fontFamily: fonts.bold, color: M.white, paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: M.pinTag, overflow: "hidden" },
  banner: { position: "absolute", top: ROW + 8, left: 0, right: 0, alignItems: "center" },
  bannerBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  bannerText: { ...type.labelSm, fontFamily: fonts.bold, color: M.ink, letterSpacing: 0.8 },
  bannerSub: { ...type.micro, color: M.ink, opacity: 0.8 },
  gate: { height: GATE },
  gateLabel: { position: "absolute", top: 6, width: 120, alignItems: "center" },
  gateText: { ...type.micro, fontFamily: fonts.bold, color: M.black, letterSpacing: 1.5 },
});
