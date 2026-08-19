import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
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

/**
 * Davet ve Başvurular — oyuncu ve başkanın ortak ekranı.
 *
 * Gelen kutusu: oyuncuya kadro davetleri, başkana katılım başvuruları
 * (GET /api/team-join-requests → inbox). Bekleyenler kabul/ret ile
 * yanıtlanır; kabul oyuncuyu sözleşmesiz olarak kadroya taşır.
 * Giden kutusu: üyenin başlattığı talepler; bekleyenler geri çekilebilir.
 *
 * Oyuncu tarafı: "Oyuncu Arayan Takımlar" ilanları (GET /api/team-
 * recruitments) ve takıma başvuru penceresi. Yalnızca serbest oyuncular
 * başvurabilir; takımı olanların geçişi transfer teklifiyle yürür
 * (sunucu 409 PLAYER_ALREADY_IN_TEAM döndürür).
 *
 * Başkan tarafı: tek açık "Oyuncu Arıyoruz" ilanı (GET /mine); yoksa
 * mevki + not ile açılır, varsa kapatılabilir.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  cancelled: "Geri çekildi",
};

export default function InvitesScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [applyTo, setApplyTo] = useState<{ teamId: number; teamName: string } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const isPlayer = Boolean(auth.user?.player_id);
  const isPresident = Boolean(auth.user?.managed_team_id);

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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["takim", "join-requests"] });
    queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
  };

  const actionError = (error: unknown) => {
    Alert.alert(
      "İşlem yapılamadı",
      error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
    );
  };

  const acceptMutation = useMutation({
    mutationFn: (id: number) => acceptJoinRequest(id),
    onSuccess: (result) => {
      Alert.alert("Tamamdır", result.message);
      refresh();
    },
    onError: actionError,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectJoinRequest(id),
    onSuccess: refresh,
    onError: actionError,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelJoinRequest(id),
    onSuccess: refresh,
    onError: actionError,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const confirmAccept = (request: JoinRequest) => {
    const text =
      request.type === "invite"
        ? `${request.team.name ?? "Takım"} davetini kabul edersen kadroya ekleneceksin.`
        : `${request.player.name ?? "Oyuncu"} başvurusunu kabul edersen kadrona eklenecek.`;
    Alert.alert("Kabul et", text, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Kabul et", onPress: () => acceptMutation.mutate(request.id) },
    ]);
  };

  const confirmReject = (request: JoinRequest) => {
    Alert.alert("Reddet", "Bu talebi reddetmek istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Reddet", style: "destructive", onPress: () => rejectMutation.mutate(request.id) },
    ]);
  };

  const confirmCancel = (request: JoinRequest) => {
    Alert.alert("Geri çek", "Bu talebi geri çekmek istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Geri çek", style: "destructive", onPress: () => cancelMutation.mutate(request.id) },
    ]);
  };

  const inbox = requestsQuery.data?.inbox ?? [];
  const outbox = requestsQuery.data?.outbox ?? [];
  const recruitments = recruitmentsQuery.data?.items ?? [];
  const openRecruitment =
    (myRecruitmentQuery.data?.items ?? []).find((item) => item.status === "open") ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Davet ve Başvurular" subtitle="Kadro davetleri ve katılım talepleri" />

      {requestsQuery.isLoading ? (
        <Loading />
      ) : requestsQuery.isError ? (
        <ErrorState error={requestsQuery.error} onRetry={requestsQuery.refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Başkan: oyuncu arıyoruz ilanı */}
          {isPresident ? (
            <RecruitmentCard
              query={myRecruitmentQuery}
              openRecruitment={openRecruitment}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: ["takim", "recruitments"] });
                queryClient.invalidateQueries({ queryKey: ["takim", "recruitments", "mine"] });
              }}
            />
          ) : null}

          {/* Oyuncu: başvuru düğmesi + ilan vitrinleri */}
          {isPlayer ? (
            <>
              <Pressable
                onPress={() => {
                  setApplyTo(null);
                  setApplyOpen(true);
                }}
                style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}
              >
                <Ionicons name="paper-plane-outline" size={15} color={colors.surface} />
                <Text style={styles.applyBtnText}>Takıma Başvur</Text>
              </Pressable>

              {recruitments.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>OYUNCU ARAYAN TAKIMLAR</Text>
                  <FlatList
                    horizontal
                    data={recruitments}
                    keyExtractor={(item) => String(item.id)}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recruitList}
                    renderItem={({ item }) => (
                      <RecruitmentAd
                        item={item}
                        onPress={() => {
                          if (!item.team) return;
                          setApplyTo({ teamId: item.team.id, teamName: item.team.name });
                          setApplyOpen(true);
                        }}
                      />
                    )}
                  />
                </View>
              ) : null}
            </>
          ) : null}

          {/* Gelen kutusu */}
          <Text style={styles.sectionTitle}>GELEN</Text>
          {inbox.length === 0 ? (
            <Text style={styles.emptyLine}>
              {isPresident
                ? "Takımına katılım başvurusu geldiğinde burada görünür."
                : "Bir takım seni kadrosuna davet ettiğinde burada görünür."}
            </Text>
          ) : (
            inbox.map((request) => (
              <RequestCard
                key={`in-${request.id}`}
                request={request}
                inbox
                onAccept={() => confirmAccept(request)}
                onReject={() => confirmReject(request)}
                busy={acceptMutation.isPending || rejectMutation.isPending}
              />
            ))
          )}

          {/* Giden kutusu */}
          <Text style={styles.sectionTitle}>GÖNDERİLEN</Text>
          {outbox.length === 0 ? (
            <Text style={styles.emptyLine}>Gönderdiğin davet ve başvurular burada listelenir.</Text>
          ) : (
            outbox.map((request) => (
              <RequestCard
                key={`out-${request.id}`}
                request={request}
                inbox={false}
                onCancel={() => confirmCancel(request)}
                busy={cancelMutation.isPending}
              />
            ))
          )}
        </ScrollView>
      )}

      {applyOpen ? (
        <ApplicationModal
          preselected={applyTo}
          onClose={() => setApplyOpen(false)}
          onSent={() => {
            setApplyOpen(false);
            refresh();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Gelen/giden talep kartı. */
function RequestCard({
  request,
  inbox,
  onAccept,
  onReject,
  onCancel,
  busy,
}: {
  request: JoinRequest;
  inbox: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  busy?: boolean;
}) {
  // Gelen davet oyuncuya takımdan; gelen başvuru başkana oyuncudan gelir.
  // Gidenlerde tersinden: davet gönderen başkan oyuncuyu, başvuran oyuncu takımı görür.
  const showTeam = inbox ? request.type === "invite" : request.type === "application";
  const title = showTeam ? request.team.name ?? "Takım" : request.player.name ?? "Oyuncu";
  const kindLabel = request.type === "invite" ? "Kadro daveti" : "Katılım başvurusu";
  const pending = request.status === "pending";

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {showTeam ? (
          <TeamCrest name={request.team.name} logo={mediaUrl(request.team.logo ?? null)} size={36} />
        ) : (
          <PlayerAvatar
            name={request.player.name}
            image={mediaUrl(request.player.image ?? null)}
            size={36}
          />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {kindLabel}
            {!showTeam && request.player.position ? ` · ${request.player.position}` : ""}
            {request.created_at ? ` · ${formatDateShort(request.created_at)}` : ""}
          </Text>
        </View>
        <View
          style={[
            styles.statusChip,
            request.status === "accepted" && styles.statusOk,
            (request.status === "rejected" || request.status === "cancelled") && styles.statusBad,
          ]}
        >
          <Text style={styles.statusText}>{STATUS_LABELS[request.status] ?? request.status}</Text>
        </View>
      </View>

      {request.message ? (
        <Text style={styles.message} numberOfLines={3}>
          “{request.message}”
        </Text>
      ) : null}

      {inbox && pending ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={onReject}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.rejectBtn, pressed && styles.pressed]}
          >
            <Text style={styles.rejectText}>Reddet</Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.acceptBtn, pressed && styles.pressed]}
          >
            <Ionicons name="checkmark" size={15} color={colors.surface} />
            <Text style={styles.acceptText}>Kabul et</Text>
          </Pressable>
        </View>
      ) : null}

      {!inbox && pending ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={onCancel}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.rejectBtn, pressed && styles.pressed]}
          >
            <Text style={styles.rejectText}>Geri çek</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Oyuncu arayan takım ilanı — yatay vitrin kartı. */
function RecruitmentAd({ item, onPress }: { item: Recruitment; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.adCard, pressed && styles.pressed]}>
      <View style={styles.adHead}>
        <TeamCrest name={item.team?.name} logo={mediaUrl(item.team?.logo ?? null)} size={30} />
        <View style={styles.cardBody}>
          <Text style={styles.adTeam} numberOfLines={1}>
            {item.team?.name ?? "Takım"}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[item.team?.city, item.team?.league].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      {item.positions.length > 0 ? (
        <View style={styles.adChips}>
          {item.positions.map((code) => (
            <View key={code} style={styles.posChip}>
              <Text style={styles.posChipText}>{code}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {item.note ? (
        <Text style={styles.adNote} numberOfLines={2}>
          {item.note}
        </Text>
      ) : null}
      <Text style={styles.adCta}>Başvur →</Text>
    </Pressable>
  );
}

/** Başkanın "Oyuncu Arıyoruz" ilan kartı: yoksa açma formu, varsa özet + kapatma. */
function RecruitmentCard({
  query,
  openRecruitment,
  onChanged,
}: {
  query: { isLoading: boolean; isError: boolean };
  openRecruitment: Recruitment | null;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createRecruitment(selected, note.trim() || undefined),
    onSuccess: (result) => {
      Alert.alert("İlan yayında", result.message);
      setSelected([]);
      setNote("");
      onChanged();
    },
    onError: (error: unknown) => {
      Alert.alert(
        "İlan açılamadı",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => closeRecruitment(id),
    onSuccess: onChanged,
    onError: (error: unknown) => {
      Alert.alert(
        "İlan kapatılamadı",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  const toggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  };

  if (query.isLoading || query.isError) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardKicker}>OYUNCU ARIYORUZ İLANIM</Text>

      {openRecruitment ? (
        <>
          <View style={styles.adChips}>
            {openRecruitment.positions.length > 0 ? (
              openRecruitment.positions.map((code) => (
                <View key={code} style={styles.posChip}>
                  <Text style={styles.posChipText}>{positionLabel(code)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyLine}>Tüm mevkiler</Text>
            )}
          </View>
          {openRecruitment.note ? (
            <Text style={styles.message} numberOfLines={3}>
              {openRecruitment.note}
            </Text>
          ) : null}
          <Pressable
            onPress={() =>
              Alert.alert("İlanı kapat", "İlan kapatılınca oyunculara görünmez. Emin misin?", [
                { text: "Vazgeç", style: "cancel" },
                {
                  text: "Kapat",
                  style: "destructive",
                  onPress: () => closeMutation.mutate(openRecruitment.id),
                },
              ])
            }
            disabled={closeMutation.isPending}
            style={({ pressed }) => [styles.btn, styles.rejectBtn, styles.closeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.rejectText}>
              {closeMutation.isPending ? "Kapatılıyor…" : "İlanı Kapat"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.cardMeta}>
            Aradığın mevkileri seç, kısa bir not ekle; serbest oyuncular panelden başvursun.
          </Text>
          <View style={[styles.adChips, styles.formChips]}>
            {POSITIONS.map((item) => {
              const active = selected.includes(item.code);
              return (
                <Pressable
                  key={item.code}
                  onPress={() => toggle(item.code)}
                  style={[styles.posChip, active && styles.posChipActive]}
                >
                  <Text style={[styles.posChipText, active && styles.posChipTextActive]}>
                    {item.code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Not (isteğe bağlı) — örn. Salı akşamları antrenman"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            style={({ pressed }) => [styles.btn, styles.acceptBtn, styles.closeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="megaphone-outline" size={14} color={colors.surface} />
            <Text style={styles.acceptText}>
              {createMutation.isPending ? "Açılıyor…" : "İlanı Yayınla"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** Takıma başvuru penceresi: takım ara-seç + isteğe bağlı mesaj. */
function ApplicationModal({
  preselected,
  onClose,
  onSent,
}: {
  preselected: { teamId: number; teamName: string } | null;
  onClose: () => void;
  onSent: () => void;
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
  }, [teamsQuery.data, search]);

  const sendMutation = useMutation({
    mutationFn: () => createApplication(team!.teamId, message.trim() || undefined),
    onSuccess: (result) => {
      Alert.alert("Başvuru gönderildi", result.message);
      onSent();
    },
    onError: (error: unknown) => {
      Alert.alert(
        "Başvuru gönderilemedi",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Takıma Başvur</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            {team ? (
              <View style={styles.selectedTeam}>
                <Text style={styles.selectedTeamText} numberOfLines={1}>
                  {team.teamName}
                </Text>
                <Pressable onPress={() => setTeam(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={colors.muted} />
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Takım adı ara…"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                {teamsQuery.isLoading ? (
                  <Text style={styles.emptyLine}>Takımlar yükleniyor…</Text>
                ) : teamsQuery.isError ? (
                  <Text style={styles.emptyLine}>Takım listesi yüklenemedi.</Text>
                ) : (
                  <ScrollView style={styles.teamList} keyboardShouldPersistTaps="handled">
                    {filtered.map((item: ApiTeam) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setTeam({ teamId: item.id, teamName: item.team_name })}
                        style={({ pressed }) => [styles.teamRow, pressed && styles.pressed]}
                      >
                        <TeamCrest name={item.team_name} logo={mediaUrl(item.logo ?? null)} size={26} />
                        <Text style={styles.teamRowName} numberOfLines={1}>
                          {item.team_name}
                        </Text>
                        {item.city ? <Text style={styles.cardMeta}>{item.city}</Text> : null}
                      </Pressable>
                    ))}
                    {filtered.length === 0 ? (
                      <Text style={styles.emptyLine}>Aramana uyan takım bulunamadı.</Text>
                    ) : null}
                  </ScrollView>
                )}
              </>
            )}

            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Mesaj (isteğe bağlı) — örn. Sol kanatta oynuyorum"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.messageInput]}
              multiline
            />

            <Pressable
              onPress={() => sendMutation.mutate()}
              disabled={!team || sendMutation.isPending}
              style={({ pressed }) => [
                styles.btn,
                styles.acceptBtn,
                styles.closeBtn,
                (!team || pressed) && styles.pressed,
              ]}
            >
              <Ionicons name="paper-plane-outline" size={14} color={colors.surface} />
              <Text style={styles.acceptText}>
                {sendMutation.isPending ? "Gönderiliyor…" : "Başvuruyu Gönder"}
              </Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginTop: spacing.sm,
  },
  emptyLine: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 16,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.turf,
    paddingVertical: spacing.sm + 3,
  },
  applyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  recruitList: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  adCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  adHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  adTeam: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  adChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  formChips: {
    marginTop: spacing.sm,
  },
  posChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  posChipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  posChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
  },
  posChipTextActive: {
    color: colors.surface,
  },
  adNote: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 15,
  },
  adCta: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.turf,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  cardMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  statusChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusOk: {
    backgroundColor: colors.green + "22",
  },
  statusBad: {
    backgroundColor: colors.live + "18",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
  },
  message: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  closeBtn: {
    marginTop: spacing.xs,
  },
  acceptBtn: {
    backgroundColor: colors.green,
  },
  acceptText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  rejectBtn: {
    backgroundColor: colors.live + "18",
  },
  rejectText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.live,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    padding: spacing.sm,
    ...type.small,
    color: colors.line,
    marginTop: spacing.sm,
  },
  messageInput: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  kav: {
    alignSelf: "stretch",
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  selectedTeam: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  selectedTeamText: {
    ...type.small,
    fontWeight: "800",
    color: colors.turf,
    flex: 1,
  },
  teamList: {
    maxHeight: 240,
    marginTop: spacing.xs,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  teamRowName: {
    ...type.small,
    color: colors.line,
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
