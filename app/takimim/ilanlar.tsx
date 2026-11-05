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
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PanelCard, PanelEmpty, PanelRow, PanelSection } from "@/components/club/Panel";
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
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
import { colors, layout, space, textScale, type } from "@/theme";

type Section = "basvuru" | "davet";
const SECTIONS: SegmentedItem<Section>[] = [
  { key: "basvuru", label: "Başvurular" },
  { key: "davet", label: "Davetlerim" },
];
const STATUS = {
  pending: { label: "Bekliyor", tone: "warn" },
  accepted: { label: "Kabul", tone: "win" },
  rejected: { label: "Ret", tone: "danger" },
  cancelled: { label: "Geri çekildi", tone: "neutral" },
} as const;

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
        <PanelSection title="Oyuncu arıyoruz ilanı" meta={openRecruitment ? "yayında" : undefined}>
          {recruitments.isLoading ? (
            <SkeletonCard lines={2} />
          ) : openRecruitment ? (
            <PanelCard style={styles.recruit}>
              <View style={styles.positions}>
                {openRecruitment.positions.map((code) => (
                  <Badge key={code} label={positionLabel(code)} tone="brand" size="sm" />
                ))}
              </View>
              {openRecruitment.note ? (
                <Text style={styles.note} {...textScale.long}>
                  {openRecruitment.note}
                </Text>
              ) : null}
              <Text style={styles.meta} {...textScale.dense}>
                {`${formatDateShort(openRecruitment.created_at)} tarihinde açıldı`}
              </Text>
              <Button
                label="İlanı kapat"
                variant="secondary"
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
            </PanelCard>
          ) : (
            <PanelEmpty
              icon="megaphone-outline"
              text="Açık ilanın yok. Aradığın mevkileri seç; serbest oyuncular takımını ilan vitrininde görüp başvursun."
              action={{ label: "İlan aç", onPress: () => setSheetOpen(true) }}
            />
          )}
        </PanelSection>

        <View style={styles.segment}>
          <SegmentedControl
            items={SECTIONS.map((item) =>
              item.key === "basvuru" && pendingApplications ? { ...item, label: `Başvurular (${pendingApplications})` } : item,
            )}
            value={section}
            onChange={setSection}
          />
        </View>

        {joins.isLoading ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
          </View>
        ) : joins.isError ? (
          <ErrorState variant="inline" error={joins.error} onRetry={joins.refetch} />
        ) : list.length === 0 ? (
          <PanelSection title={section === "basvuru" ? "Gelen başvurular" : "Gönderilen davetler"}>
            <PanelEmpty
              icon={section === "basvuru" ? "mail-open-outline" : "paper-plane-outline"}
              text={
                section === "basvuru"
                  ? "Henüz başvuru yok. İlan açarsan serbest oyuncular takımına başvurabilir."
                  : "Gönderilmiş davet yok. Serbest oyuncuyu arayıp tek dokunuşla davet et."
              }
              action={section === "davet" ? { label: "Serbest oyuncu ara", onPress: () => router.push("/takimim/oyuncu-ara?serbest=1" as Href) } : undefined}
            />
          </PanelSection>
        ) : (
          <PanelSection title={section === "basvuru" ? "Gelen başvurular" : "Gönderilen davetler"} meta={`${list.length}`}>
            <PanelCard padded={false}>
              {list.map((item, index) => (
                <RequestRow
                  key={item.id}
                  request={item}
                  last={index === list.length - 1}
                  busy={decide.isPending && decide.variables?.request.id === item.id}
                  onOpen={() => router.push(`/oyuncu/${item.player.id}`)}
                  onAccept={section === "basvuru" ? () => decide.mutate({ request: item, action: "accept" }) : undefined}
                  onReject={section === "basvuru" ? () => decide.mutate({ request: item, action: "reject" }) : undefined}
                  onCancel={section === "davet" ? () => decide.mutate({ request: item, action: "cancel" }) : undefined}
                />
              ))}
            </PanelCard>
          </PanelSection>
        )}
      </ScrollView>

      <RecruitmentSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onCreated={invalidate} />
    </SafeAreaView>
  );
}

function RequestRow({
  request,
  last,
  busy,
  onOpen,
  onAccept,
  onReject,
  onCancel,
}: {
  request: JoinRequest;
  last: boolean;
  busy: boolean;
  onOpen: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}) {
  const status = STATUS[request.status] ?? STATUS.pending;
  const pending = request.status === "pending";
  return (
    <View style={[styles.request, !last && styles.requestDivider]}>
      <PanelRow
        leading={<Avatar name={request.player.name ?? "?"} image={mediaUrl(request.player.image ?? null)} size={layout.crestLg} />}
        title={request.player.name ?? "Oyuncu"}
        hint={[positionLabel(request.player.position), formatDateShort(request.created_at), request.message].filter(Boolean).join(" · ")}
        value={pending ? undefined : status.label}
        onPress={onOpen}
        last
      />
      {pending && (onAccept || onCancel) ? (
        <View style={styles.requestActions}>
          {onAccept ? <Button label="Kadroya al" icon="checkmark" size="sm" onPress={onAccept} loading={busy} style={styles.flex} /> : null}
          {onReject ? <Button label="Reddet" variant="secondary" size="sm" onPress={onReject} disabled={busy} style={styles.flex} /> : null}
          {onCancel ? <Button label="Daveti geri çek" variant="secondary" size="sm" onPress={onCancel} loading={busy} style={styles.flex} /> : null}
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
  content: { paddingBottom: space.giant, paddingTop: space.xs },
  pad: { paddingHorizontal: layout.screenPadding },
  recruit: { gap: space.sm },
  positions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  note: { ...type.bodySm, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  segment: { paddingHorizontal: layout.screenPadding, marginTop: space.xl },
  request: {},
  requestDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  requestActions: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  flex: { flex: 1 },
  sheet: { gap: space.md, paddingBottom: space.md },
  label: { ...type.label, color: colors.textSecondary },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
});
