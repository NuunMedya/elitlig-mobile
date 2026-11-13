/**
 * KULÜBÜM ÖZET KARTLARI — kadro ve kasa, "açmadan oku" düzeninde.
 *
 *   <SquadSummary>    oyuncu sayısı (Odometer) + sözleşme oranı çubuğu,
 *                     mevki dağılımı (mevki renkli parçalı çubuk + lejant),
 *                     kalecisiz kadro uyarısı ve gol katkısı ilk üçü
 *   <FinanceSummary>  bakiye (Odometer) + FFP rozeti, gelir/gider oran
 *                     çubuğu, ▲ gelir / ▼ gider ve kadro değeri
 *
 * Kartın başı basılabilir (kadro / kasa ekranı); iç satırlar kendi hedefini
 * açar. Kart içinde kart yok: bölgeler saç teli ayraçla ayrılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LineCounts } from "@/components/club/SquadSnapshot";
import { LegendItem, ListCard, SplitBar, ToneRow, shortMoney } from "@/components/team/ClubKit";
import { Avatar, Badge, GradientBar, Odometer, RankBadge, Touchable, type Tone } from "@/components/ui";
import type { OverviewContributor } from "@/lib/api/club/overview";
import type { FfpStatus } from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, space, textScale, type, upperTR } from "@/theme";

/* ═══════════════════════════════ KADRO ═══════════════════════════════ */

export function SquadSummary({
  lines,
  total,
  contracted,
  contributors,
  onOpen,
  onContracts,
  onPlayer,
}: {
  lines: LineCounts;
  total: number;
  contracted: number;
  contributors: OverviewContributor[];
  onOpen: () => void;
  onContracts: () => void;
  onPlayer: (id: number) => void;
}) {
  const missing = total - contracted;
  return (
    <ListCard>
      <Touchable onPress={onOpen} feedback="row" accessibilityRole="button" accessibilityLabel={`Kadro, ${total} oyuncu`} style={styles.head}>
        <View style={styles.headMain}>
          <Text style={styles.overline} {...textScale.badge}>
            KADRO
          </Text>
          <View style={styles.bigRow}>
            <Odometer value={total} style={styles.big} />
            <Text style={styles.bigUnit} {...textScale.badge}>
              oyuncu
            </Text>
          </View>
        </View>
        <Touchable onPress={onContracts} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${contracted} / ${total} sözleşmeli`} style={styles.contract}>
          <View style={styles.contractHead}>
            <Text style={styles.contractLabel} {...textScale.badge}>
              SÖZLEŞMELİ
            </Text>
            <Text style={[styles.contractValue, missing > 0 && { color: colors.warn }]} {...textScale.badge}>
              {`${contracted}/${total}`}
            </Text>
          </View>
          <GradientBar value={total ? contracted / total : 0} height={6} />
        </Touchable>
      </Touchable>

      <View style={styles.block}>
        <SplitBar
          height={10}
          parts={[
            { key: "gk", value: lines.GK, color: colors.posKeeper },
            { key: "def", value: lines.DEF, color: colors.posDefense },
            { key: "mid", value: lines.MID, color: colors.posMidfield },
            { key: "fwd", value: lines.FWD, color: colors.posForward },
            { key: "unk", value: lines.unknown, color: colors.posUnknown },
          ]}
        />
        <View style={styles.legendRow}>
          <LegendItem color={colors.posKeeper} label="Kaleci" value={lines.GK} />
          <LegendItem color={colors.posDefense} label="Defans" value={lines.DEF} />
          <LegendItem color={colors.posMidfield} label="Orta" value={lines.MID} />
          <LegendItem color={colors.posForward} label="Forvet" value={lines.FWD} />
          {lines.unknown ? <LegendItem color={colors.posUnknown} label="Mevkisiz" value={lines.unknown} /> : null}
        </View>
        {lines.GK === 0 ? (
          <View style={styles.warn}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.warnText} {...textScale.dense}>
              Kadroda kaleci yok — maç kadrosu kurulamaz.
            </Text>
          </View>
        ) : null}
      </View>

      {contributors.length ? (
        <>
          <View style={styles.subHead}>
            <Text style={styles.overline} {...textScale.badge}>
              GOL KATKISI
            </Text>
          </View>
          {contributors.map((player, index) => (
            <ToneRow
              key={player.id}
              leading={
                <View>
                  <Avatar name={player.name} image={mediaUrl(player.image)} size={38} />
                  <RankBadge rank={index + 1} size={18} style={styles.rank} />
                </View>
              }
              title={player.name}
              meta={[player.position, `${player.matches} maç`].filter(Boolean).join(" · ")}
              trailing={
                <View style={styles.ga}>
                  <Text style={styles.gaValue} {...textScale.badge}>
                    {player.goals}
                    <Text style={styles.gaUnit}> G</Text>
                  </Text>
                  <Text style={styles.gaValue} {...textScale.badge}>
                    {player.assists}
                    <Text style={styles.gaUnit}> A</Text>
                  </Text>
                </View>
              }
              onPress={() => onPlayer(player.id)}
              last={index === contributors.length - 1}
            />
          ))}
        </>
      ) : null}
    </ListCard>
  );
}

/* ═══════════════════════════════ KASA ═══════════════════════════════ */

const FFP: Record<FfpStatus, { label: string; tone: Tone }> = {
  COMPLIANT: { label: "FFP uygun", tone: "win" },
  WARNING: { label: "FFP sınırda", tone: "warn" },
  BREACH: { label: "FFP aşıldı", tone: "danger" },
  DISABLED: { label: "FFP kapalı", tone: "neutral" },
};

export function FinanceSummary({
  income,
  expense,
  squadValue,
  ffp,
  season,
  onOpen,
  onSquadValue,
}: {
  income: number;
  expense: number;
  squadValue: number;
  ffp: FfpStatus;
  season?: string | null;
  onOpen: () => void;
  onSquadValue: () => void;
}) {
  const balance = income - expense;
  const ffpMeta = FFP[ffp] ?? FFP.DISABLED;
  const [amount, unit] = splitMoney(balance);
  return (
    <ListCard>
      <Touchable onPress={onOpen} feedback="row" accessibilityRole="button" accessibilityLabel={`Kasa, bakiye ${shortMoney(balance)}`} style={styles.finance}>
        <View style={styles.financeHead}>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR(season ? `Bakiye · ${season}` : "Bakiye")}
          </Text>
          <Badge label={ffpMeta.label} tone={ffpMeta.tone} size="xs" />
        </View>
        <View style={styles.bigRow}>
          <Odometer value={amount} style={[styles.big, balance < 0 && { color: colors.loss }]} />
          <Text style={styles.bigUnit} {...textScale.badge}>
            {unit}
          </Text>
        </View>
        <SplitBar
          height={8}
          parts={[
            { key: "in", value: income, color: colors.win },
            { key: "out", value: expense, color: colors.loss },
          ]}
        />
        <View style={styles.flowRow}>
          <Flow arrow="▲" color={colors.win} label="Gelir" value={shortMoney(income)} />
          <Flow arrow="▼" color={colors.loss} label="Gider" value={shortMoney(expense)} />
        </View>
      </Touchable>
      <ToneRow
        icon="diamond"
        tone="cyan"
        title="Kadro değeri"
        meta="Oyuncuların piyasa değeri · nakit değildir"
        value={shortMoney(squadValue)}
        valueColor={colors.accentText}
        onPress={onSquadValue}
        last
      />
    </ListCard>
  );
}

function Flow({ arrow, color, label, value }: { arrow: string; color: string; label: string; value: string }) {
  return (
    <View style={styles.flow}>
      <Text style={[styles.flowArrow, { color }]} {...textScale.badge}>
        {arrow}
      </Text>
      <Text style={styles.flowLabel} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.flowValue} numberOfLines={1} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

/** "22,0 B ₺" → ["22,0", "B ₺"]: rakam kısmı döner, birim sabit durur. */
function splitMoney(value: number): [string, string] {
  const text = shortMoney(value);
  const match = /^(−?[\d.,]+)\s*(.*)$/.exec(text);
  return match ? [match[1], match[2]] : [text, ""];
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: space.md, paddingHorizontal: space.lg },
  headMain: { gap: space.xxs },
  overline: { ...type.overline, color: colors.textTertiary },
  bigRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  big: { ...type.scoreLg, color: colors.textPrimary },
  bigUnit: { ...type.label, color: colors.textTertiary, marginBottom: space.xs },
  contract: { flex: 1, gap: space.s },
  contractHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  contractLabel: { ...type.nano, color: colors.textTertiary },
  contractValue: { ...type.numSmStrong, color: colors.textPrimary },
  block: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.xs, columnGap: space.sm },
  warn: { flexDirection: "row", alignItems: "center", gap: space.xs },
  warnText: { ...type.caption, color: colors.danger, flex: 1 },
  subHead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxs, borderTopWidth: hairline, borderTopColor: colors.separator },
  rank: { position: "absolute", right: -space.xs, bottom: -space.xxs },
  ga: { flexDirection: "row", gap: space.md },
  gaValue: { ...type.tableNumStrong, color: colors.textPrimary },
  gaUnit: { ...type.numSm, color: colors.textTertiary },

  finance: { padding: space.lg, gap: space.sm },
  financeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  flowRow: { flexDirection: "row", gap: space.lg },
  flow: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs },
  flowArrow: { ...type.numSmStrong },
  flowLabel: { ...type.bodySm, color: colors.textTertiary },
  flowValue: { ...type.tableNumStrong, color: colors.textPrimary, flex: 1, textAlign: "right" },
});
