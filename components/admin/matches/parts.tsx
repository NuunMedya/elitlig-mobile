/**
 * Maç ekranlarının küçük ortak parçaları:
 *   · MatchHero  — eşleşme, skor, durum, tarih/saha (web MatchHero)
 *   · StepBar    — Maç öncesi → Kadro → Canlı akış → Maç sonu
 *   · TimeField  — paket gerektirmeyen saat seçici ("HH:MM")
 *   · Note       — adım içi bilgi / uyarı şeridi
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FieldBox } from "@/components/admin";
import { Badge, BottomSheet, Button, Stepper, TeamLogo, Touchable, type Tone } from "@/components/ui";
import {
  normalizeMatchStatus,
  resultSourceLabel,
  statusLabelOf,
  type AdminMatch,
} from "@/lib/api/admin/matches";
import type { MacDurumu } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { STEPS, hhmm, shortDay, stepAvailability, type StepKey } from "./model";

export const STATUS_TONE: Record<MacDurumu, Tone> = {
  taslak: "neutral",
  zamanlanmis: "info",
  canli: "live",
  yayinlanmis: "win",
};

export function statusTone(raw: unknown): Tone {
  const s = normalizeMatchStatus(raw);
  return s ? STATUS_TONE[s] : "neutral";
}

export function MatchHero({
  match,
  homeLogo,
  awayLogo,
  score,
}: {
  match: AdminMatch;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Canlı akışta olaylardan hesaplanan skor; verilmezse kayıttaki skor. */
  score?: { home: number; away: number } | null;
}) {
  const home = score?.home ?? match.first_team_score;
  const away = score?.away ?? match.second_team_score;
  const scored = home != null && away != null && normalizeMatchStatus(match.mac_durumu) !== "taslak";
  const source = resultSourceLabel(match);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTeams}>
        <View style={styles.heroTeam}>
          <TeamLogo name={match.first_team_name} logo={homeLogo} size={44} />
          <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
            {match.first_team_name || "Ev sahibi"}
          </Text>
        </View>
        <View style={styles.heroScore}>
          <Text style={styles.heroDigits} {...textScale.badge}>
            {scored ? `${home} – ${away}` : "vs"}
          </Text>
          <Badge label={statusLabelOf(match.mac_durumu)} tone={statusTone(match.mac_durumu)} size="xs" />
        </View>
        <View style={styles.heroTeam}>
          <TeamLogo name={match.second_team_name} logo={awayLogo} size={44} />
          <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
            {match.second_team_name || "Deplasman"}
          </Text>
        </View>
      </View>
      <Text style={styles.heroMeta} numberOfLines={2} {...textScale.dense}>
        {[shortDay(match.date), hhmm(match.time), match.match_field, [match.league_name, match.match_season].filter(Boolean).join(" · ")]
          .filter(Boolean)
          .join("  ·  ")}
      </Text>
      {source ? (
        <Text style={styles.heroSource} {...textScale.dense}>
          {source}
          {match.result_note ? ` · ${match.result_note}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

export function StepBar({
  value,
  status,
  onChange,
  done,
}: {
  value: StepKey;
  status: unknown;
  onChange: (step: StepKey) => void;
  /** Tamamlanan adımlar (ör. kadro girildi) — köşede onay işareti. */
  done?: Partial<Record<StepKey, boolean>>;
}) {
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      {STEPS.map((step, index) => {
        const active = step.key === value;
        const { ready } = stepAvailability(step.key, status);
        const finished = Boolean(done?.[step.key]);
        /* Kilitli adım da gerçek bir bölüm olarak okunur: kendi ikonu ve adı
           kalır, yalnız köşesine küçük kilit gelir. Dokununca kilidin nedeni
           ve tek dokunuşla açma düğmesi görünür. */
        return (
          <Touchable
            key={step.key}
            onPress={() => onChange(step.key)}
            haptic="selection"
            style={[styles.step, active ? styles.stepOn : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${index + 1}. adım: ${step.label}${ready ? "" : ", kilitli, açmak için dokun"}${finished ? ", tamamlandı" : ""}`}
          >
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={20} color={active ? colors.textOnBrand : colors.textSecondary} />
              {!ready || finished ? (
                <View style={[styles.stepMark, !ready ? styles.stepMarkLock : styles.stepMarkDone]}>
                  <Ionicons name={!ready ? "lock-closed" : "checkmark"} size={10} color={colors.textOnStatus} />
                </View>
              ) : null}
            </View>
            <Text style={[styles.stepText, active ? styles.stepTextOn : null]} numberOfLines={1} {...textScale.badge}>
              {index + 1} · {step.short}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Sabit kaydet çubuğu ─────────────────────────
   Adımlar uzun listelerdir; kaydet düğmesi listenin sonunda kalınca saha
   kenarında bulunmuyordu. Adım `<StepSaveBar />` çizer, ekran (mac/[id])
   çubuğu kaydırılan alanın DIŞINDA, altta sabit gösterir. */

export interface SaveBarSpec {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Düğmenin üstündeki kısa durum metni ("3 değişiklik kaydedilmedi"). */
  note?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const SaveBarContext = React.createContext<((spec: SaveBarSpec | null) => void) | null>(null);

/** Görünür olduğu sürece ekranın altındaki sabit çubuğu doldurur. */
export function StepSaveBar({ visible = true, label, onPress, loading, disabled, note, icon }: SaveBarSpec & { visible?: boolean }) {
  const setBar = React.useContext(SaveBarContext);
  const handler = React.useRef(onPress);
  handler.current = onPress;
  const press = React.useCallback(() => handler.current(), []);

  useEffect(() => {
    if (!setBar) return;
    setBar(visible ? { label, onPress: press, loading, disabled, note, icon } : null);
  }, [setBar, visible, label, press, loading, disabled, note, icon]);
  useEffect(() => () => setBar?.(null), [setBar]);

  // Çubuğu barındıran ekran yoksa (adım başka yerde kullanılırsa) düğme yerinde çizilir.
  if (setBar || !visible) return null;
  return <Button label={label} icon={icon ?? "save-outline"} onPress={onPress} loading={loading} disabled={disabled} fullWidth haptic="success" />;
}

/** Ekranın altındaki sabit çubuk (AdminScreen `overlay`). */
export function SaveBar({ spec, bottomInset }: { spec: SaveBarSpec | null; bottomInset: number }) {
  if (!spec) return null;
  return (
    <View style={[styles.saveBar, { paddingBottom: Math.max(bottomInset, space.md) }]}>
      {spec.note ? (
        <Text style={styles.saveNote} numberOfLines={2} {...textScale.dense}>
          {spec.note}
        </Text>
      ) : null}
      <Button label={spec.label} icon={spec.icon ?? "save-outline"} onPress={spec.onPress} loading={spec.loading} disabled={spec.disabled} fullWidth haptic="success" />
    </View>
  );
}

export function Note({ text, tone = "info", icon }: { text: string; tone?: "info" | "warn" | "danger"; icon?: keyof typeof Ionicons.glyphMap }) {
  const fg = tone === "warn" ? colors.warn : tone === "danger" ? colors.danger : colors.info;
  const bg = tone === "warn" ? colors.warnDim : tone === "danger" ? colors.dangerDim : colors.infoDim;
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Ionicons name={icon ?? (tone === "info" ? "information-circle-outline" : "alert-circle-outline")} size={18} color={fg} />
      <Text style={styles.noteText} {...textScale.long}>
        {text}
      </Text>
    </View>
  );
}

/** Saat seçici: değer "HH:MM"; dakika 5'er adımla. */
export function TimeField({
  label,
  value,
  onChange,
  required,
  clearable,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (!open) return;
    const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
    setHour(m ? Number(m[1]) : 20);
    setMinute(m ? Number(m[2]) : 0);
  }, [open, value]);

  const text = hhmm(value);
  return (
    <>
      <FieldBox label={label} value={text || null} placeholder="Saat seç" icon="time-outline" onPress={() => setOpen(true)} required={required} />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        snap="content"
        footer={
          <View style={styles.timeFooter}>
            {clearable ? (
              <Button
                label="Temizle"
                variant="ghost"
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              />
            ) : null}
            <Button
              label="Tamam"
              style={styles.flex}
              onPress={() => {
                onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
                setOpen(false);
              }}
            />
          </View>
        }
      >
        <View style={styles.timeRow}>
          <Stepper value={hour} onChange={(v) => setHour((v + 24) % 24)} min={-1} max={24} label="Saat" repeatOnHold accessibilityLabel="Saat" />
          <Text style={styles.colon}>:</Text>
          <Stepper value={minute} onChange={(v) => setMinute((v + 60) % 60)} min={-5} max={60} step={5} label="Dakika" repeatOnHold accessibilityLabel="Dakika" />
        </View>
      </BottomSheet>
    </>
  );
}

/** Ev / deplasman seçici (iki takım adıyla). */
export function SidePicker({
  value,
  onChange,
  homeName,
  awayName,
}: {
  value: "home" | "away";
  onChange: (side: "home" | "away") => void;
  homeName: string;
  awayName: string;
}) {
  return (
    <View style={styles.sides}>
      {(["home", "away"] as const).map((side) => {
        const on = value === side;
        return (
          <Touchable
            key={side}
            onPress={() => onChange(side)}
            haptic="selection"
            style={[styles.side, on ? styles.sideOn : null]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.sideText, on ? styles.sideTextOn : null]} numberOfLines={1} {...textScale.dense}>
              {side === "home" ? homeName : awayName}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  heroTeams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  heroTeam: { flex: 1, alignItems: "center", gap: space.xs },
  heroName: { ...type.label, color: colors.textPrimary, textAlign: "center" },
  heroScore: { alignItems: "center", gap: space.xs, minWidth: 92 },
  heroDigits: { ...type.scoreLg, color: colors.textPrimary },
  heroMeta: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  heroSource: { ...type.caption, color: colors.warn, textAlign: "center" },
  steps: {
    flexDirection: "row",
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  step: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    minHeight: 56,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  stepOn: { backgroundColor: colors.brand },
  stepIcon: { width: 28, height: 22, alignItems: "center", justifyContent: "center" },
  stepMark: {
    position: "absolute",
    right: -4,
    top: -4,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepMarkLock: { backgroundColor: colors.warn },
  stepMarkDone: { backgroundColor: colors.win },
  stepText: { ...type.labelXs, color: colors.textPrimary },
  stepTextOn: { color: colors.textOnBrand },
  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  saveNote: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  note: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: "flex-start" },
  noteText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.lg, paddingVertical: space.lg },
  colon: { ...type.scoreMd, color: colors.textPrimary },
  timeFooter: { flexDirection: "row", gap: space.sm },
  sides: { flexDirection: "row", gap: space.sm },
  side: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
  },
  sideOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  sideText: { ...type.label, color: colors.textSecondary },
  sideTextOn: { color: colors.brandAccent },
});
