/**
 * TAKIM PROFİLİ (yönetim) — web editor_pages/TeamProfileAdmin.js + Update_Team.js.
 *
 * Tek istekte özet (GET /api/admin/teams/:id/overview); düzenlemeler mevcut
 * yönetim uçlarıyla yapılır. Sekmeler:
 *   Profil     logo, ad, il, vitrin lig / sezon, kuruluş, renkler, katılım;
 *              aktif / pasif ve silme (onaylı)
 *   Oyuncular  kalıcı kadro: ekle, çıkar, transfer, sezona ekle, toplu işlem
 *   Sezonlar   lig / sezon katılımı ve sezon kadrosu üyeleri
 *   Yetkililer başkan ve takım yöneticileri (iletişim), bekleyen talepler
 */

import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  AdminScreen,
  FormSheet,
  InfoLine,
  Panel,
  RecordCard,
  StatRow,
  ToggleField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { ImageUploadRow } from "@/components/admin/team/ImageUpload";
import { TeamDetailsPanel } from "@/components/admin/team/TeamDetailsPanel";
import { TeamPlayersTab } from "@/components/admin/team/TeamPlayersTab";
import { TeamSeasonsTab } from "@/components/admin/team/TeamSeasonsTab";
import { Button, EmptyState, ErrorState, SegmentedControl, SkeletonCard } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate, formatPhone } from "@/lib/admin/format";
import { fetchScopedLeagues, fetchScopedSeasons, isArchived, isNationwide, loadCityOptions, seasonBelongsToLeague } from "@/lib/api/admin/lookups";
import { cleanLabel, deleteTeam, getTeamOverview, hasRealLogo, updateTeam, uploadTeamLogo, type TeamPatch } from "@/lib/api/admin/teams";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

const PERMS = ["teams.update"];
type Tab = "profile" | "players" | "seasons" | "people";

const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export default function TeamProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const auth = useAuth();
  const user = auth.user;
  const router = useRouter();
  const nationwide = isNationwide(user);
  const canDelete = hasPermission(user, "teams.delete");
  const [tab, setTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState(false);
  const [formLeague, setFormLeague] = useState<string | null>(null);

  const KEY = ["admin", "teams", "overview", teamId] as const;
  const invalidate = [KEY, ["admin", "teams"]] as const;
  const query = useQuery({ queryKey: KEY, queryFn: () => getTeamOverview(teamId), enabled: Number.isFinite(teamId) });
  const leagues = useQuery({ queryKey: ["admin", "leagues", user?.city ?? ""], queryFn: () => fetchScopedLeagues(user, true), enabled: editing });
  const seasons = useQuery({ queryKey: ["admin", "seasons", user?.city ?? ""], queryFn: () => fetchScopedSeasons(user, true), enabled: editing });

  const data = query.data;
  const team = data?.team;
  const pendingCount = (data?.pending?.changes?.length ?? 0) + (data?.pending?.requests?.length ?? 0) + (data?.pending?.photo_requests?.length ?? 0);

  const save = useAdminMutation(
    (v: FormValues) => {
      const body: TeamPatch = {
        team_name: String(v.team_name ?? "").trim(),
        current_league: (v.current_league as string) || "",
        current_season: (v.current_season as string) || "",
        founded_at: (v.founded_at as string) || null,
        colors: String(v.colors ?? "").trim() || null,
        attendence_date: (v.attendence_date as string) || null,
      };
      if (nationwide && v.city) body.city = String(v.city);
      return updateTeam(teamId, body);
    },
    { success: "Takım bilgileri kaydedildi.", invalidate: [...invalidate] }
  );

  const toggleActive = useAdminMutation((next: boolean) => updateTeam(teamId, { active: next }), {
    success: (_, next) => (next ? "Takım aktifleştirildi." : "Takım pasife alındı."),
    invalidate: [...invalidate],
  });

  const remove = useAdminMutation(() => deleteTeam(teamId), {
    success: "Takım silindi; çöp kutusundan geri alınabilir.",
    invalidate: [["admin", "teams"]],
    onSuccess: () => router.back(),
  });

  const askToggle = async (next: boolean) => {
    const ok = await confirmAction({
      title: next ? "Takım aktifleştirilsin mi?" : "Takım pasife alınsın mı?",
      message: next ? "Takım listelerde yeniden görünür." : "Pasif takım listelerde görünmez; kayıtları silinmez.",
      confirmLabel: next ? "Aktifleştir" : "Pasife al",
    });
    if (ok) toggleActive.mutate(next);
  };

  const askDelete = async () => {
    if (!team) return;
    if (data && data.players.length) {
      const go = await confirmAction({
        title: "Takımda oyuncu var",
        message: `${data.players.length} oyuncunun kadro bağı da silinecek. Maç oynamış takımı silmek yerine pasife almayı ya da Takım birleştirme'yi düşün.`,
        confirmLabel: "Yine de devam et",
        destructive: true,
      });
      if (!go) return;
    }
    const ok = await confirmAction({
      title: "Takım silinsin mi?",
      message: `"${team.team_name}" ve oyuncu bağları silinecek. Silinen takım çöp kutusuna taşınır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(undefined);
  };

  const leagueRow = (leagues.data ?? []).find((l) => l.league_name === formLeague) ?? null;
  const fields: FieldDef[] = [
    { key: "team_name", label: "Takım adı", kind: "text", required: true, hint: "Fikstür ve puan durumunda bu haliyle görünür." },
    ...(nationwide ? [{ key: "city", label: "İl", kind: "select", loadOptions: loadCityOptions, queryKey: ["admin", "cities"] } as FieldDef] : []),
    {
      key: "current_league",
      label: "Lig (vitrin)",
      kind: "select",
      options: (leagues.data ?? []).map((l) => ({ value: l.league_name, label: isArchived(l) ? `${l.league_name} (Arşiv)` : l.league_name })),
      onChange: (v) => {
        setFormLeague((v as string) ?? null);
        return { current_season: null };
      },
    },
    {
      key: "current_season",
      label: "Sezon (vitrin)",
      kind: "select",
      options: (seasons.data ?? [])
        .filter((s) => !leagueRow || seasonBelongsToLeague(s, leagueRow))
        .map((s) => ({ value: s.season_name, label: s.season_name, hint: leagueRow ? null : s.league_name ?? null })),
    },
    { key: "founded_at", label: "Kuruluş tarihi", kind: "date" },
    { key: "colors", label: "Kulüp renkleri", kind: "text", placeholder: "ör. Kırmızı - Beyaz" },
    { key: "attendence_date", label: "Katılım tarihi", kind: "date" },
  ];

  return (
    <AdminScreen
      title={team?.team_name ?? "Takım"}
      subtitle={team ? [team.city, cleanLabel(team.current_league), cleanLabel(team.current_season)].filter(Boolean).join(" · ") : undefined}
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      bottom={
        <SegmentedControl<Tab>
          items={[
            { key: "profile", label: "Profil", dot: pendingCount > 0 },
            { key: "players", label: `Oyuncular${data ? ` ${data.players.length}` : ""}` },
            { key: "seasons", label: "Sezonlar" },
            { key: "people", label: "Yetkililer" },
          ]}
          value={tab}
          onChange={setTab}
          stretch
          size="sm"
        />
      }
    >
      {query.isLoading ? (
        <SkeletonCard />
      ) : query.error || !data || !team ? (
        <ErrorState error={query.error ?? new Error("Takım bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : tab === "players" ? (
        <TeamPlayersTab data={data} user={user} invalidate={invalidate} />
      ) : tab === "seasons" ? (
        <TeamSeasonsTab data={data} user={user} invalidate={invalidate} />
      ) : tab === "people" ? (
        <View style={styles.stack}>
          {data.managers.length ? (
            data.managers.map((m) => (
              <Panel key={m.id} title={m.id === data.manager?.id ? "TAKIM BAŞKANI" : "YETKİLİ"}>
                <InfoLine label="Ad soyad" value={m.full_name || "—"} />
                <InfoLine label="Kullanıcı adı" value={m.username ? `@${m.username}` : "—"} />
                <InfoLine label="Telefon" value={m.phone ? formatPhone(m.phone) : "—"} />
                <InfoLine label="E-posta" value={m.email || "—"} />
                <InfoLine label="Rol / durum" value={[m.role, m.status].filter(Boolean).join(" · ") || "—"} />
                <View style={styles.row}>
                  {m.phone ? <Button label="Ara" icon="call-outline" size="sm" variant="secondary" onPress={() => void Linking.openURL(`tel:${m.phone}`)} /> : null}
                  {m.email ? <Button label="E-posta" icon="mail-outline" size="sm" variant="ghost" onPress={() => void Linking.openURL(`mailto:${m.email}`)} /> : null}
                </View>
              </Panel>
            ))
          ) : (
            <EmptyState
              icon="person-outline"
              variant="inline"
              title="Yetkili hesap yok"
              body="Bu takımı yöneten bir üye hesabı bağlı değil. Hesap bağlamak için takım başkanı panelden takımını sahiplenir; talep Talepler ekranına düşer."
            />
          )}
          {data.inbox?.conversation_id ? (
            <RecordCard
              title="Sohbeti aç"
              subtitle="Takım yetkilisiyle yönetim sohbeti"
              icon="chatbubbles-outline"
              onPress={() => router.push(`/yonetim/sohbet/${data.inbox!.conversation_id}`)}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.stack}>
          <Panel>
            <ImageUploadRow
              kind="logo"
              name={team.team_name}
              image={hasRealLogo(team) ? team.logo : null}
              prefix={`takim-${team.id}-logo`}
              upload={(file) => uploadTeamLogo(teamId, file)}
              onDone={() => void query.refetch()}
            />
          </Panel>
          <StatRow
            items={[
              { label: "Oyuncu", value: data.players.length },
              { label: "Sezon", value: data.seasons.length },
              { label: "Yetkili", value: data.managers.length },
              { label: "Bekleyen talep", value: pendingCount, tone: pendingCount ? "warn" : undefined },
            ]}
          />
          <Panel
            title="TAKIM BİLGİLERİ"
            action={{
              label: "Düzenle",
              onPress: () => {
                setFormLeague(cleanLabel(team.current_league) || null);
                setEditing(true);
              },
            }}
          >
            <InfoLine label="Takım adı" value={team.team_name} />
            <InfoLine label="İl" value={team.city || "—"} />
            <InfoLine label="Lig (vitrin)" value={cleanLabel(team.current_league) || "—"} />
            <InfoLine label="Sezon (vitrin)" value={cleanLabel(team.current_season) || "—"} />
            <InfoLine label="Kuruluş" value={team.founded_at ? formatDate(team.founded_at) : "—"} />
            <InfoLine label="Kulüp renkleri" value={team.colors || "—"} />
            <InfoLine label="Katılım" value={team.attendence_date ? formatDate(team.attendence_date) : "—"} />
            <InfoLine label="Kayıt no" value={`#${team.id}`} />
          </Panel>
          <TeamDetailsPanel teamId={teamId} players={data.players} />
          {pendingCount ? (
            <RecordCard
              title={`${pendingCount} bekleyen talep`}
              subtitle="Takım yetkilisinin değişiklik ve hesap talepleri gelen kutusundan onaylanır."
              icon="hourglass-outline"
              iconTone="warn"
              onPress={() => router.push("/yonetim/talepler")}
            />
          ) : null}
          <Panel title="DURUM">
            <ToggleField
              label="Takım aktif"
              hint="Pasife alınan takım listelerde görünmez."
              value={team.active !== false}
              onChange={(v) => void askToggle(v)}
            />
          </Panel>
          {canDelete ? <Button label="Takımı sil" icon="trash-outline" variant="danger" onPress={() => void askDelete()} loading={remove.isPending} /> : null}
        </View>
      )}

      <FormSheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Takım bilgileri"
        fields={fields}
        initial={
          team
            ? {
                team_name: team.team_name,
                city: team.city ?? null,
                current_league: cleanLabel(team.current_league) || null,
                current_season: cleanLabel(team.current_season) || null,
                founded_at: dateOnly(team.founded_at),
                colors: team.colors ?? "",
                attendence_date: dateOnly(team.attendence_date),
              }
            : {}
        }
        onSubmit={(v) => save.mutateAsync(v)}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
});
