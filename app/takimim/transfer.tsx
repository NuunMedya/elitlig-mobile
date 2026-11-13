/**
 * TRANSFER YÖNETİMİ — başkanın transfer masası.
 * `/takimim/transfer?durum=<SENT|REVISION_REQUESTED|ACCEPTED|…>`
 *
 * Web panelindeki "Transfer Yönetimi" menüsünün (TransferWorkspace OfferList,
 * role=takim_baskani) karşılığı; ayrıca web'de ayrı ekranlara dağılmış iki işi
 * aynı yerde toplar:
 *   1. YENİ TEKLİF — belirgin birincil düğme: oyuncu ara → teklif ver.
 *   2. İZİN BEKLEYENLER — başka bir takım SENİN oyuncuna teklif verdiğinde
 *      serbest kalma izni istenir (TRANSFER_RELEASE_REQUESTED bildirimi).
 *      Sunucuda bu talepleri listeleyen bir uç YOK; talepler bildirim
 *      kutusundan (`/api/panel-notifications`) türetilir, karar
 *      `/transfer-izni/[id]` ekranında verilir.
 *   3. SATILIK / KİRALIK — açık ilanların özeti (yönetimi Borsa ▸ İlanlarım).
 *   4. TEKLİFLER — GET /api/transfer-offers/outbox?status=…: web'deki durum
 *      sekmeleriyle aynı süzgeç; satır teklif belgesini açar (geri çek /
 *      revize et belgede, sunucunun `actions` alanına göre).
 *
 * TASARIM (gece teması): koyu mor masa sahnesi (dönen sayaçlar: cevap
 * bekleyen · revizyon · kabul · toplam, birincil "Yeni teklif ver"); izin ve
 * ilan blokları IconTile/avatar satırlı tek kartlar; teklifler OfferCard
 * (durum hapı, süreç adımları, süre/izin notları).
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import { InkStage, ListCard, StagePill, StageStats, ToneRow } from "@/components/team/ClubKit";
import { OfferCard } from "@/components/team/OfferCard";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { isReleaseRequest } from "@/lib/api/club/notifications";
import { OFFER_STATUS_LABELS, OUTBOX_STATUSES, getOutboxPage, type OutboxStatus } from "@/lib/api/club/offers";
import { getPanelNotifications } from "@/lib/api/panel";
import { getMyListings, formatMoney } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

export default function TransferDeskScreen() {
  const auth = useAuth();
  const router = useRouter();
  const access = useTeamAccess();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ durum?: string }>();
  const initial = OUTBOX_STATUSES.find((s) => s === params.durum) ?? null;
  const [status, setStatus] = useState<OutboxStatus | null>(initial);

  const enabled = Boolean(auth.user) && access.canManage;

  const offers = useQuery({
    queryKey: ["club", "outbox", status ?? "all"],
    queryFn: () => getOutboxPage({ status }),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  /* Sayaçlar her zaman TÜM kutudan (süzgeçten bağımsız). */
  const all = useQuery({
    queryKey: ["club", "outbox", "all"],
    queryFn: () => getOutboxPage({}),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  const notifications = useQuery({
    queryKey: ["club", "notifications"],
    queryFn: () => getPanelNotifications(1),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  const listings = useQuery({
    queryKey: ["transfer-market", "mine"],
    queryFn: getMyListings,
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  const refresh = useRefresh(
    () => Promise.all([offers.refetch(), all.refetch(), notifications.refetch(), listings.refetch()]),
    { refreshing: offers.isRefetching },
  );

  const counts = useMemo(() => {
    const items = all.data?.items ?? [];
    const by = (s: string) => items.filter((item) => item.status === s).length;
    return { sent: by("SENT"), revision: by("REVISION_REQUESTED"), accepted: by("ACCEPTED"), total: all.data?.totalItems ?? items.length };
  }, [all.data]);

  /* Aynı teklif için birden çok bildirim olabilir: en yenisi kalır. */
  const releases = useMemo(() => {
    const seen = new Set<string>();
    return (notifications.data?.items ?? []).filter((item) => {
      if (!isReleaseRequest(item) || !item.entity_public_id || seen.has(item.entity_public_id)) return false;
      seen.add(item.entity_public_id);
      return true;
    });
  }, [notifications.data]);
  const openListings = (listings.data?.items ?? []).filter((item) => item.status === "open");

  if (!auth.user) return <Redirect href="/giris" />;
  if (!access.loading && !access.canManage) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Transfer yönetimi" back />
        <EmptyState
          icon="shield-outline"
          title="Takım yönetimi gerekiyor"
          body="Transfer teklifi yalnız takım başkanı gönderebilir. Takımını bağlayıp yönetim yetkisi iste."
          action={{ label: "Takımını bağla", onPress: () => router.push("/oyuncum/bagla?tur=takim" as Href) }}
        />
      </SafeAreaView>
    );
  }

  const items = offers.data?.items ?? [];

  const inProgress = counts.sent + counts.revision;
  const header = (
    <View style={styles.header}>
      {/* Birincil eylem: "teklif gönderemiyorum" şikâyetinin yanıtı. */}
      <Reveal index={0} scaleFrom={0.97}>
        <InkStage>
          <View style={styles.pills}>
            <StagePill label="Transfer masası" icon="swap-horizontal" />
            {counts.revision ? <StagePill label={`${counts.revision} revizyon`} icon="git-compare-outline" tone="warn" /> : null}
          </View>
          <View>
            <Text style={styles.heroTitle} {...textScale.dense}>
              {inProgress > 0 ? `${inProgress} teklif süreçte` : "Kadronu güçlendir"}
            </Text>
            <Text style={styles.heroBody} {...textScale.long}>
              Oyuncuyu ara, şartları belirle, teklifi gönder. Oyuncu revizyon isterse yeni sürümü buradan hazırlarsın.
            </Text>
          </View>
          <StageStats
            items={[
              { key: "sent", label: "Bekleyen", value: counts.sent, onPress: () => setStatus("SENT") },
              { key: "rev", label: "Revizyon", value: counts.revision, color: counts.revision ? colors.yellowCard : undefined, onPress: () => setStatus("REVISION_REQUESTED") },
              { key: "ok", label: "Kabul", value: counts.accepted, color: counts.accepted ? colors.win : undefined, onPress: () => setStatus("ACCEPTED") },
              { key: "all", label: "Toplam", value: counts.total, onPress: () => setStatus(null) },
            ]}
          />
          <View style={styles.heroActions}>
            <Button
              label="Yeni teklif ver"
              icon="add-circle-outline"
              onPress={() => router.push("/takimim/oyuncu-ara" as Href)}
              style={styles.flex}
              onDark
              haptic="medium"
            />
            <Button
              label="Borsa"
              icon="storefront-outline"
              variant="secondary"
              onPress={() => router.push("/takimim/borsa")}
              onDark
            />
          </View>
        </InkStage>
      </Reveal>

      {releases.length ? (
        <View style={styles.block}>
          <SectionHeader title="İzin bekleyen transferler" meta={`${releases.length}`} inset="flush" />
          <ListCard>
            {releases.slice(0, 5).map((item, index) => (
              <ToneRow
                key={item.id}
                icon="hand-left"
                tone={item.is_read ? "neutral" : "gold"}
                title={item.title}
                meta={item.description ?? formatDateShort(item.createdAt)}
                stripe={item.is_read ? undefined : colors.warn}
                onPress={() => router.push(`/transfer-izni/${item.entity_public_id}` as Href)}
                last={index === Math.min(releases.length, 5) - 1}
              />
            ))}
          </ListCard>
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionHeader
          title="Satılık / kiralık ilanlarım"
          meta={openListings.length ? `${openListings.length} açık` : undefined}
          action={{ label: "Yönet", onPress: () => router.push("/takimim/borsa?bolum=ilanlarim" as Href) }}
          inset="flush"
        />
        <ListCard>
          {openListings.length ? (
            openListings.slice(0, 3).map((item, index) => (
              <ToneRow
                key={item.public_id}
                leading={<Avatar name={item.player.name ?? "?"} image={mediaUrl(item.player.image ?? null)} size={38} />}
                title={item.player.name ?? "Oyuncu"}
                meta={[item.player.position, item.asking_fee != null ? `İstenen ${formatMoney(item.asking_fee)}` : null].filter(Boolean).join(" · ")}
                trailing={<Badge label={item.type_label} tone={item.listing_type === "loan" ? "info" : "warn"} size="xs" />}
                onPress={() => router.push("/takimim/borsa?bolum=ilanlarim" as Href)}
                last={index === Math.min(openListings.length, 3) - 1}
              />
            ))
          ) : (
            <ToneRow
              icon="pricetag-outline"
              tone="neutral"
              title="Açık ilanın yok"
              meta="Kadrondan bir oyuncuyu satılık ya da kiralık listele"
              onPress={() => router.push("/takimim/borsa?bolum=ilanlarim" as Href)}
              last
            />
          )}
        </ListCard>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Gönderilen teklifler" meta={counts.total ? `${counts.total}` : undefined} inset="flush" />
        <ChipGroup contentPadding={0}>
          <Chip size="sm" label="Tümü" count={counts.total || undefined} selected={!status} onPress={() => setStatus(null)} />
          {OUTBOX_STATUSES.map((key) => (
            <Chip
              key={key}
              size="sm"
              label={OFFER_STATUS_LABELS[key]}
              count={key === "SENT" ? counts.sent || undefined : key === "REVISION_REQUESTED" ? counts.revision || undefined : undefined}
              selected={status === key}
              onPress={() => setStatus(key)}
            />
          ))}
        </ChipGroup>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Transfer yönetimi"
        subtitle={access.teamName ?? undefined}
        back
        scrollY={scrollY}
        actions={[{ icon: "search", onPress: () => router.push("/takimim/oyuncu-ara" as Href), accessibilityLabel: "Oyuncu ara ve teklif ver" }]}
      />
      <FlatList
        {...scrollProps}
        data={offers.isLoading ? [] : items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={
          offers.isLoading ? (
            <View style={styles.skeleton}>
              <Skeleton height={140} radius="xl" />
              <Skeleton height={140} radius="xl" />
            </View>
          ) : offers.isError ? (
            <ErrorState variant="inline" error={offers.error} onRetry={offers.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="swap-horizontal-outline"
              title={status ? `“${OFFER_STATUS_LABELS[status]}” teklif yok` : "Henüz teklif göndermedin"}
              body="Futbolcu veritabanında oyuncu bul, satırdaki “Teklif ver” ile şartları gönder."
              action={{ label: "Oyuncu ara", onPress: () => router.push("/takimim/oyuncu-ara" as Href) }}
            />
          )
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item, index }) => (
          <Reveal index={index} limit={6} distance={8}>
            <OfferCard offer={item} onPress={(id) => router.push(`/teklif/${id}` as Href)} />
          </Reveal>
        )}
      />
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingTop: space.md, paddingBottom: space.md },
  skeleton: { gap: space.md },
  gap: { height: space.md },
  pills: { flexDirection: "row", alignItems: "center", gap: space.s },
  heroTitle: { ...type.display, color: colors.onDark },
  heroBody: { ...type.bodySm, color: colors.onDarkMuted, marginTop: space.xs },
  heroActions: { flexDirection: "row", gap: space.sm },
  block: { marginTop: space.xl, gap: space.sm },
  flex: { flex: 1 },
});
