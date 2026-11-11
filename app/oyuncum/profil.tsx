/**
 * OYUNCU PROFİLİM — web üye panelindeki "Oyuncu Profilim" ekranı.
 * `/oyuncum/profil`
 *
 * NE (webdeki her işlemin karşılığı):
 *   · Kişisel bilgiler (ad, mevki, uyruk, doğum tarihi, il, telefon, e-posta,
 *     oynadığı takım) — salt okunur; düzenleme `/oyuncum/duzenle`de, yönetici
 *     onayıyla yayınlanır.
 *   · Onay bekleyen değişiklikler — neyin değiştiği yazar, geri çekilebilir
 *     (DELETE /api/panel/me/changes/:id).
 *   · Taleplerim — sahiplenme / yeni profil / bağlantı koparma talepleri,
 *     yönetici notu ve "geri çek" (DELETE /api/users/account-requests/:id).
 *   · "Bu oyuncu ben değilim" — bağlantı koparma talebi
 *     (POST /api/users/request-player-unlink).
 *   · Profil kartımı paylaş (web ShareProfileCard).
 *
 * NEDEN AYRI EKRAN: Kariyerim ana sayfası "bugün ne yapmalıyım" sorusunu
 * yanıtlar; kimlik kaydının kendisi (ve onu değiştiren talepler) burada.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PendingChangeNotice } from "@/components/account/PendingChangeNotice";
import { ShareProfileCard } from "@/components/career/ShareProfileCard";
import { PanelCard, PanelRow, PanelSection } from "@/components/club/Panel";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  KeyValueRow,
  ScreenHeader,
  SkeletonCard,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  REQUEST_STATUS,
  REQUEST_TYPE_LABELS,
  accountRequestList,
  cancelAccountRequest,
  memberKeys,
  requestPlayerUnlink,
  type PanelMeExtras,
} from "@/lib/api/member/player";
import { getMyPenalties, getPanelMe } from "@/lib/api/panel";
import { getAccountRequests } from "@/lib/api/playerProfile";
import { cancelChangeRequest } from "@/lib/api/profile";
import { formatDateShort, formatDecimal, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, space, textScale, type, upperTR } from "@/theme";

/** Web FIELD_LABELS — değişiklik talebinde hangi alanın değiştiği. */
const FIELD_LABELS: Record<string, string> = {
  player_name: "Ad soyad",
  player_img: "Fotoğraf",
  player_position: "Mevki",
  birth_date: "Doğum tarihi",
  nationality: "Uyruk",
  phone: "Telefon",
  email: "E-posta",
  city: "İl",
  city_id: "İl",
  sponsor_name: "Sponsor adı",
  placement: "Konum",
  link_url: "Bağlantı",
  image_url: "Görsel",
  active: "Yayın durumu",
};

const CHANGE_TITLES: Record<string, string> = {
  player_update: "Profil değişikliğin",
  sponsor_update: "Sponsor alanı değişikliğin",
};

function changedFields(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const labels = new Set(
    Object.keys(payload as Record<string, unknown>)
      .filter((key) => key !== "slot_index")
      .map((key) => FIELD_LABELS[key] ?? key),
  );
  return [...labels].join(", ");
}

export default function MyPlayerProfileScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [shareOpen, setShareOpen] = useState(false);

  const me = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const requests = useQuery({
    queryKey: memberKeys.accountRequests,
    queryFn: getAccountRequests,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  const penalties = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user?.player_id),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(
    useCallback(() => {
      void me.refetch();
      void requests.refetch();
    }, [me, requests]),
    { refreshing: me.isRefetching || requests.isRefetching },
  );

  const data = me.data as (typeof me.data & PanelMeExtras) | undefined;
  const player = data?.player ?? null;
  const team = data?.playerTeam ?? null;
  const stats = data?.stats ?? null;

  const playerRequests = useMemo(
    () => accountRequestList(requests.data).filter((item) => String(item.type).startsWith("player_")),
    [requests.data],
  );
  const unlinkPending = playerRequests.some((item) => item.status === "pending" && item.type === "player_unlink");
  const changes = useMemo(
    () =>
      ((data?.pendingChanges ?? []) as (NonNullable<typeof data>["pendingChanges"][number] & { payload?: unknown })[]).filter(
        (item) => item.status === "pending" && (item.type === "player_update" || item.type === "sponsor_update"),
      ),
    [data?.pendingChanges],
  );
  const profilePending = changes.some((item) => item.type === "player_update");

  /* ------------------------------ İŞLEMLER ----------------------------- */

  const afterRequest = useCallback(
    (message: string) => {
      toast.show({ message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: memberKeys.accountRequests });
    },
    [queryClient, toast],
  );
  const onFail = useCallback(
    (fallback: string) => (error: unknown) =>
      toast.show({ message: error instanceof ApiError ? error.userMessage : fallback, tone: "danger" }),
    [toast],
  );

  const unlink = useMutation({
    mutationFn: () => requestPlayerUnlink(),
    onSuccess: (result) => afterRequest(result.message || "Bağlantı koparma talebin yönetici onayına gönderildi."),
    onError: onFail("Talep gönderilemedi."),
  });
  const cancelRequest = useMutation({
    mutationFn: (id: number) => cancelAccountRequest(id),
    onSuccess: (result) => afterRequest(result.message || "Talebin geri çekildi."),
    onError: onFail("Talep geri çekilemedi."),
  });
  const cancelChange = useMutation({
    mutationFn: (id: number) => cancelChangeRequest(id),
    onSuccess: (result) => {
      toast.show({ message: result.message || "Değişiklik talebin geri çekildi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
    },
    onError: onFail("Değişiklik talebi geri çekilemedi."),
  });

  const confirmUnlink = useCallback(() => {
    Alert.alert(
      "Bu oyuncu ben değilim",
      "Bağlantı koparma talebin lig yönetimine iletilecek.\n\n" +
        "· Talep onaylanana kadar profil bağlı kalır; talebi geri çekebilirsin.\n" +
        "· Onaylanırsa hesabının bu oyuncu profiliyle bağlantısı kaldırılır.\n" +
        "· Oyuncu kaydı ve istatistikleri silinmez, yalnız senden ayrılır.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Talebi gönder", style: "destructive", onPress: () => unlink.mutate() },
      ],
    );
  }, [unlink]);

  const confirmCancel = useCallback(
    (id: number, label: string) =>
      Alert.alert("Talebi geri çek", `“${label}” talebin geri çekilecek. Dilediğin zaman yeniden gönderebilirsin.`, [
        { text: "Vazgeç", style: "cancel" },
        { text: "Geri çek", style: "destructive", onPress: () => cancelRequest.mutate(id) },
      ]),
    [cancelRequest],
  );

  const go = useCallback((href: string) => router.push(href as Href), [router]);

  /* ------------------------------- KAPILAR ------------------------------ */

  if (!auth.user && !auth.initializing) return <Redirect href="/giris" />;

  const header = (
    <ScreenHeader
      title="Oyuncu Profilim"
      overline={player ? upperTR(player.player_name) : undefined}
      back
      scrollY={scrollY}
      actions={
        player
          ? [
              { icon: "share-social-outline", onPress: () => setShareOpen(true), accessibilityLabel: "Profil kartımı paylaş" },
              { icon: "create-outline", onPress: () => go("/oyuncum/duzenle"), accessibilityLabel: "Bilgilerimi düzenle" },
            ]
          : undefined
      }
    />
  );

  if (auth.initializing || me.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (me.isError && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={me.error} onRetry={me.refetch} />
      </SafeAreaView>
    );
  }

  if (!player) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="person-add-outline"
          title="Oyuncu profilin bağlı değil"
          body="Ligde maça çıktıysan kaydın büyük ihtimalle zaten var: kendini bulup sahiplen. Yoksa yeni profil talebi aç."
          action={{ label: "Profilimi bul ve bağla", onPress: () => go("/oyuncum/bagla") }}
          secondaryAction={{ label: "Profil modları", onPress: () => go("/oyuncum/modlar") }}
        />
      </SafeAreaView>
    );
  }

  const openPenalties = (penalties.data?.items ?? []).filter((item) => item.status !== "cas_karari").length;
  const rating = stats?.rating != null && Number(stats.rating) > 0 ? formatDecimal(stats.rating, 1) : "—";
  const scopeLabel = stats?.scope === "career" ? "Kariyer" : stats?.season ? `${stats.season} sezonu` : "Bu sezon";
  const info: [string, string | null | undefined][] = [
    ["Ad soyad", player.player_name],
    ["Mevki", player.player_position],
    ["Uyruk", player.nationality],
    ["Doğum tarihi", player.birth_date ? formatDateShort(player.birth_date) : null],
    ["İl", player.city],
    ["Telefon", player.phone],
    ["E-posta", player.email],
    ["Oynadığı takım", team?.team_name ?? "Serbest oyuncu"],
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}
      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {/* Kimlik */}
        <View style={styles.pad}>
          <PanelCard style={styles.identity}>
            <Avatar name={player.player_name} image={mediaUrl(player.player_img)} size={56} ring="brand" />
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                {player.player_name}
              </Text>
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {[player.player_position, team?.team_name ?? "Serbest oyuncu"].filter(Boolean).join(" · ")}
              </Text>
              <View style={styles.badges}>
                <Badge label="DOĞRULANMIŞ" tone="win" size="xs" icon="checkmark-circle" />
                {profilePending ? <Badge label="DEĞİŞİKLİK ONAYDA" tone="warn" size="xs" /> : null}
              </View>
            </View>
          </PanelCard>
        </View>

        {/* Onay bekleyen değişiklikler */}
        {changes.length ? (
          <PanelSection title="Onay bekleyen değişiklikler" meta={String(changes.length)}>
            {changes.map((change) =>
              change.type === "player_update" ? (
                <View key={change.id} style={styles.gap}>
                  <PendingChangeNotice changeId={change.id} createdAt={change.created_at} subject={CHANGE_TITLES[change.type]} />
                  {changedFields(change.payload) ? (
                    <Text style={styles.note} {...textScale.dense}>
                      Değişen alanlar: {changedFields(change.payload)}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <PanelCard key={change.id} padded={false}>
                  <PanelRow
                    icon="megaphone"
                    tone="warn"
                    title={CHANGE_TITLES[change.type] ?? "Değişiklik talebi"}
                    hint={[changedFields(change.payload), change.created_at ? formatDateShort(change.created_at) : null].filter(Boolean).join(" · ")}
                    value="İnceleniyor"
                    last
                  />
                  <View style={styles.rowAction}>
                    <Button
                      label="Geri çek"
                      size="sm"
                      variant="secondary"
                      icon="arrow-undo-outline"
                      loading={cancelChange.isPending && cancelChange.variables === change.id}
                      onPress={() =>
                        Alert.alert("Talebi geri çek", "Onay bekleyen değişikliğin iptal edilir; istersen yeniden düzenleyip gönderebilirsin.", [
                          { text: "Vazgeç", style: "cancel" },
                          { text: "Geri çek", style: "destructive", onPress: () => cancelChange.mutate(change.id) },
                        ])
                      }
                    />
                  </View>
                </PanelCard>
              ),
            )}
          </PanelSection>
        ) : null}

        {/* Kişisel bilgiler */}
        <PanelSection
          title="Kişisel bilgiler"
          action={profilePending ? undefined : { label: "Düzenle", onPress: () => go("/oyuncum/duzenle") }}
        >
          <View>
            {info.map(([label, value], index) => (
              <KeyValueRow
                key={label}
                label={label}
                value={value || "—"}
                position={index === 0 ? "first" : index === info.length - 1 ? "last" : "middle"}
              />
            ))}
          </View>
          <Text style={styles.note} {...textScale.long}>
            Değişiklikler yönetici onayından sonra profilinde yayınlanır. Onay beklerken yeni değişiklik gönderilemez.
          </Text>
        </PanelSection>

        {/* Sezon özeti + disiplin */}
        <PanelSection title={scopeLabel}>
          <PanelCard padded={false}>
            <PanelRow
              icon="stats-chart"
              tone="accent"
              title={`${stats?.matches ?? 0} maç · ${stats?.goals ?? 0} gol · ${stats?.assists ?? 0} asist`}
              hint={`Puan ortalaması ${rating} · ${stats?.yellow_cards ?? 0} sarı · ${stats?.red_cards ?? 0} kırmızı`}
              onPress={() => go("/oyuncum?tab=istatistik")}
            />
            <PanelRow
              icon="shield-checkmark"
              tone={openPenalties ? "danger" : "neutral"}
              title="Disiplin dosyalarım"
              hint={openPenalties ? "Süreci açık dosya var — savunma sürelerini kontrol et" : "Açık dosya yok"}
              count={openPenalties}
              onPress={() => go("/cezalarim")}
              last
            />
          </PanelCard>
        </PanelSection>

        {/* Taleplerim */}
        <PanelSection title="Taleplerim" meta={playerRequests.length ? String(playerRequests.length) : undefined}>
          {playerRequests.length ? (
            <PanelCard padded={false}>
              {playerRequests.map((request, index) => {
                const status = REQUEST_STATUS[request.status] ?? { label: request.status, tone: "neutral" as const };
                const label = REQUEST_TYPE_LABELS[request.type] ?? request.type;
                const note = request.adminNote ?? request.admin_note ?? request.reviewNote ?? null;
                const created = request.createdAt ?? request.created_at ?? null;
                const last = index === playerRequests.length - 1;
                return (
                  <View key={request.id}>
                    <PanelRow
                      icon={request.status === "pending" ? "hourglass" : request.status === "approved" ? "checkmark-circle" : "close-circle"}
                      tone={status.tone}
                      title={label}
                      hint={[created ? formatDateShort(created) : null, note ? `Yönetici notu: ${note}` : null].filter(Boolean).join(" · ") || undefined}
                      value={status.label}
                      last={last || request.status === "pending"}
                    />
                    {request.status === "pending" ? (
                      <View style={[styles.rowAction, !last && styles.rowActionDivider]}>
                        <Button
                          label="Talebi geri çek"
                          size="sm"
                          variant="secondary"
                          icon="arrow-undo-outline"
                          loading={cancelRequest.isPending && cancelRequest.variables === request.id}
                          onPress={() => confirmCancel(request.id, label)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </PanelCard>
          ) : (
            <Text style={styles.note} {...textScale.dense}>
              {requests.isError ? "Talepler alınamadı; aşağı çekerek yenile." : "Bu alanda yönetici onayı bekleyen talebin yok."}
            </Text>
          )}
        </PanelSection>

        {/* Eylemler */}
        <PanelSection title="Profil">
          <PanelCard padded={false}>
            <PanelRow icon="eye" tone="brand" title="Herkese açık profilim" hint="Ziyaretçilerin gördüğü sayfa" onPress={() => go(`/oyuncu/${player.id}`)} />
            <PanelRow icon="share-social" tone="accent" title="Profil kartımı paylaş" hint="Sezon istatistiklerinle görsel kart" onPress={() => setShareOpen(true)} />
            <PanelRow icon="megaphone" tone="warn" title="Sponsorluklarım" hint="Profil sayfandaki sponsor alanları" onPress={() => go("/oyuncum/sponsorlar")} />
            <PanelRow icon="toggle" tone="neutral" title="Profil modları" hint="Oyuncu / takım başkanı alanı" onPress={() => go("/oyuncum/modlar")} last />
          </PanelCard>
          <Button
            label={unlinkPending ? "Koparma talebi onayda" : "Bu oyuncu ben değilim"}
            icon="person-remove-outline"
            variant="ghost"
            onPress={confirmUnlink}
            disabled={unlinkPending || unlink.isPending}
            loading={unlink.isPending}
            fullWidth
            accessibilityHint="Bu oyuncu profili sana ait değilse bağlantıyı koparma talebi gönderir"
          />
        </PanelSection>
      </ScrollView>

      <ShareProfileCard
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        data={{
          name: player.player_name,
          image: mediaUrl(player.player_img),
          position: player.player_position,
          teamName: team?.team_name ?? null,
          scopeLabel,
          matches: Number(stats?.matches ?? 0),
          goals: Number(stats?.goals ?? 0),
          assists: Number(stats?.assists ?? 0),
          rating,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space.sm, paddingBottom: space.giant },
  loading: { gap: space.md, padding: layout.screenPadding },
  pad: { paddingHorizontal: layout.screenPadding },
  flex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { ...type.h2, color: colors.textPrimary },
  meta: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xxs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.s },
  gap: { gap: space.xs },
  note: { ...type.caption, color: colors.textTertiary },
  rowAction: { paddingHorizontal: space.md, paddingBottom: space.m, alignItems: "flex-start" },
  rowActionDivider: { borderBottomWidth: hairline, borderBottomColor: colors.border },
});
