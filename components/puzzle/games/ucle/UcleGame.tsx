import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, haptics, radius, space, textScale, type } from "@/theme";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { UCLE_RACK, generateUcleLevel, tileBlock, ucleStars, type TileBlock, type UcleLevel } from "@/lib/puzzle/levels/ucle";
import { UCLE_COLORS, UCLE_UI as UI } from "@/lib/puzzle/uclePalette";
import { BoardTile } from "./BoardTile";
import { RackPiece, type FlyFrom } from "./RackPiece";
import { Confetti, PopText } from "./Effects";
import { BoosterBar, Hud, boosterBarHeight, hudHeight } from "./Hud";
import { BoardFrame, FRAME_DEPTH, FRAME_RIM } from "./Frame";

/* ───────────────────────────── durum ───────────────────────────── */

interface Entry {
  id: number;
  kind: number;
  clearing: boolean;
  from: FlyFrom | null;
}

type Status = "play" | "full" | "won" | "lost";

interface GameState {
  onBoard: boolean[];
  /** Ters karo bir kez açılınca açık kalır. */
  revealed: boolean[];
  rack: Entry[];
  /** Toplanan karolar sırasıyla (Geri Al için). */
  history: number[];
  status: Status;
  peak: number;
  combo: number;
  bestCombo: number;
  /** Son üçlüden bu yana toplanan karo (kombo penceresi). */
  sinceMatch: number;
}

interface Fx {
  seq: number;
  text: string;
  tone: "combo" | "info" | "warn";
}

const COMBO_TEXT = ["", "", "Harika!", "Muhteşem!", "Efsane!", "Gol gibi!"];
/** Tepsinin alt kalınlığı (3D). */
const TRAY_DEPTH = 5;

const live = (rack: Entry[]) => rack.filter((e) => !e.clearing);

function initialState(lvl: UcleLevel): GameState {
  const onBoard = lvl.tiles.map(() => true);
  return {
    onBoard,
    revealed: lvl.tiles.map((t) => !t.hidden),
    rack: [],
    history: [],
    status: "play",
    peak: 0,
    combo: 0,
    bestCombo: 0,
    sinceMatch: 0,
  };
}

/** Üstü açılan ters karoları çevir. */
function reveal(lvl: UcleLevel, onBoard: boolean[], revealed: boolean[]): boolean[] {
  let out = revealed;
  for (let i = 0; i < lvl.tiles.length; i++) {
    if (out[i] || !onBoard[i]) continue;
    if (lvl.blockers[i].every((b) => !onBoard[b])) {
      if (out === revealed) out = revealed.slice();
      out[i] = true;
    }
  }
  return out;
}

/** Rafa yerleştir: aynı türün en sağına, yoksa sona. */
function insertEntry(rack: Entry[], e: Entry): Entry[] {
  let at = -1;
  for (let i = rack.length - 1; i >= 0; i--) if (!rack[i].clearing && rack[i].kind === e.kind) { at = i + 1; break; }
  const next = rack.slice();
  if (at < 0) next.push(e);
  else next.splice(at, 0, e);
  return next;
}

/* ───────────────────────────── oyun ───────────────────────────── */

export function UcleGame({ level, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused }: PuzzleGameProps) {
  const lvl = useMemo(() => generateUcleLevel(level), [level]);
  const rackSize = UCLE_RACK + (preBoosters.includes("raf") ? 1 : 0);

  const [st, setSt] = useState<GameState>(() => initialState(lvl));
  const stRef = useRef(st);
  const commit = useCallback((next: GameState) => {
    stRef.current = next;
    setSt(next);
  }, []);

  const [fx, setFx] = useState<Fx | null>(null);
  const fxSeq = useRef(0);
  const pop = useCallback((text: string, tone: Fx["tone"] = "info") => {
    fxSeq.current += 1;
    setFx({ seq: fxSeq.current, text, tone });
  }, []);

  const [glow, setGlow] = useState<Set<number>>(() => new Set());
  const [tipOpen, setTipOpen] = useState(!!lvl.tip);
  useEffect(() => {
    if (!tipOpen) return;
    const t = setTimeout(() => setTipOpen(false), 7000);
    return () => clearTimeout(t);
  }, [tipOpen]);
  const boostersUsed = useRef(0);
  const hintBusy = useRef(false);
  const finished = useRef(false);

  /* ── geometri ──
   * Dikey düzen (toplam = maxHeight): HUD | sahne (tahta çerçevesi + raf) | güçlendiriciler.
   * Tahta, çerçevenin içindeki alana EN BÜYÜK karo boyuyla sığdırılır ve
   * ortalanır; raf sahnenin altına yaslanır. Boşluk kalmaz. */
  const compact = maxHeight < 560;
  const hudH = hudHeight(compact);
  const barH = boosterBarHeight(compact);
  const gapV = compact ? space.s : space.sm;
  const stageH = Math.max(220, maxHeight - hudH - barH - gapV * 2);

  const rackPad = compact ? space.s : space.sm;
  const rackGap = space.xs;
  const rc = Math.floor(Math.min(compact ? 50 : 60, (maxWidth - 2 * rackPad - (rackSize - 1) * rackGap - 4) / rackSize));
  const rackW = rackSize * rc + (rackSize - 1) * rackGap + 2 * rackPad;
  const rackH = rc + 2 * rackPad;
  const rackLeft = (maxWidth - rackW) / 2;
  const rackTop = stageH - rackH - TRAY_DEPTH;

  const maxZ = lvl.layers - 1;
  const cols = lvl.spanX / 2;
  const rows = lvl.spanY / 2;
  const frameH = rackTop - gapV;
  const feltPad = FRAME_RIM + (compact ? space.s : space.sm);
  const availW = maxWidth - feltPad * 2;
  const availH = frameH - FRAME_DEPTH - feltPad * 2;
  const fitTile = (depth: number) => Math.min((availW - maxZ * depth) / cols, (availH - maxZ * depth) / (rows * 1.1));
  // Katman kayması karo boyuyla büyür; iki geçiş: büyük kayma → küçük karo, sığma garanti.
  const depthPx = Math.max(3, Math.round(fitTile(3) * 0.065));
  const tw = Math.floor(Math.max(26, Math.min(92, fitTile(depthPx))));
  const th = Math.round(tw * 1.1);
  const slab = Math.max(3, Math.round(tw * 0.1));
  const hx = tw / 2;
  const hy = th / 2;
  const boardW = lvl.spanX * hx + maxZ * depthPx;
  const boardH = lvl.spanY * hy + maxZ * depthPx;
  const boardLeft = Math.max(feltPad, (maxWidth - boardW) / 2);
  const boardTop = Math.max(feltPad, (frameH - FRAME_DEPTH - boardH) / 2);
  const tileLeft = useCallback((i: number) => boardLeft + lvl.tiles[i].x * hx + (maxZ - lvl.tiles[i].z) * depthPx, [boardLeft, lvl, hx, maxZ, depthPx]);
  const tileTop = useCallback((i: number) => boardTop + lvl.tiles[i].y * hy + (maxZ - lvl.tiles[i].z) * depthPx, [boardTop, lvl, hy, maxZ, depthPx]);

  const slotX = useCallback(
    (i: number, count: number) => {
      const inner = rackSize * rc + (rackSize - 1) * rackGap;
      const step = count <= rackSize ? rc + rackGap : (inner - rc) / (count - 1);
      return rackLeft + rackPad + i * step;
    },
    [rackSize, rc, rackGap, rackLeft, rackPad],
  );
  const slotY = rackTop + rackPad;

  const flyFrom = useCallback(
    (i: number): FlyFrom => ({ x: tileLeft(i) + tw / 2 - rc / 2, y: tileTop(i) + th / 2 - rc / 2, scale: tw / rc }),
    [tileLeft, tileTop, tw, th, rc],
  );

  /* ── süre ── */
  const [timeLeft, setTimeLeft] = useState<number | null>(lvl.timeLimit);
  const timeRef = useRef(lvl.timeLimit ?? 0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 900);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!lvl.timeLimit || !started || paused || st.status !== "play") return;
    let last = Date.now();
    const iv = setInterval(() => {
      const now = Date.now();
      timeRef.current = Math.max(0, timeRef.current - (now - last) / 1000);
      last = now;
      const shown = Math.ceil(timeRef.current);
      setTimeLeft((p) => (p === shown ? p : shown));
      if (timeRef.current <= 0) {
        clearInterval(iv);
        if (stRef.current.status === "play") {
          commit({ ...stRef.current, status: "lost" });
          haptics.error();
        }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [lvl.timeLimit, started, paused, st.status, commit]);

  /* ── bitiş ── */
  const finish = useCallback(
    (won: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const s = stRef.current;
      if (!won) {
        onFinish({ won: false, stars: 0, summary: s.status === "lost" ? "Süre doldu" : "Raf doldu" });
        return;
      }
      const left = Math.ceil(timeRef.current);
      const stars = ucleStars({ timeLimit: lvl.timeLimit, timeLeft: left, boostersUsed: boostersUsed.current, peakRack: s.peak, rackSize: UCLE_RACK });
      const score = lvl.tiles.length * 10 + s.bestCombo * 25 + (lvl.timeLimit ? left * 5 : 0);
      onFinish({
        won: true,
        stars,
        score,
        summary: lvl.timeLimit
          ? `${lvl.tiles.length} karo · ${left} sn kaldı (+${left * 5})`
          : `${lvl.tiles.length} karo · en iyi seri ×${Math.max(1, s.bestCombo)}`,
      });
    },
    [lvl, onFinish],
  );

  useEffect(() => {
    if (st.status === "won") {
      haptics.success();
      // Kalan süre bonusa dönüşür: kısa bir an gösterilir.
      const left = Math.ceil(timeRef.current);
      const b = lvl.timeLimit && left > 0 ? setTimeout(() => pop(`Süre bonusu +${left * 5}`, "combo"), 650) : null;
      const t = setTimeout(() => finish(true), lvl.timeLimit ? 1900 : 1500);
      return () => {
        clearTimeout(t);
        if (b) clearTimeout(b);
      };
    }
    if (st.status === "lost") {
      const t = setTimeout(() => finish(false), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [st.status, finish, lvl.timeLimit, pop]);

  /* ── raf sarsıntısı ── */
  const rackShake = useRef(new Animated.Value(0)).current;
  const shakeRack = () => {
    rackShake.setValue(0);
    Animated.timing(rackShake, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true }).start();
  };
  const rackShakeX = rackShake.interpolate({ inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1], outputRange: [0, -9, 8, -6, 5, -2, 0] });

  /* ── toplama ── */

  /** Karoları tahtadan rafa al ve sonucu (üçlü / kilit / kazanç / dolu raf) uygula. */
  const collect = useCallback(
    (ids: number[], source: "tap" | "hint") => {
      const cur = stRef.current;
      const onBoard = cur.onBoard.slice();
      let rack = cur.rack;
      let keyOpened = false;
      for (const id of ids) {
        onBoard[id] = false;
        if (lvl.tiles[id].key != null) keyOpened = true;
        rack = insertEntry(rack, { id, kind: lvl.tiles[id].kind, clearing: false, from: flyFrom(id) });
      }
      const kind = lvl.tiles[ids[ids.length - 1]].kind;
      const same = rack.filter((e) => !e.clearing && e.kind === kind);
      const matched = same.length >= 3;
      if (matched) {
        const clear = new Set(same.slice(0, 3).map((e) => e.id));
        rack = rack.map((e) => (clear.has(e.id) ? { ...e, clearing: true } : e));
      }
      let combo = cur.combo;
      let sinceMatch = cur.sinceMatch + ids.length;
      if (matched) {
        combo = sinceMatch <= 3 && cur.combo > 0 ? cur.combo + 1 : 1;
        sinceMatch = 0;
      } else if (sinceMatch > 3) combo = 0;
      const liveCount = live(rack).length;
      const boardLeftCount = onBoard.reduce((a, v) => a + (v ? 1 : 0), 0);
      let status: Status = "play";
      if (boardLeftCount === 0 && liveCount === 0) status = "won";
      else if (!matched && liveCount >= rackSize) status = "full";
      commit({
        onBoard,
        revealed: reveal(lvl, onBoard, cur.revealed),
        rack,
        history: [...cur.history, ...ids],
        status,
        peak: Math.max(cur.peak, liveCount),
        combo,
        bestCombo: Math.max(cur.bestCombo, combo),
        sinceMatch,
      });
      // Geri bildirim.
      if (status === "won") {
        pop("Tahta temiz!", "combo");
      } else if (status === "full") {
        haptics.error();
        shakeRack();
        pop("Raf doldu!", "warn");
      } else if (matched) {
        if (keyOpened) haptics.goal();
        else haptics.medium();
        if (combo >= 2) pop(COMBO_TEXT[Math.min(combo, COMBO_TEXT.length - 1)], "combo");
        else if (source === "hint") pop("İpucu: üçlü tamam!");
        else if (keyOpened) pop("Kilit açıldı!");
      } else {
        if (keyOpened) {
          haptics.goal();
          pop("Kilit açıldı!");
        } else haptics.select();
        if (liveCount === rackSize - 1) pop("Dikkat: raf dolmak üzere!", "warn");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lvl, flyFrom, rackSize, commit, pop],
  );

  const onTilePress = useCallback(
    (id: number) => {
      const cur = stRef.current;
      if (cur.status !== "play" || !cur.onBoard[id] || hintBusy.current) return;
      if (tileBlock(lvl, id, cur.onBoard) !== "free") return;
      setTipOpen(false);
      collect([id], "tap");
    },
    [lvl, collect],
  );

  const onBlockedPress = useCallback(
    (id: number) => {
      const b = tileBlock(lvl, id, stRef.current.onBoard);
      haptics.light();
      if (b === "locked") pop("Önce aynı renkli anahtarı topla");
      else if (b === "chained") pop("Yanındaki karoyu kaldır, zincir kopsun");
    },
    [lvl, pop],
  );

  const onCleared = useCallback(
    (id: number) => {
      const cur = stRef.current;
      if (!cur.rack.some((e) => e.id === id)) return;
      commit({ ...cur, rack: cur.rack.filter((e) => e.id !== id) });
    },
    [commit],
  );

  /* ── güçlendiriciler ── */

  const undoTarget = (s: GameState): number | null => {
    const ids = new Set(live(s.rack).map((e) => e.id));
    for (let i = s.history.length - 1; i >= 0; i--) if (ids.has(s.history[i])) return s.history[i];
    return null;
  };

  const onUndo = useCallback(() => {
    const cur = stRef.current;
    if (cur.status !== "play" && cur.status !== "full") return;
    const target = undoTarget(cur);
    if (target == null) {
      pop("Geri alınacak karo yok");
      return;
    }
    if (!useBooster("geri_al")) return;
    boostersUsed.current += 1;
    const onBoard = cur.onBoard.slice();
    onBoard[target] = true;
    const h = cur.history.slice();
    h.splice(h.lastIndexOf(target), 1);
    commit({ ...cur, onBoard, rack: cur.rack.filter((e) => e.id !== target), history: h, status: "play", combo: 0 });
    haptics.medium();
    pop("Geri alındı");
  }, [commit, pop, useBooster]);

  const hintPlan = (s: GameState): number[] | null => {
    const counts = new Map<number, number>();
    for (const e of live(s.rack)) counts.set(e.kind, (counts.get(e.kind) || 0) + 1);
    const freeIds: number[] = [];
    for (let i = 0; i < lvl.tiles.length; i++) if (s.onBoard[i] && tileBlock(lvl, i, s.onBoard) === "free") freeIds.push(i);
    let kind = -1;
    let best = -1;
    for (const [k, c] of counts) if (c > best) { best = c; kind = k; }
    if (kind < 0) {
      // Raf boşsa: tahtada en çok açık eşi olan tür.
      const fc = new Map<number, number>();
      for (const i of freeIds) fc.set(lvl.tiles[i].kind, (fc.get(lvl.tiles[i].kind) || 0) + 1);
      for (const [k, c] of fc) if (c > best) { best = c; kind = k; }
      best = 0;
    }
    if (kind < 0) return null;
    const need = 3 - best;
    const free = new Set(freeIds);
    const cands = lvl.tiles
      .filter((t) => s.onBoard[t.id] && t.kind === kind)
      .sort((a, b) => Number(free.has(b.id)) - Number(free.has(a.id)) || b.z - a.z)
      .map((t) => t.id);
    return cands.length >= need ? cands.slice(0, need) : null;
  };

  const onHint = useCallback(() => {
    const cur = stRef.current;
    if ((cur.status !== "play" && cur.status !== "full") || hintBusy.current) return;
    const plan = hintPlan(cur);
    if (!plan) return;
    if (!useBooster("ipucu")) return;
    boostersUsed.current += 1;
    hintBusy.current = true;
    if (cur.status === "full") commit({ ...cur, status: "play" });
    setGlow(new Set(plan));
    haptics.light();
    setTimeout(() => {
      hintBusy.current = false;
      setGlow(new Set());
      collect(plan, "hint");
    }, 520);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collect, commit, useBooster]);

  /* ── türetilmiş ── */
  const blocks: TileBlock[] = useMemo(() => lvl.tiles.map((t) => (st.onBoard[t.id] ? tileBlock(lvl, t.id, st.onBoard) : "free")), [lvl, st.onBoard]);
  const remaining = useMemo(() => st.onBoard.reduce((a, v) => a + (v ? 1 : 0), 0), [st.onBoard]);
  const locksLeft = useMemo(() => lvl.tiles.filter((t) => st.onBoard[t.id] && blocks[t.id] === "locked").length, [lvl, st.onBoard, blocks]);
  const chainsLeft = useMemo(() => lvl.tiles.filter((t) => st.onBoard[t.id] && blocks[t.id] === "chained").length, [lvl, st.onBoard, blocks]);
  const canUndo = (st.status === "play" || st.status === "full") && undoTarget(st) != null;
  const canHint = (st.status === "play" || st.status === "full") && remaining > 0;

  const introDelay = (i: number) => Math.min(700, lvl.tiles[i].z * 110 + lvl.tiles[i].y * 14 + lvl.tiles[i].x * 5);
  const introDone = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => (introDone.current = true), 50);
    return () => clearTimeout(t);
  }, []);

  const liveCount = live(st.rack).length;
  const rackWarn = st.status === "full" || (st.status === "play" && liveCount >= rackSize - 1);

  return (
    <View style={{ width: maxWidth, height: maxHeight }}>
      <Hud
        level={level}
        shapeTitle={lvl.shapeTitle}
        cup={lvl.cup}
        remaining={remaining}
        total={lvl.tiles.length}
        timeLeft={timeLeft}
        timeLimit={lvl.timeLimit}
        locksLeft={locksLeft}
        chainsLeft={chainsLeft}
        extraRack={rackSize > UCLE_RACK}
        compact={compact}
      />
      <View style={[styles.stage, { height: stageH, marginTop: gapV }]}>
        {/* Tahta çerçevesi: çim keçe + ahşap kenar; tahta içine ortalanır. */}
        <BoardFrame left={0} top={0} width={maxWidth} height={frameH} />

        {/* Raf tepsisi ve hücreler */}
        <Animated.View
          style={[styles.trayWrap, { left: rackLeft, top: rackTop, width: rackW, height: rackH + TRAY_DEPTH, transform: [{ translateX: rackShakeX }] }]}
          accessibilityLabel={`Raf: ${liveCount} / ${rackSize}`}
        >
          <View style={[styles.trayBase, { top: TRAY_DEPTH, height: rackH }]} />
          <View style={[styles.tray, { height: rackH }, rackWarn && styles.trayWarn]}>
            {Array.from({ length: rackSize }, (_, i) => (
              <View
                key={i}
                style={[styles.cell, { left: rackPad - 2 + i * (rc + rackGap), top: rackPad - 2, width: rc, height: rc }, i === UCLE_RACK && styles.cellBonus]}
              />
            ))}
          </View>
        </Animated.View>

        {/* Tahta: dizi z sırasında, üst katman en son çizilir. */}
        {lvl.tiles.map((t) =>
          st.onBoard[t.id] ? (
            <BoardTile
              key={t.id}
              id={t.id}
              kind={t.kind}
              left={tileLeft(t.id)}
              top={tileTop(t.id)}
              w={tw}
              h={th}
              slab={slab}
              block={blocks[t.id]}
              faceUp={st.revealed[t.id]}
              lockGroup={t.lock}
              keyGroup={t.key}
              glow={glow.has(t.id)}
              introDelay={introDone.current ? 0 : introDelay(t.id)}
              onPress={onTilePress}
              onBlockedPress={onBlockedPress}
            />
          ) : null,
        )}

        {/* Raftaki karolar (sahne koordinatında: tahtadan uçabilsinler). */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: rackShakeX }] }]}>
          {st.rack.map((e, i) => (
            <RackPiece
              key={e.id}
              id={e.id}
              kind={e.kind}
              x={slotX(i, st.rack.length)}
              y={slotY}
              size={rc}
              from={e.from}
              clearing={e.clearing}
              onCleared={onCleared}
            />
          ))}
        </Animated.View>

        {tipOpen && lvl.tip ? (
          <Pressable
            style={[styles.tip, { top: FRAME_RIM + space.xs }]}
            onPress={() => setTipOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={`İpucu: ${lvl.tip}. Kapatmak için dokun`}
          >
            <View style={styles.tipIcon}>
              <Ionicons name="bulb" size={16} color={UI.tipInk} />
            </View>
            <Text style={styles.tipText} {...textScale.long}>
              {lvl.tip}
            </Text>
            <Ionicons name="close" size={16} color={UI.tipInk} />
          </Pressable>
        ) : null}

        {fx ? <PopText key={fx.seq} text={fx.text} tone={fx.tone} top={rackTop - 56} /> : null}

        {st.status === "won" ? <Confetti width={maxWidth} height={stageH} palette={UCLE_COLORS.sparks} /> : null}

        {st.status === "full" || st.status === "lost" ? (
          <EndCard
            status={st.status}
            canUndo={canUndo}
            undoStock={boosterStock.geri_al ?? 0}
            hintStock={boosterStock.ipucu ?? 0}
            onUndo={onUndo}
            onHint={onHint}
            onGiveUp={() => finish(false)}
          />
        ) : null}
      </View>
      <View style={{ marginTop: gapV }}>
        <BoosterBar width={maxWidth} compact={compact} stock={boosterStock} canUndo={canUndo} canHint={canHint} onUndo={onUndo} onHint={onHint} />
      </View>
    </View>
  );
}

/** Raf doldu / süre bitti kartı: dolu rafta Geri Al ya da İpucu ile kurtarma şansı. */
function EndCard({
  status,
  canUndo,
  undoStock,
  hintStock,
  onUndo,
  onHint,
  onGiveUp,
}: {
  status: Status;
  canUndo: boolean;
  undoStock: number;
  hintStock: number;
  onUndo: () => void;
  onHint: () => void;
  onGiveUp: () => void;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, speed: 14, bounciness: 9, useNativeDriver: true }).start();
  }, [v]);
  const full = status === "full";
  return (
    <View style={styles.endWrap} pointerEvents="box-none">
      <Animated.View
        style={[styles.endCardBase, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
        accessibilityRole="alert"
      >
        <View style={styles.endCard}>
          <View style={styles.endIcon}>
            <Ionicons name={full ? "file-tray-full" : "time"} size={30} color={UI.text} />
          </View>
          <Text style={styles.endTitle}>{full ? "Raf doldu!" : "Süre doldu!"}</Text>
          {full ? (
            <>
              <Text style={styles.endBody} {...textScale.long}>
                Son karoyu geri al ya da ipucuyla bir üçlüyü tamamla; maç devam etsin.
              </Text>
              <View style={styles.endRow}>
                <EndButton icon="arrow-undo" label={`Geri Al (${undoStock})`} onPress={onUndo} disabled={!canUndo} face={UI.orange} deep={UI.orangeDeep} />
                <EndButton icon="bulb" label={`İpucu (${hintStock})`} onPress={onHint} face={UI.blue} deep={UI.blueDeep} />
              </View>
              <EndButton icon="flag" label="Maçı bitir" onPress={onGiveUp} face={UI.panelRim} deep={UI.panelDeep} />
            </>
          ) : (
            <Text style={styles.endBody} {...textScale.long}>
              Bir dahaki sefere daha hızlı!
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function EndButton({
  icon,
  label,
  onPress,
  disabled,
  face,
  deep,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  face: string;
  deep: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.endBtnBase, { backgroundColor: deep }, disabled && styles.endBtnOff, pressed && styles.endBtnPressed]}
    >
      <View style={[styles.endBtn, { backgroundColor: face }]}>
        <Ionicons name={icon} size={18} color={UI.text} />
        <Text style={styles.endBtnText}>{label}</Text>
      </View>
    </Pressable>
  );
}

const shadowText = { textShadowColor: UI.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  stage: { width: "100%" },
  trayWrap: { position: "absolute" },
  trayBase: { position: "absolute", left: 0, right: 0, borderRadius: radius.xl, backgroundColor: UI.trayDeep, borderWidth: 3, borderColor: UI.outline },
  tray: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    borderRadius: radius.xl,
    backgroundColor: UI.tray,
    borderWidth: 3,
    borderColor: UI.outline,
  },
  trayWarn: { backgroundColor: UI.redDeep },
  cell: { position: "absolute", borderRadius: radius.md, backgroundColor: UI.cell, borderWidth: 1.5, borderColor: UI.cellRim },
  cellBonus: { borderWidth: 2, borderColor: UI.gold, borderStyle: "dashed" },
  tip: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    backgroundColor: UI.tipFace,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: UI.tipDeep,
  },
  tipIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: UI.gold, borderWidth: 2.5, borderColor: UI.outline },
  tipText: { ...type.bodySm, fontFamily: fonts.bold, color: UI.tipInk, flex: 1 },
  endWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: UI.scrim, borderRadius: radius.xxl },
  endCardBase: { width: "86%", maxWidth: 360, borderRadius: radius.xxl, backgroundColor: UI.cardDeep, paddingBottom: 6, borderWidth: 3, borderColor: UI.outline },
  endCard: {
    alignItems: "center",
    gap: space.sm,
    padding: space.lg,
    paddingTop: space.xl,
    borderRadius: radius.xxl,
    backgroundColor: UI.card,
    margin: -3,
    borderWidth: 3,
    borderColor: UI.outline,
  },
  endIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.red,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: UI.outline,
  },
  endTitle: { ...type.display, fontFamily: fonts.bold, color: UI.text, ...shadowText },
  endBody: { ...type.body, fontFamily: fonts.semibold, color: UI.text, textAlign: "center" },
  endRow: { flexDirection: "row", gap: space.sm },
  endBtnBase: { borderRadius: radius.pill, paddingBottom: 4, borderWidth: 3, borderColor: UI.outline },
  endBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    margin: -3,
    marginBottom: 0,
    borderWidth: 3,
    borderColor: UI.outline,
  },
  endBtnOff: { opacity: 0.45 },
  endBtnPressed: { transform: [{ translateY: 2 }] },
  endBtnText: { ...type.label, fontFamily: fonts.heading, color: UI.text, ...shadowText },
});
