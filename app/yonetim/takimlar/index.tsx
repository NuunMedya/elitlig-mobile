/**
 * TAKIMLAR — web editor_pages/Editor_Teams.js + Add_Teams.js.
 *
 * Liste: arama, il (Türkiye geneli hesaplar) ve lig süzgeci, durum çipleri
 * (aktif / pasif / logosuz), sıralama. Her satırda oyuncu sayısı, oynanan
 * maç ve son maç tarihi (GET /api/admin/teams-overview). Dokununca takım
 * profili açılır. "Yeni takım" lig + sezon + isteğe bağlı logo ve iletişim
 * bilgisiyle kayıt açar.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AdminList,
  AdminScreen,
  FormSheet,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { pickImageFile } from "@/components/admin/team/ImageUpload";
import { CountStrip, EntityCard, PickerChip } from "@/components/admin/team/ManageKit";
import { Button, Chip, ChipGroup, FAB, TeamLogo } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { relativeDay } from "@/lib/admin/format";
import type { UploadFile } from "@/lib/api/admin/leagues";
import {
  fetchScopedLeagues,
  fetchScopedSeasons,
  foldText,
  isArchived,
  isNationwide,
  loadCityOptions,
  seasonBelongsToLeague,
} from "@/lib/api/admin/lookups";
import {
  TEAM_SORTS,
  cleanLabel,
  createTeam,
  getTeamsOverview,
  hasRealLogo,
  listTeams,
  type Team,
  type TeamOverviewRow,
} from "@/lib/api/admin/teams";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, textScale, type } from "@/theme";

const PERMS = ["teams.create", "teams.update", "teams.delete"];
const KEY = ["admin", "teams"] as const;
type Status = "all" | "active" | "passive" | "nologo";

const CONTACT_FIELDS: FieldDef[] = [
  { key: "contact_name", label: "İletişim kişisi", kind: "text", maxLength: 120 },
  { key: "phone", label: "Telefon", kind: "phone", maxLength: 40 },
  { key: "phone2", label: "İkinci telefon", kind: "phone", maxLength: 40 },
  { key: "whatsapp", label: "WhatsApp", kind: "phone", maxLength: 40 },
  { key: "email", label: "E-posta", kind: "email", maxLength: 160 },
];

export default function TeamsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const nationwide = isNationwide(user);
  const canCreate = hasPermission(user, "teams.create");
  const canContact = hasPermission(user, "teams.notes");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [city, setCity] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const [sort, setSort] = useState("created:desc");
  const [creating, setCreating] = useState(false);
  const [logo, setLogo] = useState<UploadFile | null>(null);
  // Formda seçilen lig: sezon seçenekleri bu lige göre süzülür.
  const [formLeague, setFormLeague] = useState<string | null>(null);

  const teams = useQuery({ queryKey: [...KEY, user?.city ?? ""], queryFn: () => listTeams(user) });
  const overview = useQuery({ queryKey: [...KEY, "overview"], queryFn: getTeamsOverview });
  const leagues = useQuery({ queryKey: ["admin", "leagues", user?.city ?? ""], queryFn: () => fetchScopedLeagues(user, false), enabled: creating });
  const seasons = useQuery({ queryKey: ["admin", "seasons", "active", user?.city ?? ""], queryFn: () => fetchScopedSeasons(user, false), enabled: creating });

  const stats = useMemo(() => new Map((overview.data ?? []).map((r) => [Number(r.team_id), r] as const)), [overview.data]);
  const all = teams.data ?? [];

  const counts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((t) => t.active !== false).length,
      passive: all.filter((t) => t.active === false).length,
      nologo: all.filter((t) => !hasRealLogo(t)).length,
    }),
    [all]
  );

  const leagueChoices = useMemo(
    () => [...new Set(all.map((t) => cleanLabel(t.current_league)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
    [all]
  );

  const rows = useMemo(() => {
    const needle = foldText(q);
    const filtered = all.filter((t) => {
      if (needle && !foldText(t.team_name).includes(needle) && String(t.id) !== q.trim()) return false;
      if (city && foldText(t.city) !== foldText(city)) return false;
      if (league && cleanLabel(t.current_league) !== league) return false;
      if (status === "active" && t.active === false) return false;
      if (status === "passive" && t.active !== false) return false;
      if (status === "nologo" && hasRealLogo(t)) return false;
      return true;
    });
    const [key, dir] = sort.split(":");
    const sign = dir === "asc" ? 1 : -1;
    const of = (t: Team): TeamOverviewRow | undefined => stats.get(Number(t.id));
    const byName = (a: Team, b: Team) => a.team_name.localeCompare(b.team_name, "tr");
    const time = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    const cmp: Record<string, (a: Team, b: Team) => number> = {
      name: (a, b) => byName(a, b) * sign,
      players: (a, b) => ((of(a)?.player_count ?? 0) - (of(b)?.player_count ?? 0)) * sign || byName(a, b),
      matches: (a, b) => ((of(a)?.played_matches ?? 0) - (of(b)?.played_matches ?? 0)) * sign || byName(a, b),
      lastMatch: (a, b) => (time(of(a)?.last_match_date) - time(of(b)?.last_match_date)) * sign || byName(a, b),
      created: (a, b) => (time(a.createdAt) - time(b.createdAt) || a.id - b.id) * sign,
    };
    return [...filtered].sort(cmp[key] ?? cmp.created);
  }, [all, q, city, league, status, sort, stats]);

  const create = useAdminMutation(
    (v: FormValues) => {
      const contact = canContact
        ? Object.fromEntries(
            CONTACT_FIELDS.map((f) => [f.key, String(v[f.key] ?? "").trim()] as const).filter(([, value]) => value)
          )
        : {};
      return createTeam({
        team_name: String(v.team_name ?? ""),
        current_league: String(v.current_league ?? ""),
        current_season: String(v.current_season ?? ""),
        city: (v.city as string) || (nationwide ? null : user?.city) || null,
        team_points: Number(v.team_points) || 0,
        contact,
        logo,
      });
    },
    {
      success: (r) => (r?.contact_error ? `Takım eklendi. ${r.contact_error}` : "Takım eklendi."),
      invalidate: [KEY],
      onSuccess: () => setLogo(null),
    }
  );

  const leagueOptions = (leagues.data ?? []).filter((l) => !isArchived(l)).map((l) => ({ value: l.league_name, label: l.league_name }));
  const selectedLeague = (leagues.data ?? []).find((l) => l.league_name === formLeague) ?? null;
  const seasonOptions = (seasons.data ?? [])
    .filter((s) => !isArchived(s) && (!selectedLeague || seasonBelongsToLeague(s, selectedLeague)))
    .map((s) => ({ value: s.season_name, label: s.season_name }));
  const createFields: FieldDef[] = [
    { key: "team_name", label: "Takım adı", kind: "text", required: true },
    ...(nationwide ? [{ key: "city", label: "İl", kind: "select", required: true, loadOptions: loadCityOptions, queryKey: ["admin", "cities"] } as FieldDef] : []),
    {
      key: "current_league",
      label: "Lig",
      kind: "select",
      required: true,
      options: leagueOptions,
      onChange: (value) => {
        setFormLeague((value as string) ?? null);
        return { current_season: null };
      },
    },
    {
      key: "current_season",
      label: "Sezon",
      kind: "select",
      required: true,
      hidden: (v) => !v.current_league,
      // Sezonlar seçilen ligin sezonlarıdır (ad + il ile eşleşen eski kayıtlar dahil).
      options: seasonOptions,
    },
    { key: "team_points", label: "Takım puanı", kind: "number", hint: "Boş bırakılırsa 0." },
    ...(canContact ? CONTACT_FIELDS : []),
  ];

  /* Kartın eksik bilgi uyarısı: logo, lig, sezon. */
  const missingOf = (t: Team) =>
    [!hasRealLogo(t) && "logo", !cleanLabel(t.current_league) && "lig", !cleanLabel(t.current_season) && "sezon"].filter(Boolean) as string[];

  return (
    <AdminScreen
      title="Takımlar"
      subtitle={`${counts.active} aktif · ${counts.all} toplam`}
      permission={PERMS}
      scroll={false}
      overlay={
        canCreate ? (
          <FAB icon="add" label="Yeni takım" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni takım" />
        ) : null
      }
    >
      <AdminList
        data={rows}
        loading={teams.isLoading}
        error={teams.error}
        onRetry={teams.refetch}
        refreshing={teams.isRefetching}
        onRefresh={() => {
          void teams.refetch();
          void overview.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım adı ya da no"
        extraHeader={
          <View style={styles.head}>
            {/* SAYAÇLAR = DURUM SÜZGECİ: karoya dokununca liste o duruma süzülür. */}
            <CountStrip
              items={[
                { key: "active", label: "Aktif", value: counts.active, tone: "win", selected: status === "active", onPress: () => setStatus(status === "active" ? "all" : "active") },
                { key: "passive", label: "Pasif", value: counts.passive, tone: "neutral", icon: "pause-circle", selected: status === "passive", onPress: () => setStatus(status === "passive" ? "all" : "passive") },
                { key: "nologo", label: "Logosuz", value: counts.nologo, tone: "warn", icon: "image-outline", selected: status === "nologo", onPress: () => setStatus(status === "nologo" ? "all" : "nologo") },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Tümü" size="sm" count={counts.all} selected={status === "all"} onPress={() => setStatus("all")} />
              {nationwide ? (
                <PickerChip<string>
                  icon="location-outline"
                  placeholder="Tüm iller"
                  title="İl"
                  value={city}
                  onChange={setCity}
                  loadOptions={loadCityOptions}
                  queryKey={["admin", "cities"]}
                />
              ) : null}
              <PickerChip<string>
                icon="trophy-outline"
                placeholder="Tüm ligler"
                title="Lig"
                value={league}
                onChange={setLeague}
                options={leagueChoices.map((l) => ({ value: l, label: l }))}
              />
              <PickerChip<string>
                icon="swap-vertical"
                placeholder="Sırala"
                title="Sırala"
                value={sort}
                onChange={(v) => setSort(v ?? "created:desc")}
                options={TEAM_SORTS.map((s) => ({ value: s.key, label: s.label }))}
                clearable={false}
                highlight={false}
              />
            </ChipGroup>
          </View>
        }
        summary={`${rows.length} takım${status !== "all" || league || city ? " · süzgeç açık" : ""}`}
        keyExtractor={(t) => String(t.id)}
        emptyIcon="shield-half-outline"
        emptyTitle={q ? "Aramaya uyan takım yok" : "Takım yok"}
        emptyBody={q ? "Takım adını kısaltarak ya da kayıt numarasıyla dene." : "Süzgeçleri temizleyince tüm takımlar görünür."}
        renderItem={({ item }) => {
          const s = stats.get(Number(item.id));
          const passive = item.active === false;
          const missing = missingOf(item);
          const leagueName = cleanLabel(item.current_league);
          const seasonName = cleanLabel(item.current_season);
          return (
            <EntityCard
              leading={<TeamLogo name={item.team_name} logo={hasRealLogo(item) ? item.logo : null} size={52} dimmed={passive} />}
              overline={[nationwide ? item.city : null, `#${item.id}`].filter(Boolean).join(" · ")}
              title={item.team_name}
              subtitle={[leagueName, seasonName].filter(Boolean).join(" · ") || null}
              muted={passive}
              pills={[
                passive ? { label: "Pasif", tone: "neutral", icon: "pause" } : { label: "Aktif", tone: "win" },
                s && s.played_matches === 0 && { label: "Maç oynamadı", tone: "neutral" },
              ]}
              warning={missing.length ? `Eksik: ${missing.join(", ")}` : null}
              stats={
                s
                  ? [
                      { label: "Oyuncu", value: s.player_count, tone: s.player_count ? "neutral" : "warn" },
                      { label: "Maç", value: s.played_matches },
                      { label: "Son maç", value: s.last_match_date ? relativeDay(s.last_match_date) : "—" },
                    ]
                  : undefined
              }
              onPress={() => router.push(`/yonetim/takimlar/${item.id}`)}
              accessibilityLabel={[item.team_name, leagueName, seasonName, passive ? "pasif" : "aktif"].filter(Boolean).join(", ")}
            />
          );
        }}
      />

      <FormSheet
        visible={creating}
        onClose={() => {
          setCreating(false);
          setLogo(null);
          setFormLeague(null);
        }}
        title="Yeni takım"
        intro="Takım lig ve sezonla birlikte açılır; logo ve iletişim bilgisi sonradan da eklenebilir."
        fields={createFields}
        initial={{}}
        submitLabel="Takımı ekle"
        onSubmit={(v) => create.mutateAsync(v)}
      >
        <View style={styles.logoRow}>
          <TeamLogo name="Yeni takım" logo={logo?.uri ?? null} size={56} />
          <View style={styles.logoText}>
            <Text style={styles.logoTitle} {...textScale.dense}>
              Takım logosu
            </Text>
            <Text style={styles.logoHint} {...textScale.dense}>
              {logo ? "Seçildi · kayıtla birlikte yüklenir" : "İsteğe bağlı · kare PNG önerilir"}
            </Text>
          </View>
          <Button
            label={logo ? "Değiştir" : "Seç"}
            icon="image-outline"
            variant="secondary"
            size="sm"
            onPress={async () => {
              const file = await pickImageFile("takim-logo");
              if (file) setLogo(file);
            }}
          />
        </View>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
  },
  logoText: { flex: 1, minWidth: 0 },
  logoTitle: { ...type.h4, color: colors.textPrimary },
  logoHint: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
});
