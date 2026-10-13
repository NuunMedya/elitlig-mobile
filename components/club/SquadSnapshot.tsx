/**
 * KADRO ÖZETİ — başkanın en sık sorduğu iki soruyu tek kartta yanıtlar:
 *   1. "Kalecim kaç, stoperim kaç?" → dört hattın oyuncu sayısı,
 *   2. "Kadromun ne kadarı sözleşmeli?" → sözleşme sağlığı çubuğu.
 *
 * NEDEN SAYI KUTUSU DEĞİL: eski panel "KADRO 16 · SÖZLEŞMELİ 14" diye iki
 * kopuk sayı veriyordu; oran ve dağılım okuyana kalıyordu. Burada hatlar
 * sahadaki sırasıyla (kaleden forvete) dizilir, eksik hat (0) uyarı
 * rengindedir, sözleşme çubuğu da veri rengindedir (`accent`).
 *
 * Mevkisi girilmemiş oyuncu bir hatta UYDURULMAZ: "Mevkisiz" olarak ayrıca
 * sayılır — başkanın düzeltmesi gereken bir eksiktir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Touchable } from "@/components/ui";
import { POSITION_LINES } from "@/lib/api/team";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

export type SquadLine = "GK" | "DEF" | "MID" | "FWD";

export interface LineCounts {
  GK: number;
  DEF: number;
  MID: number;
  FWD: number;
  unknown: number;
}

const LINE_LABELS: Record<SquadLine, string> = {
  GK: "Kaleci",
  DEF: "Defans",
  MID: "Orta saha",
  FWD: "Forvet",
};

const LINES: SquadLine[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Mevki → hat; tanınmazsa null. `positionLine()` bilinmeyeni orta sahaya
 * koyar (saha çizimi için doğru), sayım içinse yanlış olurdu.
 */
export function lineOf(value?: string | null): SquadLine | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const byCode = POSITION_LINES[raw.toLocaleUpperCase("tr-TR")];
  if (byCode) return byCode as SquadLine;
  const lower = raw.toLocaleLowerCase("tr-TR");
  if (lower.includes("kaleci")) return "GK";
  if (lower.includes("bek") || lower.includes("stoper") || lower.includes("defans")) return "DEF";
  if (lower.includes("forvet") || lower.includes("santrafor")) return "FWD";
  if (lower.includes("orta") || lower.includes("kanat")) return "MID";
  return null;
}

export function countLines(positions: (string | null | undefined)[]): LineCounts {
  const counts: LineCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0, unknown: 0 };
  positions.forEach((value) => {
    const line = lineOf(value);
    if (line) counts[line] += 1;
    else counts.unknown += 1;
  });
  return counts;
}

export interface SquadSnapshotProps {
  lines: LineCounts;
  total: number;
  contracted: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const SquadSnapshot = React.memo(function SquadSnapshot({
  lines,
  total,
  contracted,
  onPress,
  style,
}: SquadSnapshotProps) {
  const ratio = total > 0 ? contracted / total : 0;
  const missing = total - contracted;

  const content = (
    <>
      <View style={styles.lines}>
        {LINES.map((line, index) => (
          <React.Fragment key={line}>
            {index > 0 ? <View style={styles.sep} /> : null}
            <View style={styles.line}>
              <Text style={[styles.lineValue, lines[line] === 0 ? styles.lineEmpty : null]} {...textScale.badge}>
                {lines[line]}
              </Text>
              <Text style={styles.lineLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(LINE_LABELS[line])}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.contract}>
        <View style={styles.contractHead}>
          <Text style={styles.contractLabel} {...textScale.dense}>
            Sözleşmeli
          </Text>
          <Text style={styles.contractValue} {...textScale.badge}>
            {contracted}/{total}
          </Text>
          {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { flex: Math.max(ratio, 0) }]} />
          <View style={{ flex: Math.max(1 - ratio, 0) }} />
        </View>
        {missing > 0 || lines.unknown > 0 ? (
          <Text style={styles.note} {...textScale.dense}>
            {[
              missing > 0 ? `${missing} oyuncunun sözleşmesi yok` : null,
              lines.unknown > 0 ? `${lines.unknown} oyuncunun mevkisi girilmemiş` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (!onPress) return <View style={[styles.card, style]}>{content}</View>;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Kadro: ${total} oyuncu, ${contracted} sözleşmeli. ${LINES.map((line) => `${LINE_LABELS[line]} ${lines[line]}`).join(", ")}`}
      style={[styles.card, style]}
    >
      {content}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    marginHorizontal: layout.screenPadding,
    padding: space.md,
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  lines: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  line: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  sep: {
    width: hairline,
    backgroundColor: colors.separator,
  },
  lineValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  lineEmpty: {
    color: colors.warn,
  },
  lineLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  contract: {
    gap: space.s,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  contractHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  contractLabel: {
    ...type.label,
    color: colors.textSecondary,
    flex: 1,
  },
  contractValue: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  track: {
    flexDirection: "row",
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.slateSoft,
  },
  fill: {
    backgroundColor: colors.accent,
  },
  note: {
    ...type.caption,
    color: colors.warn,
  },
});
