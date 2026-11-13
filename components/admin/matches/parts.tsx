/**
 * Maç ekranlarının küçük ortak parçaları:
 *   · MatchHero  — eşleşme, skor, durum, tarih/saha (web MatchHero)
 *   · StepBar    — Maç öncesi → Kadro → Canlı akış → Maç sonu
 *   · TimeField  — paket gerektirmeyen saat seçici ("HH:MM")
 *   · Note       — adım içi bilgi / uyarı şeridi
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FieldBox } from "@/components/admin";
import { Badge, BottomSheet, Button, LiveBadge, Odometer, Stepper, TeamLogo, Touchable, type Tone } from "@/components/ui";
import {
  normalizeMatchStatus,
  resultSourceLabel,
  statusLabelOf,
  type AdminMatch,
} from "@/lib/api/admin/matches";
import type { MacDurumu } from "@/lib/types";
import { colors, glowStyle, hairline, radius, space, textScale, type } from "@/theme";

import { STEPS, hhmm, shortDay, stepAvailability, type StepKey } from "./model";
import { OpsStage, StageTile } from "./opsKit";

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
  const status = normalizeMatchStatus(match.mac_durumu);
  /* Zamanlanmış maçta kayıt skoru 0–0 gelir; oynanmamış maçta saat gösterilir. */
  const scored = home != null && away != null && (Boolean(score) || status === "canli" || status === "yayinlanmis");
  const live = status === "canli";
  const source = resultSourceLabel(match);
  const h = Number(home ?? 0);
  const a = Number(away ?? 0);
  const time = hhmm(match.time);
  return (
    <OpsStage height={240}>
      <View style={styles.heroTop}>
        <Badge label={statusLabelOf(match.mac_durumu).toLocaleUpperCase("tr-TR")} tone={statusTone(match.mac_durumu)} size="xs" dot={live} />
        <Text style={styles.heroLeague} numberOfLines={1} {...textScale.dense}>
          {[match.league_name, match.match_season].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.heroTeams}>
        <View style={styles.heroTeam}>
          <View style={styles.heroCrest}>
            <TeamLogo name={match.first_team_name} logo={homeLogo} size={48} />
          </View>
          <Text style={[styles.heroName, scored && a > h ? styles.heroNameDim : null]} numberOfLines={2} {...textScale.dense}>
            {match.first_team_name || "Ev sahibi"}
          </Text>
          <Text style={styles.heroSide} {...textScale.badge}>
            EV SAHİBİ
          </Text>
        </View>
        <View style={styles.heroScore}>
          {scored ? (
            <View style={styles.heroDigitsRow}>
              <Odometer value={h} style={[styles.heroDigits, a > h ? styles.heroDigitsDim : null]} />
              <Text style={styles.heroDash} {...textScale.badge}>
                –
              </Text>
              <Odometer value={a} style={[styles.heroDigits, h > a ? styles.heroDigitsDim : null]} />
            </View>
          ) : (
            <Text style={styles.heroTime} {...textScale.badge}>
              {time || "vs"}
            </Text>
          )}
          {live ? <LiveBadge /> : null}
        </View>
        <View style={styles.heroTeam}>
          <View style={styles.heroCrest}>
            <TeamLogo name={match.second_team_name} logo={awayLogo} size={48} />
          </View>
          <Text style={[styles.heroName, scored && h > a ? styles.heroNameDim : null]} numberOfLines={2} {...textScale.dense}>
            {match.second_team_name || "Deplasman"}
          </Text>
          <Text style={styles.heroSide} {...textScale.badge}>
            DEPLASMAN
          </Text>
        </View>
      </View>
      <View style={styles.heroTiles}>
        <StageTile icon="calendar-outline" label="Gün" value={shortDay(match.date) || "—"} />
        <StageTile icon="time-outline" label="Saat" value={time || "—"} tone={time ? undefined : "warn"} />
        <StageTile icon="location-outline" label="Saha" value={match.match_field || "Yok"} tone={match.match_field ? undefined : "warn"} />
      </View>
      {source ? (
        <View style={styles.heroSource}>
          <Ionicons name="ribbon-outline" size={13} color={colors.warn} />
          <Text style={styles.heroSourceText} numberOfLines={2} {...textScale.dense}>
            {source}
            {match.result_note ? ` · ${match.result_note}` : ""}
          </Text>
        </View>
      ) : null}
    </OpsStage>
  );
}

/**
 * ADIM GÖSTERGESİ — dört numaralı durak, aralarında ilerleme çizgisi.
 * Etkin durak imza degradesiyle dolar; biten durak yeşil onay, kilitli durak
 * küçük kilit taşır. Dokununca adım değişir (kilitliyse nedeni görünür).
 */
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
  const activeIndex = Math.max(0, STEPS.findIndex((s) => s.key === value));
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      <View style={styles.stepTrack} pointerEvents="none">
        <View style={styles.stepTrackBase} />
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.stepTrackFill, { width: `${(activeIndex / (STEPS.length - 1)) * 100}%` }]}
        />
      </View>
      {STEPS.map((step, index) => {
        const active = step.key === value;
        const { ready } = stepAvailability(step.key, status);
        const finished = Boolean(done?.[step.key]);
        const passed = index < activeIndex;
        /* Kilitli adım da gerçek bir bölüm olarak okunur: kendi ikonu ve adı
           kalır, yalnız köşesine küçük kilit gelir. Dokununca kilidin nedeni
           ve tek dokunuşla açma düğmesi görünür. */
        return (
          <Touchable
            key={step.key}
            onPress={() => onChange(step.key)}
            haptic="selection"
            feedback="none"
            style={styles.step}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${index + 1}. adım: ${step.label}${ready ? "" : ", kilitli, açmak için dokun"}${finished ? ", tamamlandı" : ""}`}
          >
            <View style={[styles.stepDot, active ? styles.stepDotOn : passed || finished ? styles.stepDotPassed : null, !ready ? styles.stepDotLocked : null]}>
              {active ? (
                <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.stepDotFill]} />
              ) : null}
              <Ionicons name={step.icon} size={18} color={active ? colors.onDark : !ready ? colors.textTertiary : colors.textSecondary} />
              {!ready || finished ? (
                <View style={[styles.stepMark, !ready ? styles.stepMarkLock : styles.stepMarkDone]}>
                  <Ionicons name={!ready ? "lock-closed" : "checkmark"} size={9} color={colors.textOnStatus} />
                </View>
              ) : null}
            </View>
            <Text style={[styles.stepNum, active ? styles.stepNumOn : null]} {...textScale.badge}>
              {`ADIM ${index + 1}`}
            </Text>
            <Text style={[styles.stepText, active ? styles.stepTextOn : null]} numberOfLines={1} {...textScale.badge}>
              {step.short}
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
        <View style={styles.saveNoteRow}>
          <View style={[styles.saveDot, spec.disabled ? styles.saveDotIdle : null]} />
          <Text style={styles.saveNote} numberOfLines={2} {...textScale.dense}>
            {spec.note}
          </Text>
        </View>
      ) : null}
      <Button label={spec.label} icon={spec.icon ?? "save-outline"} size="lg" onPress={spec.onPress} loading={spec.loading} disabled={spec.disabled} fullWidth haptic="success" />
    </View>
  );
}

export function Note({ text, tone = "info", icon }: { text: string; tone?: "info" | "warn" | "danger"; icon?: keyof typeof Ionicons.glyphMap }) {
  const fg = tone === "warn" ? colors.warn : tone === "danger" ? colors.danger : colors.info;
  const bg = tone === "warn" ? colors.warnDim : tone === "danger" ? colors.dangerDim : colors.infoDim;
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <View style={[styles.noteRail, { backgroundColor: fg }]} />
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
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  heroLeague: { ...type.caption, color: colors.onDarkMuted, flex: 1, textAlign: "right" },
  heroTeams: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  heroTeam: { flex: 1, alignItems: "center", gap: space.xs },
  heroCrest: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    marginBottom: space.xxs,
  },
  heroName: { ...type.h4, color: colors.onDark, textAlign: "center" },
  heroNameDim: { color: colors.onDarkMuted },
  heroSide: { ...type.overline, color: colors.onDarkMuted },
  heroScore: { alignItems: "center", justifyContent: "center", gap: space.s, minWidth: 104, minHeight: 64 },
  heroDigitsRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  heroDigits: { ...type.scoreHero, color: colors.onDark },
  heroDigitsDim: { color: colors.onDarkMuted },
  heroDash: { ...type.scoreLg, color: colors.onDarkMuted },
  heroTime: { ...type.scoreLg, color: colors.onDark },
  heroTiles: { flexDirection: "row", gap: space.sm },
  heroSource: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.inkPill,
  },
  heroSourceText: { ...type.caption, color: colors.onDark, flex: 1 },
  steps: {
    flexDirection: "row",
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  stepTrack: { position: "absolute", left: "12.5%", right: "12.5%", top: space.md + 19, height: 2 },
  stepTrackBase: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface3, borderRadius: 1 },
  stepTrackFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 1 },
  step: { flex: 1, alignItems: "center", gap: space.xxs },
  stepDot: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.xs,
  },
  stepDotOn: { borderColor: colors.brandBorder, ...glowStyle(colors.glow, 1) },
  stepDotFill: { borderRadius: 20 },
  stepDotPassed: { borderColor: colors.brandBorder, backgroundColor: colors.brandDim },
  stepDotLocked: { borderStyle: "dashed" },
  stepMark: {
    position: "absolute",
    right: -3,
    top: -3,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  stepMarkLock: { backgroundColor: colors.warn },
  stepMarkDone: { backgroundColor: colors.win },
  stepNum: { ...type.overline, color: colors.textTertiary },
  stepNumOn: { color: colors.brandAccent },
  stepText: { ...type.labelXs, color: colors.textSecondary },
  stepTextOn: { color: colors.textPrimary },
  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.glass,
    borderTopWidth: hairline,
    borderTopColor: colors.glassLine,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  saveNoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s },
  saveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warn },
  saveDotIdle: { backgroundColor: colors.win },
  saveNote: { ...type.caption, color: colors.textSecondary, textAlign: "center", flexShrink: 1 },
  note: { flexDirection: "row", gap: space.sm, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg, alignItems: "flex-start", overflow: "hidden" },
  noteRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
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
