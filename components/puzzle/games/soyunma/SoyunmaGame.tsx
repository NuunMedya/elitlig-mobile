/**
 * SOYUNMA ODASI — oyun bileşeni. Formaları takım takım dolaplara diz.
 *
 * Akış: dolaba dokun → üst grup kalkar → hedefe dokun → formalar yay çizerek
 * uçar → iner (sekme + hafif haptik) → dolap tek renkle dolduysa "takım hazır"
 * (arma, parıltı, rozet HUD'a uçar) → hepsi hazırsa kazanılır, kalan hamleler
 * bonusa dönüşür. Can/jeton/sonuç penceresi çerçevenin işidir.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Animated, Easing, InteractionManager, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { colors, haptics, radius, space, textScale, type } from "@/theme";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import {
  applyMove,
  canPick,
  generateSoyunmaLevel,
  hasAnyMove,
  isAccessible,
  isRackComplete,
  isSolved,
  moveCount,
  peekSoyunmaLevel,
  soyunmaStars,
  SOYUNMA_TEAM_SIZE,
  type SoyunmaBoard,
  type SoyunmaLevel,
  type SoyunmaRack,
} from "@/lib/puzzle/levels/soyunma";
import { TextBurst } from "./Effects";
import { bodyTop, computeGeometry, liftOffset, slotTop, type BoardGeometry } from "./geometry";
import { Crest, Jersey } from "./Jersey";
import { Locker } from "./Locker";

/* ────────────────────────────── durum ────────────────────────────── */

interface Flight {
  id: number;
  from: number;
  to: number;
  count: number;
  color: number;
  fromSlot: number;
  toSlot: number;
  fromDy: number;
}

type Phase = "play" | "won" | "blocked" | "lost";

interface Snapshot {
  racks: SoyunmaRack[];
  moves: number;
  followed: boolean;
}

interface State {
  racks: SoyunmaRack[];
  moves: number;
  history: Snapshot[];
  selected: number | null;
  flight: Flight | null;
  shake: number[];
  bump: number[];
  /** Oyuncu çözücünün yolunu izliyor mu (öğretici ok için). */
  followed: boolean;
  landed: number;
  phase: Phase;
  blockReason: "stuck" | "limit" | null;
}

type Action =
  | { t: "select"; i: number | null }
  | { t: "shake"; i: number }
  | { t: "move"; to: number; geom: BoardGeometry; follows: boolean }
  | { t: "land"; id: number }
  | { t: "undo" }
  | { t: "phase"; phase: Phase; reason?: "stuck" | "limit" | null };

let flightSeq = 0;

function makeReducer(board: SoyunmaBoard) {
  return (s: State, a: Action): State => {
    switch (a.t) {
      case "select":
        return s.selected === a.i ? s : { ...s, selected: a.i };
      case "shake": {
        const shake = s.shake.slice();
        shake[a.i] += 1;
        return { ...s, shake, selected: null };
      }
      case "move": {
        const from = s.selected;
        if (from == null) return s;
        const k = moveCount(board, s.racks, from, a.to);
        if (k === 0) return s;
        const src = s.racks[from];
        const next = applyMove(board, s.racks, from, a.to);
        const flight: Flight = {
          id: ++flightSeq,
          from,
          to: a.to,
          count: k,
          color: src.items[src.items.length - 1],
          fromSlot: src.items.length - k,
          toSlot: s.racks[a.to].items.length,
          fromDy: liftOffset(a.geom, src.items.length - 1),
        };
        const history = s.history.length > 300 ? s.history.slice(-300) : s.history.slice();
        history.push({ racks: s.racks, moves: s.moves, followed: s.followed });
        return {
          ...s,
          racks: next,
          moves: s.moves + 1,
          history,
          selected: null,
          flight,
          followed: s.followed && a.follows,
        };
      }
      case "land": {
        if (!s.flight || s.flight.id !== a.id) return s;
        const bump = s.bump.slice();
        bump[s.flight.to] += 1;
        return { ...s, flight: null, bump, landed: s.landed + 1 };
      }
      case "undo": {
        const prev = s.history[s.history.length - 1];
        if (!prev) return s;
        return {
          ...s,
          racks: prev.racks,
          moves: prev.moves,
          followed: prev.followed,
          history: s.history.slice(0, -1),
          selected: null,
          flight: null,
          phase: "play",
          blockReason: null,
        };
      }
      case "phase":
        return { ...s, phase: a.phase, blockReason: a.reason ?? null, selected: null };
    }
  };
}

/* ────────────────────────────── uçuş katmanı ────────────────────────────── */

const FlightLayer = memo(function FlightLayer({
  flight,
  geom,
  teamIds,
  onDone,
}: {
  flight: Flight | null;
  geom: BoardGeometry;
  teamIds: number[];
  onDone: (id: number) => void;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flight) return;
    t.setValue(0);
    const dx = Math.abs(geom.rackX[flight.to] - geom.rackX[flight.from]);
    const dy = Math.abs(geom.rackY[flight.to] - geom.rackY[flight.from]);
    const ms = Math.max(260, Math.min(430, 220 + (dx + dy) * 0.45));
    const anim = Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    anim.start(() => onDone(flight.id));
    return () => anim.stop();
  }, [flight, geom, onDone, t]);
  if (!flight) return null;
  const w = geom.colW - geom.pad * 2;
  const pts = [0, 0.25, 0.5, 0.75, 1];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: flight.count }, (_, m) => {
        const x0 = geom.rackX[flight.from] + geom.pad;
        const y0 = geom.rackY[flight.from] + slotTop(geom, flight.fromSlot + m) + flight.fromDy;
        const x1 = geom.rackX[flight.to] + geom.pad;
        const y1 = geom.rackY[flight.to] + slotTop(geom, flight.toSlot + m);
        const arc = geom.slotH * 0.9 + Math.abs(x1 - x0) * 0.18;
        return (
          <Animated.View
            key={m}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: w,
              height: geom.slotH,
              transform: [
                { translateX: t.interpolate({ inputRange: pts, outputRange: pts.map((p) => x0 + (x1 - x0) * p) }) },
                {
                  translateY: t.interpolate({
                    inputRange: pts,
                    outputRange: pts.map((p) => y0 + (y1 - y0) * p - arc * 4 * p * (1 - p)),
                  }),
                },
                { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] }) },
                { rotate: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", x1 > x0 ? "8deg" : "-8deg", "0deg"] }) },
              ],
            }}
          >
            <Jersey team={teamIds[flight.color]} width={w} height={geom.slotH} />
          </Animated.View>
        );
      })}
    </View>
  );
});

/* ────────────────────────────── arma uçuşu (HUD'a) ────────────────────────────── */

interface CrestFlightInfo {
  id: number;
  team: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CrestFly = memo(function CrestFly({ info, onArrive }: { info: CrestFlightInfo | null; onArrive: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!info) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 720, delay: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && onArrive(),
    );
  }, [info, onArrive, t]);
  if (!info) return null;
  const S = 30;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: S,
        height: S,
        opacity: t.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [info.x0 - S / 2, info.x1 - S / 2] }) },
          {
            translateY: t.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [info.y0 - S / 2, Math.min(info.y0, info.y1) - 40, info.y1 - S / 2],
            }),
          },
          { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1.3, 0.6] }) },
        ],
      }}
    >
      <Crest team={info.team} size={S} />
    </Animated.View>
  );
});

/* ────────────────────────────── HUD ────────────────────────────── */

function HudStat({ label, value, tone }: { label: string; value: string; tone?: "warn" | null }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text {...textScale.badge} style={styles.statLabel}>
        {label}
      </Text>
      <Text {...textScale.dense} style={[styles.statValue, tone === "warn" ? { color: colors.loss } : null]}>
        {value}
      </Text>
    </View>
  );
}

function StarMeter({ stars }: { stars: number }) {
  return (
    <View style={styles.stars} accessible accessibilityLabel={`Şu an ${stars} yıldız`}>
      {[1, 2, 3].map((n) => (
        <Ionicons key={n} name={n <= stars ? "star" : "star-outline"} size={16} color={n <= stars ? colors.warn : colors.textTertiary} />
      ))}
    </View>
  );
}

function BoosterButton({
  icon,
  label,
  stock,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  stock: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}, stok ${stock}`}
      style={({ pressed }) => [styles.booster, disabled ? { opacity: 0.45 } : null, pressed ? { opacity: 0.7 } : null]}
    >
      <Ionicons name={icon} size={20} color={colors.brandAccent} />
      <View style={[styles.stockBadge, { backgroundColor: stock > 0 ? colors.brand : colors.textTertiary }]}>
        <Text {...textScale.badge} style={styles.stockText}>
          {stock > 0 ? String(stock) : "+"}
        </Text>
      </View>
    </Pressable>
  );
}

/* ────────────────────────────── tahta ────────────────────────────── */

const COMBO_TEXT = ["Takım hazır!", "Harika!", "Muhteşem!", "Efsane!"];
const BONUS_STEP = 50;

interface BoardProps extends PuzzleGameProps {
  lvl: SoyunmaLevel;
}

function SoyunmaBoardView({ lvl, maxWidth, preBoosters, boosterStock, useBooster: spendBooster, onFinish, paused }: BoardProps) {
  // Ön güçlendirici: "aski" → sona boş bir ek askı.
  const extra = preBoosters.includes("aski");
  const board: SoyunmaBoard = useMemo(
    () => ({
      caps: extra ? [...lvl.caps, SOYUNMA_TEAM_SIZE] : lvl.caps,
      locks: extra ? [...lvl.locks, null] : lvl.locks,
      team: lvl.team,
      colors: lvl.colors,
    }),
    [lvl, extra],
  );
  const initial = useMemo(() => (extra ? [...lvl.racks, { items: [], hidden: 0 }] : lvl.racks), [lvl, extra]);
  const boardPad = space.md;
  const geom = useMemo(() => computeGeometry(board.caps, maxWidth - boardPad * 2), [board, maxWidth, boardPad]);
  const reducer = useMemo(() => makeReducer(board), [board]);
  const [s, dispatch] = useReducer(reducer, undefined, (): State => ({
    racks: initial,
    moves: 0,
    history: [],
    selected: null,
    flight: null,
    shake: initial.map(() => 0),
    bump: initial.map(() => 0),
    followed: true,
    landed: 0,
    phase: "play",
    blockReason: null,
  }));
  const st = useRef(s);
  st.current = s;

  const [burst, setBurst] = useState<{ text: string | null; id: number; tone: "win" | "brand" | "loss" }>({ text: null, id: 0, tone: "brand" });
  const [crestFly, setCrestFly] = useState<CrestFlightInfo | null>(null);
  const [bonus, setBonus] = useState<{ left: number; score: number } | null>(null);
  const goalPulse = useRef(new Animated.Value(0)).current;
  const hudRow = useRef({ x: 0, y: 0 });
  const goalChip = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const boardOrigin = useRef({ x: 0, y: 0 });
  const finished = useRef(false);
  const combo = useRef({ n: 0, lastMove: -10 });
  const prevComplete = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const showBurst = useCallback((text: string, tone: "win" | "brand" | "loss" = "brand") => {
    setBurst((b) => ({ text, id: b.id + 1, tone }));
  }, []);

  const completeCount = useMemo(() => s.racks.filter((r) => isRackComplete(r, board.team)).length, [s.racks, board.team]);
  const landedComplete = s.flight && isRackComplete(s.racks[s.flight.to], board.team) ? completeCount - 1 : completeCount;
  const liveStars = soyunmaStars(lvl, s.moves);
  const remaining = lvl.moveLimit != null ? Math.max(0, lvl.moveLimit - s.moves) : null;

  const finish = useCallback(
    (won: boolean, stars: 0 | 1 | 2 | 3, score?: number) => {
      if (finished.current) return;
      finished.current = true;
      const moves = st.current.moves;
      onFinish({
        won,
        stars,
        score,
        summary: won ? `${moves} hamlede bütün takımlar hazır` : "Soyunma odası toparlanamadı",
      });
    },
    [onFinish],
  );

  /* Dokunma */
  const onPress = useCallback(
    (i: number) => {
      const cur = st.current;
      if (paused || cur.flight || cur.phase !== "play") return;
      if (cur.selected == null) {
        if (canPick(board, cur.racks, i)) {
          haptics.select();
          dispatch({ t: "select", i });
        } else {
          haptics.warning();
          dispatch({ t: "shake", i });
        }
        return;
      }
      if (cur.selected === i) {
        dispatch({ t: "select", i: null });
        return;
      }
      if (moveCount(board, cur.racks, cur.selected, i) > 0) {
        const step = lvl.solution[cur.moves];
        const follows = !!step && step[0] === cur.selected && step[1] === i;
        dispatch({ t: "move", to: i, geom, follows });
      } else {
        haptics.warning();
        dispatch({ t: "shake", i });
      }
    },
    [board, geom, lvl.solution, paused],
  );

  const onLand = useCallback((id: number) => dispatch({ t: "land", id }), []);

  /* İniş sonrası: takım hazır, kilit, kazanç, kayıp */
  useEffect(() => {
    if (s.landed === 0) return;
    const racks = s.racks;
    const done = racks.filter((r) => isRackComplete(r, board.team)).length;
    const newly = done > prevComplete.current;
    prevComplete.current = done;
    const solved = isSolved(board, racks);

    if (newly) {
      const moveNo = s.moves;
      combo.current.n = moveNo - combo.current.lastMove <= 2 ? combo.current.n + 1 : 1;
      combo.current.lastMove = moveNo;
      // Bu inişte hazır olan dolap: hedef dolap (yalnız o değişebilir).
      const last = st.current.history[st.current.history.length - 1];
      const to = racks.findIndex((r, i) => isRackComplete(r, board.team) && !(last && isRackComplete(last.racks[i], board.team)));
      const color = to >= 0 ? racks[to].items[0] : -1;
      // Bu renk bir kilitli dolabın anahtarıysa kapı açılır: güçlü haptik.
      const opened = color >= 0 && board.locks.includes(color);
      if (opened) haptics.goal();
      else haptics.medium();
      if (!solved) showBurst(opened ? "Dolap açıldı!" : COMBO_TEXT[Math.min(COMBO_TEXT.length - 1, combo.current.n - 1)]);
      // Arma HUD'daki sayaca uçar.
      if (to >= 0) {
        setCrestFly({
          id: s.landed,
          team: lvl.teamIds[color],
          x0: boardOrigin.current.x + geom.rackX[to] + geom.colW / 2,
          y0: boardOrigin.current.y + geom.rackY[to] + bodyTop(geom, board.caps[to]),
          x1: hudRow.current.x + goalChip.current.x + goalChip.current.w / 2,
          y1: hudRow.current.y + goalChip.current.y + goalChip.current.h / 2,
        });
      }
    } else {
      haptics.light();
    }

    if (solved) {
      dispatch({ t: "phase", phase: "won" });
      later(() => {
        haptics.success();
        showBurst("Maç kazanıldı!", "win");
      }, 380);
      const stars = soyunmaStars(lvl, s.moves);
      const leftover = lvl.moveLimit != null ? lvl.moveLimit - s.moves : Math.max(0, lvl.star2 - s.moves);
      const base = 500 + lvl.colors * 100 + stars * 150;
      const steps = Math.min(leftover, 24);
      const per = steps > 0 ? Math.round((leftover * BONUS_STEP) / steps) : 0;
      let left = leftover;
      let score = base;
      setBonus({ left, score });
      for (let k = 1; k <= steps; k += 1) {
        later(() => {
          left = k === steps ? 0 : Math.max(0, left - Math.ceil(leftover / steps));
          score += per;
          setBonus({ left, score });
          if (k % 3 === 0) haptics.select();
        }, 1300 + k * 70);
      }
      later(() => finish(true, stars, base + leftover * BONUS_STEP), 1300 + steps * 70 + 700);
      return;
    }
    if (lvl.moveLimit != null && s.moves >= lvl.moveLimit) {
      haptics.error();
      showBurst("Hamleler bitti!", "loss");
      dispatch({ t: "phase", phase: "blocked", reason: "limit" });
      return;
    }
    if (!hasAnyMove(board, racks)) {
      haptics.error();
      showBurst("Hamle kalmadı!", "loss");
      dispatch({ t: "phase", phase: "blocked", reason: "stuck" });
    }
    // Yalnız iniş sayacına bağlı: her iniş bir kez işlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.landed]);

  const onCrestArrive = useCallback(() => {
    goalPulse.setValue(0);
    Animated.timing(goalPulse, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [goalPulse]);

  /* Geri al (oyun içi güçlendirici) */
  const onUndo = useCallback(() => {
    const cur = st.current;
    if (cur.flight || cur.phase === "won" || cur.phase === "lost" || finished.current) return;
    if (cur.history.length === 0) {
      haptics.warning();
      return;
    }
    if (!spendBooster("geri")) return;
    haptics.light();
    prevComplete.current = cur.history[cur.history.length - 1].racks.filter((r) => isRackComplete(r, board.team)).length;
    dispatch({ t: "undo" });
  }, [board.team, spendBooster]);

  const giveUp = useCallback(() => {
    dispatch({ t: "phase", phase: "lost" });
    finish(false, 0);
  }, [finish]);

  // Öğretici ok: ilk seviyelerde çözücünün yolu izlendikçe sıradaki dolabı gösterir.
  const hintRack = useMemo(() => {
    if (lvl.level > 3 || !s.followed || s.flight || s.phase !== "play") return -1;
    const step = lvl.solution[s.moves];
    if (!step) return -1;
    return s.selected == null ? step[0] : s.selected === step[0] ? step[1] : -1;
  }, [lvl, s.followed, s.flight, s.phase, s.moves, s.selected]);

  const onHudLayout = (e: LayoutChangeEvent) => {
    hudRow.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
  };
  const onGoalLayout = (e: LayoutChangeEvent) => {
    const l = e.nativeEvent.layout;
    goalChip.current = { x: l.x, y: l.y, w: l.width, h: l.height };
  };
  const onBoardLayout = (e: LayoutChangeEvent) => {
    boardOrigin.current = { x: e.nativeEvent.layout.x + boardPad, y: e.nativeEvent.layout.y + boardPad };
  };

  const geriStock = boosterStock.geri ?? 0;
  const movesLabel = remaining != null ? "KALAN HAMLE" : "HAMLE";
  const movesValue = bonus ? String(bonus.left) : remaining != null ? String(remaining) : String(s.moves);
  const nextStarText =
    s.phase !== "play"
      ? null
      : s.moves < lvl.star3
        ? `3 yıldız için en çok ${lvl.star3} hamle`
        : s.moves < lvl.star2
          ? `2 yıldız için en çok ${lvl.star2} hamle`
          : null;
  // Uçuş sürerken kapı/kilit durumu hamle öncesine göre çizilir (iniş anında açılsın).
  const viewRacks = s.flight ? s.history[s.history.length - 1]?.racks ?? s.racks : s.racks;

  return (
    <View style={{ width: maxWidth }}>
      {/* HUD */}
      <View style={styles.hud} onLayout={onHudLayout}>
        <HudStat label={movesLabel} value={movesValue} tone={remaining != null && remaining <= 3 && !bonus ? "warn" : null} />
        <Animated.View
          onLayout={onGoalLayout}
          style={[
            styles.goal,
            { transform: [{ scale: goalPulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.18, 1] }) }] },
          ]}
          accessible
          accessibilityLabel={`Hazır takım: ${landedComplete} / ${lvl.colors}`}
        >
          <Crest team={lvl.teamIds[0]} size={22} />
          <View>
            <Text {...textScale.badge} style={styles.statLabel}>
              TAKIM
            </Text>
            <Text {...textScale.dense} style={styles.statValue}>
              {landedComplete}/{lvl.colors}
            </Text>
          </View>
        </Animated.View>
        <View style={styles.hudRight}>
          {bonus ? (
            <HudStat label="SKOR" value={String(bonus.score)} />
          ) : (
            <StarMeter stars={liveStars} />
          )}
          <BoosterButton icon="arrow-undo" label="Geri al" stock={geriStock} disabled={s.moves === 0 || s.phase === "won"} onPress={onUndo} />
        </View>
      </View>
      <View style={styles.subRow}>
        {lvl.cup ? (
          <View style={styles.cupTag}>
            <Ionicons name="trophy" size={12} color={colors.textOnBrand} />
            <Text {...textScale.badge} style={styles.cupText}>
              KUPA MAÇI
            </Text>
          </View>
        ) : null}
        {nextStarText ? (
          <Text {...textScale.dense} style={styles.subText} numberOfLines={1}>
            {nextStarText}
          </Text>
        ) : null}
      </View>
      {lvl.tip && s.moves === 0 ? (
        <View style={styles.tip}>
          <Ionicons name="bulb" size={16} color={colors.brandAccent} />
          <Text {...textScale.long} style={styles.tipText}>
            {lvl.tip}
          </Text>
        </View>
      ) : null}

      {/* Tahta */}
      <View style={styles.room} onLayout={onBoardLayout}>
        <View style={{ width: geom.width, height: geom.height }}>
          {board.caps.map((cap, i) => {
            const r = s.racks[i];
            const incoming = s.flight && s.flight.to === i ? s.flight.count : 0;
            return (
              <Locker
                key={i}
                index={i}
                cap={cap}
                items={r.items}
                hidden={r.hidden}
                teamIds={lvl.teamIds}
                lock={board.locks[i]}
                unlocked={board.locks[i] == null || isAccessible(board, viewRacks, i)}
                complete={isRackComplete(r, board.team) && incoming === 0}
                lift={s.selected === i ? (r.items.length ? (topRun(r) ?? 0) : 0) : 0}
                incoming={incoming}
                shake={s.shake[i]}
                bump={s.bump[i]}
                hint={hintRack === i}
                geom={geom}
                onPress={onPress}
              />
            );
          })}
          <FlightLayer flight={s.flight} geom={geom} teamIds={lvl.teamIds} onDone={onLand} />
          <TextBurst text={burst.text} id={burst.id} tone={burst.tone} />
        </View>
      </View>

      {s.phase === "blocked" ? (
        <View style={styles.blocked}>
          <Text {...textScale.dense} style={styles.blockedTitle}>
            {s.blockReason === "limit" ? "Hamle hakkın bitti" : "Hamle kalmadı"}
          </Text>
          <Text {...textScale.long} style={styles.blockedText}>
            Son hamleyi geri alıp yeni bir yol deneyebilirsin.
          </Text>
          <View style={styles.blockedRow}>
            <Pressable
              onPress={onUndo}
              accessibilityRole="button"
              accessibilityLabel={`Geri al, stok ${geriStock}`}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed ? { opacity: 0.8 } : null]}
            >
              <Ionicons name="arrow-undo" size={16} color={colors.textOnBrand} />
              <Text {...textScale.dense} style={styles.btnPrimaryText}>
                Geri al ({geriStock})
              </Text>
            </Pressable>
            <Pressable
              onPress={giveUp}
              accessibilityRole="button"
              accessibilityLabel="Pes et"
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed ? { opacity: 0.7 } : null]}
            >
              <Text {...textScale.dense} style={styles.btnGhostText}>
                Pes et
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <CrestFly info={crestFly} onArrive={onCrestArrive} />
      </View>
    </View>
  );
}

/** Seçili dolabın kalkacak grubu (gizliler hariç). */
function topRun(r: SoyunmaRack): number | null {
  if (!r.items.length) return null;
  const c = r.items[r.items.length - 1];
  let n = 1;
  for (let i = r.items.length - 2; i >= r.hidden && r.items[i] === c; i -= 1) n += 1;
  return n;
}

/* ────────────────────────────── giriş ────────────────────────────── */

export default function SoyunmaGame(props: PuzzleGameProps) {
  const [lvl, setLvl] = useState<SoyunmaLevel | null>(() => peekSoyunmaLevel(props.level));
  useEffect(() => {
    if (lvl && lvl.level === props.level) return;
    // Üretim + çözücü bir anlık iş; geçiş animasyonu bitince çalışsın.
    const task = InteractionManager.runAfterInteractions(() => setLvl(generateSoyunmaLevel(props.level)));
    return () => task.cancel();
  }, [props.level, lvl]);

  if (!lvl || lvl.level !== props.level) {
    return (
      <View style={[styles.loading, { width: props.maxWidth }]} accessibilityLabel="Soyunma odası hazırlanıyor">
        <Ionicons name="shirt" size={28} color={colors.textTertiary} />
        <Text {...textScale.dense} style={styles.subText}>
          Formalar dolaplara diziliyor…
        </Text>
      </View>
    );
  }
  return <SoyunmaBoardView key={`${lvl.level}-${props.preBoosters.join(",")}`} lvl={lvl} {...props} />;
}

/* ────────────────────────────── stiller ────────────────────────────── */

const styles = StyleSheet.create({
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.s,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { minWidth: 64 },
  statLabel: { ...type.micro, color: colors.textTertiary },
  statValue: { ...type.scoreSm, color: colors.textPrimary },
  goal: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  hudRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: space.md },
  stars: { flexDirection: "row", gap: 1 },
  booster: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stockBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stockText: { ...type.nano, color: colors.textOnBrand },
  subRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.s, minHeight: 18, paddingHorizontal: space.xs },
  subText: { ...type.caption, color: colors.textSecondary },
  cupTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  cupText: { ...type.micro, color: colors.textOnBrand },
  tip: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    marginTop: space.s,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.brandDim,
  },
  tipText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  room: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  blocked: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.s,
  },
  blockedTitle: { ...type.h3, color: colors.textPrimary },
  blockedText: { ...type.bodySm, color: colors.textSecondary },
  blockedRow: { flexDirection: "row", gap: space.sm, marginTop: space.s },
  btn: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
  },
  btnPrimary: { backgroundColor: colors.brand, flex: 1 },
  btnPrimaryText: { ...type.label, color: colors.textOnBrand },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostText: { ...type.label, color: colors.textPrimary },
  loading: { height: 240, alignItems: "center", justifyContent: "center", gap: space.sm },
});
