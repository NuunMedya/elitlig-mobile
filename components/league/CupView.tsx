/**
 * CupView — kupa (eleme ağacı) ve tek etap sekmelerinin gövdesi.
 *
 * Web'deki "Kupa yolu"nun (CupBracket + CupStageList) mobil hâli. İKİ GÖRÜNÜM:
 *
 *   · AĞAÇ — turlar soldan sağa sütun; eşleşmeler ikişer ikişer bir sonraki
 *     tura bağlanır, sonda şampiyon kutusu durur. Yatay kaydırılır. Yalnız
 *     her tur bir öncekinin yarısıysa çizilir (bağlantı çizgileri ancak o
 *     zaman anlamlı); aksi hâlde yalnız tur listesi gösterilir.
 *   · TURLAR — tur tur eşleşme kartları: tarih, saha, skor. Telefon
 *     genişliğinde ayrıntının okunduğu yer burasıdır.
 *
 * ÖLÇÜLER SABİTTİR: ağaç mutlak konumla çizilir (hücre 52px, yuva 62px);
 * ölçüm (onLayout) beklenmez, ilk karede doğru çizilir.
 *
 * Eşleşmeye dokununca maç sayfası açılır (maç bağlıysa). Galip kalın,
 * elenen soluk; penaltı/kurayla geçen takım "P" rozeti taşır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Reveal, SegmentedControl, TeamLogo, Touchable, type SegmentedItem } from "@/components/ui";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { describeTie, isHalvingBracket, type Cup, type CupStage, type CupTone, type Tie, type TieSide } from "./cups";
import { PaneLabel, groupStyles } from "./shared";

type CupMode = "agac" | "turlar";

const MODE_ITEMS: SegmentedItem<CupMode>[] = [
  { key: "agac", label: "Ağaç" },
  { key: "turlar", label: "Turlar" },
];

const TONE_COLOR: Record<CupTone, string> = {
  gold: colors.zoneChampion,
  silver: colors.slate,
  bronze: colors.zoneRelegationPlayoff,
};

/* ═══════════════════════════ EŞLEŞME SATIRI ═══════════════════════════ */

const SideRow = React.memo(function SideRow({ side, dense }: { side: TieSide; dense: boolean }) {
  return (
    <View style={dense ? styles.sideDense : styles.side}>
      {side.team ? (
        <TeamLogo name={side.team.team_name} logo={side.team.logo ?? null} size={dense ? 16 : 22} dimmed={side.out} />
      ) : (
        <View style={[styles.pendingMark, dense ? styles.pendingMarkDense : null]}>
          <Ionicons name="help" size={dense ? 9 : 12} color={colors.textTertiary} />
        </View>
      )}
      <Text
        style={[
          dense ? styles.sideNameDense : styles.sideName,
          side.won ? styles.sideWon : null,
          side.out ? styles.sideOut : null,
          side.team ? null : styles.sidePending,
        ]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {side.name}
      </Text>
      {side.manual ? (
        <View style={styles.manualTag} accessibilityLabel="Penaltılarla ya da kurayla">
          <Text style={styles.manualText} {...textScale.badge}>
            P
          </Text>
        </View>
      ) : null}
      <Text
        style={[dense ? styles.sideScoreDense : styles.sideScore, side.out ? styles.sideOut : null]}
        {...textScale.badge}
      >
        {side.score == null ? "" : side.score}
      </Text>
    </View>
  );
});

function tieSpeech(tie: Tie): string {
  const score =
    tie.home.score != null && tie.away.score != null ? `${tie.home.score} ${tie.away.score}` : "";
  return [tie.home.name, score, tie.away.name, tie.meta].filter(Boolean).join(", ");
}

/** Ağaçtaki sıkı hücre. */
const BracketCell = React.memo(function BracketCell({
  tie,
  onOpenMatch,
}: {
  tie: Tie;
  onOpenMatch: (matchId: number) => void;
}) {
  const matchId = tie.matchId;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      disabled={!matchId}
      onPress={matchId ? () => onOpenMatch(matchId) : undefined}
      accessibilityRole="button"
      accessibilityLabel={tieSpeech(tie)}
      style={[styles.cell, tie.live ? styles.cellLive : null]}
    >
      <SideRow side={tie.home} dense />
      <View style={styles.cellDivider} />
      <SideRow side={tie.away} dense />
    </Touchable>
  );
});

/** Tur listesindeki ayrıntılı kart. */
const TieCard = React.memo(function TieCard({
  tie,
  onOpenMatch,
}: {
  tie: Tie;
  onOpenMatch: (matchId: number) => void;
}) {
  const matchId = tie.matchId;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      disabled={!matchId}
      onPress={matchId ? () => onOpenMatch(matchId) : undefined}
      accessibilityRole="button"
      accessibilityLabel={tieSpeech(tie)}
      style={[groupStyles.card, styles.card]}
    >
      {tie.live ? <View style={styles.cardLiveEdge} /> : null}
      <SideRow side={tie.home} dense={false} />
      <SideRow side={tie.away} dense={false} />
      <View style={styles.cardMeta}>
        <Text style={[styles.cardMetaText, tie.live ? styles.cardMetaLive : null]} numberOfLines={1} {...textScale.dense}>
          {tie.awaitingWinner ? "Berabere bitti — galip bekleniyor" : tie.meta}
          {tie.venue ? ` · ${tie.venue}` : ""}
        </Text>
        {matchId ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
      </View>
    </Touchable>
  );
});

/* ═══════════════════════════════ AĞAÇ ═══════════════════════════════ */

const CELL_W = 156;
const CELL_H = 52;
const SLOT = CELL_H + space.m;
const COL_GAP = space.xl;
const HEAD_H = 24;
const CHAMP_W = 116;
const CHAMP_H = 92;

const Bracket = React.memo(function Bracket({
  cup,
  ties,
  onOpenMatch,
}: {
  cup: Cup;
  /** Tur başına eşleşme özetleri (cup.stages ile aynı sırada). */
  ties: Tie[][];
  onOpenMatch: (matchId: number) => void;
}) {
  const tone = TONE_COLOR[cup.tone];
  const rounds = cup.stages.length;
  const height = HEAD_H + ties[0].length * SLOT;
  const width = rounds * CELL_W + rounds * COL_GAP + CHAMP_W;

  /** r. turdaki i. eşleşmenin dikey merkezi. */
  const centerY = (round: number, index: number) => HEAD_H + (index + 0.5) * SLOT * 2 ** round;
  const colX = (round: number) => round * (CELL_W + COL_GAP);

  const lines: React.ReactNode[] = [];
  ties.forEach((list, round) => {
    const x = colX(round) + CELL_W;
    const mid = x + COL_GAP / 2;
    list.forEach((tie, index) => {
      const y = centerY(round, index);
      const decided = tie.decided;
      // Hücreden çıkan kısa yatay çizgi.
      lines.push(
        <View
          key={`h-${round}-${index}`}
          style={[styles.line, decided ? styles.lineOn : null, { left: x, top: y, width: COL_GAP / 2, height: LINE }]}
        />,
      );
      if (round < rounds - 1 && index % 2 === 0 && list[index + 1]) {
        const yNext = centerY(round, index + 1);
        // Çifti birleştiren dikey çizgi ve sonraki tura giren yatay çizgi.
        lines.push(
          <View
            key={`v-${round}-${index}`}
            style={[styles.line, { left: mid, top: y, width: LINE, height: yNext - y + LINE }]}
          />,
          <View
            key={`n-${round}-${index}`}
            style={[styles.line, { left: mid, top: (y + yNext) / 2, width: COL_GAP / 2, height: LINE }]}
          />,
        );
      }
    });
  });
  // Finalden şampiyon kutusuna.
  const finalY = centerY(rounds - 1, 0);
  lines.push(
    <View
      key="champ-line"
      style={[
        styles.line,
        cup.champion ? styles.lineOn : null,
        { left: colX(rounds - 1) + CELL_W + COL_GAP / 2, top: finalY, width: COL_GAP / 2, height: LINE },
      ]}
    />,
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bracketScroll}
      style={styles.bracketBleed}
    >
      <View style={{ width, height }}>
        {cup.stages.map((stage, round) => (
          <Text
            key={`head-${stage.group.id}`}
            style={[styles.roundHead, { left: colX(round), width: CELL_W }]}
            numberOfLines={1}
            {...textScale.badge}
          >
            {upperTR(stage.label)}
          </Text>
        ))}
        <Text
          style={[styles.roundHead, { left: colX(rounds), width: CHAMP_W }]}
          numberOfLines={1}
          {...textScale.badge}
        >
          {upperTR("Şampiyon")}
        </Text>

        {lines}

        {ties.map((list, round) =>
          list.map((tie, index) => (
            <View
              key={tie.key}
              style={[styles.cellSlot, { left: colX(round), top: centerY(round, index) - CELL_H / 2 }]}
            >
              <BracketCell tie={tie} onOpenMatch={onOpenMatch} />
            </View>
          )),
        )}

        <View
          style={[
            styles.champ,
            { left: colX(rounds), top: Math.max(HEAD_H, finalY - CHAMP_H / 2) },
            cup.champion ? { borderColor: tone } : null,
          ]}
        >
          <Ionicons name="trophy" size={18} color={cup.champion ? tone : colors.textTertiary} />
          {cup.champion ? (
            <>
              <TeamLogo name={cup.champion.team_name} logo={cup.champion.logo ?? null} size={22} />
              <Text style={styles.champName} numberOfLines={2} {...textScale.dense}>
                {cup.champion.team_name}
              </Text>
            </>
          ) : (
            <Text style={styles.champPending} numberOfLines={2} {...textScale.dense}>
              Finalden sonra belli olur
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
});

/* ═════════════════════════════ TUR LİSTESİ ═════════════════════════════ */

const StageList = React.memo(function StageList({
  stage,
  ties,
  title,
  order,
  onOpenMatch,
}: {
  stage: CupStage;
  ties: Tie[];
  title: string;
  order: number;
  onOpenMatch: (matchId: number) => void;
}) {
  const sorted = useMemo(() => ties.slice().sort((a, b) => a.index - b.index), [ties]);
  const done = sorted.filter((tie) => tie.decided).length;
  const meta = sorted.length
    ? `${sorted.length} eşleşme${stage.group.double_round ? " · rövanşlı" : ""} · ${
        done === sorted.length ? "tamamlandı" : `${done}/${sorted.length} sonuçlandı`
      }`
    : undefined;

  return (
    <Reveal index={order} limit={6} style={styles.stage}>
      <PaneLabel title={title} meta={meta} />
      {sorted.length ? (
        <View style={styles.stageCards}>
          {sorted.map((tie) => (
            <TieCard key={tie.key} tie={tie} onOpenMatch={onOpenMatch} />
          ))}
        </View>
      ) : (
        <Text style={styles.stageEmpty} {...textScale.long}>
          Bu turda henüz eşleşme tanımlanmadı.
        </Text>
      )}
    </Reveal>
  );
});

/* ═══════════════════════════════ GÖVDE ═══════════════════════════════ */

export interface CupViewProps {
  /** Kupa sekmesi. */
  cup?: Cup | null;
  /** Kupaya girmeyen tek etap sekmesi. */
  stage?: CupStage | null;
  onOpenMatch: (matchId: number) => void;
}

export const CupView = React.memo(function CupView({ cup, stage, onOpenMatch }: CupViewProps) {
  const [mode, setMode] = useState<CupMode>("agac");

  const stages = useMemo<CupStage[]>(
    () => (cup ? cup.stages : stage ? [stage] : []),
    [cup, stage],
  );
  const ties = useMemo(
    () => stages.map((item) => item.matchups.map((matchup) => describeTie(matchup, item, cup))),
    [stages, cup],
  );
  const third = cup?.thirdPlace ?? null;
  const thirdTies = useMemo(
    () => (third ? third.matchups.map((matchup) => describeTie(matchup, third, cup)) : []),
    [third, cup],
  );

  const treeable = Boolean(cup && isHalvingBracket(cup));
  const showTree = treeable && mode === "agac";

  return (
    <View style={styles.root}>
      {cup ? (
        <Reveal style={[groupStyles.card, styles.hero]}>
          <View style={[styles.heroIcon, { borderColor: TONE_COLOR[cup.tone] }]}>
            <Ionicons name="trophy" size={18} color={TONE_COLOR[cup.tone]} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
              {cup.name}
            </Text>
            <Text style={styles.heroPath} numberOfLines={2} {...textScale.dense}>
              {cup.champion
                ? `Şampiyon: ${cup.champion.team_name}`
                : cup.stages.map((item) => item.label).join("  ›  ")}
            </Text>
          </View>
          {treeable ? (
            <SegmentedControl items={MODE_ITEMS} value={mode} onChange={setMode} size="sm" stretch={false} />
          ) : null}
        </Reveal>
      ) : null}

      {showTree && cup ? (
        <Reveal index={1} distance={0}>
          <Bracket cup={cup} ties={ties} onOpenMatch={onOpenMatch} />
          {third && thirdTies.length ? (
            <View style={styles.third}>
              <PaneLabel title={third.label} />
              <TieCard tie={thirdTies[0]} onOpenMatch={onOpenMatch} />
            </View>
          ) : null}
        </Reveal>
      ) : (
        <>
          {stages.map((item, index) => (
            <StageList
              key={item.group.id}
              stage={item}
              ties={ties[index]}
              title={item.label}
              order={index + 1}
              onOpenMatch={onOpenMatch}
            />
          ))}
          {third ? (
            <StageList
              stage={third}
              ties={thirdTies}
              title={third.label}
              order={stages.length + 1}
              onOpenMatch={onOpenMatch}
            />
          ) : null}
        </>
      )}

      <Text style={styles.legend} {...textScale.long}>
        Kalın yazılan takım tur atladı. “P” penaltılarla ya da kurayla geçildiğini gösterir.
        {"\n"}Eşleşmeye dokununca maç sayfası açılır.
      </Text>
    </View>
  );
});

const LINE = 1;

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },

  /* — Kupa kimliği — */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: colors.surface2,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  heroTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  heroPath: {
    ...type.meta,
    color: colors.textTertiary,
  },

  /* — Taraf satırı — */
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 30,
  },
  sideDense: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    height: (CELL_H - LINE) / 2,
    paddingHorizontal: space.sm,
  },
  sideName: {
    ...type.label,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  sideNameDense: {
    ...type.labelXs,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  sideWon: {
    fontFamily: fonts.heading,
  },
  sideOut: {
    color: colors.textTertiary,
  },
  sidePending: {
    ...type.meta,
    color: colors.textTertiary,
  },
  sideScore: {
    ...type.scoreXs,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: "right",
  },
  sideScoreDense: {
    ...type.numSmStrong,
    color: colors.textPrimary,
    minWidth: 16,
    textAlign: "right",
  },
  pendingMark: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  pendingMarkDense: {
    width: 16,
    height: 16,
  },
  manualTag: {
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.brandDim,
  },
  manualText: {
    ...type.nano,
    color: colors.brandAccent,
  },

  /* — Ağaç — */
  bracketBleed: {
    marginHorizontal: -space.lg,
  },
  bracketScroll: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  roundHead: {
    position: "absolute",
    top: 0,
    height: HEAD_H,
    ...type.overline,
    color: colors.textTertiary,
  },
  cellSlot: {
    position: "absolute",
    width: CELL_W,
    height: CELL_H,
  },
  cell: {
    width: CELL_W,
    height: CELL_H,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  cellLive: {
    borderColor: colors.live,
  },
  cellDivider: {
    height: LINE,
    backgroundColor: colors.separator,
  },
  line: {
    position: "absolute",
    backgroundColor: colors.borderStrong,
  },
  lineOn: {
    backgroundColor: colors.brand,
  },
  champ: {
    position: "absolute",
    width: CHAMP_W,
    height: CHAMP_H,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    padding: space.sm,
  },
  champName: {
    ...type.labelXs,
    color: colors.textPrimary,
    textAlign: "center",
  },
  champPending: {
    ...type.meta,
    color: colors.textTertiary,
    textAlign: "center",
  },
  third: {
    marginTop: space.lg,
  },

  /* — Tur listesi — */
  stage: {
    marginTop: space.xs,
  },
  stageCards: {
    gap: space.sm,
  },
  stageEmpty: {
    ...type.bodySm,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  card: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.s,
    overflow: "hidden",
  },
  cardLiveEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.live,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: space.xs,
    paddingTop: space.s,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  cardMetaText: {
    ...type.meta,
    color: colors.textTertiary,
    flex: 1,
  },
  cardMetaLive: {
    color: colors.live,
    fontFamily: fonts.semibold,
  },

  legend: {
    ...type.meta,
    color: colors.textTertiary,
    lineHeight: 15,
    paddingHorizontal: space.xxs,
  },
});
