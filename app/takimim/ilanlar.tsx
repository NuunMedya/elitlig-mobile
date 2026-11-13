/**
 * İLANLAR VE BAŞVURULAR — "oyuncu arıyoruz" ilanı, gelen başvurular, davetler.
 * `/takimim/ilanlar?bolum=<basvuru|davet>`
 *
 * Web: pages/panel/JoinRequests.js (scope="team") + TransferMarket "ilan".
 * Takım tarafının üç işi tek ekranda:
 *   1. İLAN — POST /api/team-recruitments { positions[], note } · kapat
 *      POST /:id/close. Takımın tek açık ilanı olur; açıkken oyuncular ilan
 *      vitrininde takımı görür ve başvurur.
 *   2. BAŞVURULAR — GET /api/team-join-requests → inbox (type=application);
 *      kabul POST /:id/accept (oyuncu kadroya sözleşmesiz eklenir), ret /reject.
 *   3. DAVETLER — outbox (type=invite); bekleyen davet geri çekilir /:id/cancel.
 * Yeni davet ve transfer teklifi oyuncu aramasından (OfferCta) gönderilir.
 *
 * Önbellek anahtarları Kulübüm sayaçlarıyla ortaktır (["takim","join-requests"]).
 *
 * TASARIM (gece teması): üstte üç sayı (bekleyen başvuru · açık davet ·
 * ilan durumu); İLAN KARTI megafon ikonu, "Yayında" hapı, aranan mevkiler
 * büyük haplar hâlinde, not alıntı çizgisiyle; altta açılış zamanı ve kapat.
 * Başvuru/davet KARTLARI: avatar + ad + mevki, durum hapı (bekliyor = warn,
 * kabul = win, ret = danger, geri çekildi = neutral), mesaj alıntısı ve
 * bekleyenlerde tam genişlik eylemler. Bekleyenler listenin başına gelir.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import {
  POSITIONS,
  acceptJoinRequest,
  cancelJoinRequest,
  closeRecruitment,
  createRecruitment,
  getJoinRequests,
  getMyRecruitments,
  positionLabel,
  rejectJoinRequest,
  type JoinRequest,
} from "@/lib/api/team";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Section = "basvuru" | "davet";
const SECTIONS: SegmentedItem<Section>[] = [
  { key: "basvuru", label: "Başvurular" },
  { key: "davet", label: "Davetlerim" },
];
const STATUS = {
  pending: { label: "Bekliyor", tone: "warn", icon: "hourglass-outline" },
  accepted: { label: "Kabul edildi", tone: "win", icon: "checkmark-circle" },
  rejected: { label: "Reddedildi", tone: "danger", icon: "close-circle" },
  cancelled: { label: "Geri çekildi", tone: "neutral", icon: "arrow-undo" },
} as const;

function ago(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 30) return `${days} gün önce`;
  return formatDateShort(value);
}

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.userMessage : fallback);

export default function RecruitmentScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const access = useTeamAccess();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ bolum?: string }>();
  const [section, setSection] = useState<Section>(params.bolum === "davet" ? "davet" : "basvuru");
  const [sheetOpen, setSheetOpen] = useState(false);

  const enabled = Boolean(auth.user) && access.canManage;
  const joins = useQuery({ queryKey: ["takim", "join-requests"], queryFn: getJoinRequests, enabled, staleTime: 30_000, retry: false });
  const recruitments = useQuery({ queryKey: ["takim", "recruitments", "mine"], queryFn: getMyRecruitments, enabled, staleTime: 60_000, retry: false });
  const refresh = useRefresh(() => Promise.all([joins.refetch(), recruitments.refetch()]), { refreshing: joins.isRefetching });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["takim", "join-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "recruitments"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
  };

  const decide = useMutation({
    mutationFn: ({ request, action }: { request: JoinRequest; action: "accept" | "reject" | "cancel" }) =>
      action === "accept" ? acceptJoinRequest(request.id) : action === "reject" ? rejectJoinRequest(request.id) : cancelJoinRequest(request.id),
    onSuccess: (result, { action }) => {
      invalidate();
      toast.show({
        message: result.message ?? (action === "accept" ? "Başvuru kabul edildi." : action === "reject" ? "Başvuru reddedildi." : "Davet geri çekildi."),
        tone: action === "accept" ? "success" : "neutral",
      });
    },
    onError: (error) => toast.show({ message: errorText(error, "İşlem tamamlanamadı."), tone: "danger" }),
  });

  const close = useMutation({
    mutationFn: (id: number) => closeRecruitment(id),
    onSuccess: (result) => {
      invalidate();
      toast.show({ message: result.message ?? "İlan kapatıldı.", tone: "neutral" });
    },
    onError: (error) => toast.show({ message: errorText(error, "İlan kapatılamadı."), tone: "danger" }),
  });

  if (!auth.user) return <Redirect href="/giris" />;
  if (!access.loading && !access.canManage) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="İlanlar ve başvurular" back />
        <EmptyState icon="shield-outline" title="Takım yönetimi gerekiyor" body="İlan açmak ve başvuruları yanıtlamak takım başkanına özel." />
      </SafeAreaView>
    );
  }

  const openRecruitment = (recruitments.data?.items ?? []).find((item) => item.status === "open") ?? null;
  const applications = (joins.data?.inbox ?? []).filter((item) => item.type === "application");
  const invites = (joins.data?.outbox ?? []).filter((item) => item.type === "invite");
  const list = section === "basvuru" ? applications : invites;
  const pendingApplications = applications.filter((item) => item.status === "pending").length;

  const pendingInvites = invites.filter((item) => item.status === "pending").length;
  /* Bekleyenler başa; kendi içinde sunucunun sırası korunur. */
  const sorted = [...list].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="İlanlar ve başvurular"
        subtitle={access.teamName ?? undefined}
        back
        scrollY={scrollY}
        actions={[{ icon: "person-add-outline", onPress: () => router.push("/takimim/oyuncu-ara?serbest=1" as Href), accessibilityLabel: "Serbest oyuncu ara ve davet et" }]}
      />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        <Reveal index={0}>
          <MetricGrid columns={3}>
            <MetricTile
              label="Aday"
              value={joins.isLoading ? "…" : String(pendingApplications)}
              hint="başvuru bekliyor"
              icon="mail-unread"
              tone={pendingApplications ? "warn" : "neutral"}
            />
            <MetricTile
              label="Davet"
              value={joins.isLoading ? "…" : String(pendingInvites)}
              hint="yanıt bekliyor"
              icon="paper-plane"
              tone="accent"
            />
            <MetricTile
              label="İlan"
              value={recruitments.isLoading ? "…" : openRecruitment ? "Açık" : "Yok"}
              hint={openRecruitment ? `${openRecruitment.positions.length} mevki` : "vitrinde değil"}
              icon="megaphone"
              tone={openRecruitment ? "win" : "neutral"}
            />
          </MetricGrid>
        </Reveal>

        <View style={styles.block}>
          <SectionHeader title="Oyuncu arıyoruz ilanı" inset="flush" />
          {recruitments.isLoading ? (
            <Skeleton height={176} radius="xl" />
          ) : openRecruitment ? (
            <Reveal index={1}>
              <View style={styles.adCard}>
                <View style={styles.adHead}>
                  <IconTile icon="megaphone" tone="gold" size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.adTitle} {...textScale.dense}>
                      Kadroya oyuncu arıyoruz
                    </Text>
                    <Text style={styles.meta} {...textScale.dense}>
                      {`${ago(openRecruitment.created_at)} açıldı · ${applications.length} başvuru`}
                    </Text>
                  </View>
                  <Badge label="Yayında" tone="win" icon="radio" size="sm" />
                </View>
                <View style={styles.positions}>
                  {openRecruitment.positions.map((code) => (
                    <View key={code} style={styles.posChip}>
                      <Text style={styles.posCode} {...textScale.badge}>
                        {code}
                      </Text>
                      <Text style={styles.posLabel} {...textScale.dense}>
                        {positionLabel(code)}
                      </Text>
                    </View>
                  ))}
                </View>
                {openRecruitment.note ? (
                  <View style={styles.quote}>
                    <Text style={styles.note} {...textScale.long}>
                      {openRecruitment.note}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.adFooter}>
                  <Text style={styles.meta} {...textScale.dense}>
                    {`${formatDateShort(openRecruitment.created_at)} tarihinde açıldı`}
                  </Text>
                  <Button
                    label="İlanı kapat"
                    variant="ghost"
                    size="sm"
                    icon="close-circle-outline"
                    loading={close.isPending}
                    onPress={() =>
                      Alert.alert("İlanı kapat", "İlan vitrinden kalkar; gelmiş başvurular kalır.", [
                        { text: "Vazgeç", style: "cancel" },
                        { text: "Kapat", style: "destructive", onPress: () => close.mutate(openRecruitment.id) },
                      ])
                    }
                  />
                </View>
              </View>
            </Reveal>
          ) : (
            <Touchable onPress={() => setSheetOpen(true)} feedback="card" accessibilityRole="button" accessibilityLabel="İlan aç" style={styles.adEmpty}>
              <IconTile icon="megaphone-outline" tone="neutral" size={42} glow={false} />
              <View style={styles.flex}>
                <Text style={styles.adTitle} {...textScale.dense}>
                  Açık ilanın yok
                </Text>
                <Text style={styles.meta} {...textScale.long}>
                  Aradığın mevkileri seç; serbest oyuncular takımını ilan vitrininde görüp başvursun.
                </Text>
              </View>
              <Badge label="İlan aç" tone="brand" variant="solid" icon="add" size="sm" />
            </Touchable>
          )}
        </View>

        <View style={styles.block}>
          <SegmentedControl
            items={SECTIONS.map((item) =>
              item.key === "basvuru" && pendingApplications ? { ...item, label: `Başvurular (${pendingApplications})` } : item,
            )}
            value={section}
            onChange={setSection}
          />
        </View>

        <View style={styles.block}>
          <SectionHeader
            title={section === "basvuru" ? "Gelen başvurular" : "Gönderilen davetler"}
            meta={list.length ? `${list.length}` : undefined}
            inset="flush"
            action={section === "davet" ? { label: "Davet et", onPress: () => router.push("/takimim/oyuncu-ara?serbest=1" as Href) } : undefined}
          />
          {joins.isLoading ? (
            <View style={styles.stack}>
              <Skeleton height={132} radius="xl" />
              <Skeleton height={132} radius="xl" />
            </View>
          ) : joins.isError ? (
            <ErrorState variant="inline" error={joins.error} onRetry={joins.refetch} />
          ) : list.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={section === "basvuru" ? "mail-open-outline" : "paper-plane-outline"}
              title={section === "basvuru" ? "Henüz başvuru yok" : "Gönderilmiş davet yok"}
              body={
                section === "basvuru"
                  ? "İlan açarsan serbest oyuncular takımına başvurabilir."
                  : "Serbest oyuncuyu arayıp tek dokunuşla davet et."
              }
              action={
                section === "davet"
                  ? { label: "Serbest oyuncu ara", onPress: () => router.push("/takimim/oyuncu-ara?serbest=1" as Href) }
                  : !openRecruitment
                    ? { label: "İlan aç", onPress: () => setSheetOpen(true) }
                    : undefined
              }
            />
          ) : (
            <View style={styles.stack}>
              {sorted.map((item, index) => (
                <Reveal key={item.id} index={index} limit={8} distance={8}>
                  <RequestCard
                    request={item}
                    busy={decide.isPending && decide.variables?.request.id === item.id}
                    onOpen={() => router.push(`/oyuncu/${item.player.id}`)}
                    onAccept={section === "basvuru" ? () => decide.mutate({ request: item, action: "accept" }) : undefined}
                    onReject={section === "basvuru" ? () => decide.mutate({ request: item, action: "reject" }) : undefined}
                    onCancel={section === "davet" ? () => decide.mutate({ request: item, action: "cancel" }) : undefined}
                  />
                </Reveal>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <RecruitmentSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onCreated={invalidate} />
    </SafeAreaView>
  );
}

function RequestCard({
  request,
  busy,
  onOpen,
  onAccept,
  onReject,
  onCancel,
}: {
  request: JoinRequest;
  busy: boolean;
  onOpen: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}) {
  const status = STATUS[request.status] ?? STATUS.pending;
  const pending = request.status === "pending";
  return (
    <View style={[styles.reqCard, pending && styles.reqPending]}>
      {pending ? <View style={styles.reqStripe} /> : null}
      <Touchable
        onPress={onOpen}
        feedback="row"
        accessibilityRole="button"
        accessibilityLabel={[request.player.name, positionLabel(request.player.position), status.label].filter(Boolean).join(", ")}
        style={styles.reqTop}
      >
        <Avatar name={request.player.name ?? "?"} image={mediaUrl(request.player.image ?? null)} size={44} />
        <View style={styles.flex}>
          <Text style={styles.reqName} numberOfLines={1} {...textScale.dense}>
            {request.player.name ?? "Oyuncu"}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[positionLabel(request.player.position), ago(request.created_at)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} icon={status.icon} size="sm" />
      </Touchable>
      {request.message ? (
        <View style={[styles.quote, styles.reqQuote]}>
          <Text style={styles.note} numberOfLines={3} {...textScale.long}>
            {request.message}
          </Text>
        </View>
      ) : null}
      {pending && (onAccept || onCancel) ? (
        <View style={styles.requestActions}>
          {onAccept ? <Button label="Kadroya al" icon="checkmark" size="sm" onPress={onAccept} loading={busy} style={styles.flex} /> : null}
          {onReject ? <Button label="Reddet" variant="secondary" size="sm" onPress={onReject} disabled={busy} style={styles.flex} /> : null}
          {onCancel ? <Button label="Daveti geri çek" variant="secondary" size="sm" icon="arrow-undo" onPress={onCancel} loading={busy} style={styles.flex} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function RecruitmentSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const create = useMutation({
    mutationFn: () => createRecruitment(selected, note.trim() || undefined),
    onSuccess: (result) => {
      onCreated();
      toast.show({ message: result.message ?? "İlan yayına alındı.", tone: "success" });
      setSelected([]);
      setNote("");
      onClose();
    },
    onError: (error) => toast.show({ message: errorText(error, "İlan açılamadı."), tone: "danger" }),
  });
  const toggle = (code: string) =>
    setSelected((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Oyuncu arıyoruz"
      snap="content"
      footer={<Button label="İlanı yayınla" icon="megaphone-outline" onPress={() => create.mutate()} loading={create.isPending} disabled={!selected.length} fullWidth />}
    >
      <View style={styles.sheet}>
        <Text style={styles.label} {...textScale.dense}>
          Aradığın mevkiler
        </Text>
        <View style={styles.chipWrap}>
          {POSITIONS.map((item) => (
            <Chip key={item.code} size="sm" label={item.label} selected={selected.includes(item.code)} onPress={() => toggle(item.code)} />
          ))}
        </View>
        <Input label="Not (isteğe bağlı)" size="sm" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Antrenman günleri, beklentiler…" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant, paddingTop: space.md },
  block: { marginTop: space.xl },
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  meta: { ...type.caption, color: colors.textTertiary },
  note: { ...type.bodySm, color: colors.textSecondary },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.brandBorder, paddingLeft: space.sm },

  /* İlan kartı */
  adCard: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  adHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  adTitle: { ...type.h3, color: colors.textPrimary },
  positions: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  posChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingLeft: space.xs,
    paddingRight: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  posCode: {
    ...type.micro,
    color: colors.textOnBrand,
    backgroundColor: colors.brand,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  posLabel: { ...type.labelSm, color: colors.brandAccent },
  adFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  adEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface1,
  },

  /* Başvuru / davet kartı */
  reqCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  reqPending: { borderColor: colors.glassLine },
  reqStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.warn },
  reqTop: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  reqName: { ...type.h4, color: colors.textPrimary },
  reqQuote: { marginHorizontal: space.md, marginBottom: space.md, marginTop: -space.xs },
  requestActions: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  sheet: { gap: space.md, paddingBottom: space.md },
  label: { ...type.label, color: colors.textSecondary },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
});
