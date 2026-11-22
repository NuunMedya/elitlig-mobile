/**
 * GÜNLÜK ÖDÜLLER — Günlük Çark, Sandık Seç, Günün Penaltısı, Yıldız Sandığı.
 *
 * Bütün sonuçlar SUNUCUDA belirlenir (POST /api/puzzle/rewards/*, reklamla ek
 * hak: /ad/start {spin|chest} → /ad/claim). İstemci yalnız gösterir:
 *   · Çark sunucunun döndürdüğü dilimde (index) TAM durur: hedef açı dilimin
 *     ortasından hesaplanır, ±%30 dilim içi sapma yalnız görünüştür.
 *   · Sandık Seç: üç kapalı sandık; seçilen açılır, öbür ikisinin içi de
 *     gösterilir (sunucu `options`).
 *   · Günün Penaltısı: köşe seç, güç çubuğunu doğru anda durdur (dokunma
 *     zamanlaması). Kalecinin yönünü sunucu zarla belirler; sonuç animasyonu
 *     sunucunun yanıtından çizilir.
 *   · Yıldız sandığı: bölüm yıldızlarıyla dolar (sunucu bölüm sonunda açar);
 *     açıldığını ana sayfa fark eder ve sandık açılış animasyonunu oynatır.
 *
 * Bu dosya ayrıca Oyun Merkezi'nin "Günlük ödüller" şeridini verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { DailyRewardSheet } from "@/components/city/DailyReward";
import { GameButton } from "@/components/puzzle/LevelSheets";
import { RewardedAdModal, adFlow } from "@/components/puzzle/RewardedLife";
import { Touchable, useReduceMotion, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { GH } from "@/lib/game/gameHomePalette";
import { useOffline } from "@/lib/offline/net";
import {
  pickChest,
  shootPenalty,
  spinWheel,
  type AdClaimResponse,
  type GrantedReward,
  type LifeGameKey,
  type PenaltyOutcome,
  type RewardPrize,
  type RewardsState,
  type WheelSegment,
} from "@/lib/puzzle/api";
import { usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, radius, space, textScale, type } from "@/theme";

import { BallShape, ChestArt, CoinArt, Grad, PrizeArt, starPoints, useGid } from "./GameArt";
import { RailButton, HomeModal, type RailItem } from "./GameHomeKit";
import { Bob } from "./GameMotion";

const A = GH.art;
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/* ═══════════════════════ VERİ ═══════════════════════ */

/** Bugünkü ödül durumu (GET /me → profile.rewards; eski sunucuda null). */
export function useRewards(): RewardsState | null {
  const auth = useAuth();
  const me = usePuzzleMe().data;
  return auth.user ? me?.profile.rewards ?? null : null;
}

type PrizeKind = "coins" | "booster" | "lives" | "stars";

/** Verilen ödülü satırlara böler: [{ kind, text }]. */
export function rewardLines(r: GrantedReward | RewardPrize | null | undefined, boosterTitle?: (key: string) => string): { kind: PrizeKind; text: string }[] {
  if (!r) return [];
  const out: { kind: PrizeKind; text: string }[] = [];
  if (r.coins) out.push({ kind: "coins", text: `${r.coins} jeton` });
  if ("boosters" in r && r.boosters) {
    for (const [key, n] of Object.entries(r.boosters)) out.push({ kind: "booster", text: `${n}× ${boosterTitle ? boosterTitle(key) : "güçlendirici"}` });
  }
  if ("booster" in r && r.booster) out.push({ kind: "booster", text: r.booster > 1 ? `${r.booster} güçlendirici` : "Güçlendirici" });
  if (r.lives) out.push({ kind: "lives", text: `+${r.lives} can` });
  if (r.stars) out.push({ kind: "stars", text: `${r.stars} yıldız` });
  return out;
}

/** Sandık çipi için kısa yazı (ikon türü anlatır): "60", "×2", "+1", "3". */
const shortPrize = (p: RewardPrize) => (p.coins ? `${p.coins} jeton` : p.stars ? `${p.stars} yıldız` : p.lives ? `+${p.lives} can` : `×${p.booster ?? 1} joker`);

const firstKind = (p: RewardPrize | GrantedReward): PrizeKind =>
  p.stars ? "stars" : p.lives ? "lives" : p.coins ? "coins" : ("booster" in p && p.booster) || ("boosters" in p && p.boosters) ? "booster" : "coins";

function useBoosterTitle() {
  const me = usePuzzleMe().data;
  return useCallback((key: string) => me?.catalog.boosters?.[key]?.title ?? "Güçlendirici", [me]);
}

/* ═══════════════════════ ÖDÜL KARTI ═══════════════════════ */

/** Kazanılan ödül: ışın patlaması + büyük ikon + satırlar. */
export function RewardReveal({ reward, title = "Kazandın!", note }: { reward: GrantedReward | null; title?: string; note?: string | null }) {
  const reduce = useReduceMotion();
  // Kısa ekranda büyük ikon ve ışın yok: pencere kaydırmadan sığsın.
  const compact = useWindowDimensions().height < 720;
  const boosterTitle = useBoosterTitle();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop, reduce, reward]);
  const lines = rewardLines(reward, boosterTitle);
  if (!reward) return null;
  return (
    <Animated.View style={[styles.reveal, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
      {compact ? null : (
        <>
          <Burst size={150} />
          <View style={styles.revealIcon}>
            <PrizeArt kind={firstKind(reward)} size={68} />
          </View>
        </>
      )}
      <Text style={styles.revealTitle} {...textScale.badge}>{title}</Text>
      <View style={styles.revealLines}>
        {lines.map((l, i) => (
          <View key={i} style={styles.revealChip}>
            <PrizeArt kind={l.kind} size={22} />
            <Text style={styles.revealChipText} numberOfLines={1} {...textScale.badge}>{l.text}</Text>
          </View>
        ))}
      </View>
      {reward.swapped === "lives" ? <Text style={styles.note} {...textScale.long}>Canların dolu olduğu için can yerine jeton verildi.</Text> : null}
      {note ? <Text style={styles.note} {...textScale.long}>{note}</Text> : null}
    </Animated.View>
  );
}

/** Işın patlaması (statik; ödül kartının arkasında). */
function Burst({ size }: { size: number }) {
  const g = useGid("burst");
  const rays = 12;
  return (
    <View pointerEvents="none" style={[styles.burst, { width: size, height: size, marginLeft: -size / 2 }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={g} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={GH.burst} />
            <Stop offset="1" stopColor={GH.burstClear} />
          </RadialGradient>
        </Defs>
        {Array.from({ length: rays }, (_, i) => {
          const a = (i / rays) * Math.PI * 2;
          const b = a + Math.PI / rays / 1.4;
          return <Path key={i} d={`M 50 50 L ${50 + Math.cos(a) * 50} ${50 + Math.sin(a) * 50} L ${50 + Math.cos(b) * 50} ${50 + Math.sin(b) * 50} Z`} fill={`url(#${g})`} />;
        })}
        <Circle cx={50} cy={50} r={26} fill={`url(#${g})`} />
      </Svg>
    </View>
  );
}

/* ═══════════════════════ GÜNLÜK ÇARK ═══════════════════════ */

/** Sunucu yoksa (eski sürüm) çizim için yedek dilimler. */
const FALLBACK_SEGMENTS: WheelSegment[] = [
  { key: "c50", label: "50 jeton", coins: 50 },
  { key: "b1", label: "Güçlendirici", booster: 1 },
  { key: "c100", label: "100 jeton", coins: 100 },
  { key: "l1", label: "+1 can", lives: 1 },
  { key: "c25", label: "25 jeton", coins: 25 },
  { key: "s2", label: "2 yıldız", stars: 2 },
  { key: "b2", label: "2 güçlendirici", booster: 2 },
  { key: "s5", label: "5 yıldız", stars: 5 },
];

/** Dilimin kısa yazısı (çarkın üstünde). */
const segShort = (s: WheelSegment) => (s.coins ? String(s.coins) : s.stars ? `×${s.stars}` : s.lives ? `+${s.lives}` : `×${s.booster ?? 1}`);

/**
 * Çark dönüşü: `index` dilimi ibrenin (üst) altında durur. Dilim i, saat
 * yönünde üstten [i·dilim, (i+1)·dilim] açısındadır; çark θ kadar dönünce
 * dilim ortası (i+½)·dilim+θ olur → θ ≡ −(i+½)·dilim (mod 360).
 */
export function wheelTarget(current: number, index: number, count: number, jitter: number) {
  const seg = 360 / count;
  const want = (((-(index + 0.5) * seg + jitter * seg * 0.3) % 360) + 360) % 360;
  const now = ((current % 360) + 360) % 360;
  let delta = want - now;
  if (delta < 0) delta += 360;
  return current + 360 * 5 + delta;
}

export function WheelSheet({ visible, onClose, game }: { visible: boolean; onClose: () => void; game: LifeGameKey | null }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const offline = useOffline();
  const toast = useToast();
  const cache = usePuzzleCache();
  const rewards = useRewards();
  const signedIn = Boolean(useAuth().user);
  const segments = rewards?.wheel.segments?.length ? rewards.wheel.segments : FALLBACK_SEGMENTS;
  const rot = useRef(new Animated.Value(0)).current;
  const angle = useRef(0);
  const [phase, setPhase] = useState<"idle" | "busy" | "spinning" | "done">("idle");
  const [won, setWon] = useState<GrantedReward | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  useEffect(() => {
    if (!visible) {
      setPhase("idle");
      setWon(null);
    }
  }, [visible]);

  const land = useCallback(
    (index: number, reward: GrantedReward) => {
      setPhase("spinning");
      const target = wheelTarget(angle.current, index, segments.length, (Math.random() - 0.5) * 2);
      angle.current = target;
      const done = () => {
        setPhase("done");
        setWon(reward);
      };
      if (reduce) {
        rot.setValue(target);
        done();
        return;
      }
      Animated.timing(rot, { toValue: target, duration: 4600, easing: Easing.bezier(0.12, 0.62, 0.12, 1), useNativeDriver: true }).start(done);
    },
    [reduce, rot, segments.length]
  );

  const free = async () => {
    setPhase("busy");
    try {
      const res = await spinWheel(game);
      cache(res.profile);
      land(res.index, res.reward);
    } catch (error) {
      setPhase("idle");
      toast.show({ message: errorText(error), tone: "danger" });
    }
  };

  const onAd = (res: AdClaimResponse) => {
    if (res.profile) cache(res.profile);
    if (res.wheel) land(res.wheel.index, res.reward ?? {});
  };

  const size = Math.min(268, width - 96, Math.round(height * 0.36));
  const adLeft = rewards?.wheel.ad.left ?? 0;
  const canFree = Boolean(rewards?.wheel.free);
  const spinning = phase === "spinning" || phase === "busy";
  const footer = !signedIn ? (
    <Text style={styles.note} {...textScale.long}>Çark için giriş yap.</Text>
  ) : phase === "done" ? (
    <>
      <GameButton label="TOPLA" icon="checkmark" onPress={onClose} />
      {adLeft > 0 ? <GameButton label={`REKLAMLA TEKRAR ÇEVİR (${adLeft})`} icon="play-circle" small disabled={offline} onPress={() => { setPhase("idle"); setWon(null); setAdOpen(true); }} /> : null}
    </>
  ) : canFree ? (
    <GameButton label={spinning ? "DÖNÜYOR…" : "ÜCRETSİZ ÇEVİR"} icon="sync" disabled={spinning || offline} onPress={free} />
  ) : adLeft > 0 ? (
    <GameButton label={spinning ? "DÖNÜYOR…" : `REKLAMLA ÇEVİR (${adLeft})`} icon="play-circle" disabled={spinning || offline} onPress={() => setAdOpen(true)} />
  ) : (
    <GameButton label="YARIN YİNE GEL" icon="time" disabled onPress={() => undefined} />
  );

  return (
    <HomeModal visible={visible} onClose={onClose} top="GÜNÜN ŞANSI" title="Günlük Çark" tone={GH.modalHeadWheel} footer={footer}>
      <View style={[styles.wheelStage, { height: size + 26 }]}>
        <Animated.View style={{ width: size, height: size, marginTop: 18, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }] }}>
          <WheelFace size={size} segments={segments} />
        </Animated.View>
        <View pointerEvents="none" style={[styles.wheelRimFixed, { width: size, height: size, top: 18 }]}>
          <WheelBulbs size={size} lit={spinning ? 1 : 0} />
        </View>
        <View pointerEvents="none" style={styles.wheelPointer}>
          <WheelPointer />
        </View>
      </View>
      {phase === "done" && won ? (
        <RewardReveal reward={won} />
      ) : (
        <Text style={styles.body} {...textScale.long}>
          {spinning ? "Çark dönüyor… İyi şanslar!" : canFree ? "Bugünkü çevirmen ücretsiz! Jeton, güçlendirici, can ya da yıldız kazan." : adLeft > 0 ? `Ücretsiz çevirmeni kullandın. Reklam izleyerek ${adLeft} kez daha çevirebilirsin.` : "Bugünkü bütün çevirmelerini kullandın. Yarın yine gel!"}
        </Text>
      )}
      <RewardedAdModal<AdClaimResponse> visible={adOpen} onClose={() => setAdOpen(false)} flow={adFlow("spin", game)} onRewarded={onAd} />
    </HomeModal>
  );
}

/** Çarkın yüzü: renkli dilimler, ikon + değer, derinlik gölgesi, merkez. */
const WheelFace = React.memo(function WheelFace({ size, segments }: { size: number; segments: WheelSegment[] }) {
  const g = useGid("wf");
  const c = size / 2;
  const R = c - 14;
  const n = segments.length;
  const seg = (Math.PI * 2) / n;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <Grad id={`${g}rim`} stops={A.wheelRim} />
        <Grad id={`${g}hub`} stops={A.gold} />
        <RadialGradient id={`${g}sh`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.55" stopColor={GH.burstClear} />
          <Stop offset="1" stopColor={A.shade} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1} fill={A.outline} />
      <Circle cx={c} cy={c} r={c - 4} fill={`url(#${g}rim)`} />
      <Circle cx={c} cy={c} r={R + 2} fill={A.outline} />
      {segments.map((s, i) => {
        const a0 = i * seg - Math.PI / 2;
        const a1 = a0 + seg;
        const am = a0 + seg / 2;
        const d = `M ${c} ${c} L ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)} Z`;
        const ix = c + R * 0.66 * Math.cos(am);
        const iy = c + R * 0.66 * Math.sin(am);
        const tx = c + R * 0.38 * Math.cos(am);
        const ty = c + R * 0.38 * Math.sin(am);
        const deg = (am * 180) / Math.PI + 90;
        return (
          <G key={s.key + i}>
            <Path d={d} fill={A.wheel[i % A.wheel.length]} stroke={A.outline} strokeWidth={2} />
            <G transform={`rotate(${deg} ${ix} ${iy})`}>
              <PrizeGlyph kind={firstKind(s)} x={ix} y={iy} r={R * 0.13} />
            </G>
            <SvgText
              x={tx}
              y={ty}
              fill={GH.white}
              stroke={A.outline}
              strokeWidth={3}
              fontSize={type.h3.fontSize}
              fontFamily={fonts.bold}
              textAnchor="middle"
              alignmentBaseline="middle"
              transform={`rotate(${deg} ${tx} ${ty})`}
            >
              {segShort(s)}
            </SvgText>
            <SvgText x={tx} y={ty} fill={GH.white} fontSize={type.h3.fontSize} fontFamily={fonts.bold} textAnchor="middle" alignmentBaseline="middle" transform={`rotate(${deg} ${tx} ${ty})`}>
              {segShort(s)}
            </SvgText>
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={R} fill={`url(#${g}sh)`} />
      <Circle cx={c} cy={c} r={R * 0.2} fill={`url(#${g}hub)`} stroke={A.outline} strokeWidth={3} />
      <Polygon points={starPoints(c, c + 1, R * 0.11)} fill={A.coin[0]} stroke={A.coinEdge} strokeWidth={1.4} />
    </Svg>
  );
});

/** Çerçeve ampulleri (çark dönerken yanık; dönmeyen katman). */
function WheelBulbs({ size, lit }: { size: number; lit: number }) {
  const c = size / 2;
  const n = 16;
  return (
    <Svg width={size} height={size}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const on = lit ? true : i % 2 === 0;
        return <Circle key={i} cx={c + (c - 8) * Math.cos(a)} cy={c + (c - 8) * Math.sin(a)} r={3.6} fill={on ? A.bulb : A.wheelRim[2]} stroke={A.outline} strokeWidth={1} />;
      })}
      <Ellipse cx={c * 0.62} cy={c * 0.4} rx={c * 0.32} ry={c * 0.12} fill={A.shineSoft} transform={`rotate(-35 ${c * 0.62} ${c * 0.4})`} />
    </Svg>
  );
}

function WheelPointer() {
  const g = useGid("wp");
  return (
    <Svg width={44} height={50} viewBox="0 0 44 50">
      <Defs>
        <Grad id={g} stops={A.heart} />
      </Defs>
      <Path d="M 22 48 L 6 18 Q 4 4 22 3 Q 40 4 38 18 Z" fill={`url(#${g})`} stroke={A.outline} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx={22} cy={17} r={6} fill={A.wheelHub[0]} stroke={A.outline} strokeWidth={2} />
    </Svg>
  );
}

/** Dilim ikonu (SVG içinde): jeton · can · yıldız · şimşek. */
function PrizeGlyph({ kind, x, y, r }: { kind: PrizeKind; x: number; y: number; r: number }) {
  if (kind === "coins") {
    return (
      <G>
        <Circle cx={x} cy={y} r={r} fill={A.coin[1]} stroke={A.coinEdge} strokeWidth={1.6} />
        <Circle cx={x} cy={y} r={r * 0.66} fill={A.coin[2]} opacity={0.5} />
        <Polygon points={starPoints(x, y, r * 0.5)} fill={A.coin[0]} />
      </G>
    );
  }
  if (kind === "stars") return <Polygon points={starPoints(x, y, r * 1.2)} fill={A.star[1]} stroke={A.starEdge} strokeWidth={1.6} strokeLinejoin="round" />;
  if (kind === "lives") {
    const s = r / 20;
    return <Path d={`M ${x} ${y + 17 * s} C ${x - 14 * s} ${y + 7 * s} ${x - 20 * s} ${y} ${x - 20 * s} ${y - 8 * s} C ${x - 20 * s} ${y - 15 * s} ${x - 15 * s} ${y - 19 * s} ${x - 9 * s} ${y - 19 * s} C ${x - 5 * s} ${y - 19 * s} ${x - 2 * s} ${y - 17 * s} ${x} ${y - 13 * s} C ${x + 2 * s} ${y - 17 * s} ${x + 5 * s} ${y - 19 * s} ${x + 9 * s} ${y - 19 * s} C ${x + 15 * s} ${y - 19 * s} ${x + 20 * s} ${y - 15 * s} ${x + 20 * s} ${y - 8 * s} C ${x + 20 * s} ${y} ${x + 14 * s} ${y + 7 * s} ${x} ${y + 17 * s} Z`} fill={A.heart[1]} stroke={A.heartEdge} strokeWidth={1.6} />;
  }
  const s = r / 20;
  return <Path d={`M ${x + 4 * s} ${y - 22 * s} L ${x - 14 * s} ${y + 3 * s} L ${x - 2 * s} ${y + 3 * s} L ${x - 6 * s} ${y + 22 * s} L ${x + 14 * s} ${y - 4 * s} L ${x + 2 * s} ${y - 4 * s} Z`} fill={A.bolt[1]} stroke={A.outline} strokeWidth={1.6} strokeLinejoin="round" />;
}

/* ═══════════════════════ SANDIK SEÇ ═══════════════════════ */

export function ChestPickSheet({ visible, onClose, game }: { visible: boolean; onClose: () => void; game: LifeGameKey | null }) {
  const { width } = useWindowDimensions();
  const offline = useOffline();
  const toast = useToast();
  const cache = usePuzzleCache();
  const rewards = useRewards();
  const signedIn = Boolean(useAuth().user);
  const boosterTitle = useBoosterTitle();
  const [busy, setBusy] = useState<number | null>(null);
  const [result, setResult] = useState<{ pick: number; options: RewardPrize[]; reward: GrantedReward } | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const pops = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!visible) {
      setResult(null);
      setBusy(null);
      pops.forEach((p) => p.setValue(0));
    }
  }, [pops, visible]);

  const available = Boolean(rewards?.chest.available);
  const adLeft = rewards?.chest.ad.left ?? 0;
  const choose = async (i: number) => {
    if (!available || busy != null || result) return;
    setBusy(i);
    Animated.sequence([
      Animated.timing(pops[i], { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(pops[i], { toValue: -1, duration: 120, useNativeDriver: true }),
      Animated.timing(pops[i], { toValue: 0.6, duration: 120, useNativeDriver: true }),
      Animated.timing(pops[i], { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const res = await pickChest(i, game);
      cache(res.profile);
      setTimeout(() => setResult({ pick: res.pick, options: res.options, reward: res.reward }), 480);
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setTimeout(() => setBusy(null), 480);
    }
  };

  const cw = Math.min(96, (Math.min(380, width - 32) - 32 - 6 - space.sm * 2) / 3);
  const footer = !signedIn ? (
    <Text style={styles.note} {...textScale.long}>Sandık için giriş yap.</Text>
  ) : result ? (
    <>
      <GameButton label="TOPLA" icon="checkmark" onPress={onClose} />
      {adLeft > 0 ? (
        <GameButton label="REKLAMLA +1 SANDIK" icon="play-circle" small disabled={offline} onPress={() => setAdOpen(true)} />
      ) : null}
    </>
  ) : available ? (
    <GameButton label={busy != null ? "AÇILIYOR…" : "BİR SANDIK SEÇ"} icon="hand-left" disabled onPress={() => undefined} />
  ) : adLeft > 0 ? (
    <GameButton label="REKLAMLA +1 SANDIK" icon="play-circle" disabled={offline} onPress={() => setAdOpen(true)} />
  ) : (
    <GameButton label="YARIN YENİ SANDIKLAR" icon="time" disabled onPress={() => undefined} />
  );

  return (
    <HomeModal visible={visible} onClose={onClose} top="HEDİYE KUTUSU" title="Sandık Seç" tone={GH.modalHeadChest} footer={footer}>
      <Text style={styles.body} {...textScale.long}>
        {result ? "Öbür sandıklarda bunlar vardı:" : available ? "Üç sandıktan birinde büyük ödül var. Şansına güven!" : adLeft > 0 ? "Bugünkü sandığını açtın. Reklam izleyerek bir sandık daha seçebilirsin." : "Bugünkü sandıklarını açtın. Yarın yeni sandıklar!"}
      </Text>
      <View style={styles.chestRow}>
        {[0, 1, 2].map((i) => {
          const picked = result?.pick === i;
          const opt = result?.options[i];
          const shake = pops[i].interpolate({ inputRange: [-1, 1], outputRange: ["-8deg", "8deg"] });
          return (
            <Touchable
              key={i}
              onPress={() => choose(i)}
              disabled={!available || busy != null || Boolean(result)}
              haptic="medium"
              feedback="icon"
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}. sandık`}
              style={[styles.chestSlot, { width: cw }, result && !picked ? styles.chestDim : null]}
            >
              <View style={[styles.chestPlinth, picked && styles.chestPlinthOn]} />
              <Bob active={available && !result && busy == null} delay={i * 260}>
                <Animated.View style={{ transform: [{ rotate: shake }, { scale: picked ? 1.08 : 1 }] }}>
                  <ChestArt size={cw - 4} open={Boolean(result)} glow={picked} tone={picked ? "gold" : "wood"} />
                </Animated.View>
              </Bob>
              {opt ? (
                <View style={[styles.chestPrize, opt.big && styles.chestPrizeBig, picked && styles.chestPrizeOn]}>
                  <PrizeArt kind={firstKind(opt)} size={18} />
                  <Text style={[styles.chestPrizeText, picked && styles.chestPrizeTextOn]} numberOfLines={1} {...textScale.badge}>
                    {shortPrize(opt)}
                  </Text>
                </View>
              ) : (
                <View style={styles.chestQ}>
                  <Text style={styles.chestQText} {...textScale.badge}>?</Text>
                </View>
              )}
            </Touchable>
          );
        })}
      </View>
      {result ? <RewardReveal reward={result.reward} title={result.options[result.pick]?.big ? "Büyük ödül!" : "Kazandın!"} note={rewardLines(result.reward, boosterTitle).length ? null : undefined} /> : null}
      <RewardedAdModal<AdClaimResponse>
        visible={adOpen}
        onClose={() => setAdOpen(false)}
        flow={adFlow("chest", game)}
        onRewarded={(res) => {
          if (res.profile) cache(res.profile);
          setResult(null);
          pops.forEach((p) => p.setValue(0));
        }}
      />
    </HomeModal>
  );
}

/* ═══════════════════════ GÜNÜN PENALTISI ═══════════════════════ */

/** Kale geometrisi (viewBox 300 × 190): direkler, üst direk, bölge merkezleri. */
const G_W = 300;
const G_H = 190;
const POST_L = 34;
const POST_R = 266;
const BAR = 28;
const LINE = 150;
const ZX = [82, 150, 218];
const ZY = [58, 116];
const zoneXY = (z: number) => ({ x: ZX[z % 3], y: ZY[z < 3 ? 0 : 1] });

export function PenaltySheet({ visible, onClose, game }: { visible: boolean; onClose: () => void; game: LifeGameKey | null }) {
  const { width } = useWindowDimensions();
  const offline = useOffline();
  const toast = useToast();
  const cache = usePuzzleCache();
  const rewards = useRewards();
  const reduce = useReduceMotion();
  const signedIn = Boolean(useAuth().user);
  const [zone, setZone] = useState<number | null>(null);
  const [phase, setPhase] = useState<"aim" | "busy" | "flight" | "done">("aim");
  const [shot, setShot] = useState<{ outcome: PenaltyOutcome; zone: number; keeper: { col: number; high: boolean }; reward: GrantedReward } | null>(null);
  const power = useRef(0.5);
  const needle = useRef(new Animated.Value(0.5)).current;
  const ball = useRef(new Animated.Value(0)).current;
  const dive = useRef(new Animated.Value(0)).current;

  const sw = Math.min(320, Math.min(380, width - 32) - 32 - 6);
  const k = sw / G_W;
  const sh = G_H * k;
  const available = Boolean(rewards?.penalty.available);

  useEffect(() => {
    if (!visible) {
      setZone(null);
      setPhase("aim");
      setShot(null);
      ball.setValue(0);
      dive.setValue(0);
    }
  }, [ball, dive, visible]);

  // Güç çubuğu: köşe seçilince ileri-geri gider (oyun girdisi; kare kare).
  useEffect(() => {
    if (!visible || zone == null || phase !== "aim") return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const t = (Date.now() - t0) / 1000;
      const p = (Math.sin(t * (reduce ? 1.4 : 2.6) - Math.PI / 2) + 1) / 2;
      power.current = p;
      needle.setValue(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [needle, phase, reduce, visible, zone]);

  const shoot = async () => {
    if (zone == null || phase !== "aim") return;
    const p = Math.round(power.current * 1000) / 1000;
    setPhase("busy");
    try {
      const res = await shootPenalty(zone, p, game);
      cache(res.profile);
      setShot({ outcome: res.outcome, zone: res.zone, keeper: res.keeper, reward: res.reward });
      setPhase("flight");
      const end = () => setPhase("done");
      if (reduce) {
        ball.setValue(1);
        dive.setValue(1);
        end();
        return;
      }
      Animated.parallel([
        Animated.timing(ball, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([Animated.delay(90), Animated.timing(dive, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true })]),
      ]).start(() => setTimeout(end, 350));
    } catch (error) {
      setPhase("aim");
      toast.show({ message: errorText(error), tone: "danger" });
    }
  };

  // Topun varış noktası (sonuçtan): gol → bölge; kurtarış → kalecinin eli; aut → üst direğin üstü.
  const target = useMemo(() => {
    if (!shot) return { x: 150, y: 116 };
    const z = zoneXY(shot.zone);
    if (shot.outcome === "over") return { x: z.x + (z.x - 150) * 0.2, y: BAR - 22 };
    if (shot.outcome === "saved") return { x: ZX[shot.keeper.col] + (shot.keeper.col - 1) * -10, y: z.y + 10 };
    return z;
  }, [shot]);
  const keeperDx = shot ? (shot.keeper.col - 1) * 64 : 0;
  const keeperRot = shot ? (shot.keeper.col - 1) * (shot.keeper.high ? 62 : 80) : 0;
  const keeperDy = shot ? (shot.keeper.high ? -14 : 18) * (shot.keeper.col === 1 ? 0.6 : 1) : 0;

  const last = rewards?.penalty.last ?? null;
  const banner = shot && phase === "done" ? (shot.outcome === "goal" ? "GOOOL!" : shot.outcome === "over" ? "ÜSTTEN AUTA!" : "KALECİ KURTARDI!") : null;

  const footer = !signedIn ? (
    <Text style={styles.note} {...textScale.long}>Penaltı için giriş yap.</Text>
  ) : phase === "done" ? (
    <GameButton label="TOPLA" icon="checkmark" onPress={onClose} />
  ) : available || phase !== "aim" ? (
    <GameButton label={zone == null ? "ÖNCE KÖŞE SEÇ" : phase === "aim" ? "ŞUT!" : "TOP YOLDA…"} icon="football" disabled={zone == null || phase !== "aim" || offline} onPress={shoot} />
  ) : (
    <GameButton label="YARIN YENİ ŞUT" icon="time" disabled onPress={() => undefined} />
  );

  const ballStart = { x: 150, y: 176 };
  return (
    <HomeModal visible={visible} onClose={onClose} top="TEK ŞUT · GÜNDE BİR" title="Günün Penaltısı" tone={GH.modalHeadPenalty} footer={footer}>
      <View style={[styles.penScene, { width: sw, height: sh }]}>
        <PenaltyGoal w={sw} h={sh} />
        {/* hedefler */}
        {available && phase === "aim"
          ? [0, 1, 2, 3, 4, 5].map((z) => {
              const p = zoneXY(z);
              const on = zone === z;
              const r = 22 * k;
              return (
                <Touchable
                  key={z}
                  onPress={() => setZone(z)}
                  haptic="selection"
                  feedback="icon"
                  accessibilityRole="button"
                  accessibilityLabel={`${z < 3 ? "Üst" : "Alt"} ${["sol", "orta", "sağ"][z % 3]} köşe`}
                  style={[styles.penTarget, { left: p.x * k - r, top: p.y * k - r, width: r * 2, height: r * 2 }, on && styles.penTargetOn]}
                >
                  {on ? <Ionicons name="locate" size={Math.round(r * 1.2)} color={GH.white} /> : null}
                </Touchable>
              );
            })
          : null}
        {/* kaleci */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.keeper,
            {
              left: (150 - 34) * k,
              top: (LINE - 92) * k,
              width: 68 * k,
              height: 96 * k,
              transform: [
                { translateX: dive.interpolate({ inputRange: [0, 1], outputRange: [0, keeperDx * k] }) },
                { translateY: dive.interpolate({ inputRange: [0, 1], outputRange: [0, keeperDy * k] }) },
                { rotate: dive.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${keeperRot}deg`] }) },
              ],
            },
          ]}
        >
          <KeeperArt w={68 * k} h={96 * k} />
        </Animated.View>
        {/* top */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: (ballStart.x - 11) * k,
            top: (ballStart.y - 11) * k,
            width: 22 * k,
            height: 22 * k,
            transform: [
              { translateX: ball.interpolate({ inputRange: [0, 1], outputRange: [0, (target.x - ballStart.x) * k] }) },
              { translateY: ball.interpolate({ inputRange: [0, 1], outputRange: [0, (target.y - ballStart.y) * k] }) },
              { scale: ball.interpolate({ inputRange: [0, 1], outputRange: [1, 0.68] }) },
              { rotate: ball.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] }) },
            ],
          }}
        >
          <Svg width={22 * k} height={22 * k} viewBox="0 0 22 22">
            <BallShape cx={11} cy={11} r={10} />
          </Svg>
        </Animated.View>
        {banner ? (
          <View style={styles.penBannerWrap} pointerEvents="none">
            <View style={[styles.penBanner, shot?.outcome === "goal" ? styles.penBannerGoal : styles.penBannerMiss]}>
              <Text style={styles.penBannerText} {...textScale.badge}>{banner}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {available && phase === "aim" ? (
        <PowerMeter width={sw} needle={needle} active={zone != null} />
      ) : null}
      {phase === "done" && shot ? (
        <RewardReveal reward={shot.reward} title={shot.outcome === "goal" ? "Gol ödülü" : "Teselli ödülü"} />
      ) : !available && phase === "aim" ? (
        <Text style={styles.body} {...textScale.long}>
          {last ? `Bugünkü şutun: ${last.outcome === "goal" ? "GOL" : last.outcome === "over" ? "üstten aut" : "kaleci kurtardı"}. Yarın yeni bir şut seni bekliyor!` : "Bugünkü şutunu attın. Yarın yine gel!"}
        </Text>
      ) : phase === "aim" ? (
        <Text style={styles.body} {...textScale.long}>
          Köşeni seç, çubuk yeşildeyken ŞUT'a bas. Gol: {rewards?.penalty.goal.coins ?? 80} jeton (üst köşeye + güçlendirici). Kaçarsa {rewards?.penalty.miss.coins ?? 20} jeton teselli.
        </Text>
      ) : null}
    </HomeModal>
  );
}

/** Güç çubuğu: kırmızı (zayıf) · sarı · YEŞİL · sarı · kırmızı (fazla sert). */
function PowerMeter({ width, needle, active }: { width: number; needle: Animated.Value; active: boolean }) {
  const segs: [number, string][] = [
    [0.18, GH.meter.bad],
    [0.36, GH.meter.mid],
    [0.78, GH.meter.good],
    [0.92, GH.meter.mid],
    [1, GH.meter.bad],
  ];
  let from = 0;
  return (
    <View style={[styles.meter, { width, opacity: active ? 1 : 0.5 }]} accessibilityLabel="Şut gücü">
      <View style={styles.meterTrack}>
        {segs.map(([to, color], i) => {
          const el = <View key={i} style={{ position: "absolute", left: `${from * 100}%`, width: `${(to - from) * 100}%`, top: 0, bottom: 0, backgroundColor: color }} />;
          from = to;
          return el;
        })}
        <View style={styles.meterGloss} />
      </View>
      <Animated.View style={[styles.meterNeedle, { transform: [{ translateX: needle.interpolate({ inputRange: [0, 1], outputRange: [0, width - 8] }) }] }]} />
      <View style={styles.meterLabels}>
        <Text style={styles.meterLabel} {...textScale.badge}>ZAYIF</Text>
        <Text style={styles.meterLabel} {...textScale.badge}>GÜÇ</Text>
        <Text style={styles.meterLabel} {...textScale.badge}>SERT</Text>
      </View>
    </View>
  );
}

/** Kale sahnesi: gece stadı, ağ, direkler, çim, penaltı noktası. */
const PenaltyGoal = React.memo(function PenaltyGoal({ w, h }: { w: number; h: number }) {
  const g = useGid("pg");
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${G_W} ${G_H}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <Grad id={`${g}sky`} stops={GH.pen.sky} />
        <Grad id={`${g}grass`} stops={GH.pen.grass} />
        <RadialGradient id={`${g}light`} cx="0.5" cy="0" r="0.8">
          <Stop offset="0" stopColor={GH.pen.flood} />
          <Stop offset="1" stopColor={GH.burstClear} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={G_W} height={G_H} fill={`url(#${g}sky)`} />
      <Rect x={0} y={0} width={G_W} height={G_H} fill={`url(#${g}light)`} />
      {/* tribün + seyirci noktaları */}
      <Path d={`M 0 22 Q 150 6 300 22 L 300 70 L 0 70 Z`} fill={GH.pen.stand} />
      {Array.from({ length: 46 }, (_, i) => (
        <Circle key={i} cx={6 + ((i * 37) % 290)} cy={26 + ((i * 13) % 36)} r={1.6} fill={GH.pen.crowd[i % GH.pen.crowd.length]} opacity={0.75} />
      ))}
      <Rect x={0} y={68} width={G_W} height={G_H - 68} fill={`url(#${g}grass)`} />
      {[0, 1, 2, 3].map((i) => (
        <Rect key={i} x={0} y={92 + i * 26} width={G_W} height={13} fill={GH.pen.stripe} />
      ))}
      {/* ağ (arka) */}
      <Path d={`M ${POST_L} ${BAR} L ${POST_L + 16} ${BAR + 18} L ${POST_R - 16} ${BAR + 18} L ${POST_R} ${BAR} Z`} fill={A.netShade} />
      <Rect x={POST_L + 16} y={BAR + 18} width={POST_R - POST_L - 32} height={LINE - BAR - 18} fill={A.netShade} />
      {Array.from({ length: 15 }, (_, i) => (
        <Path key={`v${i}`} d={`M ${POST_L + 16 + i * 14.4} ${BAR + 18} L ${POST_L + 16 + i * 14.4} ${LINE}`} stroke={A.net} strokeWidth={0.8} opacity={0.6} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <Path key={`h${i}`} d={`M ${POST_L + 16} ${BAR + 18 + i * 17} L ${POST_R - 16} ${BAR + 18 + i * 17}`} stroke={A.net} strokeWidth={0.8} opacity={0.6} />
      ))}
      {/* ceza sahası çizgileri */}
      <Path d={`M 6 ${LINE} L 294 ${LINE}`} stroke={GH.pen.line} strokeWidth={2} />
      <Path d={`M 14 ${G_H} L 50 ${LINE} M 286 ${G_H} L 250 ${LINE}`} stroke={GH.pen.line} strokeWidth={2} />
      <Ellipse cx={150} cy={178} rx={5} ry={2} fill={GH.pen.line} />
      {/* direkler (kontur + beyaz) */}
      <Path d={`M ${POST_L} ${LINE + 2} L ${POST_L} ${BAR} L ${POST_R} ${BAR} L ${POST_R} ${LINE + 2}`} stroke={A.outline} strokeWidth={8} fill="none" strokeLinejoin="round" />
      <Path d={`M ${POST_L} ${LINE + 2} L ${POST_L} ${BAR} L ${POST_R} ${BAR} L ${POST_R} ${LINE + 2}`} stroke={A.post} strokeWidth={4.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
});

/** Kaleci (özgün çizim): turuncu forma, eldivenler, kollar açık. */
function KeeperArt({ w, h }: { w: number; h: number }) {
  const K = GH.pen;
  return (
    <Svg width={w} height={h} viewBox="0 0 68 96">
      <Ellipse cx={34} cy={93} rx={18} ry={3} fill={A.shade} />
      {/* bacaklar */}
      <Rect x={22} y={62} width={9} height={26} rx={4} fill={K.shorts} stroke={A.outline} strokeWidth={1.6} />
      <Rect x={37} y={62} width={9} height={26} rx={4} fill={K.shorts} stroke={A.outline} strokeWidth={1.6} />
      <Rect x={22} y={74} width={9} height={12} rx={3} fill={K.sock} />
      <Rect x={37} y={74} width={9} height={12} rx={3} fill={K.sock} />
      <Ellipse cx={25} cy={89} rx={6} ry={3} fill={A.outline} />
      <Ellipse cx={43} cy={89} rx={6} ry={3} fill={A.outline} />
      {/* kollar (açık) */}
      <Path d="M 18 36 L 4 18" stroke={A.outline} strokeWidth={10} strokeLinecap="round" />
      <Path d="M 50 36 L 64 18" stroke={A.outline} strokeWidth={10} strokeLinecap="round" />
      <Path d="M 18 36 L 4 18" stroke={A.keeper[1]} strokeWidth={7} strokeLinecap="round" />
      <Path d="M 50 36 L 64 18" stroke={A.keeper[1]} strokeWidth={7} strokeLinecap="round" />
      <Circle cx={4} cy={16} r={6} fill={K.glove} stroke={A.outline} strokeWidth={1.6} />
      <Circle cx={64} cy={16} r={6} fill={K.glove} stroke={A.outline} strokeWidth={1.6} />
      {/* gövde */}
      <Path d="M 16 34 Q 16 28 24 27 L 44 27 Q 52 28 52 34 L 50 64 L 18 64 Z" fill={A.keeper[0]} stroke={A.outline} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M 18 52 L 50 52" stroke={A.keeper[1]} strokeWidth={5} />
      <SvgText x={34} y={48} fill={GH.white} fontSize={type.labelSm.fontSize} fontFamily={fonts.bold} textAnchor="middle">1</SvgText>
      {/* baş */}
      <Circle cx={34} cy={17} r={11} fill={K.skin} stroke={A.outline} strokeWidth={1.8} />
      <Path d="M 23 15 Q 24 5 34 5 Q 44 5 45 15 Q 40 10 34 11 Q 28 10 23 15 Z" fill={K.hair} />
      <Circle cx={30} cy={18} r={1.4} fill={A.outline} />
      <Circle cx={38} cy={18} r={1.4} fill={A.outline} />
    </Svg>
  );
}

/* ═══════════════════════ YILDIZ SANDIĞI ═══════════════════════ */

const SEEN_KEY = "elitlig.gifts.starChestSeen.v1";

/**
 * Yıldız sandığı penceresi. `opening`: sunucu sandığı bölüm sonunda açtıysa
 * (açılan sandık sayısı son görülenden fazla) açılış animasyonu oynar.
 */
export function StarChestSheet({ visible, onClose, opening }: { visible: boolean; onClose: () => void; opening: boolean }) {
  const reduce = useReduceMotion();
  const me = usePuzzleMe().data;
  const chest = me?.profile.gifts?.star_chest;
  const gift = (me?.catalog as { gifts?: { starChest?: { coins: number; boosters: number } } } | undefined)?.gifts;
  const contents = gift?.starChest ?? { coins: 150, boosters: 2 };
  const shake = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!visible) {
      setOpen(false);
      shake.setValue(0);
      lift.setValue(0);
      return;
    }
    if (!opening) return;
    if (reduce) {
      setOpen(true);
      return;
    }
    const s = (v: number) => Animated.timing(shake, { toValue: v, duration: 70, useNativeDriver: true });
    Animated.sequence([Animated.delay(250), s(1), s(-1), s(1), s(-1), s(0.6), s(-0.6), s(0), Animated.timing(lift, { toValue: 1, duration: 160, useNativeDriver: true })]).start(() => setOpen(true));
  }, [lift, opening, reduce, shake, visible]);
  const value = chest?.progress ?? 0;
  const max = chest?.every ?? 40;
  return (
    <HomeModal
      visible={visible}
      onClose={onClose}
      top={opening ? "TEBRİKLER" : "BÖLÜM YILDIZLARI"}
      title={opening ? "Yıldız sandığın açıldı!" : "Yıldız Sandığı"}
      tone={GH.modalHeadGold}
      footer={<GameButton label={opening ? "TOPLA" : "OYNA, YILDIZ TOPLA"} icon={opening ? "checkmark" : "play"} onPress={onClose} />}
    >
      <View style={styles.starChestStage}>
        {open ? <Burst size={190} /> : null}
        <Animated.View style={{ transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ["-7deg", "7deg"] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
          <ChestArt size={128} open={open} glow={open || opening} tone="gold" />
        </Animated.View>
      </View>
      {opening ? (
        open ? (
          <RewardReveal reward={{ coins: contents.coins, boosters: { _: contents.boosters } }} title="Sandıktan çıkanlar" note="Ödüller hesabına eklendi." />
        ) : (
          <Text style={styles.body} {...textScale.long}>Açılıyor…</Text>
        )
      ) : (
        <>
          <View style={styles.scTrack}>
            <View style={[styles.scFill, { width: `${Math.max(4, (Math.min(value, max) / Math.max(1, max)) * 100)}%` }]}>
              <LinearGradient colors={GH.stripFill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            </View>
            <Text style={styles.scText} {...textScale.badge}>{value}/{max} yıldız</Text>
          </View>
          <View style={styles.scRow}>
            <View style={styles.revealChip}>
              <CoinArt size={22} />
              <Text style={styles.revealChipText} {...textScale.badge}>{contents.coins} jeton</Text>
            </View>
            <View style={styles.revealChip}>
              <PrizeArt kind="booster" size={22} />
              <Text style={styles.revealChipText} {...textScale.badge}>{contents.boosters} güçlendirici</Text>
            </View>
          </View>
          <Text style={styles.body} {...textScale.long}>Bölümlerde kazandığın her yıldız sandığı doldurur. {max} yıldızda sandık kendiliğinden açılır ve ödüller hesabına eklenir.</Text>
        </>
      )}
    </HomeModal>
  );
}

/**
 * Yıldız sandığı açıldı mı? Sunucunun açılan sandık sayısı son görülenden
 * fazlaysa true döner; `seen()` sayıyı kaydeder. İlk açılışta yalnız kaydeder.
 */
export function useStarChestOpened(opened: number | undefined): { fresh: boolean; seen: () => void } {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => setLast(raw == null ? -1 : Number(raw) || 0))
      .catch(() => setLast(-1));
  }, []);
  const n = opened ?? null;
  useEffect(() => {
    // İlk kez: mevcut sayıyı "görüldü" say (eski sandıklar için animasyon yok).
    if (last === -1 && n != null) {
      void AsyncStorage.setItem(SEEN_KEY, String(n)).catch(() => undefined);
      setLast(n);
    }
  }, [last, n]);
  const fresh = n != null && last != null && last >= 0 && n > last;
  const seen = useCallback(() => {
    if (n == null) return;
    setLast(n);
    void AsyncStorage.setItem(SEEN_KEY, String(n)).catch(() => undefined);
  }, [n]);
  return { fresh, seen };
}

/* ═══════════════════════ OYUN MERKEZİ ŞERİDİ ═══════════════════════ */

/**
 * "Günlük ödüller" — Oyun Merkezi'nde tek satır: Hediye · Çark · Sandık ·
 * Penaltı. Rozet yalnız alınabilir ödülde. Pencereler burada açılır.
 */
export function DailyRewardsStrip() {
  const auth = useAuth();
  const me = usePuzzleMe().data;
  const rewards = useRewards();
  const { width } = useWindowDimensions();
  const [sheet, setSheet] = useState<null | "gift" | "wheel" | "chest" | "penalty">(null);
  if (!auth.user) return null;
  const dailyReady = Boolean(me?.profile.daily?.available);
  const items: RailItem[] = [
    { key: "gift", kind: "gift", label: "Hediye", onPress: () => setSheet("gift"), badge: dailyReady },
    { key: "wheel", kind: "wheel", label: "Çark", onPress: () => setSheet("wheel"), badge: Boolean(rewards?.wheel.free) },
    { key: "chest", kind: "chest", label: "Sandık", onPress: () => setSheet("chest"), badge: Boolean(rewards?.chest.available) },
    { key: "penalty", kind: "penalty", label: "Penaltı", onPress: () => setSheet("penalty"), badge: Boolean(rewards?.penalty.available) },
  ];
  const ready = items.filter((i) => i.badge).length;
  const size = width < 360 ? 46 : 52;
  return (
    <View style={styles.dstrip}>
      <LinearGradient colors={GH.dstrip} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.dstripFill]} />
      <View style={styles.dstripHead}>
        <Text style={styles.dstripTitle} {...textScale.badge}>GÜNLÜK ÖDÜLLER</Text>
        <Text style={styles.dstripSub} numberOfLines={1} {...textScale.badge}>
          {ready ? `${ready} ödül seni bekliyor` : "Bugünkü ödüllerin alındı · yarın yenilenir"}
        </Text>
      </View>
      <View style={styles.dstripRow}>
        {items.map((it, i) => (
          <RailButton key={it.key} item={it} size={size} delay={i * 220} />
        ))}
      </View>
      <DailyRewardSheet visible={sheet === "gift"} onClose={() => setSheet(null)} />
      <WheelSheet visible={sheet === "wheel"} onClose={() => setSheet(null)} game={null} />
      <ChestPickSheet visible={sheet === "chest"} onClose={() => setSheet(null)} game={null} />
      <PenaltySheet visible={sheet === "penalty"} onClose={() => setSheet(null)} game={null} />
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  body: { ...type.bodySm, color: GH.cardSoft, textAlign: "center" },
  note: { ...type.caption, color: GH.cardSoft, textAlign: "center" },

  reveal: { alignItems: "center", gap: space.sm, paddingTop: space.sm },
  revealIcon: { height: 76, alignItems: "center", justifyContent: "center" },
  burst: { position: "absolute", top: -34, left: "50%" },
  revealTitle: { ...type.h2, fontFamily: fonts.bold, color: GH.cardInk },
  revealLines: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.s },
  revealChip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingLeft: space.xs, paddingRight: space.md, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: GH.panel, borderWidth: 1.5, borderColor: GH.panelEdge },
  revealChipText: { ...type.label, fontFamily: fonts.bold, color: GH.cardInk },

  wheelStage: { alignItems: "center" },
  wheelRimFixed: { position: "absolute" },
  wheelPointer: { position: "absolute", top: 0, alignSelf: "center" },

  chestRow: { flexDirection: "row", justifyContent: "center", gap: space.sm, paddingTop: space.sm },
  chestSlot: { alignItems: "center", paddingTop: space.xs, gap: space.xs },
  chestDim: { opacity: 0.6 },
  chestPlinth: { position: "absolute", left: 2, right: 2, top: "42%", bottom: 22, borderRadius: radius.lg, backgroundColor: GH.panel, borderWidth: 1.5, borderColor: GH.panelEdge },
  chestPlinthOn: { backgroundColor: GH.chestPlinthOn, borderColor: GH.coin },
  chestPrize: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: space.xs, height: 24, borderRadius: radius.pill, backgroundColor: GH.white, borderWidth: 1.5, borderColor: GH.panelEdge, maxWidth: "100%" },
  chestPrizeBig: { borderColor: GH.coin, borderWidth: 2 },
  chestPrizeOn: { backgroundColor: GH.cardInk, borderColor: GH.coin },
  chestPrizeText: { ...type.nano, color: GH.cardInk, flexShrink: 1 },
  chestPrizeTextOn: { color: GH.white },
  chestQ: { width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.cardInk },
  chestQText: { ...type.label, fontFamily: fonts.bold, color: GH.coin },

  penScene: { alignSelf: "center", borderRadius: radius.lg, overflow: "hidden", borderWidth: 2.5, borderColor: GH.hudCapEdge },
  penTarget: { position: "absolute", borderRadius: radius.pill, borderWidth: 2, borderColor: GH.white, backgroundColor: GH.penTarget, alignItems: "center", justifyContent: "center", borderStyle: "dashed" },
  penTargetOn: { backgroundColor: GH.penTargetOn, borderStyle: "solid", borderColor: GH.coin },
  keeper: { position: "absolute" },
  penBannerWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "flex-end", paddingBottom: space.sm },
  penBanner: { paddingHorizontal: space.lg, paddingVertical: space.s, borderRadius: radius.pill, borderWidth: 3, borderColor: GH.white },
  penBannerGoal: { backgroundColor: GH.meter.good },
  penBannerMiss: { backgroundColor: GH.meter.bad },
  penBannerText: { ...type.h1, fontFamily: fonts.bold, color: GH.white, letterSpacing: 1, textShadowColor: GH.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },

  meter: { alignSelf: "center", gap: 3 },
  meterTrack: { height: 18, borderRadius: radius.pill, overflow: "hidden", borderWidth: 2, borderColor: GH.hudCapEdge },
  meterGloss: { position: "absolute", left: 4, right: 4, top: 2, height: 4, borderRadius: radius.pill, backgroundColor: GH.stripStripe },
  meterNeedle: { position: "absolute", top: -4, left: 0, width: 8, height: 26, borderRadius: radius.pill, backgroundColor: GH.white, borderWidth: 2, borderColor: GH.hudCapEdge },
  meterLabels: { flexDirection: "row", justifyContent: "space-between" },
  meterLabel: { ...type.nano, color: GH.cardSoft },

  starChestStage: { height: 150, alignItems: "center", justifyContent: "center" },
  scTrack: { height: 26, borderRadius: radius.pill, backgroundColor: GH.stripTrack, overflow: "hidden", justifyContent: "center", borderWidth: 2, borderColor: GH.hudCapEdge },
  scFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill, overflow: "hidden" },
  scText: { ...type.labelSm, fontFamily: fonts.bold, color: GH.white, textAlign: "center", textShadowColor: GH.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  scRow: { flexDirection: "row", justifyContent: "center", gap: space.sm, flexWrap: "wrap" },

  dstrip: { borderRadius: radius.xl, padding: space.md, gap: space.sm, overflow: "hidden", borderWidth: 2, borderColor: GH.hudCapEdge },
  dstripFill: { borderRadius: radius.xl },
  dstripHead: { gap: 1 },
  dstripTitle: { ...type.labelSm, fontFamily: fonts.bold, color: GH.white, letterSpacing: 1 },
  dstripSub: { ...type.meta, color: GH.hudSoft },
  dstripRow: { flexDirection: "row", justifyContent: "space-between" },
});

