/**
 * SONUÇ TESCİLİ (web matchUi/MatchResultPanel) — POST /maclar/:id/result.
 *
 * İki tür: "Elle skor" (golleri oyuncuya bağlamadan) ve "Hükmen" (bir takım
 * hükmen mağlup, kazanan skoru varsayılan 3). Elle / hükmen tescilli maçta
 * canlı olaylar skoru değiştirmez; "Otomatik skora dön" skoru yeniden
 * olaylardan hesaplatır. Geri dönüşü zor olduğu için her kayıt onay ister.
 */

import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { SegmentField, ToggleField, confirmAction } from "@/components/admin";
import { BottomSheet, Button, Input, Stepper, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { isManualResult, registerResult, resultSourceLabel, type AdminMatch, type ResultBody } from "@/lib/api/admin/matches";
import { colors, space, textScale, type } from "@/theme";

import { Note, SidePicker } from "./parts";

export function ResultSheet({
  visible,
  onClose,
  match,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  match: AdminMatch;
  onSaved: () => void;
}) {
  const toast = useToast();
  const homeName = match.first_team_name || "Ev sahibi";
  const awayName = match.second_team_name || "Deplasman";
  const [mode, setMode] = useState<"manual" | "forfeit">("manual");
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [loser, setLoser] = useState<"home" | "away">("away");
  const [winnerScore, setWinnerScore] = useState(3);
  const [note, setNote] = useState("");
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMode(match.score_source === "forfeit" ? "forfeit" : "manual");
    setHome(Number(match.first_team_score) || 0);
    setAway(Number(match.second_team_score) || 0);
    setNote(match.result_note || "");
    if (match.forfeit_side) setLoser(match.forfeit_side);
  }, [visible, match]);

  const preview =
    mode === "manual"
      ? { home, away }
      : { home: loser === "home" ? 0 : winnerScore, away: loser === "away" ? 0 : winnerScore };

  const submit = async (body: ResultBody, title: string, message: string) => {
    const ok = await confirmAction({ title, message, confirmLabel: "Tescil et" });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await registerResult(Number(match.id), body);
      onSaved();
      onClose();
      toast.show({ message: res?.message || "Sonuç tescil edildi.", tone: "success" });
    } catch (error) {
      // Alt sayfa açıkken toast altta kalır; hata Alert ile söylenir.
      Alert.alert("Sonuç tescil edilemedi", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const register = () => {
    const label = `${homeName} ${preview.home} – ${preview.away} ${awayName}`;
    const tail = publish
      ? "Maç tamamlandı olarak işaretlenir ve puan durumu yeniden hesaplanır."
      : "Puan durumu yeniden hesaplanır.";
    if (mode === "manual") {
      void submit({ mode, home, away, note, publish }, "Skor elle tescil edilecek", `${label}\n\n${tail}`);
    } else {
      void submit(
        { mode, forfeitSide: loser, forfeitScore: winnerScore, note, publish },
        `${loser === "home" ? homeName : awayName} hükmen mağlup`,
        `${label}\n\n${tail}`
      );
    }
  };

  const backToEvents = () =>
    void submit({ mode: "events" }, "Otomatik skora dön", "Skor yeniden canlı olaylardaki gollerden hesaplanır; elle / hükmen tescil kaldırılır.");

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title="Sonuç tescili"
      snap="full"
      footer={<Button label="Tescil et" icon="ribbon-outline" onPress={register} loading={busy} fullWidth haptic="success" />}
    >
      <View style={styles.stack}>
        {isManualResult(match) ? (
          <View style={styles.stack}>
            <Note
              tone="warn"
              text={`${resultSourceLabel(match)}: ${homeName} ${match.first_team_score ?? 0} – ${match.second_team_score ?? 0} ${awayName}${match.result_note ? `\nGerekçe: ${match.result_note}` : ""}`}
            />
            <Button label="Otomatik skora dön" variant="ghost" icon="refresh-outline" onPress={backToEvents} disabled={busy} />
          </View>
        ) : null}

        <SegmentField<"manual" | "forfeit">
          label="Tescil türü"
          value={mode}
          onChange={setMode}
          options={[
            { key: "manual", label: "Elle skor" },
            { key: "forfeit", label: "Hükmen" },
          ]}
        />

        {mode === "manual" ? (
          <View style={styles.scoreRow}>
            <View style={styles.scoreSide}>
              <Text style={styles.team} numberOfLines={2} {...textScale.dense}>
                {homeName}
              </Text>
              <Stepper value={home} onChange={setHome} min={0} max={99} repeatOnHold accessibilityLabel={`${homeName} skoru`} />
            </View>
            <View style={styles.scoreSide}>
              <Text style={styles.team} numberOfLines={2} {...textScale.dense}>
                {awayName}
              </Text>
              <Stepper value={away} onChange={setAway} min={0} max={99} repeatOnHold accessibilityLabel={`${awayName} skoru`} />
            </View>
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.label} {...textScale.dense}>
              Hükmen mağlup sayılan takım
            </Text>
            <SidePicker value={loser} onChange={setLoser} homeName={homeName} awayName={awayName} />
            <View style={styles.inline}>
              <Text style={styles.label} {...textScale.dense}>
                Kazanan takımın skoru
              </Text>
              <Stepper value={winnerScore} onChange={setWinnerScore} min={1} max={20} accessibilityLabel="Hükmen skor" />
            </View>
          </View>
        )}

        <Text style={styles.preview} {...textScale.badge}>
          {homeName} {preview.home} – {preview.away} {awayName}
        </Text>

        <Input label="Gerekçe (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Ör. takım sahaya çıkmadı" multiline />
        <ToggleField label="Maçı tamamlandı olarak işaretle" hint="Kapalıysa yalnız skor yazılır, durum değişmez." value={publish} onChange={setPublish} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  scoreRow: { flexDirection: "row", gap: space.md },
  scoreSide: { flex: 1, alignItems: "center", gap: space.sm },
  team: { ...type.label, color: colors.textSecondary, textAlign: "center" },
  label: { ...type.label, color: colors.textSecondary },
  inline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  preview: { ...type.h4, color: colors.textPrimary, textAlign: "center" },
});
