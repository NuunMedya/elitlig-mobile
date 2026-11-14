/**
 * BİNA PANELİ — şehrin İÇİNDE, sahnenin üstünde açılan oyun penceresi.
 *
 * Sahnede binaya dokununca kamera binaya uçar (sahne `view` ile panelin
 * üstündeki görünür alanı ortalar) ve bu panel alttan çıkar. Ayrı sayfa
 * yoktur; o binanın bütün yönetimi buradadır:
 *   · Yükselt   : şu anki aşamanın ara adımları (yıldız), sıradaki ana
 *                 yükseltmenin şartları (ara adımlar, lig, yıldız, Elit Lira)
 *                 ve bundan sonra içine eklenecekler.
 *   · Gelir     : EL/saat, depo (dolum çubuğu + "TOPLA"), gelir akışları,
 *                 tesis bakımı (yıldızla) ve EL yükseltmeleri (depo, personel).
 *     Etki      : destek binalarında gelir/gider etkisi.
 *   · Akademi   : akademi binasında altyapı özeti + "AKADEMİYE GİR" (şehrin
 *                 üstünde akademi penceresi açılır).
 *   · Aşamalar  : bütün ana yükseltmelerin yolu.
 * Altta binanın sıradaki ana eylemi (ara adım / ana yükseltme / kilit notu).
 * Başarılı eylemde sahne inşaat ya da kıvılcım oynatır, panelin üstünde
 * "YÜKSELDİ!" kurdelesi zıplar. Kapatınca kamera bütün şehre döner.
 *
 * Kurallar ve bedeller sunucudadır (next_action, stages, income); burada
 * yalnız gösterilir. Renkler oyun dünyasınındır (iki temada aynı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Touchable, useReduceMotion } from "@/components/ui";
import {
  fmtEl,
  fmtMult,
  fmtPct,
  fmtRate,
  incomeOf,
  leagueNeedOf,
  rungOpensText,
  untilText,
  type City2Building,
  type City2IncomeBuilding,
  type City2State,
  type City2SupportEffect,
  type City2Upgrade,
  type City2UpgradeKind,
} from "@/lib/puzzle/city2";
import { CG } from "@/lib/puzzle/cityGamePalette";
import { fonts, radius, space, textScale, type } from "@/theme";

import { BuildingIcon } from "../shared";
import { CelebrateBurst, ElAmount, GameBar, GameTabs, GlossyButton, PaperHead, PaperRow, PaperText, StarAmount, WoodFrame, fmt, upper, type GameTab } from "./CityGameKit";

type TabKey = "yukselt" | "gelir" | "akademi" | "asamalar";

export interface PanelCelebration {
  n: number;
  text: string;
}

export interface BuildingPanelProps {
  b: City2Building;
  city2: City2State;
  busy: boolean;
  /** Bekleyen eylemler (düğmede dönen gösterge). */
  pending: { lock: string | null; stage: boolean; collect: boolean; care: boolean; upgrade: City2UpgradeKind | null };
  onClose: () => void;
  onLock: (lock: string) => void;
  onStage: () => void;
  onCollect: () => void;
  onUpgrade: (kind: City2UpgradeKind) => void;
  onCare?: () => void;
  onAcademy: () => void;
  onLeague: () => void;
  celebrate: PanelCelebration | null;
  /** Panelin ekranın altından kapladığı yükseklik (sahnenin görünür alanı için). */
  onHeight: (h: number) => void;
}

export function BuildingPanel(props: BuildingPanelProps) {
  const { b, city2, busy, pending, onClose, onLock, onStage, onCollect, onUpgrade, onCare, onAcademy, onLeague, celebrate, onHeight } = props;
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const ladder = city2.ladder;
  const available = city2.stars.available;
  const el = city2.el ?? null;
  const inc = el ? incomeOf(b) : null;
  const effect = el && b.income && !b.income.has_income ? b.income.effect : null;
  const hasAcademy = b.key === "akademi" && city2.academy !== undefined;

  const tabs = useMemo<GameTab<TabKey>[]>(
    () => [
      { key: "yukselt", label: "Yükselt", icon: "hammer" },
      ...(inc ? [{ key: "gelir" as const, label: "Gelir", icon: "cash" as const, dot: inc.collectable > 0 || Boolean(inc.care?.low) }] : effect ? [{ key: "gelir" as const, label: "Etki", icon: "trending-up" as const }] : []),
      ...(hasAcademy ? [{ key: "akademi" as const, label: "Akademi", icon: "school" as const, dot: Boolean(city2.academy?.offers.length) }] : []),
      { key: "asamalar", label: "Aşamalar", icon: "list" },
    ],
    [city2.academy?.offers.length, effect, hasAcademy, inc],
  );
  const [tab, setTab] = useState<TabKey>(() => (inc && (inc.full || inc.collectable > 0) && b.next_action.kind !== "lock" ? "gelir" : "yukselt"));
  // Başka binaya geçince ilk sekme.
  const lastKey = useRef(b.key);
  useEffect(() => {
    if (lastKey.current === b.key) return;
    lastKey.current = b.key;
    setTab(inc && (inc.full || inc.collectable > 0) && b.next_action.kind !== "lock" ? "gelir" : "yukselt");
  }, [b.key, b.next_action.kind, inc]);
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "yukselt";

  /* Giriş: alttan yaylanarak çıkar. */
  const slide = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      slide.setValue(1);
      return;
    }
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }).start();
  }, [b.key, reduce, slide]);

  const need = leagueNeedOf(ladder, b.key);
  const maxH = Math.round(height * 0.6);

  return (
    <Animated.View
      style={[styles.wrap, { paddingBottom: insets.bottom + space.sm, maxHeight: maxH + insets.bottom, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [maxH, 0] }) }] }]}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
    >
      <CelebrateBurst burst={celebrate?.n ?? 0} text={celebrate?.text ?? null} />
      <WoodFrame ribbon={b.title} onClose={onClose} innerStyle={styles.paper}>
        <View style={styles.hero}>
          <BuildingIcon buildingKey={b.key} icon={b.icon} size={54} off={!b.open} stage={b.stage} />
          <View style={styles.heroTexts}>
            <View style={styles.heroLine}>
              <View style={styles.levelPill}>
                <Text style={styles.levelText} {...textScale.badge}>
                  SEVİYE {b.stage}/{b.max}
                </Text>
              </View>
              {inc && inc.per_hour > 0 ? <ElAmount value={Math.round(inc.per_hour)} size={14} /> : null}
              {inc && inc.per_hour > 0 ? (
                <Text style={styles.heroMeta} {...textScale.badge}>
                  /saat
                </Text>
              ) : null}
            </View>
            <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
              {b.current?.title ?? (b.open ? "Henüz kurulmadı" : "Kilitli arsa")}
            </Text>
            <StagePips b={b} />
          </View>
        </View>

        {need && !need.ok ? (
          <Touchable onPress={onLeague} accessibilityLabel={`${ladder.next?.title} için ${need.need}. aşama gerekli. Lig koşullarını aç`}>
            <View style={styles.league}>
              <Ionicons name="trophy" size={16} color={CG.league[1]} />
              <Text style={styles.leagueText} numberOfLines={2} {...textScale.dense}>
                {ladder.next?.title} ligi için {need.need}. aşama ({need.title}) gerekli
              </Text>
              <Ionicons name="chevron-forward" size={14} color={CG.inkSoft} />
            </View>
          </Touchable>
        ) : null}

        <GameTabs items={tabs} value={activeTab} onChange={setTab} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
          {activeTab === "yukselt" ? (
            <UpgradeTab b={b} city2={city2} busy={busy} pendingLock={pending.lock} onLock={onLock} />
          ) : activeTab === "gelir" && inc ? (
            <IncomeTab b={b} inc={inc} city2={city2} busy={busy} pending={pending} onCollect={onCollect} onUpgrade={onUpgrade} onCare={onCare} />
          ) : activeTab === "gelir" && effect ? (
            <EffectTab effect={effect} open={b.open} city2={city2} />
          ) : activeTab === "akademi" ? (
            <AcademyTab city2={city2} onAcademy={onAcademy} />
          ) : (
            <StagesTab b={b} city2={city2} />
          )}
        </ScrollView>

        <View style={styles.foot}>
          <MainAction b={b} city2={city2} busy={busy} pending={pending} onLock={onLock} onStage={onStage} />
        </View>
      </WoodFrame>
    </Animated.View>
  );
}

/* ═══════════════════════ PARÇALAR ═══════════════════════ */

function StagePips({ b }: { b: City2Building }) {
  return (
    <View style={styles.pips} accessibilityLabel={`Ana yükseltme ${b.stage}/${b.max}`}>
      {b.stages.map((s) => (
        <Ionicons key={s.index} name={s.index <= b.stage ? "star" : "star-outline"} size={b.max > 8 ? 12 : 15} color={s.index <= b.stage ? CG.star : s.state === "next" ? CG.starDeep : CG.lock} />
      ))}
    </View>
  );
}

/** Binanın sıradaki ana eylemi (alttaki büyük düğme). */
function MainAction({ b, city2, busy, pending, onLock, onStage }: { b: City2Building; city2: City2State; busy: boolean; pending: BuildingPanelProps["pending"]; onLock: (lock: string) => void; onStage: () => void }) {
  const a = b.next_action;
  const available = city2.stars.available;
  const balance = city2.el?.balance ?? 0;
  if (a.kind === "lock") {
    const short = available < a.cost;
    return (
      <GlossyButton
        label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : `ARA ADIM: ${upper(a.title)}`}
        sub={short ? "Oyun oyna, yıldız kazan" : `${a.left} ara adım kaldı`}
        icon={short ? "star-outline" : "construct"}
        tone="green"
        stars={a.cost}
        disabled={short || busy}
        busy={pending.lock === a.lock}
        onPress={() => onLock(a.lock)}
        accessibilityLabel={`Ara adım: ${a.title}, ${a.cost} yıldız`}
      />
    );
  }
  if (a.kind === "stage" && !a.blocked) {
    const elNeed = a.el ?? 0;
    const short = available < a.cost;
    const elShort = elNeed > balance;
    return (
      <GlossyButton
        label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : elShort ? `${fmtEl(elNeed - balance)} EL EKSİK` : b.stage === 0 ? "KUR!" : "YÜKSELT!"}
        sub={upper(a.title)}
        icon={short ? "star-outline" : elShort ? "wallet-outline" : "hammer"}
        tone="gold"
        stars={a.cost}
        el={elNeed || null}
        disabled={short || elShort || busy}
        busy={pending.stage}
        onPress={onStage}
        accessibilityLabel={`${b.stage === 0 ? "Kur" : "Ana yükseltme"}: ${a.title}, ${a.cost} yıldız${elNeed ? `, ${elNeed} Elit Lira` : ""}`}
      />
    );
  }
  const text =
    a.kind === "maxed"
      ? "Son aşama: bu bina tamamlandı!"
      : a.kind === "closed"
        ? `Bu arsa ${rungOpensText(city2.ladder, a.rung)}. Ligde yüksel.`
        : `Sıradaki ana yükseltme (${a.title}) ${rungOpensText(city2.ladder, a.blocked?.rung ?? b.opens)}.`;
  return (
    <View style={[styles.note, a.kind === "maxed" ? styles.noteDone : null]}>
      <Ionicons name={a.kind === "maxed" ? "trophy" : "lock-closed"} size={18} color={a.kind === "maxed" ? CG.ok : CG.inkSoft} />
      <Text style={styles.noteText} {...textScale.long}>
        {text}
      </Text>
    </View>
  );
}

function Need({ ok, icon, text, value }: { ok: boolean; icon: keyof typeof Ionicons.glyphMap; text: string; value?: string | null }) {
  return (
    <View style={styles.need}>
      <Ionicons name={ok ? "checkmark-circle" : icon} size={17} color={ok ? CG.ok : CG.lock} />
      <Text style={[styles.needText, ok ? null : styles.needOff]} numberOfLines={2} {...textScale.dense}>
        {text}
      </Text>
      {value ? (
        <Text style={[styles.needValue, ok ? styles.needOk : null]} {...textScale.badge}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function UpgradeTab({ b, city2, busy, pendingLock, onLock }: { b: City2Building; city2: City2State; busy: boolean; pendingLock: string | null; onLock: (lock: string) => void }) {
  const ladder = city2.ladder;
  const available = city2.stars.available;
  const balance = city2.el?.balance ?? 0;
  const current = b.stages.find((s) => s.state === "current") ?? null;
  const next = b.stages.find((s) => s.state === "next") ?? null;
  const locksDone = b.locks_done >= b.locks_total;
  if (!b.open) {
    return (
      <View style={styles.section}>
        <PaperRow icon="lock-closed" tint={CG.lock} title="Kilitli arsa" sub={`${b.title} ${rungOpensText(ladder, b.opens)}. Ligde yükseldikçe yeni arsalar açılır.`} />
        {next ? <PaperRow icon="construct" tint={CG.starDeep} title={`İlk aşama: ${next.title}`} sub={next.desc} right={<StarAmount value={next.cost} muted />} /> : null}
      </View>
    );
  }
  return (
    <View style={styles.section}>
      {current && current.locks.length ? (
        <>
          <PaperHead title={`Ara adımlar · ${current.title}`} meta={`${b.locks_done}/${b.locks_total}`} />
          <GameBar value={b.locks_total ? b.locks_done / b.locks_total : 1} tone="green" label={locksDone ? "HAZIR: ANA YÜKSELTMEYE GEÇ" : `${b.locks_done}/${b.locks_total}`} />
          {current.locks.map((l) => (
            <PaperRow
              key={l.key}
              icon={l.state === "open" ? "checkmark-circle" : l.state === "available" ? "key" : "lock-closed"}
              tint={l.state === "open" ? CG.ok : l.state === "available" ? CG.starDeep : CG.lock}
              title={l.title}
              sub={l.desc}
              done={l.state === "open"}
              right={
                l.state === "open" ? (
                  <Text style={styles.done} {...textScale.badge}>
                    TAMAM
                  </Text>
                ) : l.state === "available" ? (
                  <GlossyButton
                    label={fmt(l.cost)}
                    icon="star"
                    tone={available >= l.cost ? "green" : "grey"}
                    small
                    disabled={available < l.cost || busy}
                    busy={pendingLock === l.key}
                    onPress={() => onLock(l.key)}
                    style={styles.rowBtn}
                    accessibilityLabel={available < l.cost ? `${l.title}: ${l.cost - available} yıldız eksik` : `Ara adım: ${l.title}, ${l.cost} yıldız`}
                  />
                ) : (
                  <StarAmount value={l.cost} muted />
                )
              }
            />
          ))}
        </>
      ) : null}

      {next ? (
        <>
          <PaperHead title={b.stage === 0 ? "Kuruluş" : "Sıradaki ana yükseltme"} meta={`${next.index}/${b.max}`} />
          <View style={styles.nextCard}>
            <Text style={styles.nextTitle} {...textScale.dense}>
              {next.title}
            </Text>
            {next.desc ? <PaperText>{next.desc}</PaperText> : null}
            <View style={styles.needs}>
              {current ? <Need ok={locksDone} icon="construct-outline" text="Ara adımlar tamam" value={`${b.locks_done}/${b.locks_total}`} /> : null}
              <Need ok={next.min_rung <= ladder.rung} icon="trophy-outline" text={next.min_rung <= ladder.rung ? "Lig şartı tamam" : rungOpensText(ladder, next.min_rung)} />
              <Need ok={available >= next.cost} icon="star-outline" text="Yıldız" value={`${fmt(Math.min(available, next.cost))}/${fmt(next.cost)}`} />
              {next.el ? <Need ok={balance >= next.el} icon="wallet-outline" text="Elit Lira" value={`${fmtEl(Math.min(balance, next.el))}/${fmtEl(next.el)}`} /> : null}
            </View>
            {incomeOf(b)?.next_stage_per_hour != null ? (
              <View style={styles.gain}>
                <Ionicons name="arrow-up-circle" size={16} color={CG.el} />
                <Text style={styles.gainText} {...textScale.dense}>
                  Bu aşamayla gelir {fmtRate(incomeOf(b)!.next_stage_per_hour!)} EL/saat
                </Text>
              </View>
            ) : null}
            {next.locks.length ? (
              <Text style={styles.nextLocks} numberOfLines={2} {...textScale.long}>
                Sonra içine: {next.locks.map((l) => l.title).join(" · ")}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <PaperRow icon="trophy" tint={CG.starDeep} title="Bina tamamlandı" sub="Bütün ana yükseltmeler yapıldı. Gelir binasıysa EL yükseltmeleriyle büyümeye devam eder." done />
      )}
    </View>
  );
}

function UpgradeRow({ kind, u, stage, balance, busy, pending, onBuy }: { kind: City2UpgradeKind; u: City2Upgrade; stage: number; balance: number; busy: boolean; pending: boolean; onBuy: () => void }) {
  const next = u.next;
  const blocked = next?.blocked ?? null;
  const short = next ? Math.max(0, next.cost - balance) : 0;
  return (
    <PaperRow
      icon={kind === "depo" ? "archive" : "people"}
      tint={CG.el}
      title={`${u.title} · ${u.level}/${u.max}`}
      sub={next ? (blocked ? `${blocked.stage ?? next.min_stage}. aşamada açılır (şu an ${stage}.)` : short > 0 ? `${u.text} · ${fmtEl(short)} EL eksik` : u.text) : `${u.text} · en üst seviye`}
      done={!next}
      right={
        next ? (
          <GlossyButton
            label={blocked ? "KİLİTLİ" : "AL"}
            icon={blocked ? "lock-closed" : undefined}
            tone="teal"
            small
            el={blocked ? null : next.cost}
            disabled={Boolean(blocked) || short > 0 || busy}
            busy={pending}
            onPress={onBuy}
            style={styles.rowBtn}
            accessibilityLabel={`${u.title} ${next.level}. seviye, ${next.cost} EL`}
          />
        ) : (
          <Ionicons name="checkmark-circle" size={22} color={CG.ok} />
        )
      }
    >
      <View style={styles.upgPips}>
        {Array.from({ length: u.max }, (_, i) => (
          <View key={i} style={[styles.upgPip, i < u.level ? styles.upgPipOn : null]} />
        ))}
      </View>
    </PaperRow>
  );
}

function IncomeTab({
  b,
  inc,
  city2,
  busy,
  pending,
  onCollect,
  onUpgrade,
  onCare,
}: {
  b: City2Building;
  inc: City2IncomeBuilding;
  city2: City2State;
  busy: boolean;
  pending: BuildingPanelProps["pending"];
  onCollect: () => void;
  onUpgrade: (kind: City2UpgradeKind) => void;
  onCare?: () => void;
}) {
  const producing = b.open && inc.per_hour > 0;
  const until = untilText(inc.full_at);
  const stars = city2.stars.available;
  const care = inc.care;
  const fill = inc.cap ? inc.stored_exact / inc.cap : 0;
  const breakdown = [
    `taban ${fmtRate(inc.base_per_hour)}`,
    inc.boost_pct ? `destek +${fmtPct(inc.boost_pct)}` : null,
    inc.staff_pct ? `personel +${fmtPct(inc.staff_pct)}` : null,
    inc.prestige_pct ? `prestij +${fmtPct(inc.prestige_pct)}` : null,
    inc.team_pct ? `takım +${fmtPct(inc.team_pct)}` : null,
    `form ${fmtMult(inc.multiplier)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.section}>
      {producing ? (
        <>
          <PaperHead title="Depo" meta={inc.full ? "DOLU · ÜRETİM DURDU" : until ? `${until} sonra dolar` : `${inc.cap_hours} saatlik depo`} />
          <GameBar value={fill} tone={inc.full ? "warn" : "el"} height={22} label={`${fmtEl(inc.stored)} / ${fmtEl(inc.cap)} EL`} />
          <GlossyButton
            label={inc.collectable > 0 ? "TOPLA" : "DEPO BOŞ"}
            sub={inc.collectable > 0 ? `+${fmtEl(inc.collectable)} EL kasaya` : `${fmtRate(inc.per_hour)} EL/saat üretiyor`}
            icon="arrow-down-circle"
            tone="teal"
            disabled={inc.collectable < 1 || busy}
            busy={pending.collect}
            onPress={onCollect}
            accessibilityLabel={inc.collectable > 0 ? `Topla, ${inc.collectable} Elit Lira` : "Depo boş"}
          />
          <PaperText>
            Günde {fmtEl(inc.per_day)} EL · {breakdown}
          </PaperText>
        </>
      ) : (
        <PaperRow icon="hourglass" tint={CG.inkSoft} title="Henüz gelir yok" sub={b.open ? "İlk gelir akışı aşama kurulunca başlar." : "Bina açılınca işletme geliri üretmeye başlar."} />
      )}

      {care && onCare ? (
        <>
          <PaperHead title="Tesis bakımı" meta={`%${care.pct}`} />
          <GameBar value={care.pct / 100} tone={care.low ? "warn" : "green"} label={`%${care.pct} · en çok %${care.floor}'e iner`} />
          <PaperText>Gelir bakım yüzdesiyle çarpılır. Bakım günde %{care.decay_per_day} düşer.</PaperText>
          <GlossyButton
            label={care.cost > 0 ? (care.cost > stars ? `${fmt(care.cost - stars)} YILDIZ EKSİK` : "BAKIM YAP") : "TESİS BAKIMLI"}
            icon="construct"
            tone={care.cost > 0 ? "blue" : "grey"}
            small
            stars={care.cost > 0 ? care.cost : null}
            disabled={care.cost < 1 || care.cost > stars || busy}
            busy={pending.care}
            onPress={onCare}
            accessibilityLabel={care.cost > 0 ? `Bakım yap, ${care.cost} yıldız` : "Tesis bakımlı"}
          />
        </>
      ) : null}

      {inc.streams.length ? (
        <>
          <PaperHead title="Gelir akışları" />
          {inc.streams.map((s) => (
            <View key={s.key} style={styles.stream}>
              <Ionicons name={s.active ? "checkmark-circle" : "lock-closed-outline"} size={16} color={s.active ? CG.ok : CG.lock} />
              <Text style={[styles.streamTitle, s.active ? null : styles.needOff]} numberOfLines={1} {...textScale.dense}>
                {s.title}
              </Text>
              <Text style={[styles.streamValue, s.active ? null : styles.needOff]} {...textScale.badge}>
                {s.active ? `${fmtRate(s.base_per_hour)}/sa` : `${s.from}. aşamada`}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {b.open && (inc.upgrades.depo || inc.upgrades.personel) ? (
        <>
          <PaperHead title="EL yükseltmeleri" meta={`kasada ${fmtEl(city2.el?.balance ?? 0)} EL`} />
          {(["depo", "personel"] as const).map((k) =>
            inc.upgrades[k] ? (
              <UpgradeRow key={k} kind={k} u={inc.upgrades[k] as City2Upgrade} stage={b.stage} balance={city2.el?.balance ?? 0} busy={busy} pending={pending.upgrade === k} onBuy={() => onUpgrade(k)} />
            ) : null,
          )}
        </>
      ) : null}
    </View>
  );
}

function EffectTab({ effect, open, city2 }: { effect: City2SupportEffect; open: boolean; city2: City2State }) {
  const income = effect.kind === "income";
  const pct = `${income ? "+" : "−"}${fmtPct(effect.pct)}`;
  const titles = Object.fromEntries(city2.buildings.map((x) => [x.key, x.title]));
  const names = (effect.targets ?? []).map((k) => titles[k] ?? k);
  const where = !income ? "Giderlerden" : names.length ? `${names.join(", ")} gelirine` : "Bütün gelirlere";
  return (
    <View style={styles.section}>
      <PaperRow icon={income ? "trending-up" : "trending-down"} tint={CG.el} title={`${where} ${pct}${open ? "" : " · bina kapalı"}`} sub={effect.text} />
      <PaperText>Her ana yükseltme etkiyi {fmtPct(effect.per_stage)} artırır.</PaperText>
    </View>
  );
}

function AcademyTab({ city2, onAcademy }: { city2: City2State; onAcademy: () => void }) {
  const a = city2.academy;
  if (!a) {
    return (
      <View style={styles.section}>
        <PaperRow icon="school" tint={CG.side.academy[1]} title="Altyapı akademisi" sub="İlk aşama kurulunca altyapı açılır: oyuncular gerçek zamanla büyür, kulüpler teklif yollar, satışlar Elit Lira getirir." />
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <View style={styles.statRow}>
        <Stat icon="people" value={`${a.slots.used}/${a.slots.max}`} label="oyuncu" />
        <Stat icon="shield" value={String(a.a_team.players.length)} label="A takım" />
        <Stat icon="mail-unread" value={String(a.offers.length)} label="teklif" />
      </View>
      <PaperText>Transferden toplam {fmtEl(a.totals.income)} EL · bugün {a.sales.left_today}/{a.sales.daily_cap} satış hakkı.</PaperText>
      <GlossyButton label="AKADEMİYE GİR" icon="school" tone="purple" onPress={onAcademy} accessibilityLabel="Akademi penceresini aç" />
    </View>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={CG.side.academy[1]} />
      <Text style={styles.statValue} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

function StagesTab({ b, city2 }: { b: City2Building; city2: City2State }) {
  const ladder = city2.ladder;
  return (
    <View style={styles.section}>
      {b.stages.map((s) => (
        <View key={s.index} style={[styles.stage, s.state === "current" ? styles.stageNow : null]}>
          <Ionicons
            name={s.state === "done" ? "checkmark-circle" : s.state === "current" ? "star" : s.state === "next" ? "arrow-up-circle" : "lock-closed"}
            size={18}
            color={s.state === "done" ? CG.ok : s.state === "current" ? CG.star : s.state === "next" ? CG.starDeep : CG.lock}
          />
          <View style={styles.stageTexts}>
            <Text style={[styles.stageTitle, s.state === "locked" ? styles.needOff : null]} numberOfLines={1} {...textScale.dense}>
              {s.index}. {s.title}
            </Text>
            {s.state === "current" ? (
              <Text style={styles.stageMeta} {...textScale.badge}>
                ŞİMDİ
              </Text>
            ) : s.min_rung > ladder.rung && s.state !== "done" ? (
              <Text style={styles.stageMeta} {...textScale.dense}>
                {rungOpensText(ladder, s.min_rung)}
              </Text>
            ) : null}
          </View>
          {s.cost > 0 ? <StarAmount value={s.cost} muted={s.state === "done"} size={12} /> : null}
          {s.el ? <ElAmount value={s.el} muted={s.state === "done"} size={13} /> : null}
        </View>
      ))}
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.sm },
  paper: { padding: space.md, paddingTop: space.xl, gap: space.sm },
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroTexts: { flex: 1, gap: 3 },
  heroLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  levelPill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: CG.league[1] },
  levelText: { ...type.micro, fontFamily: fonts.bold, color: CG.white, letterSpacing: 0.8 },
  heroMeta: { ...type.micro, fontFamily: fonts.bold, color: CG.inkSoft },
  heroTitle: { ...type.h3, fontFamily: fonts.bold, color: CG.ink },
  pips: { flexDirection: "row", flexWrap: "wrap", gap: 1 },
  league: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: CG.paperRow },
  leagueText: { ...type.caption, fontFamily: fonts.bold, color: CG.ink, flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingVertical: space.xs },
  section: { gap: space.sm },
  foot: { paddingTop: space.xs },
  note: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: CG.paperRow },
  noteDone: { backgroundColor: CG.paperRowOn },
  noteText: { ...type.bodySm, fontFamily: fonts.semibold, color: CG.ink, flex: 1 },
  done: { ...type.micro, fontFamily: fonts.bold, color: CG.ok },
  rowBtn: { alignSelf: "center", minWidth: 84 },
  nextCard: { gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: CG.white, borderWidth: 2, borderColor: CG.paperEdge },
  nextTitle: { ...type.h3, fontFamily: fonts.bold, color: CG.ink },
  nextLocks: { ...type.caption, color: CG.inkSoft },
  needs: { gap: 6, marginTop: space.xxs },
  need: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  needText: { ...type.bodySm, fontFamily: fonts.semibold, color: CG.ink, flex: 1 },
  needOff: { color: CG.lock },
  needValue: { ...type.numSmStrong, color: CG.inkSoft },
  needOk: { color: CG.ok },
  gain: { flexDirection: "row", alignItems: "center", gap: space.xs },
  gainText: { ...type.caption, fontFamily: fonts.bold, color: CG.el },
  stream: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 26 },
  streamTitle: { ...type.bodySm, fontFamily: fonts.semibold, color: CG.ink, flex: 1 },
  streamValue: { ...type.labelXs, fontFamily: fonts.bold, color: CG.el },
  upgPips: { flexDirection: "row", gap: 3, paddingLeft: 46 },
  upgPip: { flex: 1, maxWidth: 22, height: 6, borderRadius: radius.pill, backgroundColor: CG.track },
  upgPipOn: { backgroundColor: CG.el },
  statRow: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CG.paperRow },
  statValue: { ...type.h3, fontFamily: fonts.bold, color: CG.ink },
  statLabel: { ...type.micro, fontFamily: fonts.bold, color: CG.inkSoft },
  stage: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.md },
  stageNow: { backgroundColor: CG.paperRowOn },
  stageTexts: { flex: 1, gap: 1 },
  stageTitle: { ...type.bodySm, fontFamily: fonts.semibold, color: CG.ink },
  stageMeta: { ...type.caption, color: CG.inkSoft },
});
