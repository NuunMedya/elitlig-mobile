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
  RecordCard,
  SelectField,
  ToggleField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { MarketValuePanel } from "@/components/admin/player/MarketValuePanel";
import { ImageEditBadge } from "@/components/admin/team/ImageUpload";
import { DangerNote, EntityCard, FactRow, GroupCard, IdentityStage, ListLine, PositionAvatar, StagePill } from "@/components/admin/team/ManageKit";
import { Avatar, Button, EmptyState, ErrorState, IconTile, Odometer, Reveal, SkeletonCard, SkeletonHero, Tabs, TeamLogo } from "@/components/ui";
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
import { colors, radius, space, textScale, type } from "@/theme";

const PERMS = ["players.update"];
type Tab = "profile" | "teams" | "value" | "account";
/** Sahne hücresine sığan kısa değer: 12.500 → "12,5B", 1.250.000 → "1,3M". */
const compactEtl = (value: unknown) => {
  const n = Number(value);
  if (!value || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}B`;
  return String(Math.round(n));
};
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

  const noPhoto = !player?.player_img || player.player_img === DEFAULT_PLAYER_IMG;
  const jersey = player ? data?.teams.find((t) => Number(t.team_id) === Number(player.team_id))?.jersey_number ?? null : null;
  const missing = player
    ? [noPhoto && "fotoğraf", !player.player_position && "mevki", !player.birth_date && "doğum tarihi", !data?.team && "takım"].filter(Boolean)
    : [];

  return (
    <AdminScreen
      title={player?.player_name ?? "Oyuncu"}
      subtitle={player ? `Oyuncu profili · #${player.id}` : undefined}
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
    >
      {query.isLoading ? (
        <>
          <SkeletonHero />
          <SkeletonCard />
        </>
      ) : query.error || !data || !player ? (
        <ErrorState error={query.error ?? new Error("Oyuncu bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <Reveal scaleFrom={0.97}>
            <IdentityStage
              leading={
                <ImageEditBadge kind="photo" prefix={`oyuncu-${player.id}`} upload={(file) => uploadPlayerImage(playerId, file)} onDone={() => void query.refetch()}>
                  <PositionAvatar name={player.player_name} image={noPhoto ? null : player.player_img} position={player.player_position} size={68} jersey={jersey} dimmed={passive} />
                </ImageEditBadge>
              }
              overline={[positionLabel(player.player_position) || "Mevki yok", player.city].filter(Boolean).join(" · ")}
              title={player.player_name}
              subtitle={[data.team?.team_name || "Serbest oyuncu", age != null ? `${age} yaş` : null, player.nationality].filter(Boolean).join(" · ")}
              pills={
                <>
                  <StagePill label={passive ? "Pasif" : "Aktif"} tone={passive ? "warn" : "win"} />
                  <StagePill label={data.owner ? "Üye hesabı var" : "Hesapsız"} icon={data.owner ? "person" : "person-outline"} />
                  {pendingCount ? <StagePill label={`${pendingCount} talep`} icon="hourglass" tone="gold" /> : null}
                </>
              }
              stats={[
                { label: "Maç", value: player.total_matches ?? 0 },
                { label: "Gol", value: player.total_goals ?? 0 },
                { label: "Takım", value: data.teams.length },
                { label: "Piyasa · ETL", value: compactEtl(player.value) },
              ]}
            />
          </Reveal>

          <Tabs<Tab>
            tone="paper"
            items={[
              { key: "profile", label: "Profil", badge: pendingCount ? "dot" : undefined },
              { key: "teams", label: "Takımlar" },
              { key: "value", label: "Değer" },
              { key: "account", label: "Hesap" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "teams" ? (
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
              <GroupCard title={`Takım kadroları · ${data.teams.length}`} icon="shield-half" tone="violet" padded={false}>
                {data.teams.length ? (
                  <View>
                    {data.teams.map((link, i) => (
                      <ListLine
                        key={link.id}
                        leading={<TeamLogo name={link.team?.team_name} logo={link.team?.logo} size={36} />}
                        title={link.team?.team_name ?? `Takım #${link.team_id}`}
                        subtitle={
                          [link.jersey_number != null ? `Forma #${link.jersey_number}` : null, link.team_position ? positionLabel(link.team_position) : null, link.squad_role]
                            .filter(Boolean)
                            .join(" · ") || "Forma no / mevki yok"
                        }
                        pills={[Number(link.team_id) === Number(player.team_id) && { label: "Vitrin takımı", tone: "brand", icon: "star" }]}
                        onPress={() => router.push(`/yonetim/takimlar/${link.team_id}`)}
                        onLongPress={() => void askUnlink(link)}
                        last={i === data.teams.length - 1}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.muted, styles.inset]} {...textScale.long}>
                    Kadro bağı yok; oyuncu serbest.
                  </Text>
                )}
                <Text style={[styles.muted, styles.inset, styles.foot]} {...textScale.dense}>
                  {data.teams.length ? "Kadrodan çıkarmak için takıma basılı tut. Forma no ve mevki takım yönetiminden girilir." : "Yukarıdan bir takıma ekle."}
                </Text>
              </GroupCard>

              <GroupCard title={`Sezon kadroları · ${data.memberships.length}`} icon="calendar" tone="cyan" padded={false}>
                {data.memberships.length ? (
                  <View style={styles.foot}>
                    {data.memberships.map((m, i) => (
                      <ListLine
                        key={m.id}
                        leading={<TeamLogo name={m.team?.team_name} logo={m.team?.logo} size={36} />}
                        title={m.team?.team_name ?? `Takım #${m.team_id}`}
                        subtitle={[m.season?.season_name, m.season?.league_name, m.joined_at ? formatDate(m.joined_at) : null].filter(Boolean).join(" · ")}
                        pills={[
                          { label: MEMBERSHIP_STATUS_LABELS[m.membership_status] ?? m.membership_status, tone: m.membership_status === "active" ? "win" : "neutral" },
                          m.is_licensed && { label: "Lisanslı", tone: "info", icon: "id-card" },
                          m.membership_kind === "loan" && { label: "Kiralık", tone: "warn" },
                        ]}
                        onPress={m.team_id ? () => router.push(`/yonetim/takimlar/${m.team_id}`) : undefined}
                        last={i === data.memberships.length - 1}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.muted, styles.inset, styles.foot]} {...textScale.long}>
                    Sezon kadrosu üyeliği yok.
                  </Text>
                )}
              </GroupCard>

              {data.loans.length || data.contracts.length ? (
                <GroupCard title="Kiralıklar ve sözleşmeler" icon="document-text" tone="gold" padded={false}>
                  <View style={styles.foot}>
                    {data.loans.map((l, i) => (
                      <ListLine
                        key={`loan-${l.id}`}
                        leading={<IconTile icon="swap-horizontal" tone="gold" size={36} glow={false} />}
                        title={`Kiralık · ${l.team?.team_name ?? "Takım"}`}
                        subtitle={[l.from_team?.team_name ? `${l.from_team.team_name} takımından` : null, l.start_date ? formatDate(l.start_date) : null, l.end_date ? `→ ${formatDate(l.end_date)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                        pills={[{ label: l.status === "active" ? "Aktif" : "Sona erdi", tone: l.status === "active" ? "warn" : "neutral" }]}
                        last={i === data.loans.length - 1 && !data.contracts.length}
                      />
                    ))}
                    {data.contracts.map((c, i) => (
                      <ListLine
                        key={`contract-${c.id}`}
                        leading={<IconTile icon="document-text" tone="violet" size={36} glow={false} />}
                        title={`${c.transfer_type === "loan" ? "Kiralık sözleşme" : "Sözleşme"} · ${c.team?.team_name ?? "Takım"}`}
                        subtitle={[c.start_date ? formatDate(c.start_date) : null, c.end_date ? `→ ${formatDate(c.end_date)}` : "Süresiz"].filter(Boolean).join(" ")}
                        pills={[{ label: CONTRACT_STATUS_LABELS[c.status] ?? c.status, tone: c.status === "ACTIVE" ? "win" : c.status === "PENDING_ACTIVATION" ? "warn" : "neutral" }]}
                        onPress={() => router.push("/yonetim/transfer-onaylari")}
                        last={i === data.contracts.length - 1}
                      />
                    ))}
                  </View>
                </GroupCard>
              ) : null}
            </View>
          ) : tab === "value" ? (
            <View style={styles.stack}>
              <MarketValuePanel playerId={playerId} user={user} />
              <GroupCard title="Vitrin istatistikleri" icon="stats-chart" tone="mint">
                <View style={styles.statGrid}>
                  {[
                    { label: "Maç", value: player.total_matches ?? 0, color: colors.textPrimary },
                    { label: "Gol", value: player.total_goals ?? 0, color: colors.accentText },
                    { label: "Sarı", value: Number(player.total_yellow_cards ?? 0), color: colors.warn },
                    { label: "Kırmızı", value: Number(player.total_red_cards ?? 0), color: colors.danger },
                  ].map((st) => (
                    <View key={st.label} style={styles.statCell}>
                      <Odometer value={st.value} style={[styles.statValue, { color: st.color }]} />
                      <Text style={styles.statLabel} {...textScale.badge}>
                        {st.label}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.muted} {...textScale.long}>
                  Maç, gol ve kart sayıları maç istatistiklerinden hesaplanır; elle değiştirilmez.
                </Text>
              </GroupCard>
            </View>
          ) : tab === "account" ? (
            data.owner ? (
              <EntityCard
                leading={<Avatar name={data.owner.full_name || data.owner.username} size={52} ring="brand" />}
                overline="Bağlı üye hesabı"
                title={data.owner.full_name || data.owner.username || "—"}
                subtitle={data.owner.username ? `@${data.owner.username}` : null}
                pills={[!!data.owner.role && { label: data.owner.role, tone: "brand" }, !!data.owner.status && { label: data.owner.status, tone: data.owner.status === "active" ? "win" : "warn" }]}
                footer={
                  <View>
                    <FactRow icon="mail-outline" label="E-posta" value={data.owner.email || null} />
                    <FactRow icon="call-outline" label="Telefon" value={data.owner.phone ? formatPhone(data.owner.phone) : null} />
                    <FactRow icon="calendar-outline" label="Kayıt" value={data.owner.created_at ? formatDate(data.owner.created_at) : null} last />
                  </View>
                }
              />
            ) : (
              <EmptyState icon="person-outline" variant="inline" title="Bağlı üye hesabı yok" body="Bu oyuncu profilini sahiplenmiş bir üye hesabı yok." />
            )
          ) : (
            <View style={styles.stack}>
              {pendingCount ? (
                <RecordCard
                  title={`${pendingCount} bekleyen talep`}
                  subtitle="Değişiklik, sahiplenme ve fotoğraf talepleri Talepler ekranından onaylanır."
                  icon="hourglass-outline"
                  iconTone="warn"
                  accentColor={colors.warn}
                  onPress={() => router.push("/yonetim/talepler")}
                />
              ) : null}
              {missing.length ? <DangerNote tone="warn" title="Eksik bilgi" body={`Tamamlanmamış: ${missing.join(", ")}.`} /> : null}
              <GroupCard title="Kişisel bilgiler" icon="person" tone="violet" action={{ label: "Düzenle", onPress: () => setEditing(true) }}>
                <View>
                  <FactRow icon="text-outline" label="Ad soyad" value={player.player_name} />
                  <FactRow icon="body-outline" label="Mevki" value={positionLabel(player.player_position) || null} />
                  <FactRow icon="shield-half-outline" label="Takım (vitrin)" value={data.team?.team_name || "Serbest"} />
                  <FactRow icon="shirt-outline" label="Forma" value={jersey != null ? `#${jersey}` : null} />
                  <FactRow icon="flag-outline" label="Uyruk" value={player.nationality || null} />
                  <FactRow icon="gift-outline" label="Doğum tarihi" value={player.birth_date ? `${formatDate(player.birth_date)}${age != null ? ` · ${age} yaş` : ""}` : null} />
                  <FactRow icon="calendar-outline" label="Sezon (vitrin)" value={player.season || null} />
                  <FactRow icon="location-outline" label="İl" value={player.city || null} />
                  <FactRow icon="enter-outline" label="Katılım" value={player.attendence_date ? formatDate(player.attendence_date) : null} last />
                </View>
              </GroupCard>
              <GroupCard title="Durum ve tehlikeli bölge" icon="settings" tone="neutral">
                <ToggleField label="Oyuncu aktif" hint="Pasif oyuncu listelerde görünmez." value={!passive} onChange={(v) => void askToggle(v)} />
                {canMerge ? (
                  <Button
                    label="Mükerrer kayıtla birleştir"
                    icon="git-merge-outline"
                    variant="secondary"
                    fullWidth
                    onPress={() => router.push(`/yonetim/oyuncu-birlestirme?players=${playerId}`)}
                  />
                ) : null}
                {canDelete ? (
                  <>
                    <DangerNote title="Oyuncuyu silmek" body="Takım bağları da silinir. Mükerrer kayıtsa silmek yerine birleştir; maç geçmişi korunur." />
                    <Button label="Oyuncuyu sil" icon="trash-outline" variant="danger" fullWidth loading={remove.isPending} onPress={() => void askDelete()} />
                  </>
                ) : null}
              </GroupCard>
            </View>
          )}
        </>
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
  muted: { ...type.bodySm, color: colors.textTertiary },
  inset: { paddingHorizontal: space.lg },
  foot: { paddingBottom: space.md },
  statGrid: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.surface2, paddingVertical: space.md },
  statCell: { flex: 1, alignItems: "center", gap: space.xxs },
  statValue: { ...type.metric },
  statLabel: { ...type.micro, color: colors.textTertiary },
});
