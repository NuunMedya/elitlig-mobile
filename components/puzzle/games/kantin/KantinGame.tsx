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
 */

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
  type KantinItem,
  type KantinState,
  type KantinStep,
} from "@/lib/puzzle/levels/kantin";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { colors, haptics, radius, space, textScale, type } from "@/theme";

import { FanSpot, HoldRow, Hud, PlateSpot, STACK_VISIBLE, StackColumn } from "./Board";
import { FxLayer, type Fx, type FxInput, type Pt } from "./Effects";
import type { FanMood } from "./Fan";

const HUD_H = 56;
const BUBBLE_H = 38;
const PLATES_H = 54;
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

export function KantinGame({ level: levelNo, maxWidth, preBoosters, boosterStock, useBooster, onFinish, paused }: PuzzleGameProps) {
  const level = useMemo(() => kantinLevel(levelNo), [levelNo]);
  const cap = level.holdCap + (preBoosters.includes("tezgah") ? 2 : 0);
  const totalTime = level.timeLimit > 0 ? level.timeLimit + (preBoosters.includes("sure") ? KANTIN_EXTRA_TIME : 0) : 0;

  /* ── ölçüler ── */
  const W = maxWidth;
  const geo = useMemo(() => {
    const colW = W / level.plates;
    const fanSize = Math.min(56, colW * 0.6);
    const fanH = (fanSize * 72) / 64;
    const fansY = HUD_H + 4;
    const fansH = BUBBLE_H + 6 + fanH;
    const platesY = fansY + fansH;
    const holdSize = Math.min(46, Math.floor((W - 12 - 12 - (cap - 1) * HOLD_GAP) / cap));
    const holdY = platesY + PLATES_H + 10;
    const holdH = holdSize + 10 + 22;
    const n = level.stacks.length;
    const stackW = Math.min(66, Math.floor((W - (n - 1) * STACK_GAP) / n));
    const tile = Math.min(54, stackW - 6);
    const rowStep = Math.round(tile * 0.8);
    const stacksY = holdY + holdH + 12;
    const stacksH = 6 + tile + rowStep * (STACK_VISIBLE - 1) + 24;
    const stackLeft = (W - (n * stackW + (n - 1) * STACK_GAP)) / 2;
    const holdLeft = (W - (cap * holdSize + (cap - 1) * HOLD_GAP)) / 2;
    const plateW = colW - 12;
    return { colW, fanSize, fanH, fansY, fansH, platesY, holdSize, holdY, holdH, stackW, tile, rowStep, stacksY, stacksH, stackLeft, holdLeft, plateW, total: stacksY + stacksH + 8 };
  }, [W, level, cap]);

  const plateIcon = useCallback((n: number) => Math.min(24, Math.floor((geo.plateW - 18) / Math.max(1, n)) - 2), [geo.plateW]);

  const pos = useMemo(
    () => ({
      stack: (s: number, d: number): Pt => ({
        x: geo.stackLeft + s * (geo.stackW + STACK_GAP) + geo.stackW / 2,
        y: geo.stacksY + 6 + geo.tile / 2 + Math.min(d, STACK_VISIBLE - 1) * geo.rowStep,
      }),
      plate: (slot: number, j: number, n: number): Pt => {
        const icon = plateIcon(n);
        return { x: geo.colW * slot + geo.colW / 2 + (j - (n - 1) / 2) * (icon + 2), y: geo.platesY + PLATES_H / 2 };
      },
      plateCenter: (slot: number): Pt => ({ x: geo.colW * slot + geo.colW / 2, y: geo.platesY + PLATES_H / 2 }),
      hold: (k: number): Pt => ({ x: geo.holdLeft + k * (geo.holdSize + HOLD_GAP) + geo.holdSize / 2, y: geo.holdY + 22 + 5 + geo.holdSize / 2 }),
      fan: (slot: number): Pt => ({ x: geo.colW * slot + geo.colW / 2, y: geo.fansY + BUBBLE_H - 2 + geo.fanH / 2 }),
      tips: (): Pt => ({ x: W - 84, y: HUD_H / 2 }),
      center: (): Pt => ({ x: W / 2, y: geo.fansY + geo.fansH / 2 }),
    }),
    [geo, plateIcon, W],
  );

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
          pushFx([{ kind: "burst", at: pos.center(), delay: 0 }, { kind: "burst", at: { x: W * 0.25, y: geo.platesY }, delay: 120 }, { kind: "burst", at: { x: W * 0.75, y: geo.platesY }, delay: 240 }]);
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
    [level, totalTime, later, text, pushFx, pos, W, geo.platesY, geo.holdY, onFinish],
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
          to = pos.plate(slot, items.indexOf(mv.item.p), items.length);
          toSize = plateIcon(items.length);
          if (mv.from.kind === "hold" && plate && arrivedOrders.has(plate.order) && !servedHere) delay = 420;
        } else {
          to = pos.hold(mv.to.index);
          toSize = geo.holdSize - 8;
        }
        out.push({ kind: "fly", p: mv.item.p, uid: mv.item.uid, from, to, size: mv.from.kind === "stack" ? geo.tile - 10 : geo.holdSize - 8, toSize, delay });
      }

      // Servisler: tabak tepside kalır → hayalet tabak taraftara uçar, taraftar
      // mutlu ayrılır, bahşiş jetonu sayaca uçar, konfeti.
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
          const d = 280 + k * 380;
          if (!holdServing.has(sv.slot)) holdServing.set(sv.slot, { order: sv.order, filled: sv.items });
          const look = lookFor(order, m.escaped.has(sv.order));
          out.push({ kind: "serve", at: pos.plateCenter(sv.slot), to: pos.fan(sv.slot), items: order.items, width: geo.plateW, delay: d });
          out.push({ kind: "leave", at: pos.fan(sv.slot), size: geo.fanSize, jersey: look.jersey, face: look.face, vip: vipActive, angry: false, delay: d + 260 });
          out.push({ kind: "burst", at: pos.fan(sv.slot), delay: d + 300 });
          out.push({ kind: "coin", from: pos.fan(sv.slot), to: pos.tips(), delay: d + 320 });
          out.push({ kind: "text", text: `+${gain}`, tone: "gold", big: false, at: { x: pos.fan(sv.slot).x, y: geo.fansY + 12 }, delay: d + 320 });
          later(d + 900, () => setTipsBump((b) => b + 1));
        });
        setServing((cur) => {
          const nextMap = new Map(cur);
          holdServing.forEach((v, slot) => nextMap.set(slot, v));
          return nextMap;
        });
        later(280, () =>
          setServing((cur) => {
            const nextMap = new Map(cur);
            holdServing.forEach((_, slot) => nextMap.delete(slot));
            return nextMap;
          }),
        );
        for (const a of step.arrivals) m.arrivedAt.set(a.order, now + 600);
        if (m.combo >= 2) {
          const label = step.served.length >= 2 ? "Zincir servis!" : COMBO_TEXT[Math.min(4, m.combo)];
          out.push({ kind: "text", text: label, tone: "win", big: true, at: pos.center(), delay: 360 });
        }
        haptics.medium();
      } else if (step.moves.some((mv) => mv.to.kind === "hold")) {
        if (next.hold.length === cap - 1) {
          haptics.warning();
          out.push({ kind: "text", text: "Son yuva!", tone: "danger", big: false, at: { x: W / 2, y: geo.holdY + 4 }, delay: 120 });
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
    [level, pos, plateIcon, geo, cap, W, pushFx, later, finish],
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
      elapsedRef.current += now - last;
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
          m.arrivedAt.set(pl.order, t + 600);
          haptics.warning();
          pushFx([
            { kind: "leave", at: pos.fan(slot), size: geo.fanSize, jersey: order.jersey, face: order.face, vip: true, angry: true, delay: 0 },
            { kind: "text", text: `VIP kaçtı! −${KANTIN_VIP_PENALTY} sn`, tone: "danger", big: false, at: { x: pos.fan(slot).x, y: geo.fansY + 14 }, delay: 0 },
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

  return (
    <View style={[styles.root, { width: W, height: geo.total }]}>
      <View style={[styles.abs, { top: 0, width: W }]}>
        <Hud
          served={st.served}
          total={level.orders.length}
          timeLeft={timeLeft}
          tips={m.tips}
          tipsBump={tipsBump}
          hizliStock={boosterStock.hizli ?? 0}
          onHizli={onHizli}
          disabled={Boolean(ended)}
          height={HUD_H}
        />
      </View>

      {/* Kantin önü: taraftarlar + balonlar */}
      <View style={[styles.abs, styles.stands, { top: geo.fansY, width: W, height: geo.fansH + PLATES_H / 2 }]} />
      {queueLeft > 0 ? (
        <View style={[styles.queue, { top: geo.holdY }]} accessibilityLabel={`Sırada ${queueLeft} taraftar`}>
          <Text {...textScale.badge} style={styles.queueText}>
            Sırada {queueLeft}
          </Text>
        </View>
      ) : null}
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
        const ratio = 1 - waited / patience;
        const source = show ? show.filled : pl?.filled ?? [];
        const filledMask = order.items.reduce((mask, p, i) => (source.some((it) => it.p === p) ? mask | (1 << i) : mask), 0);
        const look = lookFor(order, escaped);
        const mood: FanMood = show ? "joy" : ratio > 0.6 ? "happy" : ratio > 0.3 ? "ok" : ratio > 0 ? "worried" : "angry";
        return (
          <View key={`fan-${orderIdx}-${escaped ? "e" : "v"}`} style={[styles.abs, { top: geo.fansY, left: geo.colW * slot, width: geo.colW }]}>
            <FanSpot
              order={order}
              filledMask={filledMask}
              mood={mood}
              vipRatio={vipActive ? Math.round(Math.max(0, ratio) * 20) / 20 : null}
              jersey={look.jersey}
              face={look.face}
              width={geo.colW}
              bubbleH={BUBBLE_H}
              fanSize={geo.fanSize}
              enterDelay={arrived > 0 || escaped ? 560 : 0}
            />
          </View>
        );
      })}

      {/* Tezgâh üstü: tabaklar */}
      <View style={[styles.abs, styles.counter, { top: geo.platesY - 4, width: W, height: PLATES_H + 8 }]} />
      {st.plates.map((pl, slot) => {
        const show = serving.get(slot);
        const orderIdx = show ? show.order : pl?.order;
        if (orderIdx === undefined) return null;
        const order = level.orders[orderIdx];
        const source = show ? show.filled : pl?.filled ?? [];
        const shownMask = order.items.reduce((mask, p, i) => {
          const it = source.find((f) => f.p === p);
          return it && !hidden.has(it.uid) ? mask | (1 << i) : mask;
        }, 0);
        return (
          <View key={`plate-${slot}`} style={[styles.abs, { top: geo.platesY + 2, left: geo.colW * slot + 6 }]}>
            <PlateSpot
              items={order.items}
              shownMask={shownMask}
              width={geo.plateW}
              height={PLATES_H - 4}
              icon={plateIcon(order.items.length)}
              vip={order.vip && !m.escaped.has(orderIdx)}
            />
          </View>
        );
      })}

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
        />
      </View>

      {/* Ürün yığınları */}
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
          />
        ))}
      </View>

      {showTip && level.tip ? (
        <TipBanner text={level.tip} top={geo.stacksY + geo.tile + 10} width={W - space.xl * 2} />
      ) : null}

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
      <Text {...textScale.long} style={styles.tipText}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "center" },
  abs: { position: "absolute", left: 0 },
  stands: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  queue: {
    position: "absolute",
    left: space.xs,
    paddingHorizontal: space.s,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    justifyContent: "center",
    zIndex: 2,
  },
  queueText: { ...type.nano, color: colors.onDark },
  counter: {
    backgroundColor: S.wood,
    borderRadius: radius.md,
    borderBottomWidth: 5,
    borderColor: S.woodEdge,
  },
  stacksRow: { flexDirection: "row" },
  tip: {
    position: "absolute",
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.inkBlock,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    zIndex: 20,
  },
  tipText: { ...type.bodySm, color: colors.onDark, textAlign: "center" },
});
