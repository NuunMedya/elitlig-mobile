/**
 * ELİT ÜÇLÜ — oyun bileşeni.
 *
 * Kurallar saf motorda (lib/puzzle/ucluEngine.ts); burası yalnız girdiyi alır
 * ve motorun ürettiği adımları sırayla canlandırır:
 *   takas (kayma) → temizlik (patlama, ışın, uçan hedef simgesi) → düşme.
 * Motor durumu ref'te tutulur (tek doğruluk kaynağı); React'e yalnız adım
 * anlık görüntüleri gider, böylece her aşama tek bir toplu güncellemedir.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { haptics, radius, space } from "@/theme";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { ucluLevel } from "@/lib/puzzle/levels/uclu";
import { UCLU_BOARD, UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import {
  adjacent, bonusConvert, canHammer, canSwapCell, cloneCells, createGame, detonateAll, findMove, goalsDone,
  hammerCell, hasSpecials, H, placeSpecial, shuffleBoard, starsFor, trySwap, W,
  type Cell, type ClearedTile, type GameState, type Special, type Step,
} from "@/lib/puzzle/ucluEngine";
import { BoardLight, CellView, FrameTrim, LockView, ShineSweep } from "./BoardLayers";
import { FxLayer, type Fx, type FlyGlyph, type FxInput } from "./Effects";
import { BoosterBar, Hud, type HudGoal, type LiveBooster } from "./Hud";
import { TileView } from "./Piece";

interface BoardView {
  cells: Cell[];
  dying: ClearedTile[];
  spawn: Record<number, number>;
}

interface Hint {
  a: number;
  b: number;
  tick: number;
}

const COMBO_WORDS = ["", "", "Güzel!", "Harika!", "Süper!", "Muhteşem!", "Efsane!"];
const SPECIAL_NAMES: Record<Special, string> = { none: "", h: "Füze Şut!", v: "Füze Şut!", bomb: "Röveşata!", ball: "Altın Top!" };
const LIVE_BOOSTERS = [
  { key: "cekic", title: "Krampon Darbesi", icon: "hammer" },
  { key: "karistir", title: "Taktik Değişikliği", icon: "shuffle" },
] as const;
const FRAME = 6;
const BORDER = 2;
/** Çerçevenin bir kenarı: dolgu + kenarlık (tahta bu kadar içeride başlar). */
const PAD = FRAME + BORDER;
const BONUS_MAX = 15;

export default function UcluGame(props: PuzzleGameProps) {
  const { level, maxWidth, preBoosters, boosterStock, onFinish, paused } = props;
  const def = useMemo(() => ucluLevel(level), [level]);
  const cell = Math.max(30, Math.floor((Math.min(maxWidth, 460) - PAD * 2) / W));
  const boardPx = cell * W;

  /* ── motor durumu (ref) + ilk tahta ── */
  const engine = useRef<GameState | null>(null);
  const preCells = useRef<number[]>([]);
  if (!engine.current) {
    const s = createGame(def);
    for (const key of preBoosters) {
      const sp: Special | null = key === "roket" ? (s.rng & 1 ? "h" : "v") : key === "bomba" ? "bomb" : key === "altin_top" ? "ball" : null;
      if (sp) preCells.current.push(placeSpecial(s, sp));
    }
    engine.current = s;
  }
  const S = () => engine.current as GameState;

  const [board, setBoard] = useState<BoardView>(() => {
    const s = S();
    const spawn: Record<number, number> = {};
    s.cells.forEach((c, i) => {
      if (c.tile) spawn[c.tile.id] = Math.floor(i / W) - H - 1 - (i % W) * 0.35;
    });
    return { cells: cloneCells(s.cells), dying: [], spawn };
  });
  /** Ekranda en son gösterilen hücreler (engel vuruşunun rengini seçmek için). */
  const shown = useRef<Cell[]>(board.cells);
  shown.current = board.cells;
  const [goals, setGoals] = useState<HudGoal[]>(() => S().goals.map((g) => ({ type: g.type, color: g.color, left: g.left, target: g.target })));
  const [moves, setMoves] = useState(() => S().moves);
  const [score, setScore] = useState(0);
  const [fx, setFx] = useState<Fx[]>([]);
  const [selected, setSelected] = useState(-1);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hammer, setHammer] = useState(false);
  const [busy, setBusyState] = useState(true);
  const [tip, setTip] = useState<string | null>(def.tip);

  const busyRef = useRef(true);
  const finished = useRef(false);
  const alive = useRef(true);
  const prepaidHammer = useRef(false);
  const fxId = useRef(0);
  const hintTick = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const boosterFn = useRef(props.useBooster);
  boosterFn.current = props.useBooster;
  const finishFn = useRef(onFinish);
  finishFn.current = onFinish;

  const setBusy = useCallback((v: boolean) => {
    busyRef.current = v;
    setBusyState(v);
  }, []);

  // StrictMode bağla-çöz-bağla yaptığında da doğru kalsın diye bağlanınca yeniden true.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

  /* ── konum ölçüleri (efekt katmanı kök bileşene göre çizer) ── */
  const boardPos = useRef({ x: 0, y: 0 });
  const hudPos = useRef({ x: 0, y: 0 });
  const rightPos = useRef({ x: 0, y: 0 });
  const rowPos = useRef({ x: 0, y: 0 });
  const slotPos = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const onBoardLayout = useCallback((e: LayoutChangeEvent) => {
    boardPos.current = { x: e.nativeEvent.layout.x + PAD, y: e.nativeEvent.layout.y + PAD };
  }, []);
  const onHudLayout = useCallback((e: LayoutChangeEvent) => {
    hudPos.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
  }, []);
  const onGoalsPart = useCallback((part: "right" | "row", e: LayoutChangeEvent) => {
    const p = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
    if (part === "right") rightPos.current = p;
    else rowPos.current = p;
  }, []);
  const onGoalSlot = useCallback((i: number, e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    slotPos.current[i] = { x, y, w: width, h: height };
  }, []);

  const center = useCallback(
    (i: number) => ({ x: boardPos.current.x + (i % W) * cell + cell / 2, y: boardPos.current.y + Math.floor(i / W) * cell + cell / 2 }),
    [cell],
  );
  const goalTarget = useCallback((gi: number) => {
    const slot = slotPos.current[gi];
    const bx = hudPos.current.x + rightPos.current.x + rowPos.current.x;
    const by = hudPos.current.y + rightPos.current.y + rowPos.current.y;
    if (!slot) return { x: bx + 20, y: by + 20 };
    return { x: bx + slot.x + 22, y: by + slot.y + slot.h / 2 };
  }, []);

  /* ── efekt listesi: toplu ekle, toplu kaldır ── */
  const addFx = useCallback((items: FxInput[], ttl = 1400) => {
    if (!items.length) return;
    const withIds = items.map((f) => ({ ...f, id: ++fxId.current })) as Fx[];
    const ids = new Set(withIds.map((f) => f.id));
    setFx((prev) => prev.concat(withIds));
    setTimeout(() => {
      if (alive.current) setFx((prev) => prev.filter((f) => !ids.has(f.id)));
    }, ttl);
  }, []);

  const banner = useCallback(
    (text: string, icon: "shuffle" | "flag" | "sparkles" | "rocket" | "hammer") => {
      addFx([{ kind: "banner", x: boardPos.current.x, y: boardPos.current.y + boardPx / 2, w: boardPx, text, icon }], 1500);
    },
    [addFx, boardPx],
  );

  /* ── adım oynatıcı ── */
  const playSteps = useCallback(
    async (steps: Step[]) => {
      const mid = { x: boardPos.current.x + boardPx / 2, y: boardPos.current.y + boardPx / 2 };
      for (const st of steps) {
        if (!alive.current) return;
        if (st.convert) {
          setBoard({ cells: st.convert, dying: [], spawn: {} });
          haptics.goal();
          await wait(420);
        }
        const items: FxInput[] = [];
        const prev = shown.current;
        st.hits.slice(0, 24).forEach((i) => {
          const c = prev[i];
          if (!c) return;
          const color = c.crate > 0 ? UCLU_BOARD.woodHi : c.snow > 0 ? UCLU_BOARD.snowEdge : c.net > 0 ? UCLU_BOARD.net : UCLU_BOARD.mud;
          const p = center(i);
          items.push({ kind: "burst", x: p.x, y: p.y, color, size: cell * 0.9 });
        });
        st.cleared.slice(0, 30).forEach(({ tile, cell: i }) => {
          const p = center(i);
          const color = tile.kind === "trophy" || tile.color < 0 ? UCLU_BOARD.gold : UCLU_PIECE_COLORS[tile.color].base;
          items.push({ kind: "burst", x: p.x, y: p.y, color, size: cell, big: tile.special !== "none" });
        });
        let delay = 0;
        for (const bl of st.blasts) {
          const p = center(bl.cell);
          if (bl.kind === "row") items.push({ kind: "beam", dir: "row", x: mid.x, y: p.y, length: boardPx, thick: cell * 0.62, delay: (delay += 30) });
          else if (bl.kind === "col") items.push({ kind: "beam", dir: "col", x: p.x, y: mid.y, length: boardPx, thick: cell * 0.62, delay: (delay += 30) });
          else if (bl.kind === "bomb") items.push({ kind: "ring", x: p.x, y: p.y, size: cell * ((bl.radius ?? 1) * 2 + 1.4), color: UCLU_BOARD.comboWarm });
          else if (bl.kind === "ball") {
            items.push({ kind: "ring", x: p.x, y: p.y, size: cell * 3, color: UCLU_BOARD.gold });
            (bl.targets ?? []).slice(0, 20).forEach((t) => {
              const q = center(t);
              items.push({ kind: "ring", x: q.x, y: q.y, size: cell * 1.1, color: UCLU_BOARD.goldHi });
            });
          } else items.push({ kind: "flash", x: boardPos.current.x, y: boardPos.current.y, w: boardPx, h: boardPx });
        }
        for (const cr of st.created) {
          const p = center(cr.cell);
          items.push({ kind: "ring", x: p.x, y: p.y, size: cell * 1.6, color: UCLU_BOARD.goldHi });
          if (st.chain === 1) items.push({ kind: "text", x: p.x, y: p.y - cell * 0.6, text: SPECIAL_NAMES[cr.special], big: false });
        }
        // Kombo metni: dev kombo > zincir sözcüğü.
        if (st.combo === "mega" && st.chain === 1) {
          const kind = st.blasts[0]?.kind;
          const word = kind === "board" ? "Tribünler ayakta!" : kind === "ball" ? "Altın vuruş!" : "Gol gibi!";
          items.push({ kind: "text", x: mid.x, y: mid.y, text: word, big: true });
        } else if (st.chain >= 2) {
          items.push({ kind: "text", x: mid.x, y: mid.y, text: COMBO_WORDS[Math.min(st.chain, 6)], big: st.chain >= 4 });
        }
        // Hedefe uçan simgeler (adım başına en çok 10).
        st.collects.slice(0, 10).forEach((co, k) => {
          const g = S().goals[co.goal];
          const from = center(co.cell);
          const to = goalTarget(co.goal);
          const glyph: FlyGlyph =
            g.type === "color" ? { piece: g.color } :
            g.type === "trophy" ? { trophy: true } :
            g.type === "mud" ? { icon: "water", color: UCLU_BOARD.mud } :
            g.type === "crate" ? { icon: "cube", color: UCLU_BOARD.woodHi } :
            { icon: "snow", color: UCLU_BOARD.snowEdge };
          items.push({ kind: "fly", x: from.x, y: from.y, tx: to.x, ty: to.y, size: Math.round(cell * 0.7), glyph, delay: 60 + k * 35 });
        });

        if (st.blasts.length) haptics.goal();
        else if (st.chain === 1 || st.chain >= 3) haptics.medium();

        const counts = new Map<number, number>();
        for (const co of st.collects) counts.set(co.goal, (counts.get(co.goal) ?? 0) + 1);
        setBoard({ cells: st.afterClear, dying: st.cleared, spawn: {} });
        if (counts.size) setGoals((prev) => prev.map((g, i) => ({ ...g, left: Math.max(0, g.left - (counts.get(i) ?? 0)) })));
        addFx(items, 1300);
        await wait(st.blasts.length ? 300 : 200);
        if (!alive.current) return;
        setBoard({ cells: st.afterFall, dying: [], spawn: st.spawnRows });
        await wait(140 + Math.sqrt(Math.max(1, st.maxDrop)) * 75);
      }
    },
    [addFx, boardPx, cell, center, goalTarget, wait],
  );

  const syncHud = useCallback(() => {
    const s = S();
    setMoves(s.moves);
    setScore(s.score);
    setGoals(s.goals.map((g) => ({ type: g.type, color: g.color, left: g.left, target: g.target })));
  }, []);

  const reported = useRef(false);
  const finish = useCallback((won: boolean, stars: 0 | 1 | 2 | 3, summary: string) => {
    if (!alive.current || reported.current) return;
    reported.current = true;
    finishFn.current({ won, stars, score: S().score, summary });
  }, []);

  /** Kazanınca: kalan hamleler Füze Şut'a döner, hepsi patlar (bonus anı). */
  const winSequence = useCallback(async () => {
    const s = S();
    finished.current = true;
    const left = s.moves;
    const stars = starsFor(left, s.movesTotal);
    haptics.success();
    banner(left > 0 ? "Son düdük bonusu!" : "Hedefler tamam!", "sparkles");
    await wait(1100);
    const n = Math.min(left, BONUS_MAX);
    for (let k = 0; k < n && alive.current; k++) {
      const i = bonusConvert(s);
      s.moves -= 1;
      if (i < 0) continue;
      setMoves(s.moves);
      setBoard({ cells: cloneCells(s.cells), dying: [], spawn: {} });
      const p = center(i);
      addFx([{ kind: "ring", x: p.x, y: p.y, size: cell * 1.5, color: UCLU_BOARD.comboWarm }], 700);
      haptics.light();
      await wait(110);
    }
    s.score += Math.max(0, s.moves) * 300;
    s.moves = 0;
    setMoves(0);
    for (let round = 0; round < 5 && hasSpecials(s) && alive.current; round++) {
      await playSteps(detonateAll(s));
    }
    setScore(s.score);
    await wait(700);
    finish(true, stars, left > 0 ? `${left} hamle kala kazandın` : "Son hamlede kazandın");
  }, [addFx, banner, cell, center, finish, playSteps, wait]);

  const doShuffle = useCallback(async () => {
    banner("Taktik değişikliği!", "shuffle");
    await wait(550);
    const ok = shuffleBoard(S());
    setBoard({ cells: cloneCells(S().cells), dying: [], spawn: {} });
    haptics.medium();
    await wait(420);
    return ok;
  }, [banner, wait]);

  /** Her hamleden sonra: kazanç / kayıp / olası hamle denetimi. */
  const afterTurn = useCallback(async () => {
    const s = S();
    syncHud();
    if (goalsDone(s)) return winSequence();
    if (s.moves <= 0) {
      finished.current = true;
      haptics.error();
      banner("Hamle bitti!", "flag");
      await wait(1300);
      const done = s.goals.reduce((n, g) => n + (g.target - Math.max(0, g.left)), 0);
      const all = s.goals.reduce((n, g) => n + g.target, 0);
      return finish(false, 0, `Hedeflerin %${Math.round((done / Math.max(1, all)) * 100)}'i tamamlandı`);
    }
    if (!findMove(s)) {
      const ok = await doShuffle();
      if (!ok || !findMove(s)) {
        finished.current = true;
        return finish(false, 0, "Oynanacak hamle kalmadı");
      }
    }
    setBusy(false);
  }, [banner, doShuffle, finish, setBusy, syncHud, wait, winSequence]);

  /* ── girdi ── */
  const attemptSwap = useCallback(
    async (a: number, b: number) => {
      const s = S();
      if (busyRef.current || finished.current || pausedRef.current) return;
      setSelected(-1);
      setHint(null);
      if (!adjacent(a, b) || !canSwapCell(s, a) || !canSwapCell(s, b)) {
        haptics.light();
        return;
      }
      setBusy(true);
      const swapped = cloneCells(s.cells);
      const t = swapped[a].tile;
      swapped[a].tile = swapped[b].tile;
      swapped[b].tile = t;
      setBoard({ cells: swapped, dying: [], spawn: {} });
      haptics.select();
      await wait(170);
      const res = trySwap(s, a, b);
      if (!res.ok) {
        // Eşleşme yok: geri döner, hamle harcanmaz.
        setBoard({ cells: cloneCells(s.cells), dying: [], spawn: {} });
        haptics.warning();
        await wait(190);
        setBusy(false);
        return;
      }
      setMoves(s.moves);
      await playSteps(res.steps);
      await afterTurn();
    },
    [afterTurn, playSteps, setBusy, wait],
  );

  const hammerAt = useCallback(
    async (i: number) => {
      const s = S();
      if (!canHammer(s, i)) {
        haptics.light();
        return;
      }
      if (!prepaidHammer.current && !boosterFn.current("cekic")) {
        setHammer(false);
        return;
      }
      prepaidHammer.current = false;
      setHammer(false);
      setBusy(true);
      const p = center(i);
      addFx([{ kind: "ring", x: p.x, y: p.y, size: cell * 1.8, color: UCLU_BOARD.comboWarm }], 700);
      haptics.goal();
      await wait(120);
      await playSteps(hammerCell(s, i));
      await afterTurn();
    },
    [addFx, afterTurn, cell, center, playSteps, setBusy, wait],
  );

  const tapCell = useCallback(
    (i: number) => {
      if (busyRef.current || finished.current || pausedRef.current) return;
      setHint(null);
      setTip(null);
      if (hammer) {
        void hammerAt(i);
        return;
      }
      const s = S();
      if (selected >= 0) {
        if (selected === i) return setSelected(-1);
        if (adjacent(selected, i)) {
          void attemptSwap(selected, i);
          return;
        }
      }
      if (canSwapCell(s, i)) {
        haptics.select();
        setSelected(i);
      } else {
        haptics.light();
        setSelected(-1);
      }
    },
    [attemptSwap, hammer, hammerAt, selected],
  );

  const onBooster = useCallback(
    async (key: string) => {
      if (finished.current || pausedRef.current) return;
      if (key === "cekic") {
        if (hammer) {
          setHammer(false);
          return;
        }
        if (busyRef.current) return;
        setSelected(-1);
        if ((boosterStock.cekic ?? 0) <= 0) {
          // Stok yok: çerçeve mağazayı önerir; alınırsa hemen kullanılır.
          if (!boosterFn.current("cekic")) return;
          prepaidHammer.current = true;
        }
        haptics.select();
        setHammer(true);
        return;
      }
      if (key === "karistir") {
        if (busyRef.current) return;
        if (!boosterFn.current("karistir")) return;
        setBusy(true);
        setSelected(-1);
        setHammer(false);
        await doShuffle();
        await afterTurn();
      }
    },
    [afterTurn, boosterStock.cekic, doShuffle, hammer, setBusy],
  );

  // PanResponder bir kez kurulur; güncel işleyicilere ref üzerinden ulaşır.
  const ctrl = useRef({ tap: tapCell, swap: attemptSwap, cell });
  ctrl.current = { tap: tapCell, swap: attemptSwap, cell };
  const pan = useRef(
    (() => {
      let start = -1;
      let fired = false;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const size = ctrl.current.cell;
          const c = Math.floor(e.nativeEvent.locationX / size);
          const r = Math.floor(e.nativeEvent.locationY / size);
          start = r >= 0 && r < H && c >= 0 && c < W ? r * W + c : -1;
          fired = false;
        },
        onPanResponderMove: (_e, g) => {
          if (fired || start < 0) return;
          const th = ctrl.current.cell * 0.32;
          if (Math.abs(g.dx) < th && Math.abs(g.dy) < th) return;
          fired = true;
          const r = Math.floor(start / W);
          const c = start % W;
          let target = -1;
          if (Math.abs(g.dx) > Math.abs(g.dy)) target = g.dx > 0 ? (c + 1 < W ? start + 1 : -1) : c > 0 ? start - 1 : -1;
          else target = g.dy > 0 ? (r + 1 < H ? start + W : -1) : r > 0 ? start - W : -1;
          if (target >= 0) void ctrl.current.swap(start, target);
        },
        onPanResponderRelease: () => {
          if (!fired && start >= 0) ctrl.current.tap(start);
          start = -1;
        },
        onPanResponderTerminate: () => {
          start = -1;
        },
      });
    })(),
  ).current;

  /* ── açılış: taşlar yukarıdan yağar, seviye öncesi güçlendiriciler parlar ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await wait(900);
      if (cancelled || !alive.current) return;
      const cells = preCells.current.filter((i) => i >= 0);
      if (cells.length) {
        banner("Güçlendiriciler sahada!", "rocket");
        addFx(cells.map((i) => ({ kind: "ring" as const, ...center(i), size: cell * 1.8, color: UCLU_BOARD.goldHi })), 900);
        haptics.medium();
        await wait(600);
      }
      if (!findMove(S())) await doShuffle();
      setBusy(false);
    })();
    const tipTimer = setTimeout(() => alive.current && setTip(null), 6500);
    return () => {
      cancelled = true;
      clearTimeout(tipTimer);
    };
    // Yalnız açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── ipucu: 5 sn hareketsizlikte olası hamle sallanır (sonlu), sonra 6 sn'de bir ── */
  useEffect(() => {
    if (busy || paused || hammer || finished.current) return;
    const timer = setTimeout(() => {
      const m = findMove(S());
      if (!m || !alive.current) return;
      hintTick.current += 1;
      setHint({ a: m[0], b: m[1], tick: hintTick.current });
    }, hint ? 6000 : 5000);
    return () => clearTimeout(timer);
  }, [busy, paused, hammer, hint, selected]);

  /* ── çizim ── */
  const tiles = useMemo(() => {
    const out: { tile: NonNullable<Cell["tile"]>; i: number; dying: boolean }[] = [];
    board.cells.forEach((c, i) => {
      if (c.tile) out.push({ tile: c.tile, i, dying: false });
    });
    for (const d of board.dying) out.push({ tile: d.tile, i: d.cell, dying: true });
    return out;
  }, [board]);

  const lockCells = useMemo(() => {
    const out: number[] = [];
    S().cells.forEach((c, i) => {
      if (c.snow > 0 || c.net > 0) out.push(i);
    });
    return out;
    // Kilitli hücreler yalnız başlangıçta belirlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveBoosters: LiveBooster[] = LIVE_BOOSTERS.map((b) => ({
    key: b.key,
    title: b.title,
    icon: b.icon,
    stock: boosterStock[b.key] ?? 0,
    active: b.key === "cekic" && hammer,
  }));

  const hintDir = (i: number) => {
    if (!hint) return { dx: 0, dy: 0, tick: 0 };
    if (i !== hint.a && i !== hint.b) return { dx: 0, dy: 0, tick: 0 };
    const other = i === hint.a ? hint.b : hint.a;
    return { dx: (other % W) - (i % W), dy: Math.floor(other / W) - Math.floor(i / W), tick: hint.tick };
  };

  const barHint = hammer ? "Kırmak istediğin taşa ya da engele dokun." : tip;

  return (
    <View style={[styles.root, { width: Math.min(maxWidth, boardPx + PAD * 2) }]}>
      <View onLayout={onHudLayout}>
        <Hud level={def.level} cup={def.cup} moves={moves} goals={goals} score={score} onGoalsPart={onGoalsPart} onGoalSlot={onGoalSlot} />
      </View>

      <View
        onLayout={onBoardLayout}
        style={[styles.frame, { width: boardPx + PAD * 2, height: boardPx + PAD * 2 }, hammer && styles.frameHammer]}
      >
        <FrameTrim width={boardPx + PAD * 2} height={boardPx + PAD * 2} hammer={hammer} />
        <View
          style={{ width: boardPx, height: boardPx }}
          {...pan.panHandlers}
          accessible
          accessibilityLabel={`Oyun tahtası, 8'e 8. ${moves} hamle kaldı.`}
          accessibilityHint="Komşu iki taşı kaydırarak yer değiştir; aynı türden üç taşı diz."
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {board.cells.map((c, i) =>
              c.hole ? null : <CellView key={i} row={Math.floor(i / W)} col={i % W} cell={cell} mud={c.mud} crate={c.crate} />,
            )}
            <BoardLight size={boardPx} />
          </View>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
            {tiles.map(({ tile, i, dying }) => {
              const h = hintDir(i);
              return (
                <TileView
                  key={tile.id}
                  tile={tile}
                  row={Math.floor(i / W)}
                  col={i % W}
                  cell={cell}
                  spawnRow={board.spawn[tile.id]}
                  dying={dying}
                  selected={!dying && i === selected}
                  hintDx={h.dx}
                  hintDy={h.dy}
                  hintTick={dying ? 0 : h.tick}
                />
              );
            })}
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {lockCells.map((i) => (
              <LockView key={i} row={Math.floor(i / W)} col={i % W} cell={cell} snow={board.cells[i].snow} net={board.cells[i].net} />
            ))}
            <ShineSweep size={boardPx} tick={def.level} />
            {selected >= 0 ? (
              <View
                style={[
                  styles.selectRing,
                  { left: (selected % W) * cell, top: Math.floor(selected / W) * cell, width: cell, height: cell },
                ]}
              />
            ) : null}
          </View>
        </View>
      </View>

      <BoosterBar boosters={liveBoosters} disabled={busy} onPress={onBooster} hint={barHint} />

      <FxLayer items={fx} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "center", gap: space.md },
  frame: {
    alignSelf: "center",
    padding: FRAME,
    borderRadius: radius.xl,
    backgroundColor: UCLU_BOARD.frame,
    borderWidth: BORDER,
    borderColor: UCLU_BOARD.frame,
  },
  frameHammer: { borderColor: UCLU_BOARD.gold },
  clip: { overflow: "hidden" },
  selectRing: {
    position: "absolute",
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: UCLU_BOARD.select,
    backgroundColor: UCLU_BOARD.selectGlow,
  },
});
