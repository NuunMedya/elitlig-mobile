/**
 * BİNA — liste satırı ve ayrıntı penceresi.
 *
 * Her bina aşamalarla büyür; her aşamanın içinde 2–4 İÇ KİLİT (oda/eşya)
 * vardır. Sıradaki aşamaya geçmek için önce o anki aşamanın bütün kilitleri
 * açılır, sonra "Aşamayı yükselt". Ana düğmeyi sunucunun `next_action`'ı
 * belirler; kapalı/bloklu durumlar açıklanır ("N. basamakta açılır").
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { BottomSheet, Touchable } from "@/components/ui";
import { rungOpensText, type City2Building, type City2Ladder, type City2Lock, type City2Stage } from "@/lib/puzzle/city2";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

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
        {a.kind === "lock" ? "KİLİT" : b.stage === 0 ? "KUR" : "YÜKSELT"}
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
          ? `${b.current.title} · ${b.locks_done}/${b.locks_total} kilit`
          : b.current.title
        : "Henüz kurulmadı";
  return (
    <Touchable onPress={onPress} feedback="card" haptic="selection" style={styles.row} accessibilityRole="button" accessibilityLabel={`${b.title}, ${sub}`}>
      <BuildingIcon buildingKey={b.key} icon={b.icon} off={!b.open} stage={b.stage} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {b.title}
        </Text>
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
          AÇIK
        </Text>
      ) : lock.state === "available" ? (
        <CostButton cost={lock.cost} available={available} busy={busy} onPress={onBuy} accessibilityLabel={`${lock.title} kilidini aç, ${lock.cost} yıldız`} />
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

export function BuildingSheet({
  b,
  ladder,
  available,
  busy,
  onClose,
  onLock,
  onStage,
}: {
  b: City2Building | null;
  ladder: City2Ladder | null;
  available: number;
  busy: boolean;
  onClose: () => void;
  onLock: (building: string, lock: string) => void;
  onStage: (building: string) => void;
}) {
  const current = b?.stages.find((s) => s.state === "current") ?? null;
  const next = b?.stages.find((s) => s.state === "next") ?? null;
  const a = b?.next_action;
  let footer: ReactNode = null;
  if (b && a && ladder) {
    if (a.kind === "lock") {
      const short = available < a.cost;
      footer = (
        <ChunkyButton
          label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : `${upper(a.title)} · ${fmt(a.cost)}`}
          icon={short ? "star-outline" : "key"}
          tone="green"
          disabled={short || busy}
          onPress={() => onLock(b.key, a.lock)}
          accessibilityLabel={`${a.title} kilidini aç, ${a.cost} yıldız`}
        />
      );
    } else if (a.kind === "stage" && !a.blocked) {
      const short = available < a.cost;
      footer = (
        <ChunkyButton
          label={short ? `${fmt(a.cost - available)} YILDIZ EKSİK` : `${b.stage === 0 ? "KUR" : "AŞAMAYI YÜKSELT"} · ${fmt(a.cost)}`}
          icon={short ? "star-outline" : "hammer"}
          tone="green"
          disabled={short || busy}
          onPress={() => onStage(b.key)}
          accessibilityLabel={`${b.stage === 0 ? "Kur" : "Aşamayı yükselt"}: ${a.title}, ${a.cost} yıldız`}
        />
      );
    } else {
      const text =
        a.kind === "maxed"
          ? "Son aşama: bu bina tamamlandı."
          : a.kind === "closed"
            ? `Bu bina ${rungOpensText(ladder, a.rung)}. Merdivende ilerle.`
            : `Sıradaki aşama (${a.title}) ${rungOpensText(ladder, a.blocked?.rung ?? b.opens)}.`;
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
  return (
    <BottomSheet visible={Boolean(b)} onClose={onClose} title={b?.title} snap="full" footer={footer}>
      {b && ladder ? (
        <View style={styles.sheet}>
          <View style={styles.hero}>
            <BuildingIcon buildingKey={b.key} icon={b.icon} size={60} off={!b.open} />
            <View style={styles.heroTexts}>
              <Text style={styles.heroOver} {...textScale.badge}>
                AŞAMA {b.stage}/{b.max}
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

          {current && current.locks.length ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle} {...textScale.dense}>
                İç kilitler · {b.locks_done}/{b.locks_total}
              </Text>
              <Text style={styles.blockLead} {...textScale.long}>
                {b.locks_done < b.locks_total
                  ? `${current.title} aşamasının odalarını ve eşyalarını aç; hepsi açılınca bina bir sonraki aşamaya geçebilir.`
                  : "Bu aşamanın bütün kilitleri açık."}
              </Text>
              {current.locks.map((l) => (
                <LockCard key={l.key} lock={l} available={available} busy={busy} onBuy={() => onLock(b.key, l.key)} />
              ))}
            </View>
          ) : null}

          {next ? (
            <View style={styles.nextCard}>
              <View style={styles.nextHead}>
                <Text style={styles.nextOver} {...textScale.badge}>
                  SIRADAKİ AŞAMA
                </Text>
                {next.cost > 0 ? <StarCost value={next.cost} /> : null}
              </View>
              <Text style={styles.nextTitle} {...textScale.dense}>
                {next.index}. {next.title}
              </Text>
              {next.desc ? (
                <Text style={styles.nextDesc} {...textScale.long}>
                  {next.desc}
                </Text>
              ) : null}
              {next.locks.length ? (
                <Text style={styles.nextLocks} numberOfLines={2} {...textScale.long}>
                  İçinde: {next.locks.map((l) => l.title).join(" · ")}
                </Text>
              ) : null}
              {next.min_rung > ladder.rung ? (
                <View style={styles.nextGate}>
                  <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
                  <Text style={styles.nextGateText} {...textScale.dense}>
                    {rungOpensText(ladder, next.min_rung)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle} {...textScale.dense}>
              Bütün aşamalar
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
  rowTitle: { ...type.h3, color: colors.textPrimary },
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
  footNote: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  footNoteText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
