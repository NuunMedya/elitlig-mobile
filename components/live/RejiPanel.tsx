/**
 * Mobil stüdyo — "Reji" sekmesi: skor, saat / devre ve olay girişi.
 *
 *   Maç    büyük GOL düğmeleri, saat ve devre akışı (başlat → devre arası →
 *          2. yarı → uzatma → bitir), saat düzeltme, son olayı geri al.
 *   Olay   kart, penaltı, kafa / frikik golü, kendi kalesine, oyuncu
 *          değişikliği (çıkan → giren); son olaylar (tek tek silinebilir).
 *
 * Her olay oyuncu seçicisini açar (ekran [id].tsx yönetir). Kurallar masaüstü
 * rejiyle aynıdır: skor olaylardan hesaplanır, elle / hükmen tescilde goller
 * skoru değiştirmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { eventLabel, type MatchEvent } from "@/lib/api/admin/matches";
import { RIG } from "@/lib/live/rig";
import { clockText } from "@/lib/live/scorebug";
import { radius, space, type } from "@/theme";

import { Btn, GroupTitle, Hint, SegRow, type IconName } from "./rigUi";
import { HALF_MS, PHASE_LABEL, type ControlAction, type LiveMatch } from "./useLiveMatch";

type Side = "home" | "away";

export interface RejiPanelProps {
  live: LiveMatch;
  homeName: string;
  awayName: string;
  saving: boolean;
  /** Olayın oyuncusunu sor (oyuncu seçici açılır). */
  onAsk: (side: Side, code: string, title: string) => void;
  /** Oyuncu değişikliği akışını başlat (çıkan → giren). */
  onSubstitution: (side: Side) => void;
  onControl: (action: ControlAction) => void;
  onFinish: () => void;
  onToast: (message: string, ok?: boolean) => void;
}

const VIEWS = [
  { value: "mac", label: "Maç" },
  { value: "olay", label: "Olay" },
] as const;

const QUICK_EVENTS: { code: string; label: string; icon: IconName; color: string }[] = [
  { code: "YELLOW_CARD", label: "Sarı kart", icon: "square", color: RIG.yellow },
  { code: "RED_CARD", label: "Kırmızı kart", icon: "square", color: RIG.red },
  { code: "GOAL_PENALTY", label: "Penaltı golü", icon: "football", color: RIG.text },
  { code: "GOAL_OWN", label: "Kendi kalesine", icon: "football", color: RIG.warn },
  { code: "GOAL_HEADER", label: "Kafa golü", icon: "football", color: RIG.text },
  { code: "GOAL_FREEKICK", label: "Frikik golü", icon: "football", color: RIG.text },
];

/** "Gol 12' · Ahmet" / "Değişiklik 40' · Ali çıktı, Veli girdi" */
function describeEvent(live: LiveMatch, ev: MatchEvent, fallback: string): string {
  if (String(ev.olay_kodu).toUpperCase() === "SUBSTITUTION") {
    const out = live.nameOf(ev.oyuncu_cikan_id);
    const inn = live.nameOf(ev.oyuncu_giren_id);
    return [out ? `${out} çıktı` : null, inn ? `${inn} girdi` : null].filter(Boolean).join(", ") || fallback;
  }
  return live.nameOf(ev.oyuncu_id) ?? fallback;
}

export function RejiPanel(props: RejiPanelProps) {
  const { live, homeName, awayName, saving } = props;
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("mac");
  const nameOfSide = (side: Side) => (side === "home" ? homeName : awayName);
  const sideOf = (ev: MatchEvent): Side => (Number(ev.takim_id) === Number(live.homeTeamId) ? "home" : "away");

  const newest = live.timeline.reduce<MatchEvent | null>((best, e) => (!best || Number(e.id) > Number(best.id) ? e : best), null);

  const removeEvent = (ev: MatchEvent, title: string) => {
    const label = `${eventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}'`;
    Alert.alert(title, `${label} · ${describeEvent(live, ev, nameOfSide(sideOf(ev)))} silinsin mi? Skor yeniden hesaplanır.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () =>
          void live
            .removeEvent(Number(ev.id))
            .then(() => props.onToast("Olay silindi.", true))
            .catch((e: unknown) => props.onToast(errorText(e, "Olay silinemedi. Bağlantını kontrol edip yeniden dene."))),
      },
    ]);
  };

  const undoRow = newest ? (
    <Touchable style={styles.undo} onPress={() => removeEvent(newest, "Son olayı geri al")} accessibilityLabel="Son olayı geri al" haptic="light">
      <Ionicons name="arrow-undo" size={16} color={RIG.text} />
      <Text style={styles.undoText} numberOfLines={1} allowFontScaling={false}>
        Geri al: {eventLabel(newest.olay_kodu)} {newest.dakika ?? 0}' · {describeEvent(live, newest, nameOfSide(sideOf(newest)))}
      </Text>
    </Touchable>
  ) : null;

  return (
    <View style={styles.stack}>
      <SegRow options={VIEWS} value={view} onChange={setView} label="Reji görünümü" />
      {view === "mac" ? (
        <MatchView {...props} undoRow={undoRow} />
      ) : (
        <View style={styles.stack}>
          {live.status !== "canli" ? <Hint>Olay girmek için önce Maç bölümünden maçı başlat.</Hint> : null}
          {(["home", "away"] as const).map((side) => {
            const name = nameOfSide(side);
            return (
              <View key={side} style={styles.stack}>
                <View style={styles.teamHead}>
                  <View style={[styles.teamDot, { backgroundColor: side === "home" ? RIG.home : RIG.away }]} />
                  <GroupTitle>{name.toLocaleUpperCase("tr-TR")}</GroupTitle>
                </View>
                <View style={styles.quickGrid}>
                  {QUICK_EVENTS.map((q) => (
                    <Touchable
                      key={q.code}
                      style={styles.quick}
                      onPress={() => props.onAsk(side, q.code, `${name} — ${q.label}`)}
                      disabled={saving}
                      accessibilityLabel={`${name} ${q.label}`}
                      haptic="light"
                    >
                      <Ionicons name={q.icon} size={14} color={q.color} />
                      <Text style={styles.quickText} numberOfLines={1} allowFontScaling={false}>
                        {q.label}
                      </Text>
                    </Touchable>
                  ))}
                  <Touchable
                    style={[styles.quick, styles.quickWide]}
                    onPress={() => props.onSubstitution(side)}
                    disabled={saving}
                    accessibilityLabel={`${name} oyuncu değişikliği`}
                    haptic="light"
                  >
                    <Ionicons name="swap-horizontal" size={15} color={RIG.info} />
                    <Text style={styles.quickText} numberOfLines={1} allowFontScaling={false}>
                      Oyuncu değişikliği
                    </Text>
                  </Touchable>
                </View>
              </View>
            );
          })}

          <GroupTitle>SON OLAYLAR</GroupTitle>
          {undoRow}
          {live.timeline.length ? (
            [...live.timeline]
              .sort((a, b) => Number(b.id) - Number(a.id))
              .slice(0, 10)
              .map((ev) => {
                const side = sideOf(ev);
                const label = `${eventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}'`;
                return (
                  <View key={ev.id} style={styles.eventRow}>
                    <View style={[styles.eventDot, { backgroundColor: side === "home" ? RIG.home : RIG.away }]} />
                    <View style={styles.flex}>
                      <Text style={styles.eventTitle} numberOfLines={1} allowFontScaling={false}>
                        {label}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
                        {describeEvent(live, ev, nameOfSide(side))}
                      </Text>
                    </View>
                    <Touchable style={styles.trash} onPress={() => removeEvent(ev, "Olayı sil")} accessibilityLabel={`${label} sil`} hitSlop={6}>
                      <Ionicons name="trash-outline" size={16} color={RIG.textSoft} />
                    </Touchable>
                  </View>
                );
              })
          ) : (
            <Hint>Henüz gol, kart ya da değişiklik girilmedi.</Hint>
          )}
        </View>
      )}
    </View>
  );
}

function MatchView({ live, homeName, awayName, saving, onAsk, onControl, onFinish, onToast, undoRow }: RejiPanelProps & { undoRow: React.ReactNode }) {
  const primary: { label: string; icon: IconName; action?: ControlAction; finish?: boolean } = (() => {
    switch (live.phase) {
      case "notStarted":
        return { label: "Maçı başlat", icon: "play", action: "start" };
      case "kickoff":
        return { label: "1. yarıyı başlat", icon: "play", action: "kickoff" };
      case "first":
        return { label: "Devre arası", icon: "cafe", action: "halftime" };
      case "halftime":
        return { label: "2. yarıyı başlat", icon: "play-forward", action: "second" };
      case "paused":
        return { label: "Saati sürdür", icon: "play", action: "resume" };
      case "second":
      case "extra":
        return { label: "Maçı bitir", icon: "flag", finish: true };
      case "finished":
        return { label: "Tekrar canlıya al", icon: "refresh", action: "reopen" };
    }
  })();

  return (
    <View style={styles.stack}>
      <View style={styles.scoreRow}>
        {(["home", "away"] as const).map((side) => {
          const name = side === "home" ? homeName : awayName;
          return (
            <View key={side} style={styles.scoreCard}>
              <View style={[styles.teamStripe, { backgroundColor: side === "home" ? RIG.home : RIG.away }]} />
              <Text style={styles.teamName} numberOfLines={1} allowFontScaling={false}>
                {name}
              </Text>
              <Text style={styles.bigScore} allowFontScaling={false}>
                {side === "home" ? live.score.home : live.score.away}
              </Text>
              <Touchable
                style={[styles.goalBtn, (saving || live.manual) && styles.disabled]}
                onPress={() => onAsk(side, "GOAL_RIGHT_FOOT", `${name} — golü atan`)}
                disabled={saving || live.manual}
                accessibilityLabel={`${name} gol`}
                haptic="medium"
              >
                <Ionicons name="football" size={18} color={RIG.text} />
                <Text style={styles.goalText} allowFontScaling={false}>
                  GOL
                </Text>
              </Touchable>
            </View>
          );
        })}
      </View>
      {live.manual ? <Hint>Skor elle / hükmen tescil edildi; goller skoru değiştirmez.</Hint> : null}
      {undoRow}

      <View style={styles.clockCard}>
        <Text style={styles.clock} allowFontScaling={false}>
          {clockText(live.clockMs)}
        </Text>
        <Text style={styles.sub} allowFontScaling={false}>
          {PHASE_LABEL[live.phase]} · {live.period >= 3 ? "Uzatma" : `${live.period}. devre`}
        </Text>
        <View style={styles.nudgeRow}>
          {[-60_000, -10_000, 10_000, 60_000].map((d) => (
            <Touchable
              key={d}
              style={[styles.nudge, (saving || live.status !== "canli") && styles.disabled]}
              onPress={() => void live.nudgeClock(d).catch((e: unknown) => onToast(errorText(e, "Saat düzeltilemedi. Bağlantını kontrol et.")))}
              disabled={saving || live.status !== "canli"}
              accessibilityLabel={`Saati ${Math.abs(d) >= 60_000 ? "1 dakika" : "10 saniye"} ${d > 0 ? "ileri" : "geri"} al`}
              hitSlop={4}
            >
              <Text style={styles.nudgeText} allowFontScaling={false}>
                {d > 0 ? "+" : "−"}
                {Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
              </Text>
            </Touchable>
          ))}
        </View>
      </View>

      <Btn
        label={primary.label}
        icon={primary.icon}
        tone={primary.finish ? "danger" : "ok"}
        disabled={saving}
        onPress={() => (primary.finish ? onFinish() : primary.action && onControl(primary.action))}
      />
      {live.running ? <Btn label="Saati durdur" icon="pause" tone="soft" disabled={saving} onPress={() => onControl("pause")} /> : null}
      {live.phase === "second" && live.clockMs >= HALF_MS * 2 ? (
        <Btn label="Uzatmaya geç" icon="time" tone="soft" disabled={saving} onPress={() => onControl("extra")} />
      ) : null}
      {live.phase === "paused" && live.period >= 2 ? <Btn label="Maçı bitir" icon="flag" tone="danger" disabled={saving} onPress={onFinish} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.45 },
  sub: { ...type.caption, color: RIG.textMute },

  scoreRow: { flexDirection: "row", gap: space.sm },
  scoreCard: { flex: 1, alignItems: "stretch", gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft, overflow: "hidden" },
  teamStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  teamName: { ...type.caption, color: RIG.textSoft, textAlign: "center" },
  bigScore: { ...type.scoreLg, color: RIG.text, textAlign: "center" },
  goalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: RIG.brand,
  },
  goalText: { ...type.h3, color: RIG.text },
  undo: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  undoText: { ...type.caption, color: RIG.textSoft, flex: 1 },
  clockCard: { alignItems: "center", gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  clock: { ...type.scoreMd, color: RIG.text },
  nudgeRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs, alignSelf: "stretch" },
  nudge: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelStrong },
  nudgeText: { ...type.micro, color: RIG.text },

  teamHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  teamDot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: space.xs },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  quick: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  quickWide: { width: "100%" },
  quickText: { ...type.caption, color: RIG.text, flex: 1 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  eventDot: { width: 8, height: 8, borderRadius: radius.pill },
  eventTitle: { ...type.label, color: RIG.text },
  trash: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
});
