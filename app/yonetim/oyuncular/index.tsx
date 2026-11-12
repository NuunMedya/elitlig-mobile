/**
 * OYUNCULAR — web editor_pages/Editor_Players.js + Add_Player.js.
 *
 * Arama, süzgeç, sıralama ve sayfalama SUNUCUDA yapılır
 * (GET /api/players/admin-list): ~35 bin kayıt istemciye indirilmez; sona
 * gelince sonraki sayfa çekilir. Süzgeç seçenekleri (takım, mevki, il)
 * sunucunun döndürdüğü `facets`tan gelir. Dokununca oyuncu profili açılır.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  AdminList,
  AdminScreen,
  FormSheet,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { pickImageFile } from "@/components/admin/team/ImageUpload";
import { CountStrip, EntityCard, PickerChip, PositionAvatar } from "@/components/admin/team/ManageKit";
import { Avatar, Button, Chip, ChipGroup, FAB } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import type { UploadFile } from "@/lib/api/admin/leagues";
import { isNationwide, loadCityOptions, teamOptionsLoader } from "@/lib/api/admin/lookups";
import {
  DEFAULT_PLAYER_IMG,
  PLAYER_SORTS,
  POSITIONS,
  ageOf,
  createPlayerWithDetails,
  listPlayers,
  positionLabel,
  type AdminPlayerPage,
} from "@/lib/api/admin/players";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

const PERMS = ["players.create", "players.update", "players.delete"];
const KEY = ["admin", "players"] as const;
type Status = "" | "active" | "passive" | "nophoto";

export default function PlayersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const nationwide = isNationwide(user);
  const canCreate = hasPermission(user, "players.create");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [sort, setSort] = useState("recent");
  const [creating, setCreating] = useState(false);
  const [photo, setPhoto] = useState<UploadFile | null>(null);

  const filters = { q, status, teamId, position, city, sort };
  const query = useInfiniteQuery({
    queryKey: [...KEY, "list", user?.city ?? "", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listPlayers(user, {
        page: pageParam,
        q,
        sort,
        teamId,
        position,
        city,
        status: status === "active" || status === "passive" ? status : "",
        missingPhoto: status === "nophoto",
      }),
    getNextPageParam: (last: AdminPlayerPage) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const pages = query.data?.pages ?? [];
  const rows = useMemo(() => pages.flatMap((p) => p.items), [pages]);
  const facets = pages[0]?.facets;
  const total = pages[0]?.total ?? 0;
  const counts = facets?.counts;

  const create = useAdminMutation(
    (v: FormValues) =>
      createPlayerWithDetails({
        player_name: String(v.player_name ?? ""),
        team_id: Number(v.team_id),
        player_position: (v.player_position as string) || null,
        birth_date: (v.birth_date as string) || null,
        nationality: String(v.nationality ?? "").trim() || null,
        city: (v.city as string) || (nationwide ? null : user?.city) || null,
        image: photo,
      }),
    { success: (r) => r?.message || "Oyuncu eklendi.", invalidate: [KEY], onSuccess: () => setPhoto(null) }
  );

  const fields: FieldDef[] = [
    { key: "player_name", label: "Ad soyad", kind: "text", required: true },
    { key: "team_id", label: "Takım", kind: "select", required: true, loadOptions: teamOptionsLoader(user), queryKey: ["admin", "teams", "options"] },
    { key: "player_position", label: "Mevki", kind: "select", options: POSITIONS.map((p) => ({ value: p.label, label: p.label })) },
    { key: "birth_date", label: "Doğum tarihi", kind: "date" },
    { key: "nationality", label: "Uyruk", kind: "text", placeholder: "ör. Türkiye" },
    ...(nationwide ? [{ key: "city", label: "İl", kind: "select", required: true, loadOptions: loadCityOptions, queryKey: ["admin", "cities"] } as FieldDef] : []),
  ];

  return (
    <AdminScreen
      title="Oyuncular"
      subtitle={counts ? `${counts.total.toLocaleString("tr-TR")} oyuncu · ${counts.passive} pasif` : undefined}
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni oyuncu" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni oyuncu" /> : null}
    >
      <AdminList
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={query.refetch}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Oyuncu ya da takım adı"
        extraHeader={
          <View style={styles.head}>
            <CountStrip
              items={[
                { key: "total", label: "Toplam", value: counts?.total ?? "—", icon: "people", selected: status === "", onPress: () => setStatus("") },
                { key: "passive", label: "Pasif", value: counts?.passive ?? "—", icon: "pause-circle", selected: status === "passive", onPress: () => setStatus(status === "passive" ? "" : "passive") },
                { key: "nophoto", label: "Fotoğrafsız", value: counts?.missingPhoto ?? "—", tone: "warn", icon: "camera-outline", selected: status === "nophoto", onPress: () => setStatus(status === "nophoto" ? "" : "nophoto") },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Aktif" size="sm" icon="checkmark-circle-outline" selected={status === "active"} onPress={() => setStatus(status === "active" ? "" : "active")} />
              <PickerChip<number>
                icon="shield-half-outline"
                placeholder="Takım"
                title="Takım"
                value={teamId}
                onChange={setTeamId}
                options={(facets?.teams ?? []).map((t) => ({ value: Number(t.id), label: t.team_name }))}
              />
              <PickerChip<string>
                icon="body-outline"
                placeholder="Mevki"
                title="Mevki"
                value={position}
                onChange={setPosition}
                options={(facets?.positions ?? []).map((p) => ({ value: p, label: positionLabel(p) }))}
              />
              {nationwide ? (
                <PickerChip<string>
                  icon="location-outline"
                  placeholder="İl"
                  title="İl"
                  value={city}
                  onChange={setCity}
                  options={(facets?.cities ?? []).map((c) => ({ value: c, label: c }))}
                />
              ) : null}
              <PickerChip<string>
                icon="swap-vertical"
                placeholder="Sırala"
                title="Sırala"
                value={sort}
                onChange={(v) => setSort(v ?? "recent")}
                options={PLAYER_SORTS.map((s) => ({ value: s.key, label: s.label }))}
                clearable={false}
                highlight={false}
              />
            </ChipGroup>
          </View>
        }
        summary={query.data ? `${total.toLocaleString("tr-TR")} sonuç` : null}
        keyExtractor={(p) => String(p.id)}
        emptyIcon="people-outline"
        emptyTitle={q ? "Aramaya uyan oyuncu yok" : "Oyuncu yok"}
        emptyBody={q ? "Adın bir kısmını ya da takım adını dene." : "Süzgeçleri temizleyince tüm oyuncular görünür."}
        renderItem={({ item }) => {
          const age = ageOf(item.birth_date);
          const passive = item.active === false || item.active === 0;
          const noPhoto = !item.player_img || item.player_img === DEFAULT_PLAYER_IMG;
          return (
            <EntityCard
              leading={<PositionAvatar name={item.player_name} image={noPhoto ? null : item.player_img} position={item.player_position} size={46} dimmed={passive} />}
              overline={[nationwide ? item.city : null, `#${item.id}`].filter(Boolean).join(" · ")}
              title={item.player_name}
              subtitle={[item.team_name || "Serbest oyuncu", positionLabel(item.player_position) || null, age != null ? `${age} yaş` : null].filter(Boolean).join(" · ")}
              muted={passive}
              pills={[passive && { label: "Pasif", icon: "pause" }, !item.team_name && { label: "Takımsız", tone: "warn" }]}
              warning={noPhoto ? "Fotoğraf yok" : null}
              stats={[
                { label: "Maç", value: item.total_matches ?? 0 },
                { label: "Gol", value: item.total_goals ?? 0, tone: item.total_goals ? "accent" : "neutral" },
                { label: "Son maç", value: item.last_match_date ? formatDate(item.last_match_date, false) : "—" },
              ]}
              onPress={() => router.push(`/yonetim/oyuncular/${item.id}`)}
            />
          );
        }}
      />

      <FormSheet
        visible={creating}
        onClose={() => {
          setCreating(false);
          setPhoto(null);
        }}
        title="Yeni oyuncu"
        fields={fields}
        submitLabel="Oyuncuyu ekle"
        onSubmit={(v) => create.mutateAsync(v)}
      >
        <View style={styles.photoRow}>
          <Avatar name="Yeni oyuncu" image={photo?.uri ?? null} size={48} />
          <Button
            label={photo ? "Fotoğrafı değiştir" : "Fotoğraf seç (isteğe bağlı)"}
            icon="image-outline"
            variant="secondary"
            size="sm"
            onPress={async () => {
              const file = await pickImageFile("oyuncu");
              if (file) setPhoto(file);
            }}
          />
        </View>
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  photoRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
});
