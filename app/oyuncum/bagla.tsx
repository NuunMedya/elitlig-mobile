/**
 * OYUNCU PROFİLİNİ BAĞLA — profili olmayan üyenin kendi kaydını bulduğu ekran.
 *
 * NEDEN VAR: üyeler veritabanındaki kayıtlarına bakmadan "yeni oyuncu" açınca
 * aynı kişi için ikinci bir profil doğuyor, maç ve istatistik geçmişi eski
 * kayıtta kalıyordu. Bu ekran sırayı tersine çevirir: önce KENDİNİ BUL, ancak
 * bulamazsan yeni profil aç.
 *
 *   • Önerilenler: üyelik ad soyadına benzeyen sahipsiz kayıtlar (otomatik)
 *   • Takımımdan: takımı seç, kadrodan kendini seç
 *   • İsimle ara
 *
 * AYNI İSİMLİ FARKLI OYUNCULAR: her aday takım, mevki, doğum yılı, il ve maç
 * sayısıyla gösterilir. Yeni profil talebinde sunucu benzer kayıt bulursa
 * (409 POSSIBLE_DUPLICATE) adaylar alt sayfada sorulur; üye "hiçbiri ben
 * değilim" diyerek devam edebilir — engel değil, soru.
 *
 * Sunucu sözleşmesi: routes/User.js (player-candidates, request-player-claim,
 * request-player-create), services/playerMatchService.js.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  Input,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Touchable,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { POSITIONS } from "@/lib/api/team";
import { getTeams } from "@/lib/api/teams";
import {
  candidateFacts,
  getAccountRequests,
  getPlayerCandidates,
  requestPlayerClaim,
  requestPlayerCreate,
  type AccountRequest,
  type PlayerCandidate,
} from "@/lib/api/playerProfile";
import type { ApiTeam } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, type } from "@/theme";

type FinderTab = "suggested" | "team" | "search";

const TABS: SegmentedItem<FinderTab>[] = [
  { key: "suggested", label: "Önerilen", icon: "sparkles-outline" },
  { key: "team", label: "Takımımdan", icon: "shield-outline" },
  { key: "search", label: "İsimle ara", icon: "search-outline" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase("tr-TR");
const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message || error.userMessage : fallback;

function requestList(data: Awaited<ReturnType<typeof getAccountRequests>> | undefined): AccountRequest[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.accountRequests ?? data.requests ?? [];
}

/* ============================== ADAY SATIRI =============================== */

function CandidateRow({ player, onClaim, disabled }: { player: PlayerCandidate; onClaim: () => void; disabled?: boolean }) {
  return (
    <Surface style={styles.candidate}>
      <Avatar name={player.player_name} image={mediaUrl(player.player_img)} size={46} />
      <View style={styles.candidateCopy}>
        <Text style={styles.candidateName} numberOfLines={1}>{player.player_name}</Text>
        <Text style={styles.candidateFacts}>{candidateFacts(player)}</Text>
        <Text style={styles.candidateId}>Kayıt #{player.id}</Text>
      </View>
      <Button label="Bu benim" size="sm" onPress={onClaim} disabled={disabled} />
    </Surface>
  );
}

/* ================================= EKRAN ================================== */

export default function PlayerProfileLinkScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<FinderTab>("suggested");
  const [query, setQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [team, setTeam] = useState<ApiTeam | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ player_name: user?.fullName ?? "", player_position: "", birth_date: "" });
  const [duplicates, setDuplicates] = useState<PlayerCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  const requestsQuery = useQuery({ queryKey: ["account-requests"], queryFn: getAccountRequests, enabled: Boolean(user) });
  const pending = requestList(requestsQuery.data).some(
    (item) => item.status === "pending" && ["player_claim", "player_create"].includes(item.type)
  );

  const trimmed = query.trim();
  const candidateParams = tab === "team" ? (team ? { teamId: Number(team.id) } : null)
    : tab === "search" ? (trimmed.length >= 2 ? { q: trimmed } : null)
      : {};
  const candidatesQuery = useQuery({
    queryKey: ["player-candidates", tab, candidateParams],
    queryFn: () => getPlayerCandidates(candidateParams ?? {}),
    enabled: Boolean(user) && candidateParams !== null,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];

  const teamsQuery = useQuery({ queryKey: ["teams", "all"], queryFn: getTeams, enabled: tab === "team" });
  const teamOptions = useMemo(() => {
    const city = lower(user?.city);
    const q = lower(teamQuery).trim();
    return (teamsQuery.data ?? [])
      .filter((item) => !q || lower(item.team_name).includes(q))
      .sort((a, b) => Number(lower(b.city) === city) - Number(lower(a.city) === city)
        || String(a.team_name).localeCompare(String(b.team_name), "tr"))
      .slice(0, q ? 40 : 20);
  }, [teamsQuery.data, teamQuery, user?.city]);

  const sameNameShown = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((p) => counts.set(lower(p.player_name), (counts.get(lower(p.player_name)) ?? 0) + 1));
    return [...counts.values()].some((n) => n > 1);
  }, [candidates]);

  if (!user) return <Redirect href="/giris" />;

  const afterSubmit = async (message: string) => {
    setDuplicates(null);
    setCreateOpen(false);
    toast.show({ message, tone: "success" });
    await queryClient.invalidateQueries({ queryKey: ["account-requests"] });
  };

  const sendClaim = async (player: PlayerCandidate) => {
    setBusy(true);
    try {
      await requestPlayerClaim(player.id);
      await afterSubmit("Sahiplenme talebin yönetici onayına gönderildi.");
    } catch (error) {
      Alert.alert("Talep gönderilemedi", errorText(error, "Bir hata oluştu."));
    } finally {
      setBusy(false);
    }
  };

  const claim = (player: PlayerCandidate, confirmed = false) => {
    if (confirmed) { void sendClaim(player); return; }
    Alert.alert(
      "Bu oyuncu sen misin?",
      `“${player.player_name}” (kayıt #${player.id})\n${candidateFacts(player)}\n\n` +
        "Aynı isimde başka oyuncular olabilir; takım ve doğum yılının sana ait olduğundan emin ol. " +
        "Yönetici onayladığında bu kaydın maç ve istatistik geçmişi hesabına bağlanır.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, bu benim", onPress: () => void sendClaim(player) },
      ]
    );
  };

  const submitCreate = async (confirmedNew = false) => {
    const name = form.player_name.trim();
    if (!name) { Alert.alert("Ad soyad gerekli", "Oyuncu adını ve soyadını yaz."); return; }
    if (form.birth_date && !DATE_RE.test(form.birth_date)) {
      Alert.alert("Doğum tarihi", "Tarihi YYYY-AA-GG biçiminde yaz (ör. 1998-04-21).");
      return;
    }
    setBusy(true);
    try {
      await requestPlayerCreate({
        player_name: name,
        ...(form.player_position ? { player_position: form.player_position } : {}),
        ...(form.birth_date ? { birth_date: form.birth_date } : {}),
        ...(user.city ? { city: user.city } : {}),
        ...(confirmedNew ? { confirmedNew: true } : {}),
      });
      await afterSubmit("Yeni profil talebin yönetici onayına gönderildi.");
    } catch (error) {
      const detail = error instanceof ApiError ? (error.detail as { candidates?: PlayerCandidate[] } | undefined) : undefined;
      if (error instanceof ApiError && error.code === "POSSIBLE_DUPLICATE" && Array.isArray(detail?.candidates)) {
        setCreateOpen(false);
        setDuplicates(detail.candidates);
        return;
      }
      Alert.alert("Talep gönderilemedi", errorText(error, "Bir hata oluştu."));
    } finally {
      setBusy(false);
    }
  };

  const emptyBody = tab === "suggested"
    ? `“${user.fullName || "Ad soyad"}” adına benzeyen sahipsiz kayıt bulamadık. Takımından ya da isimle aramayı dene.`
    : tab === "team" ? "Bu takımın kadrosunda sahiplenilebilecek oyuncu yok."
      : "Aramanla eşleşen sahipsiz oyuncu bulunamadı.";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Oyuncu Profilini Bağla" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.title}>Önce kendini bul</Text>
          <Text style={styles.body}>
            Ligde maça çıktıysan kaydın büyük ihtimalle zaten var. Kendini bulup “Bu benim” dediğinde maç, gol ve
            istatistik geçmişin profiline gelir. Yeni profil açarsan bu geçmiş görünmez.
          </Text>
        </View>

        {pending && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>⏳ Oyuncu profili talebin yönetici onayı bekliyor.</Text>
          </View>
        )}

        <SegmentedControl items={TABS} value={tab} onChange={setTab} />

        {tab === "search" && (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Ad soyad yaz (ör. mehmet yıl)"
            autoCorrect={false}
            autoFocus
          />
        )}

        {tab === "team" && !team && (
          <View style={styles.block}>
            <Input value={teamQuery} onChangeText={setTeamQuery} placeholder="Takımının adını yaz" autoCorrect={false} />
            {teamsQuery.isLoading ? <SkeletonListRow count={4} /> : teamOptions.map((item) => (
              <Touchable key={item.id} onPress={() => setTeam(item)} style={styles.teamRow} accessibilityRole="button">
                <TeamLogo logo={mediaUrl(item.logo)} name={item.team_name} size={30} />
                <View style={styles.candidateCopy}>
                  <Text style={styles.teamName} numberOfLines={1}>{item.team_name}</Text>
                  {item.city ? <Text style={styles.candidateId}>{item.city}</Text> : null}
                </View>
              </Touchable>
            ))}
          </View>
        )}

        {tab === "team" && team && (
          <View style={styles.teamPicked}>
            <Text style={styles.teamName} numberOfLines={1}>{team.team_name} kadrosu</Text>
            <Button label="Takımı değiştir" size="sm" variant="ghost" onPress={() => setTeam(null)} />
          </View>
        )}

        {(tab !== "team" || team) && (
          <View style={styles.block}>
            {sameNameShown && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Aynı isimde birden fazla oyuncu var. Takım, doğum yılı ve maç bilgisine bakarak kendini seç.
                </Text>
              </View>
            )}
            {tab === "search" && trimmed.length < 2 ? (
              <Text style={styles.hint}>Aramak için en az iki harf yaz.</Text>
            ) : candidatesQuery.isLoading ? (
              <SkeletonListRow count={4} />
            ) : candidatesQuery.isError ? (
              <EmptyState icon="alert-circle-outline" title="Oyuncular alınamadı" body={errorText(candidatesQuery.error, "Bir hata oluştu.")} action={{ label: "Tekrar dene", onPress: () => void candidatesQuery.refetch() }} />
            ) : candidates.length ? (
              candidates.map((player) => (
                <CandidateRow key={player.id} player={player} onClaim={() => claim(player)} disabled={pending || busy} />
              ))
            ) : (
              <EmptyState icon="person-outline" title="Kayıt bulunamadı" body={emptyBody} />
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Listede yok musun?</Text>
          <Text style={styles.hint}>Daha önce hiç lig maçına çıkmadıysan yeni bir oyuncu profili oluşturabilirsin.</Text>
          <Button label="Yeni oyuncu profili oluştur" variant="secondary" icon="person-add-outline" onPress={() => setCreateOpen(true)} disabled={pending || busy} fullWidth />
        </View>
      </ScrollView>

      {createOpen && (
        <BottomSheet
          visible
          onClose={() => setCreateOpen(false)}
          title="Yeni oyuncu profili"
          snap="full"
          footer={<Button label="Talebi onaya gönder" onPress={() => void submitCreate()} loading={busy} fullWidth />}
        >
          <View style={styles.block}>
            <Input label="Ad soyad *" value={form.player_name} onChangeText={(value) => setForm((old) => ({ ...old, player_name: value }))} />
            <Text style={styles.fieldLabel}>Mevki</Text>
            <ChipGroup>
              {POSITIONS.map((item) => (
                <Chip
                  key={item.code}
                  label={item.label}
                  selected={form.player_position === item.label}
                  onPress={() => setForm((old) => ({ ...old, player_position: old.player_position === item.label ? "" : item.label }))}
                />
              ))}
            </ChipGroup>
            <Input
              label="Doğum tarihi"
              value={form.birth_date}
              onChangeText={(value) => setForm((old) => ({ ...old, birth_date: value }))}
              placeholder="YYYY-AA-GG"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.hint}>İl bilgisi üyelik kaydından alınır{user.city ? `: ${user.city}` : ""}. Yönetici onayladığında profilin yayınlanır.</Text>
          </View>
        </BottomSheet>
      )}

      {duplicates && (
        <BottomSheet
          visible
          onClose={() => setDuplicates(null)}
          title="Bunlardan biri sen misin?"
          snap="full"
          footer={
            <Button
              label="Hiçbiri ben değilim, yeni profil oluştur"
              variant="secondary"
              onPress={() => void submitCreate(true)}
              loading={busy}
              fullWidth
            />
          }
        >
          <View style={styles.block}>
            <Text style={styles.body}>
              Veritabanında “{form.player_name.trim()}” adına benzeyen, henüz kimsenin sahiplenmediği kayıtlar var. Biri
              sensen onu sahiplen; maç ve istatistik geçmişin korunur.
            </Text>
            {duplicates.map((player) => (
              <CandidateRow key={player.id} player={player} onClaim={() => claim(player, true)} disabled={busy} />
            ))}
            <View style={styles.badgeRow}>
              <Badge label="Aynı isim, farklı kişi olabilir" tone="neutral" />
            </View>
            <Text style={styles.hint}>
              Takım, doğum yılı ya da maç bilgisi sana ait değilse aynı isimli farklı bir oyuncudur; yeni profille devam
              edebilirsin.
            </Text>
          </View>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md },
  intro: { gap: space.xs, paddingTop: space.sm },
  title: { ...type.h1, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary },
  hint: { ...type.bodySm, color: colors.textSecondary },
  notice: { backgroundColor: colors.warnDim, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.bodySm, color: colors.warn },
  block: { gap: space.sm },
  candidate: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
  candidateCopy: { flex: 1, minWidth: 0, gap: 2 },
  candidateName: { ...type.h3, color: colors.textPrimary },
  candidateFacts: { ...type.bodySm, color: colors.textSecondary },
  candidateId: { ...type.caption, color: colors.textTertiary },
  teamRow: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md,
    borderRadius: radius.lg, backgroundColor: colors.surface1,
  },
  teamName: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  teamPicked: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm,
    backgroundColor: colors.brandDim, borderRadius: radius.md, paddingLeft: space.md,
  },
  footer: { gap: space.sm, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerTitle: { ...type.h3, color: colors.textPrimary },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  badgeRow: { flexDirection: "row" },
});
