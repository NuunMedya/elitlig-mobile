/**
 * DİSİPLİN — herkese açık disiplin sayfası (web'deki Disiplin sayfasının karşılığı).
 * `/cezalar` (Menü ▸ Disiplin). Oturum gerektirmez.
 *
 * İki sekme:
 *   SÜREÇLER    Kurulun yürüttüğü disiplin süreçleri, tek listede üç tür:
 *                 · oyuncu sevki  (kurula sevk → kurul kararı → CAS değerlendirmesi → CAS kararı)
 *                 · maç incelemesi   (inceleme başlatıldı → karar)
 *                 · konu incelemesi  (ör. "11.11.2026 tarihli Instagram paylaşımları")
 *               Her kart tek cümleyle ne olduğunu söyler; dokununca karar ve
 *               aşamalar alt sayfada açılır.
 *   BAŞVURULAR  Takımların başvuruları: yalnız neden, taraflar ve aşama
 *               (components/discipline/PublicAppeals.tsx).
 *
 * VERİ: GET /api/penalties/public, /public/inquiries, /public/appeals (il kapsamı);
 * lig / sezon seçimi istemcide uygulanır (eşleşen ya da o seviyesi boş kayıtlar).
 * Savunma ve itiraz metinleri bu uçlardan hiç gelmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PublicAppeals } from "@/components/discipline/PublicAppeals";
import { LeaguePicker } from "@/components/LeaguePicker";
import {
  Badge,
  BottomSheet,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconTile,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  Touchable,
  useRefresh,
  type IconTileTone,
  type Tone,
} from "@/components/ui";
import { getPublicInquiries, getPublicPenalties, type Inquiry, type PublicPenalty } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type TabKey = "surecler" | "basvurular";
type ProcessType = "player" | "match" | "topic";
type TypeFilter = "all" | ProcessType;

const TYPE_META: Record<ProcessType, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  player: { label: "Oyuncu sevki", icon: "person", tone: "violet" },
  match: { label: "Maç incelemesi", icon: "football", tone: "cyan" },
  topic: { label: "Konu incelemesi", icon: "document-text", tone: "gold" },
};

const PENALTY_STEPS = ["Kurula sevk", "Kurul kararı", "CAS değerlendirmesi", "CAS kararı"];
const PENALTY_ORDER = ["sevk", "kurul_karari", "cas_basvuru", "cas_karari"];
const INQUIRY_STEPS = ["İnceleme başlatıldı", "Karar"];

/** Oyuncu dosyası ve incelemeler listede ortak biçime gelir. */
interface Process {
  key: string;
  type: ProcessType;
  open: boolean;
  date: string | null;
  headline: string;
  meta: string;
  steps: string[];
  step: number;
  outcome: { label: string; note?: string | null; tone: Tone };
  decision: string | null;
  description: string | null;
}

/** Lig / sezon seçimine uyan ya da o seviyesi boş kalan kayıtlar. */
const fits = (value: number | null | undefined, selected: number | null | undefined) => value == null || selected == null || Number(value) === Number(selected);

function penaltyProcess(penalty: PublicPenalty): Process {
  const state = penalty.ban_state ?? {};
  const amount = state.duration_type === "suresiz" ? "Süresiz ihraç" : state.duration_type === "mac" ? `${state.matches_required ?? penalty.match_count ?? "—"} maç men` : null;
  const outcome: Process["outcome"] =
    state.active === true
      ? { label: amount ?? "Cezalı", note: state.duration_type === "mac" && state.matches_remaining ? `kalan ${state.matches_remaining} maç` : "ceza sürüyor", tone: "danger" }
      : state.active === false
        ? { label: amount ?? "Ceza", note: "ceza sona erdi", tone: "win" }
        : { label: "Karar bekleniyor", tone: "warn" };
  return {
    key: `p-${penalty.public_id}`,
    type: "player",
    open: penalty.status === "sevk" || penalty.status === "cas_basvuru",
    date: penalty.createdAt ?? penalty.match_date,
    headline: `${penalty.player_name ?? "Oyuncu"} disiplin kuruluna sevk edildi`,
    meta: [penalty.team_name, penalty.match_label].filter(Boolean).join(" · "),
    steps: PENALTY_STEPS,
    step: Math.max(0, PENALTY_ORDER.indexOf(penalty.status)),
    outcome,
    decision: penalty.disiplin_karari ?? state.summary ?? null,
    description: null,
  };
}

function inquiryProcess(inquiry: Inquiry): Process {
  return {
    key: `i-${inquiry.public_id}`,
    type: inquiry.kind,
    open: !inquiry.is_decided,
    date: inquiry.decided_at ?? inquiry.createdAt,
    headline: inquiry.headline,
    meta: inquiry.kind === "match" && inquiry.match_date ? `Maç tarihi ${formatDateShort(inquiry.match_date)}` : "",
    steps: INQUIRY_STEPS,
    step: inquiry.is_decided ? 1 : 0,
    outcome: inquiry.is_decided ? { label: "Karar açıklandı", tone: "win" } : { label: "İnceleme sürüyor", tone: "warn" },
    decision: inquiry.decision_text,
    description: inquiry.description,
  };
}

export default function DisciplineScreen() {
  const scope = useScope();
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("surecler");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [detail, setDetail] = useState<Process | null>(null);

  const cityId = scope.cityId ?? null;
  const penalties = useQuery({
    queryKey: ["public", "penalties", cityId],
    queryFn: () => getPublicPenalties(cityId!),
    enabled: cityId != null,
    staleTime: 2 * 60_000,
  });
  const inquiries = useQuery({
    queryKey: ["public", "inquiries", cityId],
    queryFn: () => getPublicInquiries(cityId!),
    enabled: cityId != null,
    staleTime: 2 * 60_000,
    retry: false,
  });
  const refresh = useRefresh(
    async () => {
      await Promise.all([penalties.refetch(), inquiries.refetch()]);
    },
    { refreshing: penalties.isRefetching || inquiries.isRefetching },
  );

  const all = useMemo(() => {
    const inScope = <T extends { league_id: number | null; season_id: number | null }>(row: T) => fits(row.league_id, scope.leagueId) && fits(row.season_id, scope.seasonId);
    return [...(penalties.data ?? []).filter(inScope).map(penaltyProcess), ...(inquiries.data ?? []).filter(inScope).map(inquiryProcess)].sort(
      // Süren süreçler önce, ardından en yeni.
      (a, b) => Number(b.open) - Number(a.open) || new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
    );
  }, [penalties.data, inquiries.data, scope.leagueId, scope.seasonId]);

  const count = (key: TypeFilter) => (key === "all" ? all.length : all.filter((item) => item.type === key).length);
  const visible = all.filter((item) => (typeFilter === "all" || item.type === typeFilter) && (!onlyOpen || item.open));
  const loading = penalties.isLoading || inquiries.isLoading;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Disiplin"
        subtitle="Merkez Disiplin Kurulu"
        back
        actions={
          auth.user
            ? [{ icon: "folder-open-outline", onPress: () => router.push("/cezalarim" as Href), accessibilityLabel: "Kendi disiplin dosyalarım" }]
            : undefined
        }
        bottom={
          <View style={styles.headerBottom}>
            <LeaguePicker />
            <SegmentedControl
              items={[
                { key: "surecler", label: "Süreçler" },
                { key: "basvurular", label: "Başvurular" },
              ]}
              value={tab}
              onChange={(next) => setTab(next as TabKey)}
            />
          </View>
        }
      />

      {tab === "basvurular" ? (
        <PublicAppeals cityId={scope.cityId} leagueId={scope.leagueId} seasonId={scope.seasonId} />
      ) : (
        <FlatList
          data={loading ? [] : visible}
          keyExtractor={(item) => item.key}
          refreshControl={refresh.control}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.filters}>
              <ChipGroup scrollable contentPadding={0}>
                <Chip label="Tümü" count={count("all")} size="sm" selected={typeFilter === "all"} onPress={() => setTypeFilter("all")} />
                <Chip label="Oyuncu" icon="person" count={count("player")} size="sm" selected={typeFilter === "player"} onPress={() => setTypeFilter("player")} />
                <Chip label="Maç" icon="football" count={count("match")} size="sm" selected={typeFilter === "match"} onPress={() => setTypeFilter("match")} />
                <Chip label="Konu" icon="document-text" count={count("topic")} size="sm" selected={typeFilter === "topic"} onPress={() => setTypeFilter("topic")} />
                <Chip label="Yalnız süren" size="sm" tone="warn" selected={onlyOpen} onPress={() => setOnlyOpen((value) => !value)} />
              </ChipGroup>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.skeleton}>
                <Skeleton height={104} radius="xl" />
                <Skeleton height={104} radius="xl" />
                <Skeleton height={104} radius="xl" />
              </View>
            ) : penalties.isError && all.length === 0 ? (
              <ErrorState variant="inline" error={penalties.error} onRetry={penalties.refetch} />
            ) : (
              <EmptyState
                variant="inline"
                icon="shield-checkmark-outline"
                title={all.length ? "Bu süzgeçte kayıt yok" : "Disiplin süreci yok"}
                body={all.length ? undefined : `${scope.cityLabel || "Bu kapsam"} için yayımlanmış bir disiplin süreci bulunmuyor.`}
              />
            )
          }
          ItemSeparatorComponent={Gap}
          renderItem={({ item }) => <ProcessCard item={item} onPress={() => setDetail(item)} />}
        />
      )}

      <BottomSheet visible={detail != null} onClose={() => setDetail(null)} title={detail ? TYPE_META[detail.type].label : "Süreç"} snap="content">
        {detail ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} {...textScale.dense}>
              {detail.headline}
            </Text>
            {detail.meta ? (
              <Text style={styles.meta} {...textScale.dense}>
                {detail.meta}
              </Text>
            ) : null}
            <Badge label={[detail.outcome.label, detail.outcome.note].filter(Boolean).join(" · ")} tone={detail.outcome.tone} size="sm" />
            <StepList steps={detail.steps} current={detail.step} />
            {detail.description ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel} {...textScale.badge}>
                  KAPSAM
                </Text>
                <Text style={styles.blockText} {...textScale.long}>
                  {detail.description}
                </Text>
              </View>
            ) : null}
            <View style={styles.block}>
              <Text style={styles.blockLabel} {...textScale.badge}>
                KARAR
              </Text>
              <Text style={styles.blockText} {...textScale.long}>
                {detail.decision ?? (detail.open ? "Süreç devam ediyor. Karar açıklandığında burada yayımlanır." : "Karar metni yayımlanmadı.")}
              </Text>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

/** Aşamalar: tamamlanan, güncel ve bekleyen adımlar dikey listede. */
function StepList({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.steps} accessibilityLabel={`Aşama: ${steps[current] ?? ""}`}>
      {steps.map((label, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <View key={label} style={styles.stepRow}>
            <Ionicons name={done ? "checkmark-circle" : now ? "radio-button-on" : "ellipse-outline"} size={16} color={now ? colors.brand : done ? colors.textSecondary : colors.textTertiary} />
            <Text style={[styles.stepText, now ? styles.stepNow : done ? styles.stepDone : null]} {...textScale.dense}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const ProcessCard = React.memo(function ProcessCard({ item, onPress }: { item: Process; onPress: () => void }) {
  const meta = TYPE_META[item.type];
  return (
    <Touchable
      onPress={onPress}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[item.headline, item.outcome.label, `aşama ${item.steps[item.step]}`].join(", ")}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <IconTile icon={meta.icon} tone={meta.tone} size={40} glow={false} />
        <View style={styles.texts}>
          <Text style={styles.kind} {...textScale.badge}>
            {meta.label.toLocaleUpperCase("tr-TR")} · {formatDateShort(item.date)}
          </Text>
          <Text style={styles.title} numberOfLines={3} {...textScale.dense}>
            {item.headline}
          </Text>
          {item.meta ? (
            <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
              {item.meta}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.cardFoot}>
        <Badge label={[item.outcome.label, item.outcome.note].filter(Boolean).join(" · ")} tone={item.outcome.tone} size="sm" />
        <Text style={styles.stage} numberOfLines={1} {...textScale.dense}>
          {item.step + 1}/{item.steps.length} · {item.steps[item.step]}
        </Text>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { gap: space.sm },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  filters: { paddingVertical: space.md },
  skeleton: { gap: space.sm },
  gap: { height: space.sm },
  card: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  kind: { ...type.nano, color: colors.textTertiary },
  title: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" },
  stage: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  sheet: { gap: space.md, alignItems: "flex-start" },
  sheetTitle: { ...type.h3, color: colors.textPrimary },
  steps: { gap: space.xs, alignSelf: "stretch" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepText: { ...type.label, color: colors.textTertiary },
  stepDone: { color: colors.textSecondary },
  stepNow: { color: colors.textPrimary },
  block: { alignSelf: "stretch", gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  blockLabel: { ...type.nano, color: colors.textTertiary },
  blockText: { ...type.label, color: colors.textPrimary },
});
