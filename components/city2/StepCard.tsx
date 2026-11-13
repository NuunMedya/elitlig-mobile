/**
 * KARİYER MERDİVENİ KARTI — şu anki basamak ve bir sonrakine giden yol:
 * gelişim puanı, gereken bina aşamaları ve (bazı basamaklarda) gerçek hayat
 * kilidi. Basamak atlamak AÇIK bir eylemdir: koşullar tamamsa "Basamak atla".
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { Touchable } from "@/components/ui";
import type { City2Building, City2Ladder, City2Next } from "@/lib/puzzle/city2";
import { colors, radius, space, textScale, type } from "@/theme";

import { GateLive } from "./GateView";
import { Bar, BuildingIcon, Check, cardStyle, fmt } from "./shared";

export function RungBadge({ label, size = 44, tone = "brand" }: { label: string; size?: number; tone?: "brand" | "done" | "off" }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2 },
        tone === "done" ? styles.badgeDone : tone === "off" ? styles.badgeOff : null,
      ]}
    >
      <Text style={[size >= 40 ? styles.badgeText : styles.badgeTextSm, tone === "off" ? styles.badgeTextOff : null]} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/** Sıradaki basamağın koşulları: gelişim puanı, bina aşamaları, gerçek hayat kilidi. */
export function NextRequirements({
  next,
  buildings,
  onBuilding,
  busy,
  onPay,
}: {
  next: City2Next;
  buildings: City2Building[];
  onBuilding: (key: string) => void;
  busy?: boolean;
  /** Gerçek hayat kilidini yıldızla aç (onaydan sonra). */
  onPay?: () => void;
}) {
  return (
    <>
    <View style={styles.req}>
      <Check ok={next.dev.ok} />
      <View style={styles.reqTexts}>
        <Text style={styles.reqTitle} {...textScale.dense}>
          Gelişim puanı
        </Text>
        {!next.dev.ok ? <Bar value={next.dev.have / Math.max(1, next.dev.need)} tone="brand" style={styles.reqBar} /> : null}
      </View>
      <Text style={[styles.reqValue, next.dev.ok ? styles.ok : null]} {...textScale.badge}>
        {fmt(next.dev.have)}/{fmt(next.dev.need)}
      </Text>
    </View>

    {next.stages.map((s) => {
      const b = buildings.find((x) => x.key === s.building);
      return (
        <Touchable
          key={s.building}
          onPress={() => onBuilding(s.building)}
          feedback="row"
          style={styles.req}
          accessibilityRole="button"
          accessibilityLabel={`${s.title}: ${s.need_title}, aşama ${s.have}/${s.need}`}
        >
          <Check ok={s.ok} />
          <BuildingIcon buildingKey={s.building} icon={b?.icon} size={28} off={!b?.open} />
          <View style={styles.reqTexts}>
            <Text style={styles.reqTitle} numberOfLines={1} {...textScale.dense}>
              {s.title}
            </Text>
            <Text style={styles.reqSub} numberOfLines={1} {...textScale.dense}>
              {s.need}. aşama · {s.need_title}
            </Text>
          </View>
          <Text style={[styles.reqValue, s.ok ? styles.ok : null]} {...textScale.badge}>
            {Math.min(s.have, s.need)}/{s.need}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </Touchable>
      );
    })}

    {next.gate ? <GateLive next={next} gate={next.gate} busy={busy} onPay={onPay} /> : null}
    </>
  );
}

export function StepCard({
  ladder,
  buildings,
  busy,
  onAdvance,
  onLadder,
  onBuilding,
}: {
  ladder: City2Ladder;
  buildings: City2Building[];
  busy: boolean;
  onAdvance: (pay?: boolean) => void;
  onLadder: () => void;
  onBuilding: (key: string) => void;
}) {
  const next = ladder.next;
  const lastNo = ladder.steps[ladder.steps.length - 1]?.no ?? ladder.max_rung;
  const reqs = next ? [next.dev.ok, ...next.stages.map((s) => s.ok), ...(next.gate ? [next.gate.ok] : [])] : [];
  const done = reqs.filter(Boolean).length;
  return (
    <View style={styles.card}>
      <Touchable onPress={onLadder} feedback="row" style={styles.head} accessibilityRole="button" accessibilityLabel={`Lig ${ladder.current.label}, ${ladder.current.title}. Bütün ligleri aç`}>
        <RungBadge label={ladder.current.label} />
        <View style={styles.headTexts}>
          <Text style={styles.overline} {...textScale.badge}>
            LİG · {ladder.current.no}/{lastNo}
          </Text>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {ladder.current.title}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Touchable>

      {next ? (
        <>
          <View style={styles.nextHead}>
            <Text style={styles.nextLabel} {...textScale.dense}>
              Sıradaki: {next.label} · {next.title}
            </Text>
            <Text style={[styles.nextCount, next.can_advance ? styles.nextReady : null]} {...textScale.badge}>
              {done}/{reqs.length}
            </Text>
          </View>
          <Bar value={reqs.length ? done / reqs.length : 1} />

          <NextRequirements next={next} buildings={buildings} onBuilding={onBuilding} busy={busy} onPay={() => onAdvance(true)} />

          {next.can_advance ? (
            <ChunkyButton label={busy ? "ÇIKILIYOR…" : `LİGE YÜKSEL · ${next.label}`} icon="arrow-up-circle" tone="green" disabled={busy} onPress={() => onAdvance()} accessibilityLabel={`Lige yüksel: ${next.title}`} />
          ) : null}
        </>
      ) : (
        <Text style={styles.top} {...textScale.long}>
          Merdivenin zirvesindesin. Şehrini sembol yapılarla güzelleştirmeye devam et.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...cardStyle, padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md, marginHorizontal: -space.xs, paddingHorizontal: space.xs, borderRadius: radius.md },
  headTexts: { flex: 1, gap: 2 },
  overline: { ...type.overline, color: colors.textTertiary },
  title: { ...type.h1, color: colors.textPrimary },
  badge: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  badgeDone: { backgroundColor: colors.win },
  badgeOff: { backgroundColor: colors.surface3 },
  badgeText: { ...type.scoreSm, color: colors.textOnBrand },
  badgeTextSm: { ...type.numSmStrong, color: colors.textOnBrand },
  badgeTextOff: { color: colors.textTertiary },
  nextHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  nextLabel: { ...type.label, color: colors.textSecondary, flex: 1 },
  nextCount: { ...type.numSmStrong, color: colors.textSecondary },
  nextReady: { color: colors.win },
  req: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 36 },
  reqTexts: { flex: 1, gap: 2 },
  reqTitle: { ...type.labelSm, color: colors.textPrimary },
  reqSub: { ...type.caption, color: colors.textTertiary },
  reqBar: { marginTop: 2 },
  reqValue: { ...type.numSmStrong, color: colors.textSecondary },
  ok: { color: colors.win },
  top: { ...type.body, color: colors.textSecondary },
});

