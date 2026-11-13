/**
 * BİNA — liste satırı ve ayrıntı penceresi.
 *
 * Her bina ANA YÜKSELTMELERLE (aşama) büyür; her aşamanın içinde 3–4 ARA
 * ADIM (oda/eşya; sunucuda "kilit") vardır. Ara adımlar yalnız yıldız ister;
 * hepsi bitince ana yükseltme açılır (yıldız + Elit Lira + lig şartı). Ana
 * düğmeyi sunucunun `next_action`'ı belirler; kapalı/bloklu durumlar
 * açıklanır ("4. Amatör olunca açılır"). Gelir binalarında kazanç, toplama ve
 * tesis bakımı en üsttedir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { BottomSheet, Touchable } from "@/components/ui";
import { fmtEl, incomeOf, leagueNeedOf, rungOpensText, type City2Academy, type City2Building, type City2El, type City2Ladder, type City2Lock, type City2Stage, type City2UpgradeKind } from "@/lib/puzzle/city2";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { AcademyBuildingSection } from "./Academy";
import { IncomeChip, IncomeSection, SupportSection } from "./ElitLira";
import { BuildingIcon, CostButton, StarCost, cardStyle, fmt } from "./shared";

const upper = (s: string) => s.toLocaleUpperCase("tr-TR");

/** Satırın sağındaki kısa durum. */
function ActionHint({ b, available, ladder }: { b: City2Building; available: number; ladder: City2Ladder }) {
  const a = b.next_action;
  if (a.kind === "maxed") return <Ionicons name="checkmark-circle" size={22} color={colors.win} />;
  if (a.kind === "closed" || (a.kind === "stage" && a.blocked)) {
    const rung = a.kind === "closed" ? a.rung : (a.blocked?.rung ?? b.opens);
    return (
      <View style={styles.hint}>
        <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
        <Text style={styles.hintMuted} numberOfLines={1} {...textScale.badge}>
          {ladder.steps.find((s) => s.rung === rung)?.label ?? rung}. bsm.
        </Text>
      </View>
    );
  }
  const ready = available >= a.cost;
  return (
    <View style={styles.hintCol}>
      <Text style={[styles.hintKind, ready ? styles.hintReady : null]} {...textScale.badge}>
        {a.kind === "lock" ? "ARA ADIM" : b.stage === 0 ? "KUR" : "ANA"}
      </Text>
      <StarCost value={a.cost} muted={!ready} />
    </View>
  );
}

function Pips({ b }: { b: City2Building }) {
  return (
    <View style={styles.pips}>
      {b.stages.map((s) => (
        <View key={s.index} style={[styles.pip, s.index <= b.stage ? styles.pipOn : null, s.state === "next" ? styles.pipNext : null]} />
      ))}
    </View>
  );
}

export function BuildingRow({ b, available, ladder, onPress }: { b: City2Building; available: number; ladder: City2Ladder; onPress: () => void }) {
  const a = b.next_action;
  const sub =
    a.kind === "closed"
      ? rungOpensText(ladder, a.rung)
      : b.current
        ? a.kind === "lock"
          ? `${b.current.title} · ara adım ${b.locks_done}/${b.locks_total}`
          : b.current.title
        : "Henüz kurulmadı";
  return (
    <Touchable onPress={onPress} feedback="card" haptic="selection" style={styles.row} accessibilityRole="button" accessibilityLabel={`${b.title}, ${sub}`}>
      <BuildingIcon buildingKey={b.key} icon={b.icon} off={!b.open} stage={b.stage} />
      <View style={styles.rowTexts}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
            {b.title}
          </Text>
          {b.open && incomeOf(b) ? <IncomeChip inc={incomeOf(b)!} /> : null}
        </View>
        <Text style={styles.rowSub} numberOfLines={1} {...textScale.dense}>
          {sub}
        </Text>
        <Pips b={b} />
      </View>
      <ActionHint b={b} available={available} ladder={ladder} />
    </Touchable>
  );
}

/* ═════════════════════════ AYRINTI ═════════════════════════ */

const LOCK_ICON = { open: "checkmark-circle", available: "key", locked: "lock-closed" } as const;

function LockCard({ lock, available, busy, onBuy }: { lock: City2Lock; available: number; busy: boolean; onBuy: () => void }) {
  return (
    <View style={[styles.lock, lock.state === "open" ? styles.lockOpen : null]}>
      <View style={[styles.lockIcon, lock.state === "open" ? styles.lockIconOpen : null]}>
        <Ionicons name={LOCK_ICON[lock.state]} size={18} color={lock.state === "open" ? colors.win : lock.state === "available" ? colors.brandAccent : colors.textTertiary} />
      </View>
      <View style={styles.lockTexts}>
        <Text style={styles.lockTitle} numberOfLines={1} {...textScale.dense}>
          {lock.title}
        </Text>
        {lock.desc ? (
          <Text style={styles.lockDesc} numberOfLines={2} {...textScale.long}>
            {lock.desc}
          </Text>
        ) : null}
      </View>
      {lock.state === "open" ? (
        <Text style={styles.lockDone} {...textScale.badge}>
          TAMAM
        </Text>
      ) : lock.state === "available" ? (
        <CostButton cost={lock.cost} available={available} busy={busy} onPress={onBuy} accessibilityLabel={`Ara adım: ${lock.title}, ${lock.cost} yıldız`} />
      ) : (
        <StarCost value={lock.cost} muted />
      )}
    </View>
  );
}

const STAGE_ICON = { done: "checkmark-circle", current: "radio-button-on", next: "arrow-up-circle-outline", locked: "lock-closed-outline" } as const;

function StageRow({ s, ladder, rung }: { s: City2Stage; ladder: City2Ladder; rung: number }) {
  const tint = s.state === "done" ? colors.win : s.state === "current" ? colors.brandAccent : s.state === "next" ? colors.textSecondary : colors.textTertiary;
  return (
    <View style={[styles.stage, s.state === "current" ? styles.stageCurrent : null]}>
      <Ionicons name={STAGE_ICON[s.state]} size={18} color={tint} />
      <View style={styles.stageTexts}>
        <Text style={[styles.stageTitle, s.state === "locked" ? styles.stageLocked : null]} numberOfLines={1} {...textScale.dense}>
          {s.index}. {s.title}
        </Text>
        {s.state === "current" ? (
          <Text style={styles.stageMeta} {...textScale.badge}>
            ŞİMDİ
          </Text>
        ) : s.min_rung > rung && s.state !== "done" ? (
          <Text style={styles.stageMeta} {...textScale.dense}>
            {rungOpensText(ladder, s.min_rung)}
          </Text>
        ) : null}
      </View>
      {s.cost > 0 ? <StarCost value={s.cost} muted={s.state === "done"} /> : null}
    </View>
  );
}

/** Ana yükseltmenin bir şartı: tik/çarpı, metin, değer. */
function Need({ ok, icon, text, value }: { ok: boolean; icon: keyof typeof Ionicons.glyphMap; text: string; value?: string | null }) {
  return (
    <View style={styles.need}>
      <Ionicons name={ok ? "checkmark-circle" : icon} size={16} color={ok ? colors.win : colors.textTertiary} />
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

export function BuildingSheet({
  b,
  ladder,
  available,
  busy,
  onClose,
  onLock,
  onStage,
  el,
  titles,
  collecting,
  onCollect,
  onUpgrade,
  caring,
  onCare,
  academy,
  onAcademy,
}: {
  b: City2Building | null;
  ladder: City2Ladder | null;
  available: number;
  busy: boolean;
  onClose: () => void;
  onLock: (building: string, lock: string) => void;
  onStage: (building: string) => void;
  /** Faz 2 (EL). Eski sunucuda yok → gelir bölümü çizilmez. */
  el?: City2El | null;
  titles?: Record<string, string>;
  collecting?: boolean;
  onCollect?: (building: string) => void;
  onUpgrade?: (building: string, kind: City2UpgradeKind) => void;
  /** Şehir 2.1: tesis bakımı (yıldızla). */
  caring?: boolean;
  onCare?: (building: string) => void;
  /** Faz 3: akademi durumu (`undefined` = eski sunucu → bölüm çizilmez; `null` = kurulmadı). */
  academy?: City2Academy | null;
  onAcademy?: () => void;
}) {
  const inc = el ? incomeOf(b) : null;
  const effect = el && b?.income && !b.income.has_income ? b.income.effect : null;
  const current = b?.stages.find((s) => s.state === "current") ?? null;
  const next = b?.stages.find((s) => s.state === "next") ?? null;
  const need = b && ladder ? leagueNeedOf(ladder, b.key) : null;
  const a = b?.next_action;
  const balance = el?.balance ?? 0;
  let footer: ReactNode = null;
  if (b && a && ladder) {
    if (a.kind === "lock") {
      const short = available < a.cost;
      footer = (
        <ChunkyButton
          label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : `ARA ADIM: ${upper(a.title)} · ${fmt(a.cost)}`}
          icon={short ? "star-outline" : "construct"}
          tone="green"
          disabled={short || busy}
          onPress={() => onLock(b.key, a.lock)}
          accessibilityLabel={`Ara adım: ${a.title}, ${a.cost} yıldız`}
        />
      );
    } else if (a.kind === "stage" && !a.blocked) {
      const elNeed = a.el ?? 0;
      const short = available < a.cost;
      const elShort = elNeed > balance;
      footer = (
        <ChunkyButton
          label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : elShort ? `${fmtEl(elNeed - balance)} EL EKSİK` : `${b.stage === 0 ? "KUR" : "ANA YÜKSELTME"}: ${upper(a.title)}`}
          icon={short ? "star-outline" : elShort ? "wallet-outline" : "hammer"}
          tone="gold"
          disabled={short || elShort || busy}
          onPress={() => onStage(b.key)}
          accessibilityLabel={`${b.stage === 0 ? "Kur" : "Ana yükseltme"}: ${a.title}, ${a.cost} yıldız${elNeed ? `, ${elNeed} Elit Lira` : ""}`}
        />
      );
    } else {
      const text =
        a.kind === "maxed"
          ? "Son aşama: bu bina tamamlandı."
          : a.kind === "closed"
            ? `Bu bina ${rungOpensText(ladder, a.rung)}. Ligde yüksel.`
            : `Sıradaki ana yükseltme (${a.title}) ${rungOpensText(ladder, a.blocked?.rung ?? b.opens)}.`;
      footer = (
        <View style={styles.footNote}>
          <Ionicons name={a.kind === "maxed" ? "checkmark-circle" : "lock-closed"} size={16} color={a.kind === "maxed" ? colors.win : colors.textSecondary} />
          <Text style={styles.footNoteText} {...textScale.long}>
            {text}
          </Text>
        </View>
      );
    }
  }
  const locksDone = b ? b.locks_done >= b.locks_total : false;
  return (
    <BottomSheet visible={Boolean(b)} onClose={onClose} title={b?.title} snap="full" footer={footer}>
      {b && ladder ? (
        <View style={styles.sheet}>
          <View style={styles.hero}>
            <BuildingIcon buildingKey={b.key} icon={b.icon} size={60} off={!b.open} />
            <View style={styles.heroTexts}>
              <Text style={styles.heroOver} {...textScale.badge}>
                ANA YÜKSELTME {b.stage}/{b.max}
              </Text>
              <Text style={styles.heroTitle} {...textScale.dense}>
                {b.current?.title ?? "Henüz kurulmadı"}
              </Text>
              {b.current?.desc ? (
                <Text style={styles.heroDesc} {...textScale.long}>
                  {b.current.desc}
                </Text>
              ) : null}
            </View>
          </View>

          {need ? (
            <View style={[styles.leagueNote, need.ok ? styles.leagueNoteOk : null]}>
              <Ionicons name={need.ok ? "checkmark-circle" : "trophy"} size={16} color={need.ok ? colors.win : colors.brandAccent} />
              <Text style={styles.leagueNoteText} {...textScale.long}>
                {need.ok
                  ? `${ladder.next?.title} için gereken aşama tamam.`
                  : `${ladder.next?.title} ligine yükselmek için bu binanın ${need.need}. aşaması (${need.title}) gerekli.`}
              </Text>
            </View>
          ) : null}

          {inc && b ? (
            <IncomeSection
              b={b}
              inc={inc}
              el={el ?? null}
              busy={busy}
              collecting={Boolean(collecting)}
              onCollect={() => onCollect?.(b.key)}
              onUpgrade={(kind) => onUpgrade?.(b.key, kind)}
              stars={available}
              caring={caring}
              onCare={onCare ? () => onCare(b.key) : undefined}
            />
          ) : effect ? (
            <SupportSection effect={effect} open={b.open} titles={titles ?? {}} />
          ) : null}

          {b.key === "akademi" && academy !== undefined ? <AcademyBuildingSection academy={academy} onOpen={() => onAcademy?.()} /> : null}

          {b.open ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle} {...textScale.dense}>
                Yükseltme yolu
              </Text>
              {current && current.locks.length ? (
                <View style={styles.pathCard}>
                  <View style={styles.pathHead}>
                    <Text style={styles.pathOver} {...textScale.badge}>
                      ARA ADIMLAR · {b.locks_done}/{b.locks_total}
                    </Text>
                    <Text style={styles.pathHint} {...textScale.badge}>
                      yalnız yıldız
                    </Text>
                  </View>
                  <Text style={styles.blockLead} {...textScale.long}>
                    {locksDone ? `${current.title} hazır: ana yükseltmeye geçebilirsin.` : `${current.title} içine eklenecekler. Hepsi bitince bina büyür.`}
                  </Text>
                  {current.locks.map((l) => (
                    <LockCard key={l.key} lock={l} available={available} busy={busy} onBuy={() => onLock(b.key, l.key)} />
                  ))}
                </View>
              ) : null}

              {next ? (
                <>
                  <View style={styles.connector}>
                    <Ionicons name="arrow-down" size={18} color={colors.textTertiary} />
                  </View>
                  <View style={[styles.pathCard, styles.mainCard]}>
                    <View style={styles.pathHead}>
                      <Text style={styles.pathOver} {...textScale.badge}>
                        SIRADAKİ ANA YÜKSELTME
                      </Text>
                      <Text style={styles.pathHint} {...textScale.badge}>
                        {next.index}/{b.max}
                      </Text>
                    </View>
                    <Text style={styles.nextTitle} {...textScale.dense}>
                      {next.title}
                    </Text>
                    {next.desc ? (
                      <Text style={styles.nextDesc} {...textScale.long}>
                        {next.desc}
                      </Text>
                    ) : null}
                    <View style={styles.needs}>
                      {current ? <Need ok={locksDone} icon="construct-outline" text="Ara adımlar tamam" value={`${b.locks_done}/${b.locks_total}`} /> : null}
                      <Need ok={next.min_rung <= ladder.rung} icon="trophy-outline" text={next.min_rung <= ladder.rung ? "Lig şartı tamam" : rungOpensText(ladder, next.min_rung)} />
                      <Need ok={available >= next.cost} icon="star-outline" text="Yıldız" value={`${fmt(Math.min(available, next.cost))}/${fmt(next.cost)}`} />
                      {next.el ? <Need ok={balance >= next.el} icon="wallet-outline" text="Elit Lira" value={`${fmtEl(Math.min(balance, next.el))}/${fmtEl(next.el)}`} /> : null}
                    </View>
                    {next.locks.length ? (
                      <Text style={styles.nextLocks} numberOfLines={2} {...textScale.long}>
                        Sonra içine: {next.locks.map((l) => l.title).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle} {...textScale.dense}>
              Bütün ana yükseltmeler
            </Text>
            <View style={styles.timeline}>
              {b.stages.map((s) => (
                <StageRow key={s.index} s={s} ladder={ladder} rung={ladder.rung} />
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  rowTexts: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowTitle: { ...type.h3, color: colors.textPrimary, flexShrink: 1 },
  rowSub: { ...type.caption, color: colors.textSecondary },
  pips: { flexDirection: "row", gap: 3, marginTop: space.xxs },
  pip: { flex: 1, maxWidth: 18, height: 5, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  pipOn: { backgroundColor: colors.win },
  pipNext: { backgroundColor: colors.brandBorder },
  hint: { flexDirection: "row", alignItems: "center", gap: 3 },
  hintMuted: { ...type.caption, color: colors.textTertiary },
  hintCol: { alignItems: "flex-end", gap: 2, minWidth: 56 },
  hintKind: { ...type.micro, color: colors.textTertiary },
  hintReady: { color: colors.win },

  sheet: { gap: space.lg, paddingBottom: space.lg },
  hero: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  heroTexts: { flex: 1, gap: 2 },
  heroOver: { ...type.overline, color: colors.textTertiary },
  heroTitle: { ...type.h1, color: colors.textPrimary },
  heroDesc: { ...type.bodySm, color: colors.textSecondary },
  block: { gap: space.sm },
  blockTitle: { ...type.h3, color: colors.textPrimary },
  blockLead: { ...type.bodySm, color: colors.textSecondary },
  lock: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  lockOpen: { backgroundColor: colors.surface2 },
  lockIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  lockIconOpen: { backgroundColor: colors.winDim },
  lockTexts: { flex: 1, gap: 2 },
  lockTitle: { ...type.labelSm, color: colors.textPrimary },
  lockDesc: { ...type.caption, color: colors.textSecondary },
  lockDone: { ...type.micro, fontFamily: fonts.bold, color: colors.win },
  nextCard: { gap: space.xs, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  nextHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nextOver: { ...type.overline, color: colors.textTertiary },
  nextTitle: { ...type.h3, color: colors.textPrimary },
  nextDesc: { ...type.bodySm, color: colors.textSecondary },
  nextLocks: { ...type.caption, color: colors.textTertiary },
  nextGate: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  nextGateText: { ...type.caption, color: colors.textSecondary },
  timeline: { gap: 2 },
  stage: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.md },
  stageCurrent: { backgroundColor: colors.brandDim },
  stageTexts: { flex: 1, gap: 1 },
  stageTitle: { ...type.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  stageLocked: { color: colors.textTertiary },
  stageMeta: { ...type.caption, color: colors.textTertiary },
  leagueNote: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.brandDim },
  leagueNoteOk: { backgroundColor: colors.winDim },
  leagueNoteText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  pathCard: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  mainCard: { backgroundColor: colors.surface2, borderColor: colors.brandBorder },
  pathHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pathOver: { ...type.overline, color: colors.textSecondary },
  pathHint: { ...type.micro, color: colors.textTertiary },
  connector: { alignItems: "center", marginVertical: -space.xs },
  needs: { gap: 6, marginTop: space.xxs },
  need: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  needText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  needOff: { color: colors.textSecondary },
  needValue: { ...type.numSmStrong, color: colors.textSecondary },
  needOk: { color: colors.win },
  footNote: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  footNoteText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
