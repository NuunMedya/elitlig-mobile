/**
 * Şehir 2.0 bildirimleri:
 *   · MigrationNotice — eski şehir 2.0'a taşındığında bir kez (cihazda
 *     "görüldü" olarak saklanır): ulaşılan basamak, iade edilen yıldız, kısa
 *     açıklama.
 *   · StepCelebration — basamak atlandığında: yeni basamak ve açılanlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Reveal } from "@/components/ui";
import type { City2State, City2StepView } from "@/lib/puzzle/city2";
import { colors, radius, space, textScale, type } from "@/theme";

import { BuildingIcon, LandmarkIcon, fmt } from "./shared";
import { RungBadge } from "./StepCard";

const seenKey = (at: string) => `elitlig.city2.migration.seen.v1.${at}`;
const RECENT_MS = 7 * 24 * 3600e3;

export function MigrationNotice({ city2 }: { city2: City2State | undefined }) {
  const m = city2?.migration ?? null;
  const [show, setShow] = useState(false);
  const at = m?.at ?? null;
  const justNow = Boolean(m?.just_now);
  useEffect(() => {
    if (!at) return undefined;
    let alive = true;
    const recent = justNow || Date.now() - new Date(at).getTime() < RECENT_MS;
    if (!recent) return undefined;
    AsyncStorage.getItem(seenKey(at))
      .then((v) => alive && setShow(!v))
      .catch(() => alive && setShow(justNow));
    return () => {
      alive = false;
    };
  }, [at, justNow]);

  if (!m || !city2) return null;
  const step = city2.ladder.steps.find((s) => s.rung === m.rung) ?? city2.ladder.current;
  const close = () => {
    setShow(false);
    void AsyncStorage.setItem(seenKey(m.at), "1").catch(() => undefined);
  };
  return (
    <BottomSheet
      visible={show}
      onClose={close}
      title="Kulüp Şehri 2.0"
      footer={<Button label="Şehrime bak" icon="arrow-forward" iconPosition="right" onPress={close} fullWidth haptic="success" />}
    >
      <View style={styles.wrap}>
        <View style={styles.hero}>
          <RungBadge label={step.label} size={56} />
          <View style={styles.heroTexts}>
            <Text style={styles.over} {...textScale.badge}>
              ŞEHRİN TAŞINDI
            </Text>
            <Text style={styles.title} {...textScale.dense}>
              Lig {step.label} · {step.title}
            </Text>
          </View>
        </View>
        <Text style={styles.lead} {...textScale.long}>
          Eski binaların yeni binalara aktarıldı ve harcadığın yıldızların karşılığı korundu ({fmt(m.value)} gelişim puanı). Artık binalarına ara adımlar ekleyip ana yükseltme yapar, ligde yükselirsin.
        </Text>
        {m.refund > 0 ? (
          <View style={styles.refund}>
            <Ionicons name="star" size={18} color={colors.yellowCard} />
            <View style={styles.refundTexts}>
              <Text style={styles.refundTitle} {...textScale.dense}>
                {fmt(m.refund)} yıldız iade edildi
              </Text>
              <Text style={styles.refundSub} {...textScale.long}>
                Yeni aşamalara sığmayan fark yıldız havuzuna eklendi.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

export interface StepResult {
  step: City2StepView;
  via: "player" | "fan" | "stars" | null;
  /** Atlamadan önceki açık yuva sayısı. */
  slotsBefore: number;
}

export function StepCelebration({ result, city2, onClose }: { result: StepResult | null; city2: City2State | undefined; onClose: () => void }) {
  const rung = result?.step.rung ?? 0;
  const opened = city2?.buildings.filter((b) => b.opens === rung) ?? [];
  const marks = city2?.landmarks.catalogue.filter((c) => c.min_rung === rung && c.cost != null) ?? [];
  const slots = city2 && result ? city2.landmarks.grid.open_slots - result.slotsBefore : 0;
  return (
    <BottomSheet visible={Boolean(result)} onClose={onClose} title="Yeni lig!" footer={<Button label="Devam" onPress={onClose} fullWidth haptic="success" />}>
      {result ? (
        <View style={styles.wrap}>
          <Reveal scaleFrom={0.85}>
            <View style={styles.celebrate}>
              <RungBadge label={result.step.label} size={72} tone="done" />
              <Text style={styles.celebrateTitle} {...textScale.dense}>
                {result.step.title}
              </Text>
              {result.via ? (
                <Text style={styles.celebrateVia} {...textScale.dense}>
                  {result.via === "player" ? "Sahadaki maçlarınla hak ettin" : result.via === "stars" ? "Kilit yıldızla açıldı" : "Taraftar yolundan geçtin"}
                </Text>
              ) : null}
            </View>
          </Reveal>
          {opened.length || marks.length || slots > 0 ? (
            <View style={styles.opened}>
              <Text style={styles.over} {...textScale.badge}>
                YENİ AÇILANLAR
              </Text>
              {opened.map((b) => (
                <View key={b.key} style={styles.openedRow}>
                  <BuildingIcon buildingKey={b.key} icon={b.icon} size={32} />
                  <Text style={styles.openedText} {...textScale.dense}>
                    {b.title}
                  </Text>
                </View>
              ))}
              {marks.map((c) => (
                <View key={c.key} style={styles.openedRow}>
                  <LandmarkIcon landmarkKey={c.key} tier={c.tier} size={32} />
                  <Text style={styles.openedText} {...textScale.dense}>
                    {c.title}
                  </Text>
                </View>
              ))}
              {slots > 0 ? (
                <View style={styles.openedRow}>
                  <View style={styles.slotIcon}>
                    <Ionicons name="grid" size={16} color={colors.brandAccent} />
                  </View>
                  <Text style={styles.openedText} {...textScale.dense}>
                    Meydanda {slots} yeni yuva
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingBottom: space.sm },
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroTexts: { flex: 1, gap: 2 },
  over: { ...type.overline, color: colors.textTertiary },
  title: { ...type.h1, color: colors.textPrimary },
  lead: { ...type.body, color: colors.textSecondary },
  refund: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  refundTexts: { flex: 1, gap: 2 },
  refundTitle: { ...type.h3, color: colors.textPrimary },
  refundSub: { ...type.caption, color: colors.textSecondary },
  celebrate: { alignItems: "center", gap: space.sm, paddingVertical: space.md },
  celebrateTitle: { ...type.display, color: colors.textPrimary, textAlign: "center" },
  celebrateVia: { ...type.bodySm, color: colors.textSecondary },
  opened: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  openedRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  openedText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  slotIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
});
