/**
 * DAVET VE BAŞVURULAR — oyuncu ile takım başkanının ortak kadro ekranı.
 *
 * NE DEĞİŞTİ: eski ekran tek bir uzun `ScrollView` idi; ilan formu, ilan
 * vitrini, gelen kutusu ve giden kutusu alt alta diziliyordu. Gelen bir davete
 * bakmak için ilan formunu geçmek gerekiyordu. Artık:
 *   • GELEN / GÖNDERİLEN ayrımı bir segmenttir (seçim `?tab=` ile taşınır),
 *   • talepler yoğun `ListRow` satırlarıdır, karar alt sayfada verilir,
 *   • role özel bloklar (başkan ilanı, oyuncuya ilan vitrini) liste başlığında
 *     tek satırlık özetlerdir, formlar alt sayfaya taşınmıştır.
 * Hiçbir işlev eksilmedi: kabul, ret, geri çekme, ilan açma/kapatma ve takıma
 * başvuru aynı uçlarla sürüyor.
 *
 * KİM NEYİ GÖRÜR (sunucu sözleşmesi — services/teamJoinRequestService.js):
 *   • inbox  = yanıtlaması beklenen talepler → oyuncuya DAVET, başkana BAŞVURU
 *   • outbox = üyenin kendi başlattıkları → oyuncunun başvuruları, başkanın
 *     davetleri
 * Bu yüzden satırda kimin gösterileceği (takım mı oyuncu mu) hem kutuya hem
 * talep türüne bakılarak seçilir.
 *
 * BAŞVURU KISITI: yalnız serbest oyuncular takıma başvurabilir; takımı olanın
 * geçişi transfer teklifiyle yürür (sunucu 409 PLAYER_ALREADY_IN_TEAM). Ekran
 * bunu engellemek yerine sunucunun cümlesini gösterir — kural sunucunundur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FAB,
  IconTile,
  Input,
  ListRow,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Touchable,
  toneColors,
  useFabAutoHide,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import {
  acceptJoinRequest,
  cancelJoinRequest,
  closeRecruitment,
  createApplication,
  createRecruitment,
  getJoinRequests,
  getMyRecruitments,
  getRecruitments,
  POSITIONS,
  positionLabel,
  rejectJoinRequest,
  type JoinRequest,
  type Recruitment,
} from "@/lib/api/team";
import { getTeams } from "@/lib/api/teams";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiTeam } from "@/lib/types";
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import { useAuth } from "@/providers/AuthProvider";
import { SignatureStripe } from "@/components/league/kit";
import {
  colors,
  elevate,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Bekliyor", tone: "warn" },
  accepted: { label: "Kabul edildi", tone: "win" },
  rejected: { label: "Reddedildi", tone: "danger" },
  cancelled: { label: "Geri çekildi", tone: "neutral" },
};

const statusMeta = (status: string): { label: string; tone: Tone } =>
  STATUS_META[status] ?? { label: status, tone: "neutral" };

type InviteTab = "gelen" | "gonderilen";

/** Listenin öğeleri: bölüm başlığı ya da talep kartı. */
type ListEntry =
  | { kind: "head"; key: string; title: string; count: number; tone: "warn" | "neutral" }
  | { kind: "item"; key: string; request: JoinRequest; order: number };

const TAB_KEYS: InviteTab[] = ["gelen", "gonderilen"];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(raw: unknown): InviteTab {
  const key = String(raw ?? "").trim().toLowerCase();
  return (TAB_KEYS as string[]).includes(key) ? (key as InviteTab) : "gelen";
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Hata cümlesi: sunucunun Türkçe mesajı varsa o kullanılır. */
const errorText = (error: unknown): string =>
  error instanceof ApiError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "Bilinmeyen hata.";

/* ================================= EKRAN ================================== */

export default function InvitesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();
  const fab = useFabAutoHide();

  const tab = resolveTab(firstParam(params.tab));

  const isPlayer = Boolean(auth.user?.player_id);
  // Başkanlık oturum alanından değil panelden (/api/panel/me) okunur: yetki
  // girişten sonra onaylanınca oturum alanı tazelenmiyordu.
  const teamAccess = useTeamAccess();
  const isPresident = teamAccess.canManage;

  const [selected, setSelected] = useState<{ request: JoinRequest; inbox: boolean } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTo, setApplyTo] = useState<{ teamId: number; teamName: string } | null>(null);
  const [adOpen, setAdOpen] = useState(false);

  /* ------------------------------ SORGULAR ------------------------------- */

  const requestsQuery = useQuery({
    queryKey: ["takim", "join-requests"],
    queryFn: getJoinRequests,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const recruitmentsQuery = useQuery({
    queryKey: ["takim", "recruitments"],
    queryFn: () => getRecruitments(),
    enabled: Boolean(auth.user) && isPlayer,
    staleTime: 60_000,
  });

  const myRecruitmentQuery = useQuery({
    queryKey: ["takim", "recruitments", "mine"],
    queryFn: getMyRecruitments,
    enabled: Boolean(auth.user) && isPresident,
    staleTime: 30_000,
    retry: false,
  });

  /** Aşağı çekince talepler VE ilan vitrinleri birlikte tazelenir. */
  const refetchAll = useCallback(() => {
    void requestsQuery.refetch();
    if (isPlayer) void recruitmentsQuery.refetch();
    if (isPresident) void myRecruitmentQuery.refetch();
  }, [isPlayer, isPresident, myRecruitmentQuery, recruitmentsQuery, requestsQuery]);

  const refresh = useRefresh(refetchAll, {
    refreshing: requestsQuery.isRefetching,
  });

  /** Talep listesi değişince kadro ve panel özetleri de bayatlar. */
  const invalidateRequests = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["takim", "join-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    // Oyuncu daveti kabul edince takımı değişir: Kariyerim ve maçlarım bayatlar.
    void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "overview"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "my-matches"] });
  }, [queryClient]);

  const invalidateRecruitments = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["takim", "recruitments"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "recruitments", "mine"] });
  }, [queryClient]);

  /* ------------------------------ MUTASYONLAR ---------------------------- */

  const actionError = useCallback(
    (error: unknown) => {
      toast.show({ message: errorText(error), tone: "danger", icon: "alert-circle", duration: 4000 });
    },
    [toast],
  );

  const acceptMutation = useMutation({
    mutationFn: (id: number) => acceptJoinRequest(id),
    onSuccess: (result) => {
      setSelected(null);
      invalidateRequests();
      toast.show({
        message: result.message ?? "Talep kabul edildi.",
        tone: "success",
        icon: "checkmark-circle",
        haptic: "success",
      });
    },
    onError: actionError,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectJoinRequest(id),
    onSuccess: () => {
      setSelected(null);
      invalidateRequests();
      toast.show({ message: "Talep reddedildi.", tone: "neutral" });
    },
    onError: actionError,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelJoinRequest(id),
    onSuccess: () => {
      setSelected(null);
      invalidateRequests();
      toast.show({ message: "Talep geri çekildi.", tone: "neutral" });
    },
    onError: actionError,
  });

  /* -------------------------------- VERİ --------------------------------- */

  const inbox = useMemo(() => requestsQuery.data?.inbox ?? [], [requestsQuery.data]);
  const outbox = useMemo(() => requestsQuery.data?.outbox ?? [], [requestsQuery.data]);
  const recruitments = useMemo(
    () => recruitmentsQuery.data?.items ?? [],
    [recruitmentsQuery.data],
  );
  const openRecruitment = useMemo(
    () => (myRecruitmentQuery.data?.items ?? []).find((item) => item.status === "open") ?? null,
    [myRecruitmentQuery.data],
  );

  const pendingIn = useMemo(
    () => inbox.filter((item) => item.status === "pending").length,
    [inbox],
  );
  const pendingOut = useMemo(
    () => outbox.filter((item) => item.status === "pending").length,
    [outbox],
  );

  const data = tab === "gelen" ? inbox : outbox;

  const tabItems = useMemo<SegmentedItem<InviteTab>[]>(
    () => [
      { key: "gelen", label: `Gelen${inbox.length ? ` (${inbox.length})` : ""}`, dot: pendingIn > 0 },
      {
        key: "gonderilen",
        label: `Gönderilen${outbox.length ? ` (${outbox.length})` : ""}`,
        dot: pendingOut > 0,
      },
    ],
    [inbox.length, outbox.length, pendingIn, pendingOut],
  );

  /* ------------------------------- EYLEMLER ------------------------------ */

  const changeTab = useCallback(
    (next: InviteTab) => {
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const openRequest = useCallback(
    (request: JoinRequest) => setSelected({ request, inbox: tab === "gelen" }),
    [tab],
  );

  const confirmAccept = useCallback(
    (request: JoinRequest) => {
      const text =
        request.type === "invite"
          ? `${request.team.name ?? "Takım"} davetini kabul edersen kadroya ekleneceksin.`
          : `${request.player.name ?? "Oyuncu"} başvurusunu kabul edersen kadrona eklenecek.`;
      Alert.alert("Kabul et", text, [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kabul et", onPress: () => acceptMutation.mutate(request.id) },
      ]);
    },
    [acceptMutation],
  );

  const confirmReject = useCallback(
    (request: JoinRequest) => {
      Alert.alert("Reddet", "Bu talebi reddetmek istediğine emin misin?", [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Reddet",
          style: "destructive",
          onPress: () => rejectMutation.mutate(request.id),
        },
      ]);
    },
    [rejectMutation],
  );

  const confirmCancel = useCallback(
    (request: JoinRequest) => {
      Alert.alert("Geri çek", "Bu talebi geri çekmek istediğine emin misin?", [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Geri çek",
          style: "destructive",
          onPress: () => cancelMutation.mutate(request.id),
        },
      ]);
    },
    [cancelMutation],
  );

  const openApply = useCallback((team: { teamId: number; teamName: string } | null) => {
    setApplyTo(team);
    setApplyOpen(true);
  }, []);

  const applyToRecruitment = useCallback(
    (item: Recruitment) => {
      if (!item.team) return;
      openApply({ teamId: item.team.id, teamName: item.team.name });
    },
    [openApply],
  );

  /* -------------------------------- ÇİZİM -------------------------------- */

  const busyAny =
    acceptMutation.isPending || rejectMutation.isPending || cancelMutation.isPending;

  const { onScroll: onHeaderScroll, scrollEventThrottle } = scrollProps;
  const { onScroll: onFabScroll } = fab;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onHeaderScroll(event);
      onFabScroll(event);
    },
    [onFabScroll, onHeaderScroll],
  );

  /**
   * LİSTE KURGUSU: tek düz liste yerine iki bölüm — "Yanıt bekleyen" en üstte
   * (kararın verileceği yer), altında "Sonuçlananlar" arşivi. Satırlar
   * FlatList'e başlık + kart karışık öğeler olarak verilir; böylece sanal
   * liste korunur, bölüm başlıkları da kaydırmayla birlikte akar.
   */
  const rows = useMemo<ListEntry[]>(() => {
    const pending = data.filter((item) => item.status === "pending");
    const settled = data.filter((item) => item.status !== "pending");
    const out: ListEntry[] = [];
    if (pending.length) {
      out.push({ kind: "head", key: "h-pending", title: "Yanıt bekleyen", count: pending.length, tone: "warn" });
      pending.forEach((request, index) => out.push({ kind: "item", key: `p-${request.id}`, request, order: index }));
    }
    if (settled.length) {
      out.push({ kind: "head", key: "h-settled", title: "Sonuçlananlar", count: settled.length, tone: "neutral" });
      settled.forEach((request, index) =>
        out.push({ kind: "item", key: `s-${request.id}`, request, order: pending.length + index }),
      );
    }
    return out;
  }, [data]);

  const renderItem = useCallback(
    ({ item }: { item: ListEntry }) =>
      item.kind === "head" ? (
        <SectionHeader
          title={item.title}
          meta={String(item.count)}
          icon={item.tone === "warn" ? "hourglass-outline" : "archive-outline"}
          iconTone={item.tone === "warn" ? "gold" : "neutral"}
          inset="flush"
          style={styles.groupHead}
        />
      ) : (
        <Reveal index={item.order} limit={7}>
          <RequestCard
            request={item.request}
            inbox={tab === "gelen"}
            busy={busyAny}
            onPress={openRequest}
            onAccept={confirmAccept}
            onReject={confirmReject}
            onCancel={confirmCancel}
          />
        </Reveal>
      ),
    [busyAny, confirmAccept, confirmCancel, confirmReject, openRequest, tab],
  );

  /** Özet: üç kutu — yanıt bekleyen, senin bekleyen talebin, kabul edilen. */
  const acceptedCount = useMemo(
    () => [...inbox, ...outbox].filter((item) => item.status === "accepted").length,
    [inbox, outbox],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <Reveal>
          <MetricGrid columns={3}>
            <MetricTile
              label="Gelen"
              value={String(pendingIn)}
              hint="yanıt bekliyor"
              tone={pendingIn > 0 ? "warn" : "neutral"}
              icon="mail-unread-outline"
              onPress={tab === "gelen" ? undefined : () => changeTab("gelen")}
            />
            <MetricTile
              label="Giden"
              value={String(pendingOut)}
              hint="sonuç bekliyor"
              tone="brand"
              icon="paper-plane-outline"
              onPress={tab === "gonderilen" ? undefined : () => changeTab("gonderilen")}
            />
            <MetricTile
              label="Kabul"
              value={String(acceptedCount)}
              hint="toplam"
              tone="win"
              icon="checkmark-done-outline"
            />
          </MetricGrid>
        </Reveal>

        {/* Başkan: tek açık "Oyuncu Arıyoruz" ilanının özeti. */}
        {isPresident && !myRecruitmentQuery.isLoading && !myRecruitmentQuery.isError ? (
          <Reveal index={1}>
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => setAdOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={openRecruitment ? "Oyuncu Arıyoruz ilanını yönet" : "Oyuncu Arıyoruz ilanı aç"}
              style={[styles.adBox, openRecruitment ? styles.adBoxLive : null]}
            >
              {openRecruitment ? <SignatureStripe /> : null}
              <IconTile icon="megaphone" tone={openRecruitment ? "signature" : "neutral"} size={40} glow={Boolean(openRecruitment)} />
              <View style={styles.adBoxText}>
                <View style={styles.adBoxHead}>
                  <Text style={styles.adBoxTitle} numberOfLines={1} {...textScale.dense}>
                    Oyuncu Arıyoruz
                  </Text>
                  <Badge
                    label={openRecruitment ? "Yayında" : "Kapalı"}
                    tone={openRecruitment ? "win" : "neutral"}
                    dot={Boolean(openRecruitment)}
                    size="xs"
                  />
                </View>
                {openRecruitment ? (
                  <View style={styles.adChips}>
                    {(openRecruitment.positions.length ? openRecruitment.positions : ["Tüm mevkiler"]).slice(0, 4).map((code) => (
                      <Badge key={code} label={code} tone="brand" size="xs" />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.adBoxBody} numberOfLines={2} {...textScale.long}>
                    İlan aç; serbest oyuncular seni görüp doğrudan başvursun.
                  </Text>
                )}
              </View>
              <View style={styles.adBoxCta}>
                <Text style={styles.adBoxCtaText} {...textScale.dense}>
                  {openRecruitment ? "Yönet" : "İlan aç"}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.brandAccent} />
              </View>
            </Touchable>
          </Reveal>
        ) : null}

        {/* Oyuncu: ilan vitrini. */}
        {isPlayer && recruitments.length > 0 ? (
          <View>
            <SectionHeader
              title="Oyuncu arayan takımlar"
              meta={String(recruitments.length)}
              icon="megaphone-outline"
              iconTone="cyan"
              inset="flush"
            />
            <FlatList
              horizontal
              data={recruitments}
              keyExtractor={(item) => String(item.id)}
              showsHorizontalScrollIndicator={false}
              style={styles.adRail}
              contentContainerStyle={styles.adRow}
              renderItem={({ item, index }) => (
                <Reveal index={index} limit={4} axis="x">
                  <RecruitmentAd item={item} onPress={applyToRecruitment} />
                </Reveal>
              )}
            />
          </View>
        ) : null}

        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.hint} {...textScale.long}>
            {tab === "gelen"
              ? isPresident
                ? "Kabul ettiğin oyuncu sözleşmesiz olarak kadrona girer."
                : "Takımların kadro davetleri. Kartın altından tek dokunuşla karar ver."
              : "Senin başlattığın davet ve başvurular. Bekleyenleri geri çekebilirsin."}
          </Text>
        </View>

        {requestsQuery.isError && data.length > 0 ? (
          <ErrorState
            error={requestsQuery.error}
            onRetry={requestsQuery.refetch}
            variant="banner"
          />
        ) : null}
      </View>
    ),
    [
      acceptedCount,
      applyToRecruitment,
      changeTab,
      data.length,
      isPlayer,
      isPresident,
      myRecruitmentQuery.isError,
      myRecruitmentQuery.isLoading,
      openRecruitment,
      pendingIn,
      pendingOut,
      recruitments,
      requestsQuery.error,
      requestsQuery.isError,
      requestsQuery.refetch,
      tab,
    ],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const busy = busyAny;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Davet ve Başvurular"
        subtitle="Kadro davetleri ve katılım talepleri"
        back
        scrollY={scrollY}
        bottom={
          <View style={styles.tabsWrap}>
            <SegmentedControl items={tabItems} value={tab} onChange={changeTab} size="sm" />
          </View>
        }
      />

      {requestsQuery.isLoading ? (
        <View style={styles.loading}>
          <MetricGrid columns={3}>
            <Skeleton height={92} radius="xl" />
            <Skeleton height={92} radius="xl" />
            <Skeleton height={92} radius="xl" />
          </MetricGrid>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : requestsQuery.isError && inbox.length === 0 && outbox.length === 0 ? (
        <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => `${tab}-${item.key}`}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={scrollEventThrottle}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon={tab === "gelen" ? "mail-open-outline" : "paper-plane-outline"}
              title={tab === "gelen" ? "Gelen talep yok" : "Gönderilmiş talep yok"}
              body={
                tab === "gelen"
                  ? isPresident
                    ? "Takımına katılım başvurusu geldiğinde burada görünür."
                    : "Bir takım seni kadrosuna davet ettiğinde burada görünür."
                  : isPlayer
                    ? "Takıma başvurduğunda talebin burada listelenir."
                    : "Serbest oyunculara gönderdiğin davetler burada listelenir."
              }
              variant="inline"
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          initialNumToRender={12}
        />
      )}

      {/* Oyuncunun tek birincil eylemi. */}
      {isPlayer ? (
        <FAB
          icon="paper-plane-outline"
          label="Takıma Başvur"
          extended
          visible={fab.visible && !applyOpen && selected === null}
          offsetBottom={insets.bottom + space.lg}
          onPress={() => openApply(null)}
          accessibilityLabel="Takıma başvuru gönder"
        />
      ) : null}

      {/* ------------------------- TALEP DETAYI -------------------------- */}
      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.request.type === "invite" ? "Kadro daveti" : "Katılım başvurusu"}
        snap="content"
        footer={
          selected && selected.request.status === "pending" ? (
            <View style={styles.sheetFooter}>
              {selected.inbox ? (
                <>
                  <Button
                    label="Reddet"
                    variant="danger"
                    onPress={() => confirmReject(selected.request)}
                    disabled={busy}
                    style={styles.sheetButton}
                  />
                  <Button
                    label="Kabul et"
                    variant="primary"
                    icon="checkmark"
                    onPress={() => confirmAccept(selected.request)}
                    disabled={busy}
                    loading={acceptMutation.isPending}
                    style={styles.sheetButton}
                  />
                </>
              ) : (
                <Button
                  label="Talebi geri çek"
                  variant="danger"
                  onPress={() => confirmCancel(selected.request)}
                  disabled={busy}
                  loading={cancelMutation.isPending}
                  style={styles.sheetButton}
                />
              )}
            </View>
          ) : undefined
        }
      >
        {selected ? <RequestDetail request={selected.request} inbox={selected.inbox} /> : null}
      </BottomSheet>

      {/* ------------------------ TAKIMA BAŞVURU ------------------------- */}
      {applyOpen ? (
        <ApplicationSheet
          preselected={applyTo}
          onClose={() => setApplyOpen(false)}
          onSent={(message) => {
            setApplyOpen(false);
            invalidateRequests();
            toast.show({
              message: message ?? "Başvurun gönderildi.",
              tone: "success",
              icon: "paper-plane",
              haptic: "success",
            });
          }}
          onError={actionError}
        />
      ) : null}

      {/* --------------------- OYUNCU ARIYORUZ İLANI --------------------- */}
      {adOpen ? (
        <RecruitmentSheet
          openRecruitment={openRecruitment}
          onClose={() => setAdOpen(false)}
          onChanged={(message) => {
            setAdOpen(false);
            invalidateRecruitments();
            toast.show({ message, tone: "success", icon: "megaphone" });
          }}
          onError={actionError}
        />
      ) : null}
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/**
 * Talep kartı — davet/başvurunun TAMAMI tek kartta okunur.
 *
 * Gelen kutusunda DAVET takımı, BAŞVURU oyuncuyu gösterir; giden kutusunda
 * tersi geçerlidir (kendi gönderdiğin daveti oyuncu adıyla, başvurunu takım
 * adıyla ararsın).
 *
 * ANATOMİ: arma/avatar · ad + tür · durum hapı; altında mesaj alıntısı ve
 * zaman çizgisi (gönderildi → yanıtlandı). Bekleyen talepte kartın dibinde
 * KARAR ŞERİDİ durur: gelen kutusunda Reddet / Kabul et, giden kutusunda
 * Geri çek. Eskiden karar için önce satıra dokunup alt sayfayı açmak
 * gerekiyordu; kararlar aynı onay pencerelerinden geçer.
 */
const RequestCard = React.memo(function RequestCard({
  request,
  inbox,
  busy,
  onPress,
  onAccept,
  onReject,
  onCancel,
}: {
  request: JoinRequest;
  inbox: boolean;
  busy: boolean;
  onPress: (request: JoinRequest) => void;
  onAccept: (request: JoinRequest) => void;
  onReject: (request: JoinRequest) => void;
  onCancel: (request: JoinRequest) => void;
}) {
  const handlePress = useCallback(() => onPress(request), [onPress, request]);

  const showTeam = inbox ? request.type === "invite" : request.type === "application";
  const meta = statusMeta(request.status);
  const pending = request.status === "pending";
  const title = (showTeam ? request.team.name : request.player.name) ?? "—";
  const kindLabel = request.type === "invite" ? "Kadro daveti" : "Katılım başvurusu";
  const direction = inbox ? "Gelen" : "Giden";

  const subtitle = [
    kindLabel,
    !showTeam && request.player.position ? positionLabel(request.player.position) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.reqCard, pending ? styles.reqCardPending : null]}>
      {pending ? <SignatureStripe /> : null}
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${kindLabel}, ${meta.label}. Ayrıntılar`}
        style={styles.reqMain}
      >
        <View style={styles.reqHead}>
          {showTeam ? (
            <TeamLogo name={request.team.name} logo={mediaUrl(request.team.logo ?? null)} size={40} />
          ) : (
            <Avatar name={request.player.name} image={mediaUrl(request.player.image ?? null)} size={40} />
          )}
          <View style={styles.reqText}>
            <Text style={styles.reqTitle} numberOfLines={1} {...textScale.dense}>
              {title}
            </Text>
            <View style={styles.reqMetaRow}>
              <Ionicons
                name={request.type === "invite" ? "mail-outline" : "paper-plane-outline"}
                size={12}
                color={colors.textTertiary}
              />
              <Text style={styles.reqMeta} numberOfLines={1} {...textScale.dense}>
                {subtitle}
              </Text>
            </View>
          </View>
          <Badge label={meta.label} tone={meta.tone} dot={pending} size="xs" />
        </View>

        {request.message ? (
          <View style={styles.reqQuote}>
            <Text style={styles.reqQuoteText} numberOfLines={2} {...textScale.long}>
              “{request.message}”
            </Text>
          </View>
        ) : null}

        {/* Zaman çizgisi: gönderildi → yanıt. Bekleyende ikinci durak boş halka. */}
        <View style={styles.timeline}>
          <View style={[styles.tlDot, styles.tlDotOn]} />
          <Text style={styles.tlText} numberOfLines={1} {...textScale.dense}>
            {direction} · {request.created_at ? formatDateShort(request.created_at) : "—"}
          </Text>
          <View style={styles.tlLine} />
          <View
            style={[
              styles.tlDot,
              pending ? null : { backgroundColor: toneColors(meta.tone).fg, borderColor: toneColors(meta.tone).fg },
            ]}
          />
          <Text style={[styles.tlText, pending ? styles.tlTextWait : null]} numberOfLines={1} {...textScale.dense}>
            {pending ? "Yanıt bekleniyor" : request.responded_at ? formatDateShort(request.responded_at) : meta.label}
          </Text>
        </View>
      </Touchable>

      {pending ? (
        <View style={styles.reqActions}>
          {inbox ? (
            <>
              <Button
                label="Reddet"
                variant="secondary"
                size="sm"
                icon="close"
                onPress={() => onReject(request)}
                disabled={busy}
                style={styles.reqButton}
              />
              <Button
                label="Kabul et"
                variant="primary"
                size="sm"
                icon="checkmark"
                onPress={() => onAccept(request)}
                disabled={busy}
                style={styles.reqButton}
              />
            </>
          ) : (
            <Button
              label="Talebi geri çek"
              variant="ghost"
              size="sm"
              icon="arrow-undo-outline"
              onPress={() => onCancel(request)}
              disabled={busy}
              style={styles.reqButton}
            />
          )}
        </View>
      ) : null}
    </View>
  );
});

/** Alt sayfadaki talep künyesi. */
const RequestDetail = React.memo(function RequestDetail({
  request,
  inbox,
}: {
  request: JoinRequest;
  inbox: boolean;
}) {
  const showTeam = inbox ? request.type === "invite" : request.type === "application";
  const meta = statusMeta(request.status);

  return (
    <View style={styles.sheetBody}>
      <View style={styles.detailHead}>
        {showTeam ? (
          <TeamLogo
            name={request.team.name}
            logo={mediaUrl(request.team.logo ?? null)}
            size={layout.crestXl}
          />
        ) : (
          <Avatar
            name={request.player.name}
            image={mediaUrl(request.player.image ?? null)}
            size={layout.crestXl}
          />
        )}
        <View style={styles.detailBody}>
          <Text style={styles.detailTitle} numberOfLines={2} {...textScale.dense}>
            {(showTeam ? request.team.name : request.player.name) ?? "—"}
          </Text>
          <Text style={styles.detailMeta} {...textScale.dense}>
            {request.created_at ? formatDateShort(request.created_at) : ""}
            {request.responded_at ? ` · yanıt ${formatDateShort(request.responded_at)}` : ""}
          </Text>
          <Badge label={meta.label} tone={meta.tone} size="xs" />
        </View>
      </View>

      {request.message ? (
        <Surface level={2} radius="md" style={styles.quote}>
          <Text style={styles.quoteText} {...textScale.long}>
            “{request.message}”
          </Text>
        </Surface>
      ) : null}

      <Text style={styles.detailNote} {...textScale.long}>
        {request.type === "invite"
          ? "Davet kabul edilirse oyuncu sözleşmesiz olarak kadroya eklenir; sözleşme ayrı bir transfer teklifiyle kurulur."
          : "Başvuru kabul edilirse oyuncu sözleşmesiz olarak kadroya girer."}
      </Text>
    </View>
  );
});

/**
 * Oyuncu arayan takım ilanı — yatay vitrin kartı. Üstte arma + takım,
 * ortada aranan mevki pulları, dipte not ve "Başvur" eylem satırı.
 */
const RecruitmentAd = React.memo(function RecruitmentAd({
  item,
  onPress,
}: {
  item: Recruitment;
  onPress: (item: Recruitment) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.team?.name ?? "Takım"} ilanına başvur`}
      style={styles.ad}
    >
      <View style={styles.adHead}>
        <TeamLogo name={item.team?.name} logo={mediaUrl(item.team?.logo ?? null)} size={36} />
        <View style={styles.adBody}>
          <Text style={styles.adTeam} numberOfLines={1} {...textScale.dense}>
            {item.team?.name ?? "Takım"}
          </Text>
          <Text style={styles.adMeta} numberOfLines={1} {...textScale.dense}>
            {[item.team?.city, item.team?.league].filter(Boolean).join(" · ") || "Serbest oyuncu arıyor"}
          </Text>
        </View>
      </View>

      <View style={styles.adChips}>
        {item.positions.length > 0 ? (
          item.positions.slice(0, 4).map((code) => <Badge key={code} label={code} tone="brand" size="xs" />)
        ) : (
          <Badge label="Tüm mevkiler" tone="neutral" size="xs" />
        )}
      </View>

      <Text style={styles.adNote} numberOfLines={2} {...textScale.long}>
        {item.note || "Kadroya katılacak oyuncu arıyor."}
      </Text>

      <View style={styles.adCtaRow}>
        <Text style={styles.adCta} {...textScale.dense}>
          Başvur
        </Text>
        <Ionicons name="arrow-forward" size={14} color={colors.brandAccent} />
      </View>
    </Touchable>
  );
});

/**
 * Takıma başvuru alt sayfası — takım ara/seç + isteğe bağlı mesaj.
 * Yalnız açıkken mount edilir; kapanınca arama durumu sıfırlanır.
 */
const ApplicationSheet = React.memo(function ApplicationSheet({
  preselected,
  onClose,
  onSent,
  onError,
}: {
  preselected: { teamId: number; teamName: string } | null;
  onClose: () => void;
  onSent: (message?: string) => void;
  onError: (error: unknown) => void;
}) {
  const [team, setTeam] = useState<{ teamId: number; teamName: string } | null>(preselected);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const teamsQuery = useQuery({
    queryKey: queryKeys.teams(),
    queryFn: getTeams,
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const list = teamsQuery.data ?? [];
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return list.slice(0, 30);
    return list
      .filter((item: ApiTeam) => item.team_name.toLocaleLowerCase("tr-TR").includes(needle))
      .slice(0, 30);
  }, [search, teamsQuery.data]);

  const sendMutation = useMutation({
    mutationFn: () => createApplication(team!.teamId, message.trim() || undefined),
    onSuccess: (result) => onSent(result.message),
    onError,
  });

  const renderTeam = useCallback(
    ({ item, index }: { item: ApiTeam; index: number }) => (
      <ListRow
        leading={
          <TeamLogo
            name={item.team_name}
            logo={mediaUrl(item.logo ?? null)}
            size={layout.crestMd}
          />
        }
        title={item.team_name}
        subtitle={item.city ?? undefined}
        position={rowPosition(index, filtered.length)}
        chevron={false}
        onPress={() => setTeam({ teamId: item.id, teamName: item.team_name })}
      />
    ),
    [filtered.length],
  );

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Takıma Başvur"
      snap="full"
      scrollable={false}
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Vazgeç" variant="ghost" onPress={onClose} style={styles.sheetButton} />
          <Button
            label="Başvuruyu gönder"
            variant="primary"
            icon="paper-plane-outline"
            onPress={() => sendMutation.mutate()}
            disabled={!team || sendMutation.isPending}
            loading={sendMutation.isPending}
            style={styles.sheetButton}
          />
        </View>
      }
    >
      <View style={styles.applyBody}>
        {team ? (
          <View style={styles.selectedTeam}>
            <Text style={styles.selectedTeamText} numberOfLines={1} {...textScale.dense}>
              {team.teamName}
            </Text>
            <Chip label="Değiştir" size="sm" onPress={() => setTeam(null)} />
          </View>
        ) : (
          <>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Takım adı ara…"
              variant="search"
            />
            {teamsQuery.isLoading ? (
              <SkeletonListRow count={4} />
            ) : teamsQuery.isError ? (
              <ErrorState
                error={teamsQuery.error}
                onRetry={teamsQuery.refetch}
                variant="inline"
              />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderTeam}
                keyboardShouldPersistTaps="handled"
                style={styles.teamList}
                ListEmptyComponent={
                  <EmptyState
                    icon="search-outline"
                    title="Takım bulunamadı"
                    body="Aramanı değiştirip tekrar dene."
                    variant="inline"
                    compact
                  />
                }
              />
            )}
          </>
        )}

        <Input
          label="Mesaj (isteğe bağlı)"
          value={message}
          onChangeText={setMessage}
          placeholder="Örn. Sol kanatta oynuyorum"
          multiline
        />

        <Text style={styles.detailNote} {...textScale.long}>
          Başvuru yalnızca serbest oyuncular içindir. Takımın varsa geçiş
          transfer teklifiyle yapılır.
        </Text>
      </View>
    </BottomSheet>
  );
});

/**
 * Başkanın "Oyuncu Arıyoruz" ilanı — açık ilan varsa kapatma, yoksa açma.
 * Sunucu takım başına TEK açık ilan tutar (routes/teamRecruitments.js).
 */
const RecruitmentSheet = React.memo(function RecruitmentSheet({
  openRecruitment,
  onClose,
  onChanged,
  onError,
}: {
  openRecruitment: Recruitment | null;
  onClose: () => void;
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createRecruitment(selected, note.trim() || undefined),
    onSuccess: (result) => onChanged(result.message ?? "İlan yayında."),
    onError,
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => closeRecruitment(id),
    onSuccess: () => onChanged("İlan kapatıldı."),
    onError,
  });

  const toggle = useCallback((code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  }, []);

  const confirmClose = useCallback(() => {
    if (!openRecruitment) return;
    Alert.alert("İlanı kapat", "İlan kapatılınca oyunculara görünmez. Emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Kapat",
        style: "destructive",
        onPress: () => closeMutation.mutate(openRecruitment.id),
      },
    ]);
  }, [closeMutation, openRecruitment]);

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Oyuncu Arıyoruz ilanı"
      snap="content"
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Kapat" variant="ghost" onPress={onClose} style={styles.sheetButton} />
          {openRecruitment ? (
            <Button
              label="İlanı kapat"
              variant="danger"
              onPress={confirmClose}
              loading={closeMutation.isPending}
              disabled={closeMutation.isPending}
              style={styles.sheetButton}
            />
          ) : (
            <Button
              label="İlanı yayınla"
              variant="primary"
              icon="megaphone-outline"
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              style={styles.sheetButton}
            />
          )}
        </View>
      }
    >
      <View style={styles.sheetBody}>
        {openRecruitment ? (
          <>
            <Text style={styles.sheetText} {...textScale.long}>
              İlanın yayında. Serbest oyuncular panelinden doğrudan başvurabilir;
              başvurular Gelen sekmesine düşer.
            </Text>
            <View style={styles.adChips}>
              {openRecruitment.positions.length ? (
                openRecruitment.positions.map((code) => (
                  <Badge key={code} label={positionLabel(code)} tone="brand" size="sm" />
                ))
              ) : (
                <Badge label="Tüm mevkiler" tone="neutral" size="sm" />
              )}
            </View>
            {openRecruitment.note ? (
              <Surface level={2} radius="md" style={styles.quote}>
                <Text style={styles.quoteText} {...textScale.long}>
                  {openRecruitment.note}
                </Text>
              </Surface>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.sheetText} {...textScale.long}>
              Aradığın mevkileri seç, kısa bir not ekle; ilan serbest oyunculara
              görünür. Mevki seçmezsen ilan "tüm mevkiler" olarak yayınlanır.
            </Text>
            <ChipGroup contentPadding={0} scrollable={false} style={styles.positionChips}>
              {POSITIONS.map((item) => (
                <PositionChip
                  key={item.code}
                  code={item.code}
                  label={item.label}
                  selected={selected.includes(item.code)}
                  onToggle={toggle}
                />
              ))}
            </ChipGroup>
            <Input
              label="Not (isteğe bağlı)"
              value={note}
              onChangeText={setNote}
              placeholder="Örn. Salı akşamları antrenman"
              multiline
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
});

const PositionChip = React.memo(function PositionChip({
  code,
  label,
  selected,
  onToggle,
}: {
  code: string;
  label: string;
  selected: boolean;
  onToggle: (code: string) => void;
}) {
  const handlePress = useCallback(() => onToggle(code), [code, onToggle]);
  return <Chip label={label} selected={selected} onPress={handlePress} size="sm" />;
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  /* Bölüm başlığı kendi ekran kenarı dolgusunu taşır; içerik zaten dolgulu
     olduğu için burada sıfırlanır — aksi hâlde başlık kartlardan 14px içeride
     dururdu. */
  flushHeader: {
    paddingHorizontal: 0,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabsWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant + space.giant,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  headerBlock: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  groupHead: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s,
    paddingHorizontal: space.xxs,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 16,
    flex: 1,
  },

  /* — Başkanın ilan kartı — */
  adBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  adBoxLive: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  adBoxText: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  adBoxHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  adBoxTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  adBoxBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  adBoxCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  adBoxCtaText: {
    ...type.label,
    color: colors.brandAccent,
  },

  /* — İlan vitrini — */
  adRail: {
    marginHorizontal: -layout.screenPadding,
  },
  adRow: {
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
  },
  ad: {
    width: 232,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  adHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  adBody: {
    flex: 1,
    minWidth: 0,
  },
  adTeam: {
    ...type.h4,
    color: colors.textPrimary,
  },
  adMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  adChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  adNote: {
    ...type.bodySm,
    color: colors.textSecondary,
    minHeight: 34,
  },
  adCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  adCta: {
    ...type.label,
    color: colors.brandAccent,
  },

  /* — Talep kartı — */
  reqCard: {
    marginBottom: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  reqCardPending: {
    borderColor: colors.brandBorder,
  },
  reqMain: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.m,
    gap: space.m,
  },
  reqHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  reqText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  reqTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  reqMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  reqMeta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  reqQuote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.brandBorder,
    paddingLeft: space.m,
    marginLeft: space.xxs,
  },
  reqQuoteText: {
    ...type.bodySm,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  tlDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  tlDotOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  tlLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.separator,
  },
  tlText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  tlTextWait: {
    color: colors.warn,
  },
  reqActions: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  reqButton: {
    flex: 1,
  },
  sheetBody: {
    gap: space.md,
    paddingBottom: space.md,
  },
  sheetText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: space.sm,
  },
  sheetButton: {
    flex: 1,
  },
  detailHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  detailBody: {
    flex: 1,
    gap: space.xs,
    alignItems: "flex-start",
  },
  detailTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  detailMeta: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  detailNote: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  quote: {
    padding: space.md,
  },
  quoteText: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  applyBody: {
    gap: space.md,
    paddingBottom: space.md,
    flexShrink: 1,
  },
  teamList: {
    maxHeight: 260,
  },
  selectedTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  selectedTeamText: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  positionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
