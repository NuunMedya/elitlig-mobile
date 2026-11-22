/**
 * STADYUM KANTİNİ — oyun bileşeni.
 *
 * Kurallar motoru lib/puzzle/levels/kantin.ts'dedir (gerçek tek kaynak);
 * bu bileşen durumu tutar, tahtayı çizer ve motorun her adımından (KantinStep)
 * efekt üretir. Efektler yalnız görseldir: girdi hiç kilitlenmez, uçuştaki
 * ürün hedefinde gizli tutulur ve iniş anında belirir.
 *
 * Koordinatlar: bütün bölümler hesaplanmış sabit yüksekliklerle MUTLAK
 * yerleşir; uçuş kaynak/hedefleri bu yüzden ölçüm gerektirmeden bilinir.
 *
 * 2026-11 YENİLEMESİ: ayrı "tabak" sırası kaldırıldı. Ürünler doğrudan
 * taraftarın BÜYÜK sipariş balonundaki hücresine uçar; balon hem isteği hem
 * hazırlığı gösterir (ekran alanı balona kaldı: ikonlar iki-üç kat büyük).
 * Servis: balon yeşile döner, kocaman onay damgası + şok halkası, taraftar
 * sevinerek ayrılır, bahşiş jetonu sayaca uçar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { kantinScene as S } from "@/lib/puzzle/kantinPalette";
import {
  KANTIN_EXTRA_TIME,
  KANTIN_VIP_PENALTY,
  initialState,
  kantinFanPatience,
  kantinLevel,
  kantinStars,
  lossReason,
  rushServe,
  takeItem,
  targetSlot,
  type KantinItem,
  type KantinState,
  type KantinStep,
} from "@/lib/puzzle/levels/kantin";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { fonts, haptics, radius, space, textScale, type } from "@/theme";

import { softShadow, useIdleDriver } from "../soyunma/CartoonKit";

import {
  Awning,
  BUBBLE_TAIL,
  BUBBLE_TOPPAD,
  BoosterDock,
  Counter,
  FanSpot,
  HoldRow,
  Hud,
  STACK_VISIBLE,
  StackColumn,
  Stadium,
  bubbleGeom,
  type BubbleGeom,
} from "./Board";
import { FxLayer, type Fx, type FxInput, type Pt } from "./Effects";
import type { FanMood } from "./Fan";

const HOLD_GAP = 6;
const STACK_GAP = 8;
const TICK_MS = 250;
const COMBO_MS = 2600;

const COMBO_TEXT = ["", "", "Harika!", "Muhteşem!", "Efsane servis!"];

interface Meta {
  /** Siparişin tabağa geldiği an (oyun içi ms). */
  arrivedAt: Map<number, number>;
  /** Kaçan VIP siparişleri — yerine normal bir taraftar geçer. */
  escaped: Set<number>;
  patient: number;
  vipMissed: number;
  penalty: number;
  tips: number;
  combo: number;
  lastServe: number;
}

/** Bölümler arası sabit boşluklar (tezgâh→tepsi, tepsi→raf, alt). */
const GAP_CH = 8;
const GAP_HS = 10;
const GAP_BOT = 8;

/**
 * TAM EKRAN YERLEŞİM. Bütün bölümler tek bir ölçek `k` ile büyür/küçülür
 * (genişlik sınırları ayrıca kırpar); `k`, toplam yükseklik `H`'yi aşmayan en
 * büyük değer olarak ikili aramayla bulunur. Artan pay yığın satır aralığına,
 * tribüne ve bölüm aralarına dağıtılır: sahne tam olarak `H`'yi doldurur.
 *
 * Balon bölgesi seviyenin EN UZUN siparişine göre ayrılır; her balon bu
 * bölgenin altına (taraftarın başına) yaslanır.
 */
function computeLayout(W: number, H: number, plates: number, cap: number, n: number, maxItems: number) {
  const small = H < 540;
  const hudH = small ? 50 : 60;
  const dockH = small ? 58 : 70;
  const A = H - hudH - dockH;
  const colW = W / plates;
  const holdMax = Math.floor((W - 28 - (cap - 1) * HOLD_GAP) / cap);
  const stackMax = Math.floor((W - 8 - (n - 1) * STACK_GAP) / n);
  const build = (k: number) => {
    const awnH = Math.round(Math.max(12, Math.min(22, 16 * k)));
    const cellMax = Math.round(Math.max(22, Math.min(60, 46 * k)));
    const geom = bubbleGeom(maxItems, colW - 8, cellMax);
    const zoneH = geom.h + BUBBLE_TAIL + BUBBLE_TOPPAD;
    const fanSize = Math.min(colW * 0.64, 66 * k, 96);
    const fanH = (fanSize * 72) / 64;
    // Tezgâh taraftarın göğsünü örter: büstün üst %70'i görünür.
    const fanVisible = Math.round(fanH * 0.7);
    const crowdPad = Math.round(8 * k);
    const counterH = Math.round(Math.max(14, Math.min(26, 18 * k)));
    const holdSize = Math.max(24, Math.min(holdMax, Math.round(44 * k), 64));
    const headH = k < 0.8 ? 0 : 24;
    const holdH = holdSize + 10 + headH;
    const stackW = Math.max(28, Math.min(stackMax, Math.round(66 * k), 104));
    const tile = Math.max(24, Math.min(stackW - 6, Math.round(56 * k), 88));
    const rowStep = Math.round(tile * Math.min(0.78, 0.56 + (k - 0.45) * 0.5));
    const moreH = k < 0.8 ? 18 : 24;
    const stacksH = 6 + tile + rowStep * (STACK_VISIBLE - 1) + moreH;
    const used = awnH + crowdPad + zoneH + fanVisible + counterH + GAP_CH + holdH + GAP_HS + stacksH + GAP_BOT;
    return { k, awnH, cellMax, zoneH, fanSize, fanH, fanVisible, crowdPad, counterH, holdSize, headH, holdH, stackW, tile, rowStep, moreH, stacksH, used };
  };
  let lo = 0.45;
  let hi = 2;
  if (build(lo).used <= A) {
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      if (build(mid).used <= A) lo = mid;
      else hi = mid;
    }
  }
  const b = build(lo);
  let rest = Math.max(0, A - b.used);
  const rowExtra = Math.min(b.tile * 0.24, (rest * 0.4) / (STACK_VISIBLE - 1));
  const rowStep = b.rowStep + rowExtra;
  rest -= rowExtra * (STACK_VISIBLE - 1);
  const standExtra = rest * 0.36;
  const gapCH = GAP_CH + rest * 0.16;
  const gapHS = GAP_HS + rest * 0.18;
  const shelfExtra = rest - standExtra - (gapCH - GAP_CH) - (gapHS - GAP_HS);
  const padTop = 6 + shelfExtra * 0.4;
  const stacksH = b.stacksH + rowExtra * (STACK_VISIBLE - 1) + shelfExtra;

  const standY = hudH;
  const fansY = standY + b.awnH + b.crowdPad + standExtra;
  const counterY = fansY + b.zoneH + b.fanVisible;
  const holdY = counterY + b.counterH + gapCH;
  const stacksY = holdY + b.holdH + gapHS;
  const stackLeft = (W - (n * b.stackW + (n - 1) * STACK_GAP)) / 2;
  const holdLeft = (W - (cap * b.holdSize + (cap - 1) * HOLD_GAP)) / 2;
  return {
    ...b,
    hudH,
    dockH,
    colW,
    rowStep,
    padTop,
    stacksH,
    standY,
    fansY,
    counterY,
    holdY,
    stacksY,
    stackLeft,
    holdLeft,
    dockY: H - dockH,
    total: H,
  };
}

export function KantinGame({ level: levelNo, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused, onPause }: PuzzleGameProps) {
  const level = useMemo(() => kantinLevel(levelNo), [levelNo]);
  const cap = level.holdCap + (preBoosters.includes("tezgah") ? 2 : 0);
  const totalTime = level.timeLimit > 0 ? level.timeLimit + (preBoosters.includes("sure") ? KANTIN_EXTRA_TIME : 0) : 0;

  /* ── ölçüler ── */
  const W = maxWidth;
  const maxItems = useMemo(() => Math.max(2, ...level.orders.map((o) => o.items.length)), [level]);
  const geo = useMemo(
    () => computeLayout(W, Math.round(maxHeight), level.plates, cap, level.stacks.length, maxItems),
    [W, maxHeight, level, cap, maxItems],
  );

  /** Sipariş boyuna göre balon ızgarası (2–4 ürün; önbellekli). */
  const geomFor = useMemo(() => {
    const cache = new Map<number, BubbleGeom>();
    return (n: number) => {
      let g = cache.get(n);
      if (!g) {
        g = bubbleGeom(n, geo.colW - 8, geo.cellMax);
        cache.set(n, g);
      }
      return g;
    };
  }, [geo.colW, geo.cellMax]);

  const pos = useMemo(() => {
    const bubbleTop = (n: number) => geo.fansY + geo.zoneH - (geomFor(n).h + BUBBLE_TAIL);
    const bubbleLeft = (slot: number, n: number) => geo.colW * slot + (geo.colW - geomFor(n).w) / 2;
    return {
      stack: (s: number, d: number): Pt => ({
        x: geo.stackLeft + s * (geo.stackW + STACK_GAP) + geo.stackW / 2,
        y: geo.stacksY + geo.padTop + geo.tile / 2 + Math.min(d, STACK_VISIBLE - 1) * geo.rowStep,
      }),
      /** Balondaki j. hücrenin merkezi. */
      cell: (slot: number, j: number, n: number): Pt => {
        const at = geomFor(n).at(j);
        return { x: bubbleLeft(slot, n) + at.x, y: bubbleTop(n) + at.y };
      },
      bubbleCenter: (slot: number, n: number): Pt => ({ x: geo.colW * slot + geo.colW / 2, y: bubbleTop(n) + geomFor(n).h / 2 }),
      hold: (k: number): Pt => ({ x: geo.holdLeft + k * (geo.holdSize + HOLD_GAP) + geo.holdSize / 2, y: geo.holdY + geo.headH + 5 + geo.holdSize / 2 }),
      fan: (slot: number): Pt => ({ x: geo.colW * slot + geo.colW / 2, y: geo.fansY + geo.zoneH + 2 + geo.fanH / 2 }),
      tips: (): Pt => ({ x: W - 40, y: geo.hudH / 2 }),
      center: (): Pt => ({ x: W / 2, y: geo.fansY + geo.zoneH / 2 }),
    };
  }, [geo, geomFor, W]);

  /* ── durum ── */
  const [st, setSt] = useState<KantinState>(() => initialState(level));
  const stRef = useRef(st);
  const [fx, setFx] = useState<Fx[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  /** Servis edilen tabak, hayalet uçuşu başlayana dek yuvasında kalır. */
  const [serving, setServing] = useState<Map<number, { order: number; filled: KantinItem[] }>>(() => new Map());
  const [elapsed, setElapsed] = useState(0);
  const [tipsBump, setTipsBump] = useState(0);
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [showTip, setShowTip] = useState(Boolean(level.tip));
  const [ended, setEnded] = useState<null | "won" | "lost">(null);
  const idle = useIdleDriver(2200, !paused && !ended);

  const meta = useRef<Meta>({
    arrivedAt: new Map(st.plates.filter(Boolean).map((p) => [p!.order, 0])),
    escaped: new Set(),
    patient: 0,
    vipMissed: 0,
    penalty: 0,
    tips: 0,
    combo: 0,
    lastServe: 0,
  });
  const elapsedRef = useRef(0);
  const fxId = useRef(1);
  /** Uçuş efekti → ürün uid'i (iniş anında hedefte görünür yapılır). */
  const flyUid = useRef(new Map<number, number>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);
  const overRef = useRef(false);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pushFx = useCallback((list: FxInput[]) => {
    if (!list.length) return;
    // Metin patlamaları ekran kenarından taşmasın.
    const withIds = list.map((f) =>
      f.kind === "text"
        ? ({ ...f, at: { x: Math.min(W - 90, Math.max(90, f.at.x)), y: f.at.y }, id: fxId.current++ } as Fx)
        : ({ ...f, id: fxId.current++ } as Fx),
    );
    setFx((cur) => [...cur, ...withIds]);
    const flying = withIds.filter((f): f is Extract<Fx, { kind: "fly" }> => f.kind === "fly");
    if (flying.length) {
      flying.forEach((f) => flyUid.current.set(f.id, f.uid));
      setHidden((cur) => {
        const next = new Set(cur);
        flying.forEach((f) => next.add(f.uid));
        return next;
      });
    }
  }, [W]);

  const onFxDone = useCallback((id: number) => {
    const uid = flyUid.current.get(id);
    if (uid !== undefined) {
      flyUid.current.delete(id);
      setHidden((h) => {
        const next = new Set(h);
        next.delete(uid);
        return next;
      });
    }
    setFx((cur) => cur.filter((f) => f.id !== id));
  }, []);

  const text = useCallback(
    (t: string, tone: "win" | "warn" | "danger" | "gold", big = true, at?: Pt, delay = 0) => {
      pushFx([{ kind: "text", text: t, tone, big, at: at ?? pos.center(), delay }]);
    },
    [pushFx, pos],
  );

  /* ── bitiş ── */
  const finish = useCallback(
    (won: boolean, reason?: "hold" | "stuck" | "time") => {
      if (finished.current) return;
      finished.current = true;
      overRef.current = true;
      setEnded(won ? "won" : "lost");
      const m = meta.current;
      const s = stRef.current;
      if (won) {
        const timeLeft = totalTime > 0 ? Math.max(0, totalTime - m.penalty - elapsedRef.current / 1000) : 0;
        const bonus = Math.floor(timeLeft / 5);
        const stars = kantinStars(level, {
          peak: s.peak,
          timeLeft,
          patientRatio: level.orders.length ? m.patient / level.orders.length : 1,
          vipMissed: m.vipMissed,
        });
        haptics.success();
        later(450, () => {
          text("Bütün siparişler tamam!", "win");
          pushFx([
            { kind: "burst", at: pos.center(), delay: 0 },
            { kind: "burst", at: { x: W * 0.25, y: geo.counterY }, delay: 120 },
            { kind: "burst", at: { x: W * 0.75, y: geo.counterY }, delay: 240 },
            { kind: "ring", at: pos.center(), size: W * 0.6, color: "gold", delay: 60 },
          ]);
        });
        if (bonus > 0) {
          later(1200, () => {
            m.tips += bonus;
            setTipsBump((b) => b + 1);
            text(`Kalan süre bahşişe döndü +${bonus}`, "gold", false, { x: W / 2, y: geo.holdY });
          });
        }
        later(bonus > 0 ? 2300 : 1600, () =>
          onFinish({
            won: true,
            stars,
            score: m.tips,
            summary: `${level.orders.length} sipariş · ${m.tips} bahşiş${m.vipMissed ? ` · ${m.vipMissed} VIP kaçtı` : ""}`,
          }),
        );
      } else {
        haptics.error();
        const msg = reason === "time" ? "Süre bitti!" : reason === "stuck" ? "Hamle kalmadı!" : "Tezgâh doldu!";
        text(msg, "danger");
        later(1300, () =>
          onFinish({ won: false, stars: 0, score: m.tips, summary: `${msg} ${s.served}/${level.orders.length} sipariş servis edildi.` }),
        );
      }
    },
    [level, totalTime, later, text, pushFx, pos, W, geo.counterY, geo.holdY, onFinish],
  );

  /* ── adımı uygula: durum + efektler ── */
  const apply = useCallback(
    (prev: KantinState, next: KantinState, step: KantinStep) => {
      stRef.current = next;
      setSt(next);
      setShowTip(false);
      const m = meta.current;
      const now = elapsedRef.current;
      const out: FxInput[] = [];

      // Ürün uçuşları. Servisten SONRA gelen tabağa tezgâhtan kayanlar gecikmeli.
      const arrivedOrders = new Set(step.arrivals.map((a) => a.order));
      for (const mv of step.moves) {
        const from = mv.from.kind === "stack" ? pos.stack(mv.from.stack, mv.from.depth) : pos.hold(mv.from.index);
        let to: Pt;
        let toSize: number;
        let delay = 0;
        if (mv.to.kind === "plate") {
          const slot = mv.to.slot;
          const plate = next.plates[slot];
          const servedHere = step.served.find((sv) => sv.slot === slot && sv.items.some((it) => it.uid === mv.item.uid));
          const orderIdx = servedHere ? servedHere.order : plate?.order ?? 0;
          const items = level.orders[orderIdx].items;
          to = pos.cell(slot, items.indexOf(mv.item.p), items.length);
          toSize = Math.round(geomFor(items.length).cell * 0.84);
          // Yeni gelen taraftara tezgâhtan kayan ürün, taraftar yerleşince uçar.
          if (mv.from.kind === "hold" && plate && arrivedOrders.has(plate.order) && !servedHere) delay = 1100;
        } else {
          to = pos.hold(mv.to.index);
          toSize = geo.holdSize - 8;
        }
        out.push({ kind: "fly", p: mv.item.p, uid: mv.item.uid, from, to, size: mv.from.kind === "stack" ? geo.tile - 10 : geo.holdSize - 8, toSize, delay });
      }

      // Servisler: balon yerinde yeşile döner (ürünler indikten sonra) →
      // onay damgası + şok halkası → taraftar sevinerek ayrılır, bahşiş
      // jetonu sayaca uçar, konfeti.
      if (step.served.length) {
        const nowMs = Date.now();
        m.combo = nowMs - m.lastServe < COMBO_MS ? m.combo + step.served.length : step.served.length;
        m.lastServe = nowMs;
        const holdServing = new Map<number, { order: number; filled: KantinItem[] }>();
        step.served.forEach((sv, k) => {
          const order = level.orders[sv.order];
          const waited = now - (m.arrivedAt.get(sv.order) ?? now);
          const vipActive = order.vip && !m.escaped.has(sv.order);
          const patience = (vipActive ? order.patience : kantinFanPatience(order)) * 1000;
          const patientOk = waited <= patience;
          if (patientOk) m.patient += 1;
          const gain = 2 + (patientOk ? 1 : 0) + (vipActive ? 3 : 0) + Math.max(0, Math.min(3, m.combo - 1));
          m.tips += gain;
          const d = 340 + k * 300;
          if (!holdServing.has(sv.slot)) holdServing.set(sv.slot, { order: sv.order, filled: sv.items });
          const look = lookFor(order, m.escaped.has(sv.order));
          const bc = pos.bubbleCenter(sv.slot, order.items.length);
          const bubbleSize = geomFor(order.items.length).h;
          out.push({ kind: "stamp", at: bc, size: Math.max(44, Math.min(84, bubbleSize * 0.9)), delay: d });
          out.push({ kind: "ring", at: bc, size: Math.max(70, geo.colW), color: vipActive ? "gold" : "good", delay: d });
          out.push({ kind: "burst", at: bc, delay: d + 60 });
          out.push({ kind: "leave", at: pos.fan(sv.slot), size: geo.fanSize, jersey: look.jersey, face: look.face, vip: vipActive, angry: false, delay: d + 460 });
          out.push({ kind: "coin", from: bc, to: pos.tips(), delay: d + 200 });
          out.push({ kind: "text", text: `+${gain}`, tone: "gold", big: false, at: { x: bc.x, y: bc.y - 10 }, delay: d + 160 });
          later(d + 820, () => setTipsBump((b) => b + 1));
        });
        setServing((cur) => {
          const nextMap = new Map(cur);
          holdServing.forEach((v, slot) => nextMap.set(slot, v));
          return nextMap;
        });
        later(820 + (step.served.length - 1) * 300, () =>
          setServing((cur) => {
            const nextMap = new Map(cur);
            holdServing.forEach((_, slot) => nextMap.delete(slot));
            return nextMap;
          }),
        );
        for (const a of step.arrivals) m.arrivedAt.set(a.order, now + 1200);
        if (m.combo >= 2) {
          const label = step.served.length >= 2 ? "Zincir servis!" : COMBO_TEXT[Math.min(4, m.combo)];
          out.push({ kind: "text", text: label, tone: "win", big: true, at: { x: W / 2, y: geo.counterY }, delay: 420 });
        }
        haptics.medium();
      } else if (step.moves.some((mv) => mv.to.kind === "hold")) {
        if (next.hold.length === cap - 1) {
          haptics.warning();
          out.push({ kind: "text", text: "Son yuva!", tone: "danger", big: false, at: { x: W / 2, y: geo.holdY + 4 }, delay: 120 });
          out.push({ kind: "ring", at: pos.hold(next.hold.length - 1), size: geo.holdSize * 2, color: "bad", delay: 260 });
        } else haptics.light();
      } else haptics.select();

      // İki katlı yığında koli açıldıysa kutla.
      next.stacks.forEach((s, i) => {
        const before = prev.stacks[i];
        if (s.length && s[0].crate && before.length && !before[0].crate) {
          out.push({ kind: "text", text: "Koli açıldı!", tone: "warn", big: false, at: { x: pos.stack(i, 0).x, y: geo.stacksY - 4 }, delay: 200 });
          out.push({ kind: "burst", at: pos.stack(i, 1), delay: 200 });
        }
      });

      pushFx(out);
      if (next.won) finish(true);
      else if (next.lost) {
        overRef.current = true;
        later(300, () => finish(false, lossReason(next, cap)));
      }
    },
    [level, pos, geomFor, geo, cap, W, pushFx, later, finish],
  );

  const onTap = useCallback(
    (s: number) => {
      if (overRef.current) return;
      const cur = stRef.current;
      const top = cur.stacks[s]?.[0];
      if (!top) return;
      if (top.lock > cur.served) {
        haptics.warning();
        setNudges((n) => ({ ...n, [s]: (n[s] ?? 0) + 1 }));
        text(`Kilitli: ${top.lock - cur.served} sipariş daha`, "warn", false, { x: pos.stack(s, 0).x, y: geo.stacksY - 6 });
        return;
      }
      const res = takeItem(level, cur, s, cap);
      if (res) apply(cur, res.state, res.step);
    },
    [level, cap, apply, text, pos, geo.stacksY],
  );

  const onHizli = useCallback(() => {
    if (overRef.current) return;
    const cur = stRef.current;
    const res = rushServe(level, cur, cap);
    if (!res) {
      haptics.warning();
      text("Hızlı servis için uygun tabak yok", "warn", false);
      return;
    }
    if (!useBooster("hizli")) return;
    haptics.goal();
    text("Hızlı servis!", "win", true, pos.center());
    apply(cur, res.state, res.step);
  }, [level, cap, useBooster, apply, text, pos]);

  /* ── süre / sabır tik'i ── */
  useEffect(() => {
    if (paused || ended) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      // Uygulama arka plandayken zamanlayıcı durur; dönüşte aradaki süre tek
      // tikte düşülüp oyun bitiyordu. Bir tikte en çok 500 ms sayılır.
      elapsedRef.current += Math.min(now - last, 500);
      last = now;
      const m = meta.current;
      const t = elapsedRef.current;
      // VIP sabrı: dolan VIP kaçar, yerine normal bir taraftar geçer.
      stRef.current.plates.forEach((pl, slot) => {
        if (!pl) return;
        const order = level.orders[pl.order];
        if (!order.vip || m.escaped.has(pl.order)) return;
        const arrived = m.arrivedAt.get(pl.order) ?? 0;
        if (t - arrived > order.patience * 1000) {
          m.escaped.add(pl.order);
          m.vipMissed += 1;
          m.penalty += KANTIN_VIP_PENALTY;
          m.arrivedAt.set(pl.order, t + 1200);
          haptics.warning();
          pushFx([
            { kind: "leave", at: pos.fan(slot), size: geo.fanSize, jersey: order.jersey, face: order.face, vip: true, angry: true, delay: 0 },
            { kind: "text", text: `VIP kaçtı! −${KANTIN_VIP_PENALTY} sn`, tone: "danger", big: false, at: { x: pos.fan(slot).x, y: geo.fansY + 14 }, delay: 0 },
            { kind: "ring", at: pos.fan(slot), size: geo.fanSize * 1.6, color: "bad", delay: 0 },
          ]);
        }
      });
      setElapsed(t);
      if (totalTime > 0 && totalTime - m.penalty - t / 1000 <= 0 && !finished.current) finish(false, "time");
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, ended, level, totalTime, pushFx, pos, geo, finish]);

  useEffect(() => {
    if (!showTip) return;
    const id = setTimeout(() => setShowTip(false), 7000);
    return () => clearTimeout(id);
  }, [showTip]);

  /* ── çizim ── */
  const m = meta.current;
  const timeLeft = totalTime > 0 ? Math.max(0, totalTime - m.penalty - elapsed / 1000) : null;
  const holdHiddenKey = st.hold.filter((it) => hidden.has(it.uid)).map((it) => it.uid).join(",");
  const queueLeft = level.orders.length - st.next;
  const extras = [preBoosters.includes("tezgah") ? "+2 yuva" : null, preBoosters.includes("sure") && totalTime > 0 ? `+${KANTIN_EXTRA_TIME} sn` : null].filter(
    (e): e is string => Boolean(e),
  );

  const stadiumH = geo.counterY + geo.counterH * 0.5 - geo.standY;
  return (
    <View style={[styles.root, { width: W, height: geo.total }]}>
      {/* Satıcı tarafı: tezgâhın altı koyu duvar */}
      <View style={[styles.abs, styles.wall, { top: geo.counterY, width: W, height: geo.dockY - geo.counterY }]} />

      {/* Gece stadyumu: tribün, kalabalık, projektörler */}
      <View style={[styles.abs, styles.stands, { top: geo.standY, width: W, height: stadiumH }]}>
        <Stadium w={W} h={stadiumH} />
      </View>

      {/* Taraftarlar + büyük sipariş balonları */}
      {st.plates.map((pl, slot) => {
        const show = serving.get(slot);
        const orderIdx = show ? show.order : pl?.order;
        if (orderIdx === undefined) return null;
        const order = level.orders[orderIdx];
        const escaped = m.escaped.has(orderIdx);
        const vipActive = order.vip && !escaped;
        const arrived = m.arrivedAt.get(orderIdx) ?? 0;
        const waited = Math.max(0, elapsed - arrived);
        const patience = (vipActive ? order.patience : kantinFanPatience(order)) * 1000;
        const ratio = Math.max(0, 1 - waited / patience);
        const source = show ? show.filled : pl?.filled ?? [];
        // Uçuştaki ürün hücresine inince "hazır" görünür.
        const filledMask = order.items.reduce((mask, p, i) => {
          const it = source.find((f) => f.p === p);
          return it && !hidden.has(it.uid) ? mask | (1 << i) : mask;
        }, 0);
        const allIn = filledMask === (1 << order.items.length) - 1;
        const look = lookFor(order, escaped);
        const mood: FanMood = show && allIn ? "joy" : ratio > 0.6 ? "happy" : ratio > 0.3 ? "ok" : ratio > 0 ? "worried" : "angry";
        return (
          <View key={`fan-${orderIdx}-${escaped ? "e" : "v"}`} style={[styles.abs, { top: geo.fansY, left: geo.colW * slot, width: geo.colW }]}>
            <FanSpot
              order={order}
              filledMask={filledMask}
              mood={mood}
              ratio={Math.round(ratio * 20) / 20}
              vip={vipActive}
              served={Boolean(show) && allIn}
              jersey={look.jersey}
              face={look.face}
              width={geo.colW}
              zoneH={geo.zoneH}
              geom={geomFor(order.items.length)}
              fanSize={geo.fanSize}
              enterDelay={arrived > 0 || escaped ? 220 : 0}
              idle={idle}
              phase={slot * 0.31}
            />
          </View>
        );
      })}

      {/* Tente (üstte) ve ahşap tezgâh (taraftarların göğsünü örter) */}
      <View pointerEvents="none" style={[styles.abs, { top: geo.standY, width: W, height: geo.awnH }]}>
        <Awning w={W} h={geo.awnH} />
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.counter, { top: geo.counterY, width: W, height: geo.counterH }]}>
        <Counter w={W} h={geo.counterH} />
      </View>

      <View style={[styles.abs, { top: 0, width: W }]}>
        <Hud served={st.served} total={level.orders.length} timeLeft={timeLeft} tips={m.tips} tipsBump={tipsBump} height={geo.hudH} onPause={onPause} width={W} />
      </View>

      {/* Bekleme tezgâhı */}
      <View style={[styles.abs, { top: geo.holdY, width: W }]}>
        <HoldRow
          hold={st.hold}
          cap={cap}
          size={geo.holdSize}
          gap={HOLD_GAP}
          hiddenKey={holdHiddenKey}
          danger={st.hold.length === cap - 1}
          lost={ended === "lost" && st.hold.length >= cap}
          height={geo.holdH}
          headH={geo.headH}
        />
      </View>

      {/* Ürün rafları */}
      <View style={[styles.abs, styles.stacksRow, { top: geo.stacksY, left: geo.stackLeft, gap: STACK_GAP }]}>
        {st.stacks.map((s, i) => (
          <StackColumn
            key={i}
            stack={s}
            index={i}
            served={s.some((it) => it.lock > 0) ? st.served : 0}
            width={geo.stackW}
            tile={geo.tile}
            rowStep={geo.rowStep}
            height={geo.stacksH}
            onTap={onTap}
            nudge={nudges[i] ?? 0}
            padTop={geo.padTop}
            idle={idle}
            hint={Boolean(s[0]) && targetSlot(level, st.plates, s[0].p) >= 0}
          />
        ))}
      </View>

      {showTip && level.tip ? <TipBanner text={level.tip} top={geo.stacksY + geo.tile + 10} width={W - space.xl * 2} /> : null}

      {/* Alt dok: sıra sayacı + Hızlı Servis güçlendiricisi */}
      <View style={[styles.abs, { top: geo.dockY, width: W }]}>
        <BoosterDock
          height={geo.dockH}
          queueLeft={queueLeft}
          hizliStock={boosterStock.hizli ?? 0}
          onHizli={onHizli}
          disabled={Boolean(ended)}
          extras={extras}
        />
      </View>

      <FxLayer fx={fx} onDone={onFxDone} />
    </View>
  );
}

/** Kaçan VIP'in yerine geçen taraftar farklı forma ve yüzle gelir. */
function lookFor(order: { jersey: number; face: number }, escaped: boolean) {
  return escaped ? { jersey: (order.jersey + 3) % 8, face: (order.face + 2) % 6 } : { jersey: order.jersey, face: order.face };
}

function TipBanner({ text, top, width }: { text: string; top: number; width: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 7, tension: 80, delay: 250, useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tip,
        { top, width, left: space.xl },
        { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
      accessibilityLabel={`İpucu: ${text}`}
    >
      <View style={styles.tipIcon}>
        <Ionicons name="bulb" size={16} color={S.white} />
      </View>
      <Text {...textScale.long} style={styles.tipText}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "center", backgroundColor: S.base, borderRadius: radius.xxl, overflow: "hidden" },
  abs: { position: "absolute", left: 0 },
  wall: { backgroundColor: S.base },
  stands: { overflow: "hidden" },
  counter: {
    shadowColor: S.dropShadow,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  stacksRow: { flexDirection: "row" },
  tip: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.xl,
    backgroundColor: S.tipCard,
    borderWidth: 3,
    borderColor: S.tipAccent,
    zIndex: 20,
    ...softShadow,
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.tipAccent,
  },
  tipText: { ...type.bodySm, fontFamily: fonts.semibold, color: S.tipInk, flex: 1 },
});
