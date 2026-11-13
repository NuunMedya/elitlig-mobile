/**
 * TAKIM SÖZLEŞMELERİ — kulübün oyuncularla yaptığı sözleşmeler.
 * `/takimim/sozlesmeler?durum=<ACTIVE|PENDING_ACTIVATION|…>`
 *
 * Web: TransferWorkspace → Contracts (scope="team"). GET /api/contracts?scope=team.
 * `scope=team` şart: double rolünde kapsamsız istek oyuncunun kendi
 * sözleşmelerini de karıştırır (bkz. lib/api/club/contracts.ts). Satır
 * sözleşme belgesini açar (/sozlesme/[id]).
 *
 * TASARIM (gece teması): üstte üç sayı (aktif · aktivasyon bekleyen · biten
 * ya da feshedilen), durum şeridi (yatay Chip). SÖZLEŞME KARTI: avatar + ad,
 * durum hapı, başlangıç → bitiş zaman çizgisi (geçen süre degrade çubukla),
 * kalan gün; bitişe 30 günden az kalan aktif sözleşme uyarı tonunda.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientBar,
  MetricGrid,
  MetricTile,
  Reveal,
  Skeleton,
  ScreenHeader,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { CONTRACT_STATUS_LABELS, getTeamContracts, type TeamContract } from "@/lib/api/club/contracts";
import { formatMoney } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const TONE: Record<string, Tone> = {
  ACTIVE: "win",
  PENDING_ACTIVATION: "warn",
  COMPLETED: "neutral",
  TERMINATED: "danger",
  CANCELLED: "neutral",
};
const STATUSES = Object.keys(CONTRACT_STATUS_LABELS);
const DAY = 86_400_000;

/** Sözleşme süresinin geçen kısmı (0–1) ve kalan gün; süresizse null. */
function timeline(contract: TeamContract): { ratio: number; daysLeft: number | null } {
  const start = contract.contract_start_date ? new Date(contract.contract_start_date).getTime() : NaN;
  const end = contract.contract_end_date ? new Date(contract.contract_end_date).getTime() : NaN;
  const now = Date.now();
  if (!Number.isFinite(end)) return { ratio: Number.isFinite(start) && start <= now ? 1 : 0, daysLeft: null };
  const daysLeft = Math.ceil((end - now) / DAY);
  if (!Number.isFinite(start) || end <= start) return { ratio: now >= end ? 1 : 0, daysLeft };
  return { ratio: Math.max(0, Math.min(1, (now - start) / (end - start))), daysLeft };
}

export default function TeamContractsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ durum?: string }>();
  const [status, setStatus] = useState<string | null>(STATUSES.includes(String(params.durum)) ? String(params.durum) : null);

  const query = useQuery({
    queryKey: ["club", "contracts", status ?? "all"],
    queryFn: () => getTeamContracts({ status }),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const count = (key: string) => items.filter((item) => item.status === key).length;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Sözleşmeler"
        subtitle={query.data ? `${query.data.totalItems} sözleşme` : "Takımının oyuncu sözleşmeleri"}
        back
        scrollY={scrollY}
      />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            {!status && items.length ? (
              <MetricGrid columns={3}>
                <MetricTile label="Aktif" value={String(count("ACTIVE"))} icon="document-text" tone="win" />
                <MetricTile label="Sırada" value={String(count("PENDING_ACTIVATION"))} icon="hourglass" tone="warn" />
                <MetricTile label="Biten" value={String(count("COMPLETED") + count("TERMINATED") + count("CANCELLED"))} icon="archive" />
              </MetricGrid>
            ) : null}
            <ChipGroup contentPadding={0}>
              <Chip size="sm" label="Tümü" selected={!status} onPress={() => setStatus(null)} />
              {STATUSES.map((key) => (
                <Chip key={key} size="sm" label={CONTRACT_STATUS_LABELS[key]} selected={status === key} onPress={() => setStatus(key)} />
              ))}
            </ChipGroup>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={styles.skeleton}>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} height={120} radius="xl" />
              ))}
            </View>
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="document-text-outline"
              title="Sözleşme bulunamadı"
              body="Kabul edilen transfer teklifleri sözleşmeye dönüşür ve burada listelenir."
              action={{ label: "Transfer yönetimi", onPress: () => router.push("/takimim/transfer" as Href) }}
            />
          )
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item, index }) => (
          <Reveal index={index} limit={6} distance={8}>
            <ContractCard contract={item} onPress={() => router.push(`/sozlesme/${item.public_id}` as Href)} />
          </Reveal>
        )}
      />
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const ContractCard = React.memo(function ContractCard({ contract, onPress }: { contract: TeamContract; onPress: () => void }) {
  const tone = TONE[contract.status] ?? "neutral";
  const active = contract.status === "ACTIVE";
  const { ratio, daysLeft } = timeline(contract);
  const ending = active && daysLeft != null && daysLeft <= 30;
  const fee = contract.transfer_fee != null && Number(contract.transfer_fee) > 0 ? formatMoney(contract.transfer_fee, contract.currency ?? "TRY") : null;
  const left =
    contract.status === "PENDING_ACTIVATION"
      ? "Başlangıç bekleniyor"
      : !active
        ? null
        : daysLeft == null
          ? "Süresiz"
          : daysLeft <= 0
            ? "Bugün bitiyor"
            : `${daysLeft} gün kaldı`;
  return (
    <Touchable
      onPress={onPress}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[contract.player?.player_name, CONTRACT_STATUS_LABELS[contract.status], left].filter(Boolean).join(", ")}
      style={[styles.card, !active && contract.status !== "PENDING_ACTIVATION" && styles.cardDone]}
    >
      <View style={styles.top}>
        <Avatar name={contract.player?.player_name ?? "?"} image={mediaUrl(contract.player?.player_img ?? null)} size={42} />
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {contract.player?.player_name ?? "Oyuncu"}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {fee ? `Bonservis ${fee}` : "Bedelsiz"}
          </Text>
        </View>
        <Badge label={CONTRACT_STATUS_LABELS[contract.status] ?? contract.status} tone={tone} size="sm" />
      </View>
      <View style={styles.timeline}>
        <GradientBar
          value={ratio}
          height={6}
          gradient={!active ? colors.tileTones.neutral : ending ? colors.tileTones.gold : undefined}
        />
        <View style={styles.dates}>
          <Text style={styles.date} {...textScale.badge}>
            {formatDateShort(contract.contract_start_date)}
          </Text>
          {left ? (
            <Text style={[styles.left, ending && styles.leftWarn]} numberOfLines={1} {...textScale.badge}>
              {left}
            </Text>
          ) : null}
          <Text style={styles.date} {...textScale.badge}>
            {contract.contract_end_date ? formatDateShort(contract.contract_end_date) : "Süresiz"}
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md, gap: space.md },
  skeleton: { gap: space.md },
  gap: { height: space.sm },
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  cardDone: { borderColor: colors.border, opacity: 0.8 },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  name: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  timeline: { gap: space.xs },
  dates: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  date: { ...type.numSm, color: colors.textTertiary },
  left: { ...type.labelXs, color: colors.textSecondary, flexShrink: 1, textAlign: "center" },
  leftWarn: { color: colors.warn },
});
