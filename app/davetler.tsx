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
  Input,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Touchable,
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
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  fonts,
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
  const isPresident = Boolean(auth.user?.managed_team_id);

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

  const { onScroll: onHeaderScroll, scrollEventThrottle } = scrollProps;
  const { onScroll: onFabScroll } = fab;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onHeaderScroll(event);
      onFabScroll(event);
    },
    [onFabScroll, onHeaderScroll],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: JoinRequest; index: number }) => (
      <RequestRow
        request={item}
        inbox={tab === "gelen"}
        position={rowPosition(index, data.length)}
        onPress={openRequest}
      />
    ),
    [data.length, openRequest, tab],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {/* Başkan: tek açık "Oyuncu Arıyoruz" ilanının özeti. */}
        {isPresident && !myRecruitmentQuery.isLoading && !myRecruitmentQuery.isError ? (
          <Surface level={1} radius="lg" style={styles.adBox}>
            <View style={styles.adBoxHead}>
              <Ionicons name="megaphone" size={16} color={colors.brandAccent} />
              <Text style={styles.adBoxTitle} {...textScale.dense}>
                Oyuncu Arıyoruz ilanım
              </Text>
              <Badge
                label={openRecruitment ? "YAYINDA" : "YOK"}
                tone={openRecruitment ? "win" : "neutral"}
                size="xs"
              />
            </View>
            <Text style={styles.adBoxBody} {...textScale.long}>
              {openRecruitment
                ? `Aranan mevkiler: ${
                    openRecruitment.positions.length
                      ? openRecruitment.positions.map(positionLabel).join(", ")
                      : "tüm mevkiler"
                  }.`
                : "İlan açtığında serbest oyuncular seni panelde görür ve doğrudan başvurabilir."}
            </Text>
            <Button
              label={openRecruitment ? "İlanı yönet" : "İlan aç"}
              variant={openRecruitment ? "secondary" : "primary"}
              size="sm"
              onPress={() => setAdOpen(true)}
            />
          </Surface>
        ) : null}

        {/* Oyuncu: ilan vitrini. */}
        {isPlayer && recruitments.length > 0 ? (
          <View>
            <SectionHeader title="Oyuncu arayan takımlar" meta={String(recruitments.length)} />
            <FlatList
              horizontal
              data={recruitments}
              keyExtractor={(item) => String(item.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.adRow}
              renderItem={({ item }) => (
                <RecruitmentAd item={item} onPress={applyToRecruitment} />
              )}
            />
          </View>
        ) : null}

        <Text style={styles.hint} {...textScale.long}>
          {tab === "gelen"
            ? isPresident
              ? "Takımına gelen katılım başvuruları burada. Kabul edersen oyuncu sözleşmesiz olarak kadroya girer."
              : "Takımların sana gönderdiği kadro davetleri burada. Karar vermek için satıra dokun."
            : "Senin başlattığın davet ve başvurular. Bekleyenleri geri çekebilirsin."}
        </Text>

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
      applyToRecruitment,
      data.length,
      isPlayer,
      isPresident,
      myRecruitmentQuery.isError,
      myRecruitmentQuery.isLoading,
      openRecruitment,
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

  const busy =
    acceptMutation.isPending || rejectMutation.isPending || cancelMutation.isPending;

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
          <SkeletonListRow count={5} />
        </View>
      ) : requestsQuery.isError && inbox.length === 0 && outbox.length === 0 ? (
        <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => `${tab}-${item.id}`}
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
 * Talep satırı.
 *
 * Gelen kutusunda DAVET takımı, BAŞVURU oyuncuyu gösterir; giden kutusunda
 * tersi geçerlidir (kendi gönderdiğin daveti oyuncu adıyla, başvurunu takım
 * adıyla ararsın).
 */
const RequestRow = React.memo(function RequestRow({
  request,
  inbox,
  position,
  onPress,
}: {
  request: JoinRequest;
  inbox: boolean;
  position: "single" | "first" | "middle" | "last";
  onPress: (request: JoinRequest) => void;
}) {
  const handlePress = useCallback(() => onPress(request), [onPress, request]);

  const showTeam = inbox ? request.type === "invite" : request.type === "application";
  const meta = statusMeta(request.status);

  const leading = useMemo(
    () =>
      showTeam ? (
        <TeamLogo
          name={request.team.name}
          logo={mediaUrl(request.team.logo ?? null)}
          size={layout.crestLg}
        />
      ) : (
        <Avatar
          name={request.player.name}
          image={mediaUrl(request.player.image ?? null)}
          size={layout.crestLg}
        />
      ),
    [request.player.image, request.player.name, request.team.logo, request.team.name, showTeam],
  );

  const subtitle = [
    request.type === "invite" ? "Kadro daveti" : "Katılım başvurusu",
    !showTeam && request.player.position ? positionLabel(request.player.position) : null,
    request.created_at ? formatDateShort(request.created_at) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow
      leading={leading}
      title={(showTeam ? request.team.name : request.player.name) ?? "—"}
      subtitle={subtitle}
      badge={<Badge label={meta.label} tone={meta.tone} size="xs" />}
      highlighted={request.status === "pending"}
      position={position}
      onPress={handlePress}
    />
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

/** Oyuncu arayan takım ilanı — yatay vitrin kartı. */
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
        <TeamLogo
          name={item.team?.name}
          logo={mediaUrl(item.team?.logo ?? null)}
          size={layout.crestMd}
        />
        <View style={styles.adBody}>
          <Text style={styles.adTeam} numberOfLines={1} {...textScale.dense}>
            {item.team?.name ?? "Takım"}
          </Text>
          <Text style={styles.adMeta} numberOfLines={1} {...textScale.dense}>
            {[item.team?.city, item.team?.league].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {item.positions.length > 0 ? (
        <View style={styles.adChips}>
          {item.positions.slice(0, 4).map((code) => (
            <Badge key={code} label={code} tone="brand" size="xs" />
          ))}
        </View>
      ) : null}

      {item.note ? (
        <Text style={styles.adNote} numberOfLines={2} {...textScale.long}>
          {item.note}
        </Text>
      ) : null}

      <Text style={styles.adCta} {...textScale.badge}>
        Başvur →
      </Text>
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
  },
  headerBlock: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  hint: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  adBox: {
    padding: space.md,
    gap: space.sm,
    marginTop: space.md,
  },
  adBoxHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  adBoxTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  adBoxBody: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  adRow: {
    gap: space.sm,
    paddingVertical: space.xs,
  },
  ad: {
    width: 210,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  adHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  adBody: {
    flex: 1,
  },
  adTeam: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fonts.bold,
  },
  adMeta: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  adChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  adNote: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 15,
  },
  adCta: {
    ...type.micro,
    color: colors.brandAccent,
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
