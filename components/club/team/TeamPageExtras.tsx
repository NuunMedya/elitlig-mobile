/**
 * TAKIM BİLGİLERİ EKLERİ — web panelinde olup mobil "Takım bilgileri"
 * ekranında olmayan iki blok. `app/takimim/bilgiler.tsx` içine yerleşir.
 *
 *   CaptainHomepageCard  Takım sayfası ▸ kaptan seçimi ve ana sayfa
 *                        görünürlükleri (web TeamDetails "captain" /
 *                        "homepage" sekmeleri). PATCH /api/panel/me/team/details
 *                        — doğrudan yazılır, onay beklemez.
 *   TeamAuthorityCard    Kimlik ▸ yönetim yetkisi: takımı başka üyeye devret,
 *                        takımdan istifa et, bekleyen talebi geri çek (web
 *                        PlayerTeamPanel teamAction). Hepsi yönetici onaylıdır.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { AuthCard } from "@/components/account/AuthShell";
import { Avatar, Badge, Button, Chip, Input, ListRow, SkeletonCard, Toggle, useToast } from "@/components/ui";
import {
  ACCOUNT_REQUEST_LABELS,
  TEAM_REQUEST_TYPES,
  cancelAccountRequest,
  getAccountRequests,
  requestTeamResign,
  requestTeamTransfer,
  searchHandoverCandidates,
  type HandoverCandidate,
} from "@/lib/api/club/account";
import { HOMEPAGE_KEYS, updateTeamCaptain, updateTeamHomepage, type HomepageKey } from "@/lib/api/club/details";
import { getTeamDetails } from "@/lib/api/profile";
import { getTeamRoster } from "@/lib/api/team";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { colors, layout, space, textScale, type } from "@/theme";

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.userMessage : fallback);

/* ═══════════════════════════ KAPTAN + ANA SAYFA ═══════════════════════════ */

export function CaptainHomepageCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  // Anahtar bilgiler.tsx PageSection ile ortak: kayıt sonrası iki blok da tazelenir.
  const details = useQuery({ queryKey: ["panel", "team-details"], queryFn: getTeamDetails, staleTime: 60_000 });
  const roster = useQuery({ queryKey: ["takim", "roster"], queryFn: getTeamRoster, staleTime: 60_000 });
  const [showAll, setShowAll] = useState(false);

  const captainId = details.data?.details.captain_player_id ?? null;
  const homepage = details.data?.details.homepage ?? {};

  const captain = useMutation({
    mutationFn: (playerId: number | null) => updateTeamCaptain(playerId),
    onSuccess: (data) => {
      queryClient.setQueryData(["panel", "team-details"], data);
      toast.show({ message: data.captain ? `${data.captain.player_name} kaptan seçildi.` : "Kaptan kaldırıldı.", tone: "success" });
    },
    onError: (error) => toast.show({ message: errorText(error, "Kaptan kaydedilemedi."), tone: "danger" }),
  });
  const visibility = useMutation({
    mutationFn: (patch: Partial<Record<HomepageKey, boolean>>) => updateTeamHomepage(patch),
    onSuccess: (data) => queryClient.setQueryData(["panel", "team-details"], data),
    onError: (error) => toast.show({ message: errorText(error, "Görünüm kaydedilemedi."), tone: "danger" }),
  });

  if (details.isLoading) return <SkeletonCard lines={3} />;
  if (!details.data) return null;

  const players = roster.data?.roster ?? [];
  const sorted = [...players].sort((a, b) => Number(b.id === captainId) - Number(a.id === captainId));
  const shown = showAll ? sorted : sorted.slice(0, 6);

  return (
    <>
      <AuthCard title="Kaptan">
        <Text style={styles.hint} {...textScale.long}>
          Kaptan takım sayfanda ve maç kadrosunda öne çıkar. Yalnız kadrondaki bir oyuncu seçilebilir.
        </Text>
        <View style={styles.chips}>
          {shown.map((player) => (
            <Chip
              key={player.id}
              size="sm"
              icon={player.id === captainId ? "star" : undefined}
              label={player.player_name}
              selected={player.id === captainId}
              disabled={captain.isPending}
              onPress={() => captain.mutate(player.id === captainId ? null : player.id)}
            />
          ))}
          {sorted.length > 6 ? (
            <Chip size="sm" label={showAll ? "Daha az" : `+${sorted.length - 6} oyuncu`} onPress={() => setShowAll((v) => !v)} />
          ) : null}
        </View>
        {!players.length && !roster.isLoading ? (
          <Text style={styles.hint} {...textScale.long}>
            Kadronda oyuncu yok.
          </Text>
        ) : null}
      </AuthCard>

      <AuthCard title="Takım sayfasında göster">
        {HOMEPAGE_KEYS.map((item) => (
          <View key={item.key} style={styles.toggleRow}>
            <Text style={styles.toggleText} {...textScale.dense}>
              {item.label}
            </Text>
            <Toggle
              value={homepage[item.key] !== false}
              onValueChange={(value) => visibility.mutate({ [item.key]: value })}
              disabled={visibility.isPending}
              accessibilityLabel={`${item.label} takım sayfasında görünsün`}
            />
          </View>
        ))}
      </AuthCard>
    </>
  );
}

/* ═══════════════════════════ YÖNETİM YETKİSİ ═══════════════════════════ */

export function TeamAuthorityCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["club", "account-requests"], queryFn: getAccountRequests, staleTime: 60_000, retry: false });
  const [mode, setMode] = useState<null | "transfer">(null);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<HandoverCandidate | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term]);

  const candidates = useQuery({
    queryKey: ["club", "handover", debounced],
    queryFn: () => searchHandoverCandidates(debounced),
    enabled: mode === "transfer" && !picked && debounced.length >= 2,
    staleTime: 60_000,
    retry: false,
  });

  const done = (message: string) => {
    toast.show({ message, tone: "success" });
    setMode(null);
    setTerm("");
    setPicked(null);
    void queryClient.invalidateQueries({ queryKey: ["club", "account-requests"] });
  };
  const resign = useMutation({
    mutationFn: () => requestTeamResign(),
    onSuccess: (result) => done(result.message ?? "İstifa talebin yönetici onayına gönderildi."),
    onError: (error) => toast.show({ message: errorText(error, "Talep gönderilemedi."), tone: "danger" }),
  });
  const transfer = useMutation({
    mutationFn: (username: string) => requestTeamTransfer(username),
    onSuccess: (result) => done(result.message ?? "Devir talebin yöneticiye ve ilgili üyeye iletildi."),
    onError: (error) => toast.show({ message: errorText(error, "Talep gönderilemedi."), tone: "danger" }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => cancelAccountRequest(id),
    onSuccess: (result) => done(result.message ?? "Talebin geri çekildi."),
    onError: (error) => toast.show({ message: errorText(error, "Talep geri çekilemedi."), tone: "danger" }),
  });

  const teamRequests = (requests.data?.requests ?? []).filter((item) => TEAM_REQUEST_TYPES.has(item.type));
  const pendingAction = teamRequests.some((item) => item.status === "pending" && ["team_resign", "team_transfer"].includes(item.type));

  return (
    <AuthCard title="Yönetim yetkisi">
      {teamRequests.length ? (
        <View style={styles.requests}>
          {teamRequests.slice(0, 4).map((item, index, list) => (
            <ListRow
              key={item.id}
              leading={{ icon: item.status === "pending" ? "hourglass-outline" : "document-text-outline", tone: item.status === "pending" ? "warn" : "neutral" }}
              title={ACCOUNT_REQUEST_LABELS[item.type] ?? item.type}
              subtitle={[formatDateShort(item.createdAt ?? item.created_at), item.adminNote ?? item.admin_note ?? item.reviewNote].filter(Boolean).join(" · ") || undefined}
              badge={
                <Badge
                  label={item.status === "pending" ? "Bekliyor" : item.status === "approved" ? "Onaylandı" : item.status === "rejected" ? "Reddedildi" : "Geri çekildi"}
                  tone={item.status === "pending" ? "warn" : item.status === "approved" ? "win" : item.status === "rejected" ? "danger" : "neutral"}
                  size="xs"
                />
              }
              position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
              onPress={
                item.status === "pending"
                  ? () =>
                      Alert.alert("Talebi geri çek", `${ACCOUNT_REQUEST_LABELS[item.type] ?? "Talep"} geri çekilsin mi?`, [
                        { text: "Vazgeç", style: "cancel" },
                        { text: "Geri çek", style: "destructive", onPress: () => cancel.mutate(item.id) },
                      ])
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      {pendingAction ? (
        <Text style={styles.hint} {...textScale.long}>
          Bekleyen bir devir ya da istifa talebin var. Yeni talep için önce onu geri çek ya da sonucu bekle.
        </Text>
      ) : mode === "transfer" ? (
        <View style={styles.transfer}>
          <Input
            label="Devredilecek üye"
            size="sm"
            value={picked ? `${picked.fullName ?? picked.username} (@${picked.username})` : term}
            onChangeText={(value) => {
              setPicked(null);
              setTerm(value);
            }}
            placeholder="Kullanıcı adı ya da ad soyad"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!picked && debounced.length >= 2 ? (
            candidates.isLoading ? (
              <SkeletonCard lines={2} />
            ) : (candidates.data?.candidates ?? []).length ? (
              <View>
                {(candidates.data?.candidates ?? []).map((candidate, index, list) => (
                  <ListRow
                    key={candidate.username}
                    leading={<Avatar name={candidate.fullName ?? candidate.username} image={null} size={layout.crestMd} />}
                    title={candidate.fullName ?? candidate.username}
                    subtitle={[`@${candidate.username}`, candidate.city, candidate.hasTeam ? "Zaten bir takımı yönetiyor" : null].filter(Boolean).join(" · ")}
                    disabled={candidate.hasTeam}
                    position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
                    onPress={() => setPicked(candidate)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.hint} {...textScale.long}>
                Eşleşen üye bulunamadı. Kullanıcı adını ya da ad soyadını kontrol et.
              </Text>
            )
          ) : null}
          <View style={styles.row}>
            <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setMode(null)} style={styles.flex} />
            <Button
              label="Devir talebini gönder"
              size="sm"
              disabled={!picked}
              loading={transfer.isPending}
              onPress={() => picked && transfer.mutate(picked.username)}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.hint} {...textScale.long}>
            Takımı başka bir üyeye devredebilir ya da yönetimden ayrılabilirsin. İki talep de yönetici onayından sonra uygulanır.
          </Text>
          <View style={styles.row}>
            <Button label="Takımı devret" icon="swap-horizontal" variant="secondary" size="sm" onPress={() => setMode("transfer")} style={styles.flex} />
            <Button
              label="İstifa et"
              icon="exit-outline"
              variant="danger"
              size="sm"
              loading={resign.isPending}
              onPress={() =>
                Alert.alert("Takımdan istifa", "Yönetici onaylarsa takımın yönetimi senden alınır. Devam edilsin mi?", [
                  { text: "Vazgeç", style: "cancel" },
                  { text: "İstifa talebi gönder", style: "destructive", onPress: () => resign.mutate() },
                ])
              }
              style={styles.flex}
            />
          </View>
        </>
      )}
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.caption, color: colors.textTertiary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  toggleText: { ...type.label, color: colors.textPrimary },
  requests: { gap: 0 },
  transfer: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
