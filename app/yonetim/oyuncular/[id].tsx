/**
 * OYUNCU PROFİLİ (yönetim) — web editor_pages/PlayerProfileAdmin.js + Update_Player.js.
 *
 * Özet tek istekte gelir (GET /api/admin/players/:id/overview). Sekmeler:
 *   Profil    fotoğraf, ad, mevki, vitrin takımı, uyruk, doğum, sezon, il,
 *             katılım tarihi, değer; aktif / pasif, birleştir, sil
 *   Takımlar  kalıcı kadro bağları (ekle / çıkar, forma no ve takımdaki
 *             mevki), sezon kadrosu üyelikleri, kiralıklar ve sözleşmeler
 *   Değer     piyasa değeri (kırılım, geçmiş, yeniden hesap, düzeltme) ve
 *             vitrin istatistikleri
 *   Hesap     bağlı üye hesabı
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AdminScreen,
  FormSheet,
  InfoLine,
  Panel,
  RecordCard,
  SelectField,
  StatRow,
  ToggleField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { MarketValuePanel } from "@/components/admin/player/MarketValuePanel";
import { ImageUploadRow } from "@/components/admin/team/ImageUpload";
import { Button, EmptyState, ErrorState, SegmentedControl, SkeletonCard } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate, formatPhone } from "@/lib/admin/format";
import { fetchScopedSeasons, isNationwide, loadCityOptions, teamOptionsLoader } from "@/lib/api/admin/lookups";
import {
  CONTRACT_STATUS_LABELS,
  DEFAULT_PLAYER_IMG,
  POSITIONS,
  ageOf,
  deletePlayer,
  getPlayerOverview,
  positionLabel,
  updatePlayer,
  uploadPlayerImage,
  type PlayerPatch,
  type PlayerTeamLink,
} from "@/lib/api/admin/players";
import { MEMBERSHIP_STATUS_LABELS, addPlayerToTeam, removePlayerFromTeam } from "@/lib/api/admin/teams";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["players.update"];
type Tab = "profile" | "teams" | "value" | "account";
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = Number(id);
  const auth = useAuth();
  const user = auth.user;
  const router = useRouter();
  const nationwide = isNationwide(user);
  const canDelete = hasPermission(user, "players.delete");
  const canMerge = hasPermission(user, "players.merge");
  const [tab, setTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState(false);
  const [addTeam, setAddTeam] = useState<number | null>(null);

  const KEY = ["admin", "players", "overview", playerId] as const;
  const invalidate = [KEY, ["admin", "players"], ["admin", "teams"]];
  const query = useQuery({ queryKey: KEY, queryFn: () => getPlayerOverview(playerId), enabled: Number.isFinite(playerId) });
  const seasons = useQuery({ queryKey: ["admin", "seasons", user?.city ?? ""], queryFn: () => fetchScopedSeasons(user, true), enabled: editing });

  const data = query.data;
  const player = data?.player;
  const passive = player?.active === false || player?.active === 0;
  const pendingCount = (data?.pending?.changes?.length ?? 0) + (data?.pending?.requests?.length ?? 0) + (data?.pending?.photo_requests?.length ?? 0);

  const save = useAdminMutation(
    (v: FormValues) => {
      const body: PlayerPatch = {
        player_name: String(v.player_name ?? "").trim(),
        player_position: (v.player_position as string) || null,
        team_id: v.team_id ? Number(v.team_id) : null,
        nationality: String(v.nationality ?? "").trim() || null,
        birth_date: (v.birth_date as string) || null,
        season: (v.season as string) || null,
        attendence_date: (v.attendence_date as string) || null,
      };
      if (v.value !== "" && v.value != null) body.value = Number(String(v.value).replace(",", ".")) || 0;
      if (nationwide && v.city) body.city = String(v.city);
      return updatePlayer(playerId, body);
    },
    { success: "Oyuncu bilgileri kaydedildi.", invalidate }
  );

  const toggleActive = useAdminMutation((next: boolean) => updatePlayer(playerId, { active: next }), {
    success: (_, next) => (next ? "Oyuncu aktifleştirildi." : "Oyuncu pasife alındı."),
    invalidate,
  });

  const linkTeam = useAdminMutation(
    ({ teamId, teamName }: { teamId: number; teamName: string }) =>
      addPlayerToTeam({ playerId, playerName: player!.player_name, teamId, teamName }),
    { success: "Oyuncu takım kadrosuna eklendi.", invalidate }
  );

  const unlinkTeam = useAdminMutation((link: PlayerTeamLink) => removePlayerFromTeam(playerId, link.team_id), {
    success: "Oyuncu takım kadrosundan çıkarıldı.",
    invalidate,
  });

  const remove = useAdminMutation(() => deletePlayer(playerId), {
    success: "Oyuncu silindi; çöp kutusundan geri alınabilir.",
    invalidate: [["admin", "players"], ["admin", "teams"]],
    onSuccess: () => router.back(),
  });

  const askToggle = async (next: boolean) => {
    const ok = await confirmAction({
      title: next ? "Oyuncu aktifleştirilsin mi?" : "Oyuncu pasife alınsın mı?",
      message: `${player?.player_name} ${next ? "aktif" : "pasif"} duruma alınacak.`,
      confirmLabel: next ? "Aktifleştir" : "Pasife al",
    });
    if (ok) toggleActive.mutate(next);
  };

  const askDelete = async () => {
    const ok = await confirmAction({
      title: "Oyuncu silinsin mi?",
      message: `"${player?.player_name}" ve takım bağları silinecek. Mükerrer kayıtsa silmek yerine Oyuncu birleştirme ile birleştir; maç geçmişi korunur.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(undefined);
  };

  const askLink = async (teamId: number | null, teamName?: string) => {
    setAddTeam(null);
    if (!teamId || !player) return;
    const ok = await confirmAction({
      title: "Takım kadrosuna eklensin mi?",
      message: `${player.player_name}, ${teamName ?? "seçilen takım"} kadrosuna eklenecek. Sezon kadrosu takım profilinden yönetilir.`,
      confirmLabel: "Ekle",
    });
    if (ok) linkTeam.mutate({ teamId, teamName: teamName ?? "" });
  };

  const askUnlink = async (link: PlayerTeamLink) => {
    const ok = await confirmAction({
      title: "Takım kadrosundan çıkarılsın mı?",
      message: `${player?.player_name}, ${link.team?.team_name ?? "takım"} kadrosundan çıkarılacak.`,
      confirmLabel: "Çıkar",
      destructive: true,
    });
    if (ok) unlinkTeam.mutate(link);
  };

  const fields: FieldDef[] = [
    { key: "player_name", label: "Ad soyad", kind: "text", required: true },
    { key: "player_position", label: "Mevki", kind: "select", options: POSITIONS.map((p) => ({ value: p.label, label: p.label })) },
    {
      key: "team_id",
      label: "Takım (vitrin)",
      kind: "select",
      loadOptions: teamOptionsLoader(user),
      queryKey: ["admin", "teams", "options"],
      valueLabel: () => data?.team?.team_name ?? null,
      hint: "Kalıcı kadro bağları Takımlar sekmesinde.",
    },
    { key: "nationality", label: "Uyruk", kind: "text" },
    { key: "birth_date", label: "Doğum tarihi", kind: "date" },
    {
      key: "season",
      label: "Sezon (vitrin)",
      kind: "select",
      options: (seasons.data ?? []).map((s) => ({ value: s.season_name, label: s.season_name, hint: s.league_name ?? null })),
    },
    ...(nationwide ? [{ key: "city", label: "İl", kind: "select", loadOptions: loadCityOptions, queryKey: ["admin", "cities"] } as FieldDef] : []),
    { key: "attendence_date", label: "Katılım tarihi", kind: "date" },
    { key: "value", label: "Değer (vitrin)", kind: "number" },
  ];

  const age = ageOf(player?.birth_date);

  return (
    <AdminScreen
      title={player?.player_name ?? "Oyuncu"}
      subtitle={player ? [positionLabel(player.player_position) || null, data?.team?.team_name || "Serbest oyuncu", player.city].filter(Boolean).join(" · ") : undefined}
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      bottom={
        <SegmentedControl<Tab>
          items={[
            { key: "profile", label: "Profil", dot: pendingCount > 0 },
            { key: "teams", label: "Takımlar" },
            { key: "value", label: "Değer" },
            { key: "account", label: "Hesap" },
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
      ) : query.error || !data || !player ? (
        <ErrorState error={query.error ?? new Error("Oyuncu bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : tab === "teams" ? (
        <View style={styles.stack}>
          <SelectField<number>
            value={addTeam}
            onChange={(v, option) => void askLink(v, option?.label)}
            loadOptions={teamOptionsLoader(user, { exclude: data.teams.map((t) => Number(t.team_id)) })}
            queryKey={["admin", "teams", "options", "player", playerId]}
            placeholder="Takıma ekle: takım adı…"
            icon="add-circle-outline"
            sheetTitle="Takım kadrosuna ekle"
          />
          <Panel title="TAKIM KADROLARI">
            {data.teams.length ? (
              data.teams.map((link) => (
                <RecordCard
                  key={link.id}
                  title={link.team?.team_name ?? `Takım #${link.team_id}`}
                  subtitle={
                    [link.jersey_number != null ? `Forma #${link.jersey_number}` : null, link.team_position ? positionLabel(link.team_position) : null, link.squad_role]
                      .filter(Boolean)
                      .join(" · ") || "Forma no / mevki yok"
                  }
                  avatar={{ name: link.team?.team_name, image: link.team?.logo }}
                  badges={[Number(link.team_id) === Number(player.team_id) && { label: "Vitrin takımı", tone: "brand" }]}
                  onPress={() => router.push(`/yonetim/takimlar/${link.team_id}`)}
                  onLongPress={() => void askUnlink(link)}
                />
              ))
            ) : (
              <Text style={styles.muted} {...textScale.long}>
                Kadro bağı yok; oyuncu serbest.
              </Text>
            )}
            {data.teams.length ? (
              <Text style={styles.muted} {...textScale.dense}>
                Kadrodan çıkarmak için takıma basılı tut. Forma numarası ve takımdaki mevki takım yönetiminden girilir.
              </Text>
            ) : null}
          </Panel>
          <Panel title="SEZON KADROSU ÜYELİKLERİ">
            {data.memberships.length ? (
              data.memberships.map((m) => (
                <RecordCard
                  key={m.id}
                  title={m.team?.team_name ?? `Takım #${m.team_id}`}
                  subtitle={[m.season?.season_name, m.season?.league_name, m.joined_at ? formatDate(m.joined_at) : null].filter(Boolean).join(" · ")}
                  avatar={{ name: m.team?.team_name, image: m.team?.logo }}
                  badges={[
                    m.is_licensed && { label: "Lisanslı", tone: "info" },
                    m.membership_kind === "loan" && { label: "Kiralık", tone: "warn" },
                    { label: MEMBERSHIP_STATUS_LABELS[m.membership_status] ?? m.membership_status },
                  ]}
                  onPress={m.team_id ? () => router.push(`/yonetim/takimlar/${m.team_id}`) : undefined}
                />
              ))
            ) : (
              <Text style={styles.muted} {...textScale.long}>
                Sezon kadrosu üyeliği yok.
              </Text>
            )}
          </Panel>
          {data.loans.length || data.contracts.length ? (
            <Panel title="KİRALIKLAR VE SÖZLEŞMELER">
              {data.loans.map((l) => (
                <RecordCard
                  key={`loan-${l.id}`}
                  title={`Kiralık · ${l.team?.team_name ?? "Takım"}`}
                  subtitle={[l.from_team?.team_name ? `${l.from_team.team_name} takımından` : null, l.start_date ? formatDate(l.start_date) : null, l.end_date ? `→ ${formatDate(l.end_date)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  icon="swap-horizontal-outline"
                  badges={[{ label: l.status === "active" ? "Aktif" : "Sona erdi", tone: l.status === "active" ? "warn" : "neutral" }]}
                />
              ))}
              {data.contracts.map((c) => (
                <RecordCard
                  key={`contract-${c.id}`}
                  title={`${c.transfer_type === "loan" ? "Kiralık sözleşme" : "Sözleşme"} · ${c.team?.team_name ?? "Takım"}`}
                  subtitle={[c.start_date ? formatDate(c.start_date) : null, c.end_date ? `→ ${formatDate(c.end_date)}` : "Süresiz"].filter(Boolean).join(" ")}
                  icon="document-text-outline"
                  badges={[{ label: CONTRACT_STATUS_LABELS[c.status] ?? c.status }]}
                  onPress={() => router.push("/yonetim/transfer-onaylari")}
                />
              ))}
            </Panel>
          ) : null}
        </View>
      ) : tab === "value" ? (
        <View style={styles.stack}>
          <MarketValuePanel playerId={playerId} user={user} />
          <Panel title="VİTRİN İSTATİSTİKLERİ">
            <StatRow
              items={[
                { label: "Maç", value: player.total_matches ?? 0 },
                { label: "Gol", value: player.total_goals ?? 0 },
                { label: "Sarı", value: Number(player.total_yellow_cards ?? 0) },
                { label: "Kırmızı", value: Number(player.total_red_cards ?? 0) },
              ]}
            />
            <Text style={styles.muted} {...textScale.long}>
              Maç, gol ve kart sayıları maç istatistiklerinden hesaplanır; elle değiştirilmez.
            </Text>
          </Panel>
        </View>
      ) : tab === "account" ? (
        data.owner ? (
          <Panel title="BAĞLI ÜYE HESABI">
            <InfoLine label="Kullanıcı adı" value={data.owner.username ? `@${data.owner.username}` : "—"} />
            <InfoLine label="Ad soyad" value={data.owner.full_name || "—"} />
            <InfoLine label="E-posta" value={data.owner.email || "—"} />
            <InfoLine label="Telefon" value={data.owner.phone ? formatPhone(data.owner.phone) : "—"} />
            <InfoLine label="Rol / durum" value={[data.owner.role, data.owner.status].filter(Boolean).join(" · ") || "—"} />
            <InfoLine label="Kayıt" value={data.owner.created_at ? formatDate(data.owner.created_at) : "—"} />
          </Panel>
        ) : (
          <EmptyState icon="person-outline" variant="inline" title="Bağlı üye hesabı yok" body="Bu oyuncu profilini sahiplenmiş bir üye hesabı yok." />
        )
      ) : (
        <View style={styles.stack}>
          <Panel>
            <ImageUploadRow
              kind="photo"
              name={player.player_name}
              image={player.player_img && player.player_img !== DEFAULT_PLAYER_IMG ? player.player_img : null}
              prefix={`oyuncu-${player.id}`}
              upload={(file) => uploadPlayerImage(playerId, file)}
              onDone={() => void query.refetch()}
            />
          </Panel>
          <Panel title="KİŞİSEL BİLGİLER" action={{ label: "Düzenle", onPress: () => setEditing(true) }}>
            <InfoLine label="Ad soyad" value={player.player_name} />
            <InfoLine label="Mevki" value={positionLabel(player.player_position) || "—"} />
            <InfoLine label="Takım (vitrin)" value={data.team?.team_name || "Serbest"} />
            <InfoLine label="Forma" value={data.teams.find((t) => Number(t.team_id) === Number(player.team_id))?.jersey_number?.toString() ?? "—"} />
            <InfoLine label="Uyruk" value={player.nationality || "—"} />
            <InfoLine label="Doğum tarihi" value={player.birth_date ? `${formatDate(player.birth_date)}${age != null ? ` (${age})` : ""}` : "—"} />
            <InfoLine label="Sezon (vitrin)" value={player.season || "—"} />
            <InfoLine label="İl" value={player.city || "—"} />
            <InfoLine label="Katılım" value={player.attendence_date ? formatDate(player.attendence_date) : "—"} />
            <InfoLine label="Kayıt no" value={`#${player.id}`} />
          </Panel>
          {pendingCount ? (
            <RecordCard
              title={`${pendingCount} bekleyen talep`}
              subtitle="Oyuncunun değişiklik, sahiplenme ve fotoğraf talepleri gelen kutusundan onaylanır."
              icon="hourglass-outline"
              iconTone="warn"
              onPress={() => router.push("/yonetim/talepler")}
            />
          ) : null}
          <Panel title="DURUM">
            <ToggleField label="Oyuncu aktif" hint="Pasif oyuncu listelerde görünmez." value={!passive} onChange={(v) => void askToggle(v)} />
          </Panel>
          <View style={styles.row}>
            {canMerge ? (
              <Button
                label="Birleştir"
                icon="git-merge-outline"
                variant="secondary"
                onPress={() => router.push(`/yonetim/oyuncu-birlestirme?players=${playerId}`)}
              />
            ) : null}
            {canDelete ? <Button label="Oyuncuyu sil" icon="trash-outline" variant="danger" loading={remove.isPending} onPress={() => void askDelete()} /> : null}
          </View>
        </View>
      )}

      <FormSheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Kişisel bilgiler"
        fields={fields}
        initial={
          player
            ? {
                player_name: player.player_name,
                player_position: positionLabel(player.player_position) || null,
                team_id: player.team_id,
                nationality: player.nationality ?? "",
                birth_date: dateOnly(player.birth_date),
                season: player.season ?? null,
                city: player.city ?? null,
                attendence_date: dateOnly(player.attendence_date),
                value: player.value ?? "",
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
});
