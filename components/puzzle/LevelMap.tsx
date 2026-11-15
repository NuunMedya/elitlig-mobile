/**
 * LİG YOLU HARİTASI — futbol dünyasında aşağıdan yukarı kıvrılan resimli yol.
 *
 * NE: her satır bir bölüm. Yol düğümden düğüme S kıvrımlarla akar; her 20
 * bölümde MEKÂN değişir (lib/puzzle/mapPalette): Mahalle Parkı'nın toprak
 * patikası, Sokak Sahası'nın asfaltı, Sahil'in iskelesi, Antrenman
 * Tesisi'nin koşu pisti, Kasaba Stadı'nın taş yolu, Stadyum Bölgesi'nin
 * meydanı … Altın Lig'in kırmızı halısı. İlk altı mekânın sırası oyuna göre
 * döner (`game`): her oyunun evi farklı bir dünyada başlar.
 *
 * 2026-11 v3 (v2 "sade" düz daireler ve şerit zemin çirkin bulundu):
 *   · Zemin: ana renk + yumuşak lekeler + çim tutamları (eğitim tesisinde
 *     biçilmiş saha şeritleri). Yol mekâna göre çizilir (kenar, dolgu, iç
 *     ışık, desen). Geçilen kısmın orta çizgisi ışıklı.
 *   · Dekor: satır başına 0–2 özenli parça (ağaç, bank, fener, gölet, ev,
 *     koni, merdiven, baraj mankenleri, top filesi, mini kale, tribün,
 *     projektör, skor tabelası, şemsiye, tekne, kupa …), yolun BOŞ yanında,
 *     üst satırın düğümünden de uzakta. Parçalar üst satıra taşabilir
 *     (aşağıdaki satır üstte çizilir: doğal derinlik).
 *   · Düğümler katmanlı: koyu kontur, beyaz halka, gradyan gövde, ışık
 *     lekesi; geçilende üstte üç yıldız yayı. Sıradaki büyük ve YEŞİL
 *     (OYNA), arkasında ışıma, üstünde süzülen "SEN" iğnesi. Kilitli soluk
 *     arduvaz + kilit. Her 5. turuncu halka (zor), her 10. KUPA düğümü
 *     (kırmızı gövde, altın halka, kupa, altında numara kurdelesi).
 *   · Düğümler `side` kadar kenardan uzak durur: ana sayfanın yan rafları
 *     yolun üstüne binmez.
 *
 * NEDEN TERS FLATLIST: yol aşağıdan yukarı okunur (bölüm 1 en altta) ve
 * açılışta oyuncunun bulunduğu yere kaydırılır; sabit satır yüksekliği
 * (getItemLayout) 300+ bölümde de akıcı tutar. Her satır yolun kendi
 * parçasını çizer (alt komşuyla orta noktada, dikey teğetle birleşir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions, type CellRendererProps } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { starPoints, useGid } from "@/components/gamehome/GameArt";
import { Bob } from "@/components/gamehome/GameMotion";
import { Touchable } from "@/components/ui";
import { MAP_COMMON as M, zoneOf, type MapDecor, type MapZone } from "@/lib/puzzle/mapPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const ROW = 108;
const NODE = 54;
const NODE_CURRENT = 68;
const NODE_BOSS = 64;
const ROAD = 34;
/** Bölge başlangıcındaki satırın altına eklenen pankart şeridi. */
const BANNER = 58;
/** Dekorun üst satıra taşabildiği yükseklik. */
const OVER = 76;
const rowHeight = (level: number) => ((level - 1) % 20 === 0 ? ROW + BANNER : ROW);
/** index (0 = 1. bölüm) satırının listedeki ofseti: her 20 satırda bir pankart şeridi. */
const rowOffset = (index: number) => ROW * index + BANNER * Math.floor((index + 19) / 20);
/** Başlangıç kapısının yüksekliği (listenin en altı). */
const GATE = 128;
/** Haritada açık bölümün ötesinde gösterilen kilitli bölüm sayısı. */
const AHEAD = 25;

/** Lig basamakları — her 20 bölüm bir basamak. */
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

interface Geo {
  w: number;
  /** Düğüm merkezinin kenardan en az uzaklığı. */
  amp: number;
}

export function LevelMap({
  cleared,
  stars,
  onPlay,
  header,
  contentTop = 0,
  contentBottom = 0,
  avatar,
  game,
  side = 0,
}: {
  /** Geçilmiş son bölüm. */
  cleared: number;
  stars: Record<string, number>;
  onPlay: (level: number) => void;
  /** Eski imza (kullanılmıyor): düğüm rengi mekândan gelir. */
  tone?: string;
  header?: React.ReactElement | null;
  /** Üst şeridin altında kalan boşluk (harita şeridin altından kayar). */
  contentTop?: number;
  /** Alt şeridin (büyük OYNA düğmesi) kapladığı boşluk. */
  contentBottom?: number;
  /** Bulunduğun bölümün iğnesindeki baş harfler (yoksa top ikonu). */
  avatar?: string | null;
  /** Oyun anahtarı: mekân sırası oyuna göre döner. */
  game?: string | null;
  /** Yan rafların kapladığı genişlik (düğümler bunun içine girmez). */
  side?: number;
}) {
  const { width, height } = useWindowDimensions();
  const current = cleared + 1;
  const geo = useMemo<Geo>(() => ({ w: width, amp: Math.max(26, Math.min(width * 0.24, width / 2 - side - NODE_CURRENT / 2 - 2)) }), [side, width]);
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
    ({ item }: { item: Row }) => <LevelRow row={item} geo={geo} game={game ?? null} side={side} onPlay={onPlay} avatar={item.state === "current" ? avatarRef.current : null} />,
    [game, geo, onPlay, side]
  );
  // Bulunduğun bölüme yumuşak kaydırma: düğüm iki şerit arasındaki boş alanın ortasına gelir.
  useEffect(() => {
    const id = setTimeout(() => {
      const free = Math.max(ROW, height - contentTop - contentBottom);
      const offset = rowOffset(current - 1) + GATE + rowHeight(current) - ROW / 2 - free * 0.42;
      listRef.current?.scrollToOffset({ offset: Math.max(0, offset), animated: true });
    }, 350);
    return () => clearTimeout(id);
  }, [contentBottom, contentTop, current, height]);
  const zone = zoneOf(current, game);

  return (
    <FlatList
      ref={listRef}
      data={data}
      inverted
      keyExtractor={(item) => String(item.level)}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: rowHeight(index + 1), offset: rowOffset(index), index })}
      // Alt satır üsttekinin üstünde çizilsin: dekor, yıldızlar ve "SEN" iğnesi yukarı taşar.
      CellRendererComponent={RowCell}
      initialScrollIndex={Math.max(0, current - 3)}
      initialNumToRender={12}
      removeClippedSubviews={false}
      windowSize={7}
      style={{ backgroundColor: zone.ground[0] }}
      contentContainerStyle={{ paddingTop: contentBottom, paddingBottom: contentTop }}
      onScrollToIndexFailed={() => undefined}
      ListHeaderComponent={<StartGate geo={geo} game={game ?? null} />}
      ListFooterComponent={header ?? <MapFog width={width} zone={zoneOf(current + AHEAD, game)} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

/** Alt satırın hücresi üsttekinin üstünde çizilsin (taşan dekor ve iğne). */
function RowCell({ index, style, children, onLayout }: CellRendererProps<Row>) {
  return (
    <View style={[style, { zIndex: 100000 - index }]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/* ═══════════════════════ geometri ═══════════════════════ */

const nodeX = (level: number, g: Geo) => g.w / 2 + Math.sin(level * 0.9) * g.amp;

/** Satırdaki yol parçası: alt orta nokta → düğüm → üst orta nokta (dikey teğetli S). */
function roadPaths(level: number, g: Geo) {
  const h = rowHeight(level);
  const xn = nodeX(level, g);
  const xb = level === 1 ? xn : (nodeX(level - 1, g) + xn) / 2;
  const xa = (xn + nodeX(level + 1, g)) / 2;
  const m = (h + ROW * 0.5) / 2;
  const lower = `M ${xb} ${h} C ${xb} ${m}, ${xn} ${m}, ${xn} ${ROW * 0.5}`;
  const upper = `M ${xn} ${ROW * 0.5} C ${xn} ${ROW * 0.25}, ${xa} ${ROW * 0.25}, ${xa} 0`;
  return { h, xn, xa, xb, lower, upper, full: `${lower} C ${xn} ${ROW * 0.25}, ${xa} ${ROW * 0.25}, ${xa} 0` };
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

/** Dekorun yarı genişliği (ölçek 1): yerleşimde çarpışmayı önler. */
const HALF: Record<MapDecor, number> = {
  tree: 22, pine: 18, palm: 22, bush: 20, flowers: 18, bench: 20, lamp: 10, pond: 34, house: 26, fence: 26,
  cones: 24, ladder: 26, dummies: 26, ballbag: 14, goal: 28, stand: 34, flood: 14, board: 26, flag: 14,
  trophy: 14, rock: 16, umbrella: 20, boat: 26, sparkle: 12, kiosk: 22,
};

/** Büyük yapılar (rafların altına konmaz) ve yerlerine geçen küçük parçalar. */
const BIG = new Set<MapDecor>(["stand", "house", "pond", "board", "kiosk", "goal", "boat", "dummies", "fence", "ladder", "bench"]);
const SMALL: MapDecor[] = ["bush", "flowers", "rock", "cones", "flag"];
/** Ayna çevrilmeyen parçalar (yazı, ışık yönü). */
const NO_FLIP = new Set<MapDecor>(["board", "house", "kiosk", "lamp", "flood"]);

/* ═══════════════════════ satır ═══════════════════════ */

const LevelRow = React.memo(function LevelRow({ row, geo, game, side, onPlay, avatar }: { row: Row; geo: Geo; game: string | null; side: number; onPlay: (level: number) => void; avatar: string | null }) {
  const zone = zoneOf(row.level, game);
  const { h, xn, xa, xb, lower, upper, full } = roadPaths(row.level, geo);
  const w = geo.w;
  const lowerDone = row.state !== "locked";
  const upperDone = row.state === "done";
  const tierStart = (row.level - 1) % 20 === 0;
  const prevZone = tierStart && row.level > 1 ? zoneOf(row.level - 1, game) : null;
  const striped = zone.key === "training";
  const base = striped && row.level % 2 ? zone.ground[2] : zone.ground[0];

  const scene = useMemo(() => {
    const r = rand(row.level * 977 + 13);
    // Zemin lekeleri ve tutamlar.
    const patches = Array.from({ length: 2 }, (_, i) => ({ x: r() * w, y: 18 + r() * (h - 36), rx: 26 + r() * 40, ry: 9 + r() * 10, light: i === 0 }));
    const tufts = Array.from({ length: 10 }, () => ({ x: r() * w, y: 8 + r() * (h - 12), s: 0.7 + r() * 0.6 }));
    // Küçük çiçek kümeleri (yoldan uzak).
    const dots = Array.from({ length: 2 }, () => ({ x: r() * w, y: 14 + r() * (h - 24) })).filter((d) => Math.abs(d.x - xn) > 50 && Math.abs(d.x - xa) > 40);
    // Dekor: yolun ve üst satır düğümünün uzağında, boş yanlarda.
    const xs = [xn, xa, xb, nodeX(row.level + 1, geo)];
    const lo = Math.min(...xs) - 50;
    const hi = Math.max(...xs) + 50;
    const regions = [
      { a: 4, b: lo },
      { a: hi, b: w - 4 },
    ].filter((reg) => reg.b - reg.a > 30);
    const count = r() < 0.12 ? 0 : r() < 0.55 ? 1 : 2;
    const items: { kind: MapDecor; x: number; y: number; s: number; flip: boolean }[] = [];
    for (let i = 0; i < count && regions.length; i += 1) {
      const reg = regions[(i + Math.floor(r() * 2)) % regions.length];
      let kind = zone.decor[Math.floor(r() * zone.decor.length)];
      const s = 0.82 + r() * 0.26;
      let half = HALF[kind] * s;
      if (reg.b - reg.a < half * 2) continue;
      const x = reg.a + half + r() * (reg.b - reg.a - half * 2);
      // Yan rafların altına yalnız küçük parçalar (büyük yapı düğmelerin arkasında karışıyordu).
      if (BIG.has(kind) && (x - half < side || x + half > w - side)) {
        kind = SMALL[Math.floor(r() * SMALL.length)];
        half = HALF[kind] * s;
      }
      if (items.some((it) => Math.abs(it.x - x) < (HALF[it.kind] * it.s + half) * 0.9)) continue;
      items.push({ kind, x, y: (tierStart ? ROW : h) * (0.5 + r() * 0.42), s, flip: !NO_FLIP.has(kind) && r() < 0.5 });
    }
    items.sort((p, q) => p.y - q.y);
    return { patches, tufts, dots, items };
  }, [geo, h, row.level, side, tierStart, w, xa, xb, xn, zone]);

  return (
    <View style={[styles.row, { height: h }]}>
      <Svg width={w} height={h + OVER} style={[styles.rowSvg, { top: -OVER }]} pointerEvents="none">
        <G transform={`translate(0 ${OVER})`}>
          <Rect x={0} y={0} width={w} height={h} fill={base} />
          {scene.patches.map((p, i) => (
            <Ellipse key={`p${i}`} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={p.light ? zone.ground[1] : zone.ground[2]} opacity={0.75} />
          ))}
          {scene.tufts.map((t, i) =>
            zone.texture === "tiles" ? (
              <Rect key={`t${i}`} x={t.x - 9 * t.s} y={t.y - 5 * t.s} width={18 * t.s} height={10 * t.s} rx={2} fill="none" stroke={zone.tuft} strokeWidth={1.2} opacity={0.55} />
            ) : zone.texture === "sand" ? (
              <Path key={`t${i}`} d={`M ${t.x - 8 * t.s} ${t.y} Q ${t.x - 4 * t.s} ${t.y - 3 * t.s} ${t.x} ${t.y} T ${t.x + 8 * t.s} ${t.y}`} stroke={zone.tuft} strokeWidth={1.4} fill="none" opacity={0.6} />
            ) : (
              <Path key={`t${i}`} d={`M ${t.x - 4 * t.s} ${t.y} L ${t.x - 1.5 * t.s} ${t.y - 6 * t.s} L ${t.x} ${t.y - 1} L ${t.x + 1.5 * t.s} ${t.y - 7 * t.s} L ${t.x + 4 * t.s} ${t.y}`} stroke={zone.tuft} strokeWidth={1.6} fill="none" strokeLinejoin="round" opacity={0.7} />
            )
          )}
          {scene.dots.map((d, i) =>
            zone.texture === "tiles" || zone.night ? null : (
              <G key={`f${i}`}>
                {[0, 1, 2].map((k) => (
                  <Circle key={k} cx={d.x + (k - 1) * 5} cy={d.y + (k === 1 ? -3 : 0)} r={2.1} fill={k === 1 ? zone.accent2 : zone.accent} opacity={0.9} />
                ))}
              </G>
            )
          )}
          {prevZone ? <Path d={`M 0 ${h - 10} Q ${w * 0.25} ${h - 22} ${w * 0.5} ${h - 12} T ${w} ${h - 14} L ${w} ${h} L 0 ${h} Z`} fill={prevZone.ground[0]} /> : null}
          <Road zone={zone} full={full} lower={lower} upper={upper} lowerDone={lowerDone} upperDone={upperDone} />
          {scene.items.map((it, i) => (
            <Decor key={`d${i}`} kind={it.kind} x={it.x} y={it.y} s={it.s} flip={it.flip} zone={zone} />
          ))}
        </G>
      </Svg>
      {tierStart ? <TierBanner level={row.level} zone={zone} width={w} side={side} /> : null}
      <LevelNode row={row} x={xn} zone={zone} onPlay={onPlay} avatar={avatar} />
    </View>
  );
});

/* ═══════════════════════ yol ═══════════════════════ */

function Road({ zone, full, lower, upper, lowerDone, upperDone }: { zone: MapZone; full: string; lower: string; upper: string; lowerDone: boolean; upperDone: boolean }) {
  const s = zone.roadStyle;
  const line = (d: string, done: boolean) => (
    <Path
      d={d}
      stroke={done ? zone.roadDone : zone.roadLine}
      strokeWidth={done ? 5 : 3}
      strokeDasharray={done ? undefined : s === "asphalt" ? "10 9" : "4 10"}
      fill="none"
      strokeLinecap="round"
      opacity={done ? 0.95 : 0.6}
    />
  );
  return (
    <G>
      {/* gölge + kenar */}
      <Path d={full} stroke={M.shadowSoft} strokeWidth={ROAD + 12} fill="none" transform="translate(0 4)" />
      {s === "glow" ? <Path d={full} stroke={zone.roadLine} strokeWidth={ROAD + 18} fill="none" opacity={0.18} /> : null}
      <Path d={full} stroke={zone.roadEdge} strokeWidth={ROAD + 7} fill="none" />
      <Path d={full} stroke={zone.road} strokeWidth={ROAD} fill="none" />
      {s === "dirt" ? <Path d={full} stroke={zone.roadLight} strokeWidth={ROAD - 14} fill="none" opacity={0.8} /> : null}
      {s === "track" ? (
        <>
          <Path d={full} stroke={zone.roadLight} strokeWidth={ROAD - 8} fill="none" />
          <Path d={full} stroke={zone.road} strokeWidth={ROAD - 11} fill="none" />
        </>
      ) : null}
      {s === "boardwalk" ? <Path d={full} stroke={zone.roadLine} strokeWidth={ROAD - 2} strokeDasharray="2.5 9" fill="none" opacity={0.75} /> : null}
      {s === "stone" || s === "plaza" ? <Path d={full} stroke={zone.roadLine} strokeWidth={ROAD - 4} strokeDasharray="1.5 12" fill="none" opacity={0.8} /> : null}
      {s === "carpet" ? <Path d={full} stroke={zone.roadLine} strokeWidth={ROAD - 6} fill="none" opacity={0.9} /> : null}
      {s === "carpet" ? <Path d={full} stroke={zone.road} strokeWidth={ROAD - 10} fill="none" /> : null}
      {s === "asphalt" || s === "glow" ? <Path d={full} stroke={zone.roadLight} strokeWidth={ROAD - 18} fill="none" opacity={0.35} /> : null}
      {s === "track" || s === "boardwalk" ? null : (
        <>
          {line(lower, lowerDone)}
          {line(upper, upperDone)}
        </>
      )}
      {s === "track" || s === "boardwalk" ? (
        <>
          {lowerDone ? <Path d={lower} stroke={zone.roadDone} strokeWidth={5} fill="none" strokeLinecap="round" /> : null}
          {upperDone ? <Path d={upper} stroke={zone.roadDone} strokeWidth={5} fill="none" strokeLinecap="round" /> : null}
        </>
      ) : null}
    </G>
  );
}

/* ═══════════════════════ düğüm ═══════════════════════ */

/** Düğüm kutusu genişliği. */
const BOX = 120;

function LevelNode({ row, x, zone, onPlay, avatar }: { row: Row; x: number; zone: MapZone; onPlay: (level: number) => void; avatar: string | null }) {
  const isCurrent = row.state === "current";
  const locked = row.state === "locked";
  const done = row.state === "done";
  const boss = row.level % 10 === 0;
  const hard = !boss && row.level % 5 === 0;
  const size = isCurrent ? NODE_CURRENT : boss ? NODE_BOSS : NODE;
  const top = ROW / 2 - size / 2;

  return (
    <View pointerEvents="box-none" style={[styles.nodeWrap, { left: x - BOX / 2, top: top - 26, height: size + 52 }]}>
      {isCurrent ? <Halo size={size} /> : null}
      <Touchable
        onPress={() => !locked && onPlay(row.level)}
        disabled={locked}
        haptic="selection"
        feedback="icon"
        style={[styles.node, { width: size, height: size + 6, marginTop: 26 }]}
        accessibilityRole="button"
        accessibilityLabel={`${row.level}. bölüm${boss ? ", süper zor, kupa bölümü" : hard ? ", zor" : ""}${done ? `, ${row.stars} yıldız` : locked ? ", kilitli" : ", oyna"}`}
      >
        <NodeArt size={size} state={row.state} boss={boss} hard={hard} zone={zone} />
        {boss ? (
          <View style={styles.bossIcon} pointerEvents="none">
            <Ionicons name="trophy" size={size * 0.36} color={locked ? M.lockedInk : M.cup} />
          </View>
        ) : locked ? (
          <View style={styles.nodeCenter} pointerEvents="none">
            <Ionicons name="lock-closed" size={18} color={M.lockedInk} />
          </View>
        ) : (
          <View style={styles.nodeCenter} pointerEvents="none">
            <Text style={[styles.nodeText, isCurrent && styles.nodeTextCurrent]} numberOfLines={1} {...textScale.badge}>
              {row.level}
            </Text>
          </View>
        )}
      </Touchable>
      {boss ? (
        <View pointerEvents="none" style={[styles.bossRibbon, { top: 26 + size - 8 }, locked && styles.bossRibbonLocked]}>
          <Text style={styles.bossRibbonText} {...textScale.badge}>{row.level}</Text>
        </View>
      ) : null}
      {done ? (
        <View pointerEvents="none" style={[styles.stars, { top: 26 - 14 }]}>
          <StarArc lit={row.stars} />
        </View>
      ) : null}
      {hard && !locked ? (
        <View pointerEvents="none" style={[styles.flame, { top: 26 - 2, left: BOX / 2 + size / 2 - 14 }]}>
          <Ionicons name="flame" size={11} color={M.white} />
        </View>
      ) : null}
      {isCurrent ? <AvatarPin avatar={avatar} /> : null}
    </View>
  );
}

/** Katmanlı düğüm çizimi: gölge · kontur · halka · gradyan gövde · ışık. */
const NodeArt = React.memo(function NodeArt({ size, state, boss, hard, zone }: { size: number; state: Row["state"]; boss: boolean; hard: boolean; zone: MapZone }) {
  const g = useGid("node");
  const c = size / 2;
  const locked = state === "locked";
  const current = state === "current";
  const stops = locked ? M.locked : current ? M.current : boss ? M.boss : zone.node;
  const edge = locked ? M.lockedEdge : current ? M.currentEdge : boss ? M.bossEdge : zone.nodeEdge;
  const ring = boss && !locked ? M.cup : hard && !locked ? M.hardRim : locked ? M.locked[0] : M.rim;
  return (
    <Svg width={size} height={size + 6}>
      <Defs>
        <SvgGradient id={`${g}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="0.5" stopColor={stops[1]} />
          <Stop offset="1" stopColor={stops[2]} />
        </SvgGradient>
      </Defs>
      <Ellipse cx={c} cy={size + 1} rx={c * 0.8} ry={4} fill={M.shadow} />
      <Circle cx={c} cy={c + 2} r={c - 0.5} fill={edge} />
      <Circle cx={c} cy={c} r={c - 1.5} fill={edge} />
      <Circle cx={c} cy={c} r={c - 3.5} fill={ring} />
      <Circle cx={c} cy={c} r={c - (boss ? 8 : 7)} fill={`url(#${g}b)`} stroke={edge} strokeWidth={1.2} />
      <Ellipse cx={c - c * 0.22} cy={c - c * 0.4} rx={c * 0.38} ry={c * 0.18} fill={M.white} opacity={locked ? 0.25 : 0.45} />
    </Svg>
  );
});

/** Sıradaki düğümün arkasındaki ışıma. */
function Halo({ size }: { size: number }) {
  const g = useGid("halo");
  const d = size * 1.9;
  return (
    <View pointerEvents="none" style={[styles.halo, { width: d, height: d, top: 26 + size / 2 - d / 2, left: BOX / 2 - d / 2 }]}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id={g} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.35" stopColor={M.halo} />
            <Stop offset="1" stopColor={M.haloClear} />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={`url(#${g})`} />
      </Svg>
    </View>
  );
}

/** Üç yıldız yayı (ortadaki büyük). */
const StarArc = React.memo(function StarArc({ lit }: { lit: number }) {
  const pts = [
    { x: 12, y: 15, r: 8.5 },
    { x: 32, y: 11, r: 10.5 },
    { x: 52, y: 15, r: 8.5 },
  ];
  return (
    <Svg width={64} height={28}>
      {pts.map((p, i) => {
        const on = i < lit;
        return (
          <G key={i}>
            <Polygon points={starPoints(p.x, p.y + 1.5, p.r, 0.5)} fill={M.shadowSoft} />
            <Polygon points={starPoints(p.x, p.y, p.r, 0.5)} fill={on ? M.star : M.starEmpty} stroke={on ? M.starEdge : M.starEmptyEdge} strokeWidth={1.8} strokeLinejoin="round" />
            {on ? <Polygon points={starPoints(p.x - 1, p.y - 1.5, p.r * 0.38, 0.5)} fill={M.white} opacity={0.7} /> : null}
          </G>
        );
      })}
    </Svg>
  );
});

/** "SEN" iğnesi: düğümün ÜSTÜNDE süzülür (yan rafa ve komşu düğüme çarpmaz). */
function AvatarPin({ avatar }: { avatar: string | null }) {
  const g = useGid("pin");
  return (
    <View pointerEvents="none" style={styles.pinWrap}>
      <Bob amount={4}>
        <View style={styles.pin}>
          <Svg width={46} height={56} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id={g} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={M.avatar[0]} />
                <Stop offset="1" stopColor={M.avatar[1]} />
              </SvgGradient>
            </Defs>
            <Path d="M 23 54 L 13 38 A 20 20 0 1 1 33 38 Z" fill={M.avatarEdge} />
            <Circle cx={23} cy={22} r={18.5} fill={M.white} />
            <Circle cx={23} cy={22} r={15.5} fill={`url(#${g})`} />
            <Ellipse cx={18} cy={14} rx={7} ry={3.5} fill={M.white} opacity={0.35} />
          </Svg>
          <View style={styles.pinFace}>
            {avatar ? (
              <Text style={styles.pinText} numberOfLines={1} {...textScale.badge}>{avatar}</Text>
            ) : (
              <Ionicons name="football" size={18} color={M.white} />
            )}
          </View>
        </View>
      </Bob>
    </View>
  );
}

/* ═══════════════════════ pankart, kapı, sis ═══════════════════════ */

function TierBanner({ level, zone, width, side }: { level: number; zone: MapZone; width: number; side: number }) {
  const g = useGid("ban");
  const bw = Math.min(280, width - side * 2 - 8);
  const bh = 42;
  const tail = 14;
  return (
    <View pointerEvents="none" style={[styles.banner, { top: ROW + (BANNER - bh) / 2 - 6 }]}>
      <View style={{ width: bw + tail * 2, height: bh + 8 }}>
        <Svg width={bw + tail * 2} height={bh + 8} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id={g} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={zone.banner[0]} />
              <Stop offset="1" stopColor={zone.banner[1]} />
            </SvgGradient>
          </Defs>
          {/* katlanmış uçlar */}
          <Path d={`M 0 12 L ${tail + 6} 12 L ${tail + 6} ${bh + 6} L 0 ${bh + 6} L 7 ${(bh + 18) / 2} Z`} fill={zone.banner[1]} stroke={M.outline} strokeWidth={2} strokeLinejoin="round" />
          <Path d={`M ${bw + tail * 2} 12 L ${bw + tail - 6} 12 L ${bw + tail - 6} ${bh + 6} L ${bw + tail * 2} ${bh + 6} L ${bw + tail * 2 - 7} ${(bh + 18) / 2} Z`} fill={zone.banner[1]} stroke={M.outline} strokeWidth={2} strokeLinejoin="round" />
          <Rect x={tail} y={2} width={bw} height={bh} rx={10} fill={`url(#${g})`} stroke={M.outline} strokeWidth={2.4} />
          <Rect x={tail + 4} y={5} width={bw - 8} height={bh * 0.4} rx={7} fill={M.white} opacity={0.18} />
        </Svg>
        <View style={[styles.bannerTexts, { left: tail, width: bw, height: bh + 4 }]}>
          <Text style={styles.bannerText} numberOfLines={1} {...textScale.badge}>
            {tierOf(level).toLocaleUpperCase("tr-TR")}
          </Text>
          <Text style={styles.bannerSub} numberOfLines={1} {...textScale.badge}>
            {zone.place} · {level}–{level + 19}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StartGate({ geo, game }: { geo: Geo; game: string | null }) {
  const zone = zoneOf(1, game);
  const g = useGid("gate");
  const x = nodeX(1, geo);
  const w = geo.w;
  return (
    <View style={[styles.gate, { backgroundColor: zone.ground[0] }]}>
      <Svg width={w} height={GATE} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={`${g}p`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={M.gate[0]} />
            <Stop offset="1" stopColor={M.gate[1]} />
          </SvgGradient>
          <SvgGradient id={`${g}r`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={M.gateRibbon[0]} />
            <Stop offset="1" stopColor={M.gateRibbon[1]} />
          </SvgGradient>
        </Defs>
        <Ellipse cx={w * 0.2} cy={70} rx={50} ry={14} fill={zone.ground[1]} opacity={0.8} />
        <Ellipse cx={w * 0.8} cy={96} rx={60} ry={16} fill={zone.ground[2]} opacity={0.7} />
        <Rect x={x - ROAD / 2 - 3.5} y={0} width={ROAD + 7} height={76} fill={zone.roadEdge} />
        <Rect x={x - ROAD / 2} y={0} width={ROAD} height={76} fill={zone.road} />
        <Ellipse cx={x} cy={80} rx={74} ry={16} fill={zone.roadEdge} />
        <Ellipse cx={x} cy={78} rx={70} ry={14} fill={zone.road} />
        {/* kemer */}
        <Rect x={x - 66} y={20} width={11} height={58} rx={3} fill={`url(#${g}p)`} stroke={M.outline} strokeWidth={2} />
        <Rect x={x + 55} y={20} width={11} height={58} rx={3} fill={`url(#${g}p)`} stroke={M.outline} strokeWidth={2} />
        <Path d={`M ${x - 72} 30 Q ${x} 2 ${x + 72} 30 L ${x + 72} 46 Q ${x} 18 ${x - 72} 46 Z`} fill={`url(#${g}r)`} stroke={M.outline} strokeWidth={2.2} strokeLinejoin="round" />
        <SvgText x={x} y={33} fill={M.white} fontSize={type.micro.fontSize} fontFamily={fonts.bold} textAnchor="middle" letterSpacing={1.5}>
          BAŞLANGIÇ
        </SvgText>
        <Decor kind="flag" x={x - 88} y={78} s={0.9} flip={false} zone={zone} />
        <Decor kind="flag" x={x + 88} y={78} s={0.9} flip zone={zone} />
      </Svg>
    </View>
  );
}

/** Haritanın tepesi: sise karışan bulutlar ("yeni bölümler yakında"). */
function MapFog({ width, zone }: { width: number; zone: MapZone }) {
  const g = useGid("fog");
  const h = ROW * 1.6;
  return (
    <View style={{ height: h, backgroundColor: zone.ground[0] }}>
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={g} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={M.fog[0]} />
            <Stop offset="1" stopColor={M.fog[1]} />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={h} fill={`url(#${g})`} />
        {[0.15, 0.45, 0.8].map((f, i) => (
          <G key={i} transform={`translate(${width * f} ${h * (0.35 + (i % 2) * 0.2)})`}>
            <Ellipse cx={0} cy={0} rx={46} ry={16} fill={M.cloud} />
            <Circle cx={-16} cy={-10} r={16} fill={M.cloud} />
            <Circle cx={12} cy={-14} r={20} fill={M.cloud} />
          </G>
        ))}
      </Svg>
    </View>
  );
}

/* ═══════════════════════ dekor ═══════════════════════ */

/**
 * Dekor parçaları: taban (0,0) yerde, yukarı doğru çizilir. Hepsi koyu
 * konturlu, sol üstten ışık alır, altında yumuşak gölge vardır.
 */
function Decor({ kind, x, y, s, flip, zone }: { kind: MapDecor; x: number; y: number; s: number; flip: boolean; zone: MapZone }) {
  const t = `translate(${x} ${y}) scale(${flip ? -s : s} ${s})`;
  const O = M.outline;
  const shadow = (rx: number) => <Ellipse cx={0} cy={1} rx={rx} ry={rx * 0.22} fill={M.shadow} />;
  switch (kind) {
    case "tree":
      return (
        <G transform={t}>
          {shadow(20)}
          <Path d="M -4 0 L -3 -22 L 3 -22 L 4 0 Z" fill={zone.wood} stroke={O} strokeWidth={1.5} />
          <Circle cx={0} cy={-34} r={18} fill={zone.leaf[2]} stroke={O} strokeWidth={1.8} />
          <Circle cx={-10} cy={-28} r={12} fill={zone.leaf[1]} stroke={O} strokeWidth={1.5} />
          <Circle cx={9} cy={-30} r={12} fill={zone.leaf[1]} stroke={O} strokeWidth={1.5} />
          <Circle cx={-2} cy={-42} r={12} fill={zone.leaf[0]} stroke={O} strokeWidth={1.5} />
          <Ellipse cx={-6} cy={-46} rx={5} ry={3} fill={M.white} opacity={0.35} />
          <Circle cx={8} cy={-36} r={2.2} fill={zone.accent} />
          <Circle cx={-11} cy={-30} r={2} fill={zone.accent} />
        </G>
      );
    case "pine":
      return (
        <G transform={t}>
          {shadow(16)}
          <Rect x={-3} y={-10} width={6} height={10} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          <Polygon points="0,-58 13,-34 -13,-34" fill={zone.leaf[1]} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Polygon points="0,-46 16,-22 -16,-22" fill={zone.leaf[1]} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Polygon points="0,-34 19,-9 -19,-9" fill={zone.leaf[2]} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Polygon points="-2,-52 -8,-38 -2,-40" fill={M.white} opacity={0.35} />
        </G>
      );
    case "palm":
      return (
        <G transform={t}>
          {shadow(18)}
          <Path d="M -3 0 Q -6 -24 4 -46 L 8 -45 Q 0 -24 4 0 Z" fill={zone.wood} stroke={O} strokeWidth={1.5} />
          {[-150, -110, -70, -30, 10].map((a, i) => {
            const r = (a * Math.PI) / 180;
            const ex = 6 + Math.cos(r) * 24;
            const ey = -46 + Math.sin(r) * 14 + (Math.abs(Math.cos(r)) > 0.6 ? 8 : 0);
            return <Path key={i} d={`M 6 -46 Q ${6 + Math.cos(r) * 14} ${-56 + Math.sin(r) * 8} ${ex} ${ey}`} stroke={i % 2 ? zone.leaf[1] : zone.leaf[2]} strokeWidth={7} fill="none" strokeLinecap="round" />;
          })}
          <Circle cx={4} cy={-44} r={3} fill={zone.wood} stroke={O} strokeWidth={1} />
          <Circle cx={9} cy={-43} r={3} fill={zone.wood} stroke={O} strokeWidth={1} />
        </G>
      );
    case "bush":
      return (
        <G transform={t}>
          {shadow(20)}
          <Circle cx={-11} cy={-9} r={10} fill={zone.leaf[2]} stroke={O} strokeWidth={1.5} />
          <Circle cx={10} cy={-9} r={11} fill={zone.leaf[2]} stroke={O} strokeWidth={1.5} />
          <Circle cx={0} cy={-15} r={12} fill={zone.leaf[1]} stroke={O} strokeWidth={1.5} />
          <Ellipse cx={-4} cy={-21} rx={4} ry={2.2} fill={M.white} opacity={0.35} />
          <Circle cx={-7} cy={-12} r={2.4} fill={zone.accent} />
          <Circle cx={6} cy={-17} r={2.4} fill={zone.accent2} />
          <Circle cx={12} cy={-8} r={2.2} fill={zone.accent} />
        </G>
      );
    case "flowers":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={-2} rx={20} ry={6} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          {[-12, -4, 4, 12].map((dx, i) => (
            <G key={i} transform={`translate(${dx} ${-6 - (i % 2) * 4})`}>
              <Line x1={0} y1={0} x2={0} y2={5} stroke={zone.leaf[2]} strokeWidth={2} />
              {[0, 72, 144, 216, 288].map((a) => (
                <Circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3} cy={Math.sin((a * Math.PI) / 180) * 3} r={2.4} fill={i % 2 ? zone.accent : zone.accent2} />
              ))}
              <Circle cx={0} cy={0} r={1.6} fill={M.window} />
            </G>
          ))}
        </G>
      );
    case "bench":
      return (
        <G transform={t}>
          {shadow(20)}
          <Rect x={-17} y={-9} width={3} height={9} fill={M.steelDark} />
          <Rect x={14} y={-9} width={3} height={9} fill={M.steelDark} />
          <Rect x={-20} y={-12} width={40} height={5} rx={1.5} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          <Rect x={-20} y={-24} width={40} height={5} rx={1.5} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          <Rect x={-20} y={-18} width={40} height={4} rx={1.5} fill={zone.wood} stroke={O} strokeWidth={1.2} />
        </G>
      );
    case "lamp":
      return (
        <G transform={t}>
          {shadow(8)}
          {zone.night ? <Circle cx={0} cy={-46} r={26} fill={M.glow} opacity={0.6} /> : <Circle cx={0} cy={-46} r={12} fill={M.glow} opacity={0.5} />}
          <Rect x={-2} y={-42} width={4} height={42} fill={M.steelDark} stroke={O} strokeWidth={1} />
          <Rect x={-5} y={-4} width={10} height={4} rx={1} fill={M.steelDark} />
          <Path d="M -8 -42 L 8 -42 L 5 -52 L -5 -52 Z" fill={M.steelDark} stroke={O} strokeWidth={1.4} />
          <Rect x={-5} y={-50} width={10} height={7} fill={M.window} />
          <Path d="M -7 -52 L 0 -58 L 7 -52 Z" fill={M.steelDark} stroke={O} strokeWidth={1.2} />
        </G>
      );
    case "pond":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={-6} rx={34} ry={12} fill={zone.ground[2]} />
          <Ellipse cx={0} cy={-7} rx={30} ry={10} fill={zone.water[1]} stroke={O} strokeWidth={1.6} />
          <Ellipse cx={-4} cy={-9} rx={22} ry={6} fill={zone.water[0]} />
          <Path d="M -14 -9 Q -8 -12 -2 -9" stroke={M.white} strokeWidth={1.5} fill="none" opacity={0.8} />
          <Path d="M 6 -6 Q 11 -8 16 -6" stroke={M.white} strokeWidth={1.2} fill="none" opacity={0.7} />
          {[-28, -18, 22, 30].map((dx, i) => (
            <Ellipse key={i} cx={dx} cy={-4 + (i % 2) * 2} rx={4} ry={2.6} fill={M.rock[1]} stroke={O} strokeWidth={1} />
          ))}
        </G>
      );
    case "house": {
      const vi = Math.floor(Math.abs(x * 7 + y * 3)) % M.roof.length;
      return (
        <G transform={t}>
          {shadow(26)}
          <Rect x={-20} y={-30} width={40} height={30} fill={M.wall[vi]} stroke={O} strokeWidth={1.8} />
          <Polygon points="-25,-29 0,-50 25,-29" fill={M.roof[vi]} stroke={O} strokeWidth={1.8} strokeLinejoin="round" />
          <Polygon points="-19,-31 0,-46 -2,-40" fill={M.white} opacity={0.3} />
          <Rect x={-5} y={-16} width={10} height={16} rx={1} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          <Rect x={-16} y={-24} width={8} height={8} fill={zone.night ? M.window : M.windowDark} stroke={O} strokeWidth={1.2} />
          <Rect x={8} y={-24} width={8} height={8} fill={M.window} stroke={O} strokeWidth={1.2} />
          <Rect x={10} y={-50} width={5} height={10} fill={M.rock[2]} stroke={O} strokeWidth={1.2} />
        </G>
      );
    }
    case "fence":
      return (
        <G transform={t}>
          {shadow(26)}
          <Rect x={-26} y={-14} width={52} height={3.5} fill={M.white} stroke={O} strokeWidth={1} />
          <Rect x={-26} y={-7} width={52} height={3.5} fill={M.white} stroke={O} strokeWidth={1} />
          {[-24, -14, -4, 6, 16].map((fx) => (
            <Path key={fx} d={`M ${fx} 0 L ${fx} -18 L ${fx + 3} -21 L ${fx + 6} -18 L ${fx + 6} 0 Z`} fill={M.white} stroke={O} strokeWidth={1.2} />
          ))}
        </G>
      );
    case "cones":
      return (
        <G transform={t}>
          {[
            [-16, 0],
            [0, -8],
            [16, 0],
          ].map(([cx, cy], i) => (
            <G key={i} transform={`translate(${cx} ${cy})`}>
              <Ellipse cx={0} cy={1} rx={8} ry={2.2} fill={M.shadow} />
              <Rect x={-7} y={-3} width={14} height={3.5} rx={1} fill={M.cone} stroke={O} strokeWidth={1.2} />
              <Polygon points="0,-17 5.5,-3 -5.5,-3" fill={M.cone} stroke={O} strokeWidth={1.3} strokeLinejoin="round" />
              <Polygon points="-2.8,-10 2.8,-10 3.8,-7 -3.8,-7" fill={M.white} />
            </G>
          ))}
        </G>
      );
    case "ladder":
      return (
        <G transform={t}>
          <Path d="M -26 -2 L 26 -10" stroke={M.cone} strokeWidth={2.4} />
          <Path d="M -24 6 L 28 -2" stroke={M.cone} strokeWidth={2.4} />
          {[-22, -12, -2, 8, 18].map((lx, i) => (
            <Path key={i} d={`M ${lx} ${-2 - i * 1.6} L ${lx + 2} ${6 - i * 1.6}`} stroke={M.window} strokeWidth={2.4} />
          ))}
        </G>
      );
    case "dummies":
      return (
        <G transform={t}>
          {shadow(26)}
          {[-16, 0, 16].map((dx, i) => (
            <G key={i} transform={`translate(${dx} 0)`}>
              <Rect x={-1.5} y={-6} width={3} height={6} fill={M.steelDark} />
              <Path d="M -6 -6 L -6 -26 Q -6 -30 -2 -30 L 2 -30 Q 6 -30 6 -26 L 6 -6 Z" fill={zone.accent} stroke={O} strokeWidth={1.4} />
              <Circle cx={0} cy={-35} r={5} fill={zone.accent} stroke={O} strokeWidth={1.4} />
              <Rect x={-5} y={-22} width={10} height={3} fill={M.white} opacity={0.8} />
            </G>
          ))}
        </G>
      );
    case "ballbag":
      return (
        <G transform={t}>
          {shadow(14)}
          <Path d="M -13 -4 Q -15 -30 0 -32 Q 15 -30 13 -4 Q 0 2 -13 -4 Z" fill={M.net} stroke={O} strokeWidth={1.4} />
          {[
            [-6, -10],
            [6, -10],
            [0, -20],
            [-7, -23],
            [7, -22],
          ].map(([bx, by], i) => (
            <G key={i}>
              <Circle cx={bx} cy={by} r={5} fill={M.white} stroke={O} strokeWidth={1} />
              <Circle cx={bx} cy={by} r={1.8} fill={M.black} />
            </G>
          ))}
          <Path d="M -10 -30 L 0 -38 L 10 -30" stroke={zone.wood} strokeWidth={2} fill="none" />
        </G>
      );
    case "goal":
      return (
        <G transform={t}>
          {shadow(28)}
          <Path d="M -24 0 L -18 -10 L 18 -10 L 24 0" fill={M.shadowSoft} />
          <Rect x={-24} y={-26} width={48} height={26} fill={M.net} opacity={0.35} />
          {[-16, -8, 0, 8, 16].map((gx) => (
            <Line key={gx} x1={gx} y1={-26} x2={gx} y2={0} stroke={M.net} strokeWidth={1} />
          ))}
          {[-18, -10].map((gy) => (
            <Line key={gy} x1={-24} y1={gy} x2={24} y2={gy} stroke={M.net} strokeWidth={1} />
          ))}
          <Path d="M -24 0 L -24 -26 L 24 -26 L 24 0" stroke={O} strokeWidth={5} fill="none" strokeLinejoin="round" />
          <Path d="M -24 0 L -24 -26 L 24 -26 L 24 0" stroke={M.white} strokeWidth={3} fill="none" strokeLinejoin="round" />
          <Circle cx={14} cy={-4} r={4} fill={M.white} stroke={O} strokeWidth={1} />
        </G>
      );
    case "stand":
      return (
        <G transform={t}>
          {shadow(34)}
          <Path d="M -34 0 L -30 -30 L 30 -30 L 34 0 Z" fill={zone.banner[1]} stroke={O} strokeWidth={1.8} strokeLinejoin="round" />
          {[0, 1, 2].map((r) => (
            <Rect key={r} x={-31 + r * 1.3} y={-28 + r * 9} width={62 - r * 2.6} height={6} fill={zone.banner[0]} opacity={0.9} />
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <Circle key={i} cx={-27 + (i % 9) * 6.8} cy={-24 + Math.floor(i / 9) * 9} r={2.2} fill={M.crowd[i % M.crowd.length]} />
          ))}
          <Path d="M -36 -30 L 36 -30 L 32 -38 L -32 -38 Z" fill={zone.accent} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
        </G>
      );
    case "flood":
      return (
        <G transform={t}>
          {shadow(10)}
          {zone.night ? <Path d="M -10 -62 L -40 40 L 30 40 L 10 -62 Z" fill={M.beam} /> : null}
          <Path d="M -4 0 L -2 -56 L 2 -56 L 4 0 Z" fill={M.steel} stroke={O} strokeWidth={1.3} />
          <Path d="M -3 -14 L 3 -24 M 3 -14 L -3 -24 M -3 -30 L 3 -40 M 3 -30 L -3 -40" stroke={M.steelDark} strokeWidth={1} />
          <Rect x={-13} y={-70} width={26} height={16} rx={2} fill={M.steelDark} stroke={O} strokeWidth={1.6} />
          {[0, 1, 2].map((c) =>
            [0, 1].map((r) => <Circle key={`${c}${r}`} cx={-8 + c * 8} cy={-66 + r * 7} r={2.8} fill={M.window} />)
          )}
          {zone.night ? <Circle cx={0} cy={-62} r={20} fill={M.glow} opacity={0.55} /> : null}
        </G>
      );
    case "board":
      return (
        <G transform={t}>
          {shadow(26)}
          <Rect x={-16} y={-14} width={4} height={14} fill={M.steelDark} />
          <Rect x={12} y={-14} width={4} height={14} fill={M.steelDark} />
          <Rect x={-26} y={-40} width={52} height={28} rx={3} fill={M.board} stroke={O} strokeWidth={2} />
          <Rect x={-26} y={-40} width={52} height={7} rx={3} fill={zone.accent} />
          <SvgText x={0} y={-17} fill={M.boardInk} fontSize={type.labelSm.fontSize} fontFamily={fonts.bold} textAnchor="middle">
            2 - 1
          </SvgText>
        </G>
      );
    case "flag":
      return (
        <G transform={t}>
          {shadow(8)}
          <Line x1={0} y1={0} x2={0} y2={-46} stroke={M.steel} strokeWidth={3} />
          <Path d="M 1.5 -46 Q 12 -50 24 -44 Q 14 -38 24 -32 Q 12 -36 1.5 -32 Z" fill={zone.accent} stroke={O} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M 2 -44 Q 10 -47 18 -43" stroke={M.white} strokeWidth={1.5} fill="none" opacity={0.5} />
          <Circle cx={0} cy={-47} r={2.4} fill={M.cup} stroke={O} strokeWidth={0.8} />
        </G>
      );
    case "trophy":
      return (
        <G transform={t}>
          {shadow(14)}
          <Rect x={-12} y={-12} width={24} height={12} rx={2} fill={zone.wood} stroke={O} strokeWidth={1.4} />
          <Rect x={-3} y={-20} width={6} height={9} fill={M.cupDeep} stroke={O} strokeWidth={1} />
          <Path d="M -11 -40 L 11 -40 L 8 -26 Q 0 -18 -8 -26 Z" fill={M.cup} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M -11 -37 Q -18 -36 -14 -29 L -9 -29" stroke={M.cup} strokeWidth={3} fill="none" />
          <Path d="M 11 -37 Q 18 -36 14 -29 L 9 -29" stroke={M.cup} strokeWidth={3} fill="none" />
          <Ellipse cx={-4} cy={-34} rx={2.4} ry={4} fill={M.white} opacity={0.6} />
          {zone.night ? <Circle cx={0} cy={-32} r={18} fill={M.glow} opacity={0.4} /> : null}
        </G>
      );
    case "rock":
      return (
        <G transform={t}>
          {shadow(16)}
          <Path d="M -15 0 L -11 -12 L 0 -17 L 12 -10 L 15 0 Z" fill={M.rock[1]} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M -11 -12 L 0 -17 L 4 -8 L -6 -6 Z" fill={M.rock[0]} />
          <Path d="M 4 -8 L 12 -10 L 15 0 L 6 0 Z" fill={M.rock[2]} />
        </G>
      );
    case "umbrella":
      return (
        <G transform={t}>
          <Ellipse cx={4} cy={0} rx={18} ry={4} fill={M.shadow} />
          <Line x1={0} y1={0} x2={0} y2={-38} stroke={zone.wood} strokeWidth={2.5} />
          <Path d="M -20 -32 Q 0 -54 20 -32 Z" fill={M.umbrella[0]} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M -7 -34 Q 0 -52 7 -34 Z" fill={M.umbrella[1]} />
          <Path d="M -20 -32 Q -14 -36 -7 -34 M 7 -34 Q 14 -36 20 -32" stroke={O} strokeWidth={1.2} fill="none" />
          <Rect x={-14} y={-6} width={22} height={5} rx={2} fill={zone.accent2} stroke={O} strokeWidth={1.2} />
        </G>
      );
    case "boat":
      return (
        <G transform={t}>
          <Ellipse cx={0} cy={-3} rx={30} ry={8} fill={zone.water[1]} />
          <Ellipse cx={-3} cy={-4} rx={20} ry={4} fill={zone.water[0]} />
          <Path d="M -20 -10 L 20 -10 L 14 -2 L -14 -2 Z" fill={M.hull} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Line x1={0} y1={-10} x2={0} y2={-42} stroke={zone.wood} strokeWidth={2} />
          <Path d="M 2 -40 L 18 -13 L 2 -13 Z" fill={M.sail} stroke={O} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M -2 -36 L -14 -13 L -2 -13 Z" fill={zone.accent} stroke={O} strokeWidth={1.4} strokeLinejoin="round" />
        </G>
      );
    case "sparkle":
      return (
        <G transform={t}>
          <Circle cx={0} cy={-16} r={14} fill={M.glow} opacity={0.4} />
          <Path d="M 0 -30 Q 2 -18 12 -16 Q 2 -14 0 -2 Q -2 -14 -12 -16 Q -2 -18 0 -30 Z" fill={M.cup} stroke={O} strokeWidth={1} />
          <Circle cx={14} cy={-30} r={2} fill={M.white} />
          <Circle cx={-12} cy={-4} r={1.6} fill={M.white} />
        </G>
      );
    case "kiosk":
      return (
        <G transform={t}>
          {shadow(22)}
          <Rect x={-18} y={-26} width={36} height={26} fill={M.wall[0]} stroke={O} strokeWidth={1.6} />
          <Rect x={-12} y={-20} width={24} height={10} fill={zone.night ? M.window : M.windowDark} stroke={O} strokeWidth={1.2} />
          <Path d="M -22 -26 L 22 -26 L 18 -36 L -18 -36 Z" fill={zone.accent} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          {[-14, -6, 2, 10].map((sx) => (
            <Rect key={sx} x={sx} y={-36} width={4} height={10} fill={M.white} opacity={0.75} />
          ))}
          <Rect x={-16} y={-8} width={32} height={3} fill={zone.wood} />
        </G>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  row: { height: ROW, overflow: "visible" },
  rowSvg: { position: "absolute", left: 0 },
  nodeWrap: { position: "absolute", width: BOX, alignItems: "center" },
  node: { alignItems: "center" },
  nodeCenter: { position: "absolute", left: 0, right: 0, top: 0, bottom: 6, alignItems: "center", justifyContent: "center" },
  bossIcon: { position: "absolute", left: 0, right: 0, top: 0, bottom: 8, alignItems: "center", justifyContent: "center" },
  nodeText: { ...type.h1, fontFamily: fonts.bold, color: M.ink, textShadowColor: M.inkShadow, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1.5 },
  nodeTextCurrent: { ...type.scoreMd, color: M.currentInk, textShadowColor: M.currentEdge, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  stars: { position: "absolute", alignItems: "center" },
  halo: { position: "absolute" },
  flame: { position: "absolute", width: 18, height: 18, borderRadius: radius.pill, backgroundColor: M.hardRim, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: M.white },
  bossRibbon: { position: "absolute", minWidth: 40, paddingHorizontal: space.sm, height: 20, borderRadius: radius.pill, backgroundColor: M.boss[2], borderWidth: 2, borderColor: M.cup, alignItems: "center", justifyContent: "center" },
  bossRibbonLocked: { backgroundColor: M.locked[2], borderColor: M.locked[0] },
  bossRibbonText: { ...type.numSmStrong, color: M.white },
  pinWrap: { position: "absolute", top: -27, left: BOX / 2 - 23 },
  pin: { width: 46, height: 56 },
  pinFace: { position: "absolute", top: 7, left: 8, width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  pinText: { ...type.labelSm, fontFamily: fonts.bold, color: M.white },
  banner: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bannerTexts: { position: "absolute", top: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  bannerText: { ...type.labelSm, fontFamily: fonts.bold, color: M.bannerInk, letterSpacing: 0.8, textShadowColor: M.inkShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  bannerSub: { ...type.meta, color: M.bannerInk, opacity: 0.92 },
  gate: { height: GATE },
});
