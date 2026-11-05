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
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PanelCard, PanelEmpty, PanelRow, PanelSection } from "@/components/club/Panel";
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientFill,
  ListRow,
  ScreenHeader,
  SkeletonListRow,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { isReleaseRequest } from "@/lib/api/club/notifications";
import { OFFER_STATUS_LABELS, OUTBOX_STATUSES, getOutboxPage, type OutboxStatus } from "@/lib/api/club/offers";
import { getPanelNotifications } from "@/lib/api/panel";
import { getMyListings, formatMoney } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

const STATUS_TONE: Record<string, Tone> = {
  SENT: "warn",
  REVISION_REQUESTED: "info",
  ACCEPTED: "win",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
};

const positionOf = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

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

  const header = (
    <View style={styles.header}>
      {/* Birincil eylem: "teklif gönderemiyorum" şikâyetinin yanıtı. */}
      <View style={styles.hero}>
        <GradientFill tone="ink" radius="xxl" />
        <Text style={styles.heroEyebrow} {...textScale.badge}>
          TRANSFER MASASI
        </Text>
        <Text style={styles.heroTitle} {...textScale.dense}>
          {counts.sent + counts.revision > 0
            ? `${counts.sent + counts.revision} teklif süreçte`
            : "Kadronu güçlendir"}
        </Text>
        <Text style={styles.heroBody} {...textScale.long}>
          Oyuncuyu ara, şartları belirle, teklifi gönder. Oyuncu revizyon isterse yeni sürümü buradan hazırlarsın.
        </Text>
        <View style={styles.heroStats}>
          <HeroStat label="Cevap bekleyen" value={counts.sent} />
          <HeroStat label="Revizyon" value={counts.revision} />
          <HeroStat label="Kabul" value={counts.accepted} />
          <HeroStat label="Toplam" value={counts.total} />
        </View>
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
      </View>

      {releases.length ? (
        <PanelSection title="İzin bekleyen transferler" meta={`${releases.length}`} style={styles.flush}>
          <PanelCard padded={false}>
            {releases.slice(0, 5).map((item, index) => (
              <PanelRow
                key={item.id}
                icon="hand-left"
                tone={item.is_read ? "neutral" : "warn"}
                title={item.title}
                hint={item.description ?? formatDateShort(item.createdAt)}
                onPress={() => router.push(`/transfer-izni/${item.entity_public_id}` as Href)}
                last={index === Math.min(releases.length, 5) - 1}
              />
            ))}
          </PanelCard>
        </PanelSection>
      ) : null}

      <PanelSection
        title="Satılık / kiralık ilanlarım"
        meta={openListings.length ? `${openListings.length} açık` : undefined}
        action={{ label: "Yönet", onPress: () => router.push("/takimim/borsa?bolum=ilanlarim" as Href) }}
        style={styles.flush}
      >
        {openListings.length ? (
          <PanelCard padded={false}>
            {openListings.slice(0, 3).map((item, index) => (
              <PanelRow
                key={item.public_id}
                leading={<Avatar name={item.player.name ?? "?"} image={mediaUrl(item.player.image ?? null)} size={layout.crestMd} />}
                title={item.player.name ?? "Oyuncu"}
                hint={[item.type_label, item.asking_fee != null ? formatMoney(item.asking_fee) : null].filter(Boolean).join(" · ")}
                onPress={() => router.push("/takimim/borsa?bolum=ilanlarim" as Href)}
                last={index === Math.min(openListings.length, 3) - 1}
              />
            ))}
          </PanelCard>
        ) : (
          <PanelEmpty
            icon="pricetag-outline"
            text="Açık ilanın yok. Kadrondan bir oyuncuyu satılık ya da kiralık listele."
            action={{ label: "İlan aç", onPress: () => router.push("/takimim/borsa?bolum=ilanlarim" as Href) }}
          />
        )}
      </PanelSection>

      <View style={styles.listHead}>
        <Text style={styles.listTitle} {...textScale.badge}>
          GÖNDERİLEN TEKLİFLER
        </Text>
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
            <SkeletonListRow count={5} />
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
        renderItem={({ item, index }) => {
          const subtitle = [
            item.sent_at ? `Gönderildi ${formatDateShort(item.sent_at)}` : null,
            item.expires_at && ["SENT", "REVISION_REQUESTED"].includes(item.status) ? `Son gün ${formatDateShort(item.expires_at)}` : null,
            item.release_status === "PENDING" ? "Mevcut takımın izni bekleniyor" : null,
            item.release_status === "REJECTED" ? "Mevcut takım izin vermedi" : null,
            item.requires_admin_approval && (item.admin_status ?? "PENDING") === "PENDING" && ["SENT", "REVISION_REQUESTED"].includes(item.status)
              ? "Yönetim onayında"
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <ListRow
              leading={<Avatar name={item.player?.player_name ?? "?"} image={mediaUrl(item.player?.player_img ?? null)} size={layout.crestLg} />}
              title={item.player?.player_name ?? "Oyuncu"}
              subtitle={subtitle || undefined}
              badge={<Badge label={OFFER_STATUS_LABELS[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? "neutral"} size="xs" />}
              highlighted={item.status === "REVISION_REQUESTED"}
              position={positionOf(index, items.length)}
              onPress={() => router.push(`/teklif/${item.public_id}` as Href)}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingTop: space.md, paddingBottom: space.md },
  hero: {
    borderRadius: radius.xxl,
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
  },
  heroEyebrow: { ...type.overline, color: colors.brandOnDark },
  heroTitle: { ...type.h2, color: colors.onDark },
  heroBody: { ...type.bodySm, color: colors.onDarkMuted },
  heroStats: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  heroStat: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.glassBorder,
  },
  heroStatValue: { ...type.metricSm, color: colors.onDark },
  heroStatLabel: { ...type.nano, color: colors.onDarkMuted },
  heroActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  listHead: { marginTop: space.xl, gap: space.sm },
  listTitle: { ...type.overline, color: colors.textTertiary },
  flex: { flex: 1 },
  /* PanelSection kendi kenar payını taşır; liste zaten paylı. */
  flush: { paddingHorizontal: 0 },
});
