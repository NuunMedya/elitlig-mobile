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
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  GradientBar,
  Reveal,
  SegmentedControl,
  TeamLogo,
  Touchable,
  withAlpha,
  type SegmentedItem,
} from "@/components/ui";
import { colors, elevate, fonts, glowStyle, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { describeTie, isHalvingBracket, type Cup, type CupStage, type CupTone, type Tie, type TieSide } from "./cups";
import { StageCard } from "./kit";

type CupMode = "agac" | "turlar";

const MODE_ITEMS: SegmentedItem<CupMode>[] = [
  { key: "agac", label: "Ağaç" },
  { key: "turlar", label: "Turlar" },
];

/** Kupa tonu → madalya degradesi (kupa ikonu, şampiyon kutusu, başlık). */
const TONE_GRADIENT: Record<CupTone, readonly [string, string]> = {
  gold: colors.medalGold,
  silver: colors.medalSilver,
  bronze: colors.medalBronze,
};

/* ═══════════════════════════ EŞLEŞME SATIRI ═══════════════════════════ */

/**
 * Tek taraf. Galip satırı açık mor zemin + kalın ad + vurgulu skor hapı;
 * elenen soluk; henüz belli olmayan taraf soru işaretli boş halka.
 */
const SideRow = React.memo(function SideRow({ side, dense }: { side: TieSide; dense: boolean }) {
  return (
    <View style={[dense ? styles.sideDense : styles.side, side.won ? styles.sideWonBg : null]}>
      {side.won ? <View style={dense ? styles.winTickDense : styles.winTick} /> : null}
      {side.team ? (
        <TeamLogo name={side.team.team_name} logo={side.team.logo ?? null} size={dense ? 18 : 26} dimmed={side.out} />
      ) : (
        <View style={[styles.pendingMark, dense ? styles.pendingMarkDense : null]}>
          <Ionicons name="help" size={dense ? 10 : 13} color={colors.textTertiary} />
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
      <View style={[dense ? styles.scoreBoxDense : styles.scoreBox, side.won ? styles.scoreBoxWon : null]}>
        <Text
          style={[
            dense ? styles.sideScoreDense : styles.sideScore,
            side.won ? styles.sideScoreWon : null,
            side.out ? styles.sideOut : null,
          ]}
          {...textScale.badge}
        >
          {side.score == null ? "–" : side.score}
        </Text>
      </View>
    </View>
  );
});

function tieSpeech(tie: Tie): string {
  const score =
    tie.home.score != null && tie.away.score != null ? `${tie.home.score} ${tie.away.score}` : "";
  return [tie.home.name, score, tie.away.name, tie.meta].filter(Boolean).join(", ");
}

/** Ağaçtaki hücre — iki taraf üst üste, canlıysa kırmızı kenar. */
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
      style={[styles.cell, tie.decided ? styles.cellDecided : null, tie.live ? styles.cellLive : null]}
    >
      <SideRow side={tie.home} dense />
      <View style={styles.cellDivider} />
      <SideRow side={tie.away} dense />
    </Touchable>
  );
});

/** Tur listesindeki ayrıntılı kart: iki taraf, büyük skor, dipte zaman/saha. */
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
      style={[styles.card, tie.live ? styles.cardLive : null]}
    >
      {tie.live ? <View style={styles.cardLiveEdge} /> : null}
      <View style={styles.cardSides}>
        <SideRow side={tie.home} dense={false} />
        <SideRow side={tie.away} dense={false} />
      </View>
      <View style={styles.cardMeta}>
        <Ionicons
          name={tie.live ? "radio" : tie.decided ? "checkmark-circle" : "calendar-outline"}
          size={12}
          color={tie.live ? colors.live : tie.decided ? colors.win : colors.textTertiary}
        />
        <Text style={[styles.cardMetaText, tie.live ? styles.cardMetaLive : null]} numberOfLines={1} {...textScale.dense}>
          {tie.awaitingWinner ? "Berabere bitti — galip bekleniyor" : tie.meta === "MS" ? "Maç sonucu" : tie.meta}
          {tie.venue ? ` · ${tie.venue}` : ""}
        </Text>
        {matchId ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
      </View>
    </Touchable>
  );
});

/* ═══════════════════════════════ AĞAÇ ═══════════════════════════════ */

const CELL_W = 168;
const CELL_H = 60;
const SLOT = CELL_H + space.md;
const COL_GAP = space.xxl;
const HEAD_H = 34;
const CHAMP_W = 128;
const CHAMP_H = 120;
const LINE = 2;

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
  const medal = TONE_GRADIENT[cup.tone];
  const rounds = cup.stages.length;
  const height = HEAD_H + ties[0].length * SLOT;
  const width = rounds * CELL_W + rounds * COL_GAP + CHAMP_W;

  /** r. turdaki i. eşleşmenin dikey merkezi. */
  const centerY = (round: number, index: number) => HEAD_H + (index + 0.5) * SLOT * 2 ** round;
  const colX = (round: number) => round * (CELL_W + COL_GAP);

  /* Bağlantılar: sonuçlanmış eşleşmeden çıkan çizgi marka renginde
     yanar — ağaçta "kim nereden geldi" yolu ışıkla izlenir. */
  const lines: React.ReactNode[] = [];
  ties.forEach((list, round) => {
    const x = colX(round) + CELL_W;
    const mid = x + COL_GAP / 2;
    list.forEach((tie, index) => {
      const y = centerY(round, index) - LINE / 2;
      const decided = tie.decided;
      lines.push(
        <View
          key={`h-${round}-${index}`}
          style={[styles.line, decided ? styles.lineOn : null, { left: x, top: y, width: COL_GAP / 2, height: LINE }]}
        />,
      );
      if (round < rounds - 1 && index % 2 === 0 && list[index + 1]) {
        const yNext = centerY(round, index + 1) - LINE / 2;
        const pairOn = decided && list[index + 1].decided;
        lines.push(
          <View
            key={`v-${round}-${index}`}
            style={[
              styles.line,
              decided ? styles.lineOn : null,
              { left: mid - LINE / 2, top: y, width: LINE, height: (yNext - y) / 2 + LINE },
            ]}
          />,
          <View
            key={`v2-${round}-${index}`}
            style={[
              styles.line,
              list[index + 1].decided ? styles.lineOn : null,
              { left: mid - LINE / 2, top: (y + yNext) / 2, width: LINE, height: (yNext - y) / 2 + LINE },
            ]}
          />,
          <View
            key={`n-${round}-${index}`}
            style={[
              styles.line,
              pairOn ? styles.lineOn : null,
              { left: mid, top: (y + yNext) / 2, width: COL_GAP / 2, height: LINE },
            ]}
          />,
        );
      }
    });
  });
  const finalY = centerY(rounds - 1, 0) - LINE / 2;
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
        {/* Tur başlıkları: ad + sonuçlanan/toplam hapı. */}
        {cup.stages.map((stage, round) => {
          const list = ties[round] ?? [];
          const done = list.filter((tie) => tie.decided).length;
          const complete = list.length > 0 && done === list.length;
          return (
            <View key={`head-${stage.group.id}`} style={[styles.roundHead, { left: colX(round), width: CELL_W }]}>
              <Text style={styles.roundHeadText} numberOfLines={1} {...textScale.badge}>
                {upperTR(stage.label)}
              </Text>
              <View style={[styles.roundPill, complete ? styles.roundPillDone : null]}>
                {complete ? (
                  <Ionicons name="checkmark" size={10} color={colors.win} />
                ) : (
                  <Text style={styles.roundPillText} {...textScale.badge}>
                    {`${done}/${list.length}`}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
        <View style={[styles.roundHead, { left: colX(rounds), width: CHAMP_W }]}>
          <Text style={styles.roundHeadText} numberOfLines={1} {...textScale.badge}>
            {upperTR("Şampiyon")}
          </Text>
        </View>

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

        {/* Şampiyon kutusu: belliyse madalya degradeli çerçeve + parıltı. */}
        <View
          style={[
            styles.champ,
            { left: colX(rounds), top: Math.max(HEAD_H, finalY - CHAMP_H / 2) },
            cup.champion ? [styles.champOn, glowStyle(medal[1], 2)] : null,
          ]}
        >
          {cup.champion ? (
            <LinearGradient
              colors={[withAlpha(medal[0], 0.28), withAlpha(medal[1], 0.08)]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[styles.champTrophy, cup.champion ? { backgroundColor: medal[1] } : null]}>
            <Ionicons name="trophy" size={18} color={cup.champion ? colors.medalInk : colors.textTertiary} />
          </View>
          {cup.champion ? (
            <>
              <TeamLogo name={cup.champion.team_name} logo={cup.champion.logo ?? null} size={26} />
              <Text style={styles.champName} numberOfLines={2} {...textScale.dense}>
                {cup.champion.team_name}
              </Text>
            </>
          ) : (
            <Text style={styles.champPending} numberOfLines={3} {...textScale.dense}>
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
  const complete = sorted.length > 0 && done === sorted.length;

  return (
    <Reveal index={order} limit={6} style={styles.stage}>
      {/* Tur başlığı: numara pulu, ad, eşleşme/rövanş bilgisi ve ilerleme çubuğu. */}
      <View style={styles.stageHead}>
        <View style={[styles.stageNum, complete ? styles.stageNumDone : null]}>
          {complete ? (
            <Ionicons name="checkmark" size={13} color={colors.textOnBrand} />
          ) : (
            <Text style={styles.stageNumText} {...textScale.badge}>
              {order}
            </Text>
          )}
        </View>
        <View style={styles.stageHeadText}>
          <Text style={styles.stageTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.stageMeta} numberOfLines={1} {...textScale.dense}>
            {sorted.length
              ? `${sorted.length} eşleşme${stage.group.double_round ? " · rövanşlı" : ""} · ${
                  complete ? "tamamlandı" : `${done}/${sorted.length} sonuçlandı`
                }`
              : "Eşleşme bekleniyor"}
          </Text>
        </View>
      </View>
      {sorted.length ? (
        <>
          <GradientBar value={sorted.length ? done / sorted.length : 0} height={4} style={styles.stageBar} />
          <View style={styles.stageCards}>
            {sorted.map((tie) => (
              <TieCard key={tie.key} tie={tie} onOpenMatch={onOpenMatch} />
            ))}
          </View>
        </>
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

  /* Kupanın ilerleyişi: sonuçlanan / toplam eşleşme ve o anki tur. */
  const progress = useMemo(() => {
    const all = ties.flat();
    const done = all.filter((tie) => tie.decided).length;
    const current = stages.find((_, index) => (ties[index] ?? []).some((tie) => !tie.decided));
    return { done, total: all.length, current: current?.label ?? null };
  }, [stages, ties]);

  return (
    <View style={styles.root}>
      {cup ? (
        <Reveal>
          <StageCard style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, glowStyle(TONE_GRADIENT[cup.tone][1], 1)]}>
                <LinearGradient
                  colors={TONE_GRADIENT[cup.tone]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="trophy" size={20} color={colors.medalInk} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroOver} numberOfLines={1} {...textScale.badge}>
                  {upperTR(cup.champion ? "Şampiyon belli" : progress.current ? `Sıradaki: ${progress.current}` : "Eleme ağacı")}
                </Text>
                <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
                  {cup.name}
                </Text>
              </View>
              {treeable ? (
                <SegmentedControl items={MODE_ITEMS} value={mode} onChange={setMode} size="sm" stretch={false} />
              ) : null}
            </View>

            {cup.champion ? (
              <View style={styles.heroChamp}>
                <TeamLogo name={cup.champion.team_name} logo={cup.champion.logo ?? null} size={24} />
                <Text style={styles.heroChampName} numberOfLines={1} {...textScale.dense}>
                  {cup.champion.team_name}
                </Text>
                <Ionicons name="trophy" size={14} color={TONE_GRADIENT[cup.tone][0]} />
              </View>
            ) : null}

            {/* Tur yolu: her tur bir durak; geçilen turlar dolu. */}
            <View style={styles.path}>
              {cup.stages.map((item, index) => {
                const list = ties[index] ?? [];
                const complete = list.length > 0 && list.every((tie) => tie.decided);
                const active = item.label === progress.current;
                return (
                  <View key={item.group.id} style={styles.pathStop}>
                    <View style={[styles.pathDot, complete ? styles.pathDotDone : active ? styles.pathDotActive : null]} />
                    <Text
                      style={[styles.pathLabel, complete || active ? styles.pathLabelOn : null]}
                      numberOfLines={1}
                      {...textScale.badge}
                    >
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.heroBarRow}>
              <GradientBar value={progress.total ? progress.done / progress.total : 0} height={6} track={colors.inkTile} style={styles.flex} />
              <Text style={styles.heroBarText} {...textScale.dense}>
                {progress.done}/{progress.total}
              </Text>
            </View>
          </StageCard>
        </Reveal>
      ) : null}

      {showTree && cup ? (
        <Reveal index={1} distance={0}>
          <Bracket cup={cup} ties={ties} onOpenMatch={onOpenMatch} />
          {third && thirdTies.length ? (
            <View style={styles.third}>
              <View style={styles.thirdHead}>
                <Ionicons name="medal" size={14} color={colors.medalBronze[1]} />
                <Text style={styles.thirdTitle} {...textScale.dense}>
                  {third.label}
                </Text>
              </View>
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

      {/* Lejant: işaretler örnekleriyle. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendWin} />
          <Text style={styles.legendText} {...textScale.dense}>
            Tur atladı
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.manualTag}>
            <Text style={styles.manualText} {...textScale.badge}>
              P
            </Text>
          </View>
          <Text style={styles.legendText} {...textScale.dense}>
            Penaltı / kura
          </Text>
        </View>
        <View style={styles.legendItem}>
          <Ionicons name="hand-left-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.legendText} {...textScale.dense}>
            Dokun: maç sayfası
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  flex: {
    flex: 1,
  },

  /* — Kupa kimliği (sahne) — */
  hero: {
    padding: space.lg,
    gap: space.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  heroOver: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  heroTitle: {
    ...type.h2,
    color: colors.onDark,
  },
  heroChamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  heroChampName: {
    ...type.h4,
    color: colors.onDark,
    flex: 1,
  },
  path: {
    flexDirection: "row",
    gap: space.xs,
  },
  pathStop: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  pathDot: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
  },
  pathDotDone: {
    backgroundColor: colors.brandOnDark,
  },
  pathDotActive: {
    backgroundColor: colors.accent,
  },
  pathLabel: {
    ...type.micro,
    color: colors.onDarkMuted,
  },
  pathLabelOn: {
    color: colors.onDark,
  },
  heroBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  heroBarText: {
    ...type.numSmStrong,
    color: colors.onDark,
  },

  /* — Taraf satırı — */
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  sideDense: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    height: (CELL_H - hairline) / 2,
    paddingHorizontal: space.sm,
  },
  sideWonBg: {
    backgroundColor: colors.brandDim,
  },
  winTick: {
    position: "absolute",
    left: 0,
    top: space.s,
    bottom: space.s,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.brand,
  },
  winTickDense: {
    position: "absolute",
    left: 0,
    top: space.xs,
    bottom: space.xs,
    width: 2,
    backgroundColor: colors.brand,
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
  scoreBox: {
    minWidth: 30,
    height: 26,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
    backgroundColor: colors.surface2,
  },
  scoreBoxDense: {
    minWidth: 22,
    height: 20,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxs,
    backgroundColor: colors.surface2,
  },
  scoreBoxWon: {
    backgroundColor: colors.brand,
  },
  sideScore: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  sideScoreDense: {
    ...type.numSmStrong,
    color: colors.textPrimary,
  },
  sideScoreWon: {
    color: colors.textOnBrand,
  },
  pendingMark: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  pendingMarkDense: {
    width: 18,
    height: 18,
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
    paddingBottom: space.sm,
  },
  roundHead: {
    position: "absolute",
    top: 0,
    height: HEAD_H - space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  roundHeadText: {
    ...type.overline,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  roundPill: {
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  roundPillDone: {
    backgroundColor: colors.winDim,
  },
  roundPillText: {
    ...type.nano,
    color: colors.textSecondary,
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
    ...elevate(1),
  },
  cellDecided: {
    borderColor: colors.brandBorder,
  },
  cellLive: {
    borderColor: colors.live,
    borderWidth: 1,
  },
  cellDivider: {
    height: hairline,
    backgroundColor: colors.separator,
  },
  line: {
    position: "absolute",
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  lineOn: {
    backgroundColor: colors.brand,
  },
  champ: {
    position: "absolute",
    width: CHAMP_W,
    height: CHAMP_H,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    padding: space.sm,
    overflow: "hidden",
  },
  champOn: {
    borderStyle: "solid",
    borderColor: colors.medalGold[1],
  },
  champTrophy: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
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
    gap: space.sm,
  },
  thirdHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.xxs,
  },
  thirdTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },

  /* — Tur listesi — */
  stage: {
    marginTop: space.xs,
    gap: space.sm,
  },
  stageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.xxs,
  },
  stageNum: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  stageNumDone: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stageNumText: {
    ...type.micro,
    color: colors.brandAccent,
  },
  stageHeadText: {
    flex: 1,
    minWidth: 0,
  },
  stageTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  stageMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  stageBar: {
    marginHorizontal: space.xxs,
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
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  cardLive: {
    borderColor: colors.live,
  },
  cardSides: {
    paddingVertical: space.xs,
    gap: space.xxs,
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
    gap: space.s,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  cardMetaText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  cardMetaLive: {
    color: colors.live,
    fontFamily: fonts.semibold,
  },

  /* — Lejant — */
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    paddingHorizontal: space.xxs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  legendWin: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  legendText: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
