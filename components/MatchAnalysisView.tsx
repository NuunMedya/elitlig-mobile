/**
 * RAKİP ANALİZİ — maç öncesi karar-destek raporu ve skor simülasyonu.
 *
 * NEDEN VAR: web panelindeki Maç Merkezi'nin iki sekmesinden biri buydu
 * (`Kadro & Ayarlar` / `Rakip Analizi`) ve mobilde hiç yoktu. Başkanın maç
 * öncesi sorduğu "rakip ne yapıyor, biz neye dikkat edelim" sorusunun yanıtı
 * yalnız web'de kalıyordu.
 *
 * BÜTÜN SAYILAR SUNUCUDAN GELİR: rapor `services/matchAnalysisService.js`
 * içinde üretilir (puan durumu, son 8 yayınlanmış maç, ikili maç geçmişi,
 * oyuncu istatistikleri). İstemci HİÇBİR ŞEY hesaplamaz — iki taraf ayrı
 * hesaplasaydı web ile mobil farklı sayı gösterir ve "hangisi doğru" sorusu
 * doğardı. Buradaki tek türetme, karşılaştırma çubuğunun genişliğidir.
 *
 * SİMÜLASYON DETERMİNİSTİKTİR: sunucu iki takımın hücum/savunma
 * ortalamalarından beklenen gol üretip Poisson dağılımıyla skor olasılıklarını
 * hesaplar; rastgelelik yoktur. Aynı senaryoda aynı sonuç döner, bu yüzden
 * yanıt önbelleğe alınabilir ve "yeniden çalıştır" düğmesine gerek yoktur —
 * senaryo değişmedikçe sonuç da değişmez.
 *
 * SORUMLULUK REDDİ EKRANDA DURUR: sunucu her iki yanıtta da `disclaimer`
 * döndürüyor ve bu metin gizlenmez. Tahmin bir vaat değildir; ekranın bunu
 * söylemesi ürün kararıdır, süs değil.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FormChips,
  SectionHeader,
  SkeletonCard,
  TeamLogo,
} from "@/components/ui";
import {
  SIMULATION_SCENARIOS,
  getMatchAnalysis,
  simulateMatch,
  type AnalysisForm,
  type AnalysisKeyPlayer,
  type MatchSimulation,
  type SimulationScenario,
} from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Küçük yapı taşları
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * İki değeri tek çubukta karşılaştırır: sol taraf BİZ, sağ taraf RAKİP.
 *
 * Çubuk oranı toplama göredir; iki değer de 0 ise ortadan bölünür (aksi hâlde
 * sıfıra bölme çıkar ve çubuk kaybolur). "Düşük olan iyi" ölçütlerde
 * (`lowerIsBetter` — yenilen gol gibi) renkler yer değiştirir, çünkü çubuğun
 * uzunluğu her zaman "daha çok" demektir, "daha iyi" demez.
 */
const CompareBar = React.memo(function CompareBar({
  label,
  us,
  them,
  lowerIsBetter,
  suffix = "",
}: {
  label: string;
  us: number;
  them: number;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  const total = us + them;
  const usRatio = total > 0 ? (us / total) * 100 : 50;

  const usBetter = lowerIsBetter ? us < them : us > them;
  const themBetter = lowerIsBetter ? them < us : them > us;

  return (
    <View style={styles.compare}>
      <Text
        style={[styles.compareValue, usBetter ? styles.compareStrong : null]}
        {...textScale.dense}
      >
        {us}
        {suffix}
      </Text>

      <View style={styles.compareMiddle}>
        <Text style={styles.compareLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
        <View style={styles.compareTrack}>
          <View style={[styles.compareFillUs, { flex: Math.max(usRatio, 1) }]} />
          <View style={[styles.compareFillThem, { flex: Math.max(100 - usRatio, 1) }]} />
        </View>
      </View>

      <Text
        style={[
          styles.compareValue,
          styles.compareValueRight,
          themBetter ? styles.compareStrong : null,
        ]}
        {...textScale.dense}
      >
        {them}
        {suffix}
      </Text>
    </View>
  );
});

/** Madde listesi — güçlü yönler, zayıf yönler, dikkat edilecekler. */
const InsightList = React.memo(function InsightList({
  icon,
  tone,
  items,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <View style={styles.insightBox}>
      {items.map((item, index) => (
        <View key={index} style={styles.insightRow}>
          <Ionicons name={icon} size={13} color={tone} style={styles.insightIcon} />
          <Text style={styles.insightText} {...textScale.long}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
});

const KeyPlayerRow = React.memo(function KeyPlayerRow({ player }: { player: AnalysisKeyPlayer }) {
  const meta = [
    player.position,
    `${player.matches} maç`,
    `${player.goals} gol`,
    player.assists ? `${player.assists} asist` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.keyRow}>
      <Avatar
        name={player.name}
        image={player.image ? mediaUrl(player.image) : undefined}
        size={30}
      />
      <View style={styles.keyTexts}>
        <Text style={styles.keyName} numberOfLines={1} {...textScale.dense}>
          {player.name}
        </Text>
        <Text style={styles.keyMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      </View>
      {player.rating != null ? (
        <Text style={styles.keyRating} {...textScale.dense}>
          {player.rating.toFixed(2)}
        </Text>
      ) : null}
    </View>
  );
});

/** Kazanma/beraberlik/kaybetme olasılığı — tek satırlık yığılmış çubuk. */
const ProbabilityBar = React.memo(function ProbabilityBar({
  win,
  draw,
  loss,
}: {
  win: number;
  draw: number;
  loss: number;
}) {
  return (
    <View>
      <View style={styles.probTrack}>
        <View style={[styles.probWin, { flex: Math.max(win, 1) }]} />
        <View style={[styles.probDraw, { flex: Math.max(draw, 1) }]} />
        <View style={[styles.probLoss, { flex: Math.max(loss, 1) }]} />
      </View>
      <View style={styles.probLegend}>
        <Text style={[styles.probLabel, { color: colors.win }]} {...textScale.dense}>
          Kazanma %{win}
        </Text>
        <Text style={[styles.probLabel, { color: colors.draw }]} {...textScale.dense}>
          Berabere %{draw}
        </Text>
        <Text style={[styles.probLabel, { color: colors.loss }]} {...textScale.dense}>
          Kaybetme %{loss}
        </Text>
      </View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Ekran gövdesi
   ══════════════════════════════════════════════════════════════════════════ */

/** Form profilini "3G 1B 1M" biçiminde tek satıra indirir. */
const formSummary = (profile: AnalysisForm): string =>
  profile.played
    ? `${profile.played} maç · ${profile.wins}G ${profile.draws}B ${profile.losses}M`
    : "Yayınlanmış maç yok";

export interface MatchAnalysisViewProps {
  matchId: number;
  /** Kadro kaydedilmeden simülasyon anlamsız; düğme buna göre kilitlenir. */
  canSimulate?: boolean;
  /** Simülasyon kilitliyken kullanıcıyı kadro sekmesine yollar. */
  onNeedPlan?: () => void;
}

export function MatchAnalysisView({
  matchId,
  canSimulate = true,
  onNeedPlan,
}: MatchAnalysisViewProps) {
  const [scenario, setScenario] = useState<SimulationScenario>("balanced");
  const [simulation, setSimulation] = useState<MatchSimulation | null>(null);

  const query = useQuery({
    queryKey: ["team", "match-analysis", matchId],
    queryFn: () => getMatchAnalysis(matchId),
    enabled: Number.isInteger(matchId) && matchId > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const simulate = useMutation({
    mutationFn: (next: SimulationScenario) => simulateMatch(matchId, { scenario: next }),
    onSuccess: (result) => setSimulation(result),
  });

  const runScenario = useCallback(
    (next: SimulationScenario) => {
      setScenario(next);
      /* Senaryo değişince önceki sonuç GEÇERSİZDİR ve hemen silinir: eski
         yüzdeleri yeni senaryonun etiketiyle göstermek yanlış bilgi olurdu. */
      setSimulation(null);
      if (!canSimulate) return;
      simulate.mutate(next);
    },
    [canSimulate, simulate],
  );

  const data = query.data;

  const opponentForm = data?.form.opponent;
  const teamForm = data?.form.team;

  const h2h = data?.head_to_head;
  const h2hLine = useMemo(() => {
    if (!h2h || !h2h.played) return null;
    return `${h2h.played} karşılaşma · ${h2h.team_wins} galibiyet · ${h2h.draws} beraberlik · ${h2h.opponent_wins} mağlubiyet`;
  }, [h2h]);

  if (query.isLoading) {
    return (
      <View style={styles.loading}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (query.isError || !data) {
    return <ErrorState error={query.error} onRetry={query.refetch} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* ── Rakip başlığı ─────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <TeamLogo name={data.opponent.name} logo={data.opponent.logo} size={40} />
        <View style={styles.heroTexts}>
          <Text style={styles.heroEyebrow} {...textScale.badge}>
            {upperTR(data.is_home ? "Evinde oynuyorsun" : "Deplasmandasın")}
          </Text>
          <Text style={styles.heroName} numberOfLines={1} {...textScale.dense}>
            {data.opponent.name}
          </Text>
          {data.opponent.league || data.opponent.city ? (
            <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
              {[data.opponent.city, data.opponent.league].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.summary} {...textScale.long}>
        {data.summary}
      </Text>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <SectionHeader title="Form" />
      <View style={styles.card}>
        <View style={styles.formRow}>
          <Text style={styles.formSide} numberOfLines={1} {...textScale.dense}>
            {data.team.name ?? "Takımın"}
          </Text>
          {teamForm?.form.length ? (
            <FormChips form={teamForm.form} size="xs" />
          ) : (
            <Text style={styles.formEmpty} {...textScale.dense}>—</Text>
          )}
        </View>
        <Text style={styles.formMeta} {...textScale.dense}>
          {teamForm ? formSummary(teamForm) : "—"}
        </Text>

        <View style={styles.divider} />

        <View style={styles.formRow}>
          <Text style={styles.formSide} numberOfLines={1} {...textScale.dense}>
            {data.opponent.name}
          </Text>
          {opponentForm?.form.length ? (
            <FormChips form={opponentForm.form} size="xs" />
          ) : (
            <Text style={styles.formEmpty} {...textScale.dense}>—</Text>
          )}
        </View>
        <Text style={styles.formMeta} {...textScale.dense}>
          {opponentForm ? formSummary(opponentForm) : "—"}
        </Text>
      </View>

      {/* ── Karşılaştırma ─────────────────────────────────────────────── */}
      <SectionHeader title="Karşılaştırma" meta="sen · rakip" />
      <View style={styles.card}>
        {teamForm && opponentForm ? (
          <>
            <CompareBar
              label="Attığı gol / maç"
              us={teamForm.avg_scored}
              them={opponentForm.avg_scored}
            />
            <CompareBar
              label="Yediği gol / maç"
              us={teamForm.avg_conceded}
              them={opponentForm.avg_conceded}
              lowerIsBetter
            />
            <CompareBar
              label="Puan / maç"
              us={teamForm.points_per_match}
              them={opponentForm.points_per_match}
            />
            <CompareBar
              label="Gol yemediği maç"
              us={teamForm.clean_sheets}
              them={opponentForm.clean_sheets}
            />
          </>
        ) : null}

        {data.standings.team && data.standings.opponent ? (
          <>
            <View style={styles.divider} />
            <CompareBar
              label="Puan"
              us={data.standings.team.points}
              them={data.standings.opponent.points}
            />
            <View style={styles.positionRow}>
              <Text style={styles.positionText} {...textScale.dense}>
                {data.standings.team.position
                  ? `${data.standings.team.position}. sıra`
                  : "Sırasız"}
              </Text>
              <Text style={styles.positionLabel} {...textScale.badge}>
                {upperTR("Lig sırası")}
              </Text>
              <Text style={[styles.positionText, styles.positionRight]} {...textScale.dense}>
                {data.standings.opponent.position
                  ? `${data.standings.opponent.position}. sıra`
                  : "Sırasız"}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* ── İkili geçmiş ──────────────────────────────────────────────── */}
      {h2hLine ? (
        <>
          <SectionHeader title="İkili geçmiş" />
          <View style={styles.card}>
            <Text style={styles.h2hLine} {...textScale.dense}>
              {h2hLine}
            </Text>
            {h2h?.matches.slice(0, 5).map((item) => (
              <View key={item.match_id} style={styles.h2hRow}>
                <Text style={styles.h2hDate} {...textScale.dense}>
                  {String(item.date ?? "").slice(0, 10)}
                </Text>
                <Text style={styles.h2hOpponent} numberOfLines={1} {...textScale.dense}>
                  {item.is_home ? "Ev" : "Dep"} · {item.opponent}
                </Text>
                <Text
                  style={[
                    styles.h2hScore,
                    item.result === "W"
                      ? { color: colors.win }
                      : item.result === "L"
                        ? { color: colors.loss }
                        : null,
                  ]}
                  {...textScale.dense}
                >
                  {item.score}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* ── Öne çıkan rakip oyuncular ─────────────────────────────────── */}
      {data.key_players.length ? (
        <>
          <SectionHeader title="Rakibin öne çıkanları" meta={`${data.key_players.length} oyuncu`} />
          <View style={styles.card}>
            {data.key_players.map((player) => (
              <KeyPlayerRow key={player.id} player={player} />
            ))}
            {data.discipline.opponent.yellow_cards || data.discipline.opponent.red_cards ? (
              <Text style={styles.disciplineLine} {...textScale.dense}>
                Disiplin: {data.discipline.opponent.yellow_cards} sarı ·{" "}
                {data.discipline.opponent.red_cards} kırmızı
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* ── Çıkarımlar ────────────────────────────────────────────────── */}
      {data.strengths.length || data.weaknesses.length || data.watch_outs.length ? (
        <>
          <SectionHeader title="Çıkarımlar" />
          <View style={styles.card}>
            <InsightList icon="trending-up" tone={colors.win} items={data.strengths} />
            <InsightList icon="trending-down" tone={colors.loss} items={data.weaknesses} />
            <InsightList icon="alert-circle" tone={colors.warn} items={data.watch_outs} />
          </View>
        </>
      ) : null}

      {/* ── Simülasyon ────────────────────────────────────────────────── */}
      <SectionHeader title="Skor tahmini" />
      <View style={styles.card}>
        <ChipGroup contentPadding={0}>
          {SIMULATION_SCENARIOS.map((item) => (
            <ScenarioChip
              key={item.key}
              value={item.key}
              label={item.label}
              selected={item.key === scenario}
              onPress={runScenario}
            />
          ))}
        </ChipGroup>

        <Text style={styles.scenarioHint} {...textScale.long}>
          {SIMULATION_SCENARIOS.find((item) => item.key === scenario)?.description}
        </Text>

        {!canSimulate ? (
          <EmptyState
            icon="clipboard-outline"
            title="Önce kadronu kaydet"
            body="Skor tahmini maç kadrona göre hesaplanır."
            action={onNeedPlan ? { label: "Kadroya git", onPress: onNeedPlan } : undefined}
            variant="inline"
          />
        ) : simulation ? (
          <>
            <ProbabilityBar
              win={simulation.probabilities.win}
              draw={simulation.probabilities.draw}
              loss={simulation.probabilities.loss}
            />

            <View style={styles.predictRow}>
              <View style={styles.predictBox}>
                <Text style={styles.predictLabel} {...textScale.badge}>
                  {upperTR("Tahmini skor")}
                </Text>
                <Text style={styles.predictValue} {...textScale.dense}>
                  {simulation.predicted_score}
                </Text>
              </View>
              <View style={styles.predictBox}>
                <Text style={styles.predictLabel} {...textScale.badge}>
                  {upperTR("Beklenen gol")}
                </Text>
                <Text style={styles.predictValue} {...textScale.dense}>
                  {simulation.expected_goals.team} - {simulation.expected_goals.opponent}
                </Text>
              </View>
            </View>

            {simulation.scorelines.length ? (
              <View style={styles.scorelines}>
                {simulation.scorelines.map((line) => (
                  <View key={line.score} style={styles.scoreline}>
                    <Text style={styles.scorelineScore} {...textScale.dense}>
                      {line.score}
                    </Text>
                    <Text style={styles.scorelineProb} {...textScale.dense}>
                      %{line.probability}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.markets}>
              <Text style={styles.marketItem} {...textScale.dense}>
                Karşılıklı gol %{simulation.markets.both_teams_score}
              </Text>
              <Text style={styles.marketItem} {...textScale.dense}>
                2.5 üstü %{simulation.markets.over_2_5}
              </Text>
              <Text style={styles.marketItem} {...textScale.dense}>
                Gol yememe %{simulation.markets.clean_sheet}
              </Text>
            </View>

            <Text style={styles.disclaimer} {...textScale.long}>
              {simulation.disclaimer}
            </Text>
          </>
        ) : (
          <Button
            label="Tahmini hesapla"
            icon="analytics-outline"
            variant="secondary"
            onPress={() => runScenario(scenario)}
            loading={simulate.isPending}
            fullWidth
          />
        )}

        {simulate.isError ? (
          <ErrorState error={simulate.error} variant="banner" />
        ) : null}
      </View>

      <Text style={styles.disclaimer} {...textScale.long}>
        {data.basis} {data.disclaimer}
      </Text>
    </ScrollView>
  );
}

/** Senaryo çipi — memo'lu olsun diye değeri geri verir. */
const ScenarioChip = React.memo(function ScenarioChip({
  value,
  label,
  selected,
  onPress,
}: {
  value: SimulationScenario;
  label: string;
  selected: boolean;
  onPress: (value: SimulationScenario) => void;
}) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return <Chip label={label} selected={selected} onPress={handlePress} size="sm" />;
});

const styles = StyleSheet.create({
  loading: {
    padding: layout.screenPadding,
    gap: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.huge,
    gap: space.sm,
  },

  /* — Rakip başlığı — */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.md,
  },
  heroTexts: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    ...type.overline,
    color: colors.accentText,
  },
  heroName: {
    ...type.h1,
    color: colors.textPrimary,
  },
  heroMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  summary: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  card: {
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  divider: {
    height: hairline,
    backgroundColor: colors.separator,
    marginVertical: space.xs,
  },

  /* — Form — */
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  formSide: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  formEmpty: {
    ...type.caption,
    color: colors.textTertiary,
  },
  formMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Karşılaştırma — */
  compare: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  compareValue: {
    ...type.tableNum,
    color: colors.textSecondary,
    width: 38,
  },
  compareValueRight: {
    textAlign: "right",
  },
  compareStrong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  compareMiddle: {
    flex: 1,
    gap: 3,
  },
  compareLabel: {
    ...type.overline,
    color: colors.textTertiary,
    textAlign: "center",
  },
  compareTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  compareFillUs: {
    backgroundColor: colors.brand,
  },
  compareFillThem: {
    backgroundColor: colors.textDisabled,
  },
  positionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  positionText: {
    ...type.bodySm,
    color: colors.textPrimary,
    width: 70,
  },
  positionRight: {
    textAlign: "right",
  },
  positionLabel: {
    ...type.overline,
    color: colors.textTertiary,
    flex: 1,
    textAlign: "center",
  },

  /* — İkili geçmiş — */
  h2hLine: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  h2hRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  h2hDate: {
    ...type.caption,
    color: colors.textTertiary,
    width: 72,
  },
  h2hOpponent: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  h2hScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },

  /* — Öne çıkanlar — */
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
  },
  keyTexts: {
    flex: 1,
    gap: 1,
  },
  keyName: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  keyMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  keyRating: {
    ...type.tableNumStrong,
    color: colors.accentText,
  },
  disciplineLine: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Çıkarımlar — */
  insightBox: {
    gap: space.s,
  },
  insightRow: {
    flexDirection: "row",
    gap: space.s,
  },
  insightIcon: {
    marginTop: 2,
  },
  insightText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  /* — Simülasyon — */
  scenarioHint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  probTrack: {
    flexDirection: "row",
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  probWin: { backgroundColor: colors.win },
  probDraw: { backgroundColor: colors.draw },
  probLoss: { backgroundColor: colors.loss },
  probLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  probLabel: {
    ...type.caption,
  },
  predictRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  predictBox: {
    flex: 1,
    gap: 2,
    padding: space.m,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
  },
  predictLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  predictValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  scorelines: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  scoreline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.m,
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
  },
  scorelineScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  scorelineProb: {
    ...type.caption,
    color: colors.textTertiary,
  },
  markets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.m,
  },
  marketItem: {
    ...type.caption,
    color: colors.textSecondary,
  },
  disclaimer: {
    ...type.caption,
    color: colors.textDisabled,
  },
});
