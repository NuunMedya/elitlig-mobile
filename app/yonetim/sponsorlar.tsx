/**
 * SPONSORLAR — yayın kaplaması, saha LED ekranı ve web sitesi sponsorları.
 *
 * Web: pages/management/sponsors/SponsorsAdmin.js. Liste (arama + durum
 * süzgeci + sayaçlar) → sponsora dokununca düzenleyici alt sayfa (bilgiler,
 * kullanım yerine göre görseller, görünüm yerleri, sözleşme). Basılı tutunca
 * hızlı eylemler: aktifleştir / pasife al, sil. Yayın yeri seçilen sponsor
 * reji panelinin Yayın sekmesinde "ekrana ver" ile gösterilir (bu ekran değil).
 */

import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";


import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { SysStage } from "@/components/admin/system/SysKit";
import { SponsorEditor } from "@/components/admin/broadcast/SponsorEditor";
import { FAB, Touchable, withAlpha } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import {
  createSponsor,
  deleteSponsor,
  getSponsorCatalog,
  listSponsors,
  updateSponsor,
  type Sponsor,
  type SponsorPayload,
} from "@/lib/api/admin/broadcast";
import { getCities } from "@/lib/api/meta";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["sponsors.view", "sponsors.manage"] as const;

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "live", label: "Yayında" },
  { key: "inactive", label: "Pasif / süresi dolan" },
  { key: "broadcast", label: "Yayın alanı" },
  { key: "web", label: "Web alanı" },
  { key: "app", label: "Uygulama alanı" },
];

const onAirGroup = (group?: string) => group === "broadcast" || group === "led";

export default function SponsorsScreen() {
  const auth = useAuth();
  const canManage = hasAnyPermission(auth.user, ["sponsors.manage"]);
  const canDelete = hasAnyPermission(auth.user, ["sponsors.delete"]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Sponsor | "new" | null>(null);
  const [menu, setMenu] = useState<Sponsor | null>(null);

  const catalog = useQuery({ queryKey: ["admin", "sponsors", "catalog"], queryFn: getSponsorCatalog, staleTime: 300_000 });
  const nationwide = Boolean(catalog.data?.scope.nationwide);
  const list = useQuery({ queryKey: ["admin", "sponsors", "list"], queryFn: () => listSponsors() });
  const cities = useQuery({ queryKey: ["admin", "sponsors", "cities"], queryFn: getCities, enabled: nationwide, staleTime: 300_000 });

  const groupOf = (key: string) => catalog.data?.placements.find((p) => p.key === key)?.group;
  const items = useMemo(() => list.data ?? [], [list.data]);
  const stats = {
    total: items.length,
    live: items.filter((s) => s.live).length,
    broadcast: items.filter((s) => s.live && s.placements.some((k) => onAirGroup(groupOf(k)))).length,
    web: items.filter((s) => s.live && s.placements.some((k) => groupOf(k) === "web" || groupOf(k) === "app")).length,
  };
  const visible = items.filter((s) => {
    const text = q.trim().toLocaleLowerCase("tr-TR");
    if (text && ![s.name, s.tagline, s.contactName].join(" ").toLocaleLowerCase("tr-TR").includes(text)) return false;
    if (filter === "live") return s.live;
    if (filter === "inactive") return !s.live;
    if (filter === "broadcast") return s.placements.some((k) => onAirGroup(groupOf(k)));
    if (filter === "web") return s.placements.some((k) => groupOf(k) === "web");
    if (filter === "app") return s.placements.some((k) => groupOf(k) === "app");
    return true;
  });

  // Logo ızgarası: iki sütun; liste satırı bir çift karodur.
  const pairs = useMemo(() => {
    const out: Sponsor[][] = [];
    for (let i = 0; i < visible.length; i += 2) out.push(visible.slice(i, i + 2));
    return out;
  }, [visible]);

  const invalidate = [["admin", "sponsors", "list"]];
  const save = useAdminMutation(
    (body: Partial<SponsorPayload>) => (editing && editing !== "new" ? updateSponsor(editing.id, body) : createSponsor(body)),
    { success: (r) => `${r.sponsor.name} ${editing === "new" ? "eklendi" : "güncellendi"}.`, invalidate }
  );
  const toggle = useAdminMutation((s: Sponsor) => updateSponsor(s.id, { active: !s.active }), {
    success: (r) => (r.sponsor.active ? `${r.sponsor.name} aktifleştirildi.` : `${r.sponsor.name} pasife alındı.`),
    invalidate,
  });
  const remove = useAdminMutation((s: Sponsor) => deleteSponsor(s.id), { success: (_r, s) => `${s.name} silindi.`, invalidate });

  const askDelete = async (s: Sponsor) => {
    const ok = await confirmAction({
      title: "Sponsoru sil",
      message: `${s.name} kalıcı olarak silinecek. Yayındaki grafikleri ve web alanları kalkar; görseller ve sözleşme bilgileri geri alınamaz. Geçici durdurmak için "Pasife al" kullan.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) {
      remove.mutate(s);
      setEditing(null);
    }
  };

  const tierLabel = (key: string) => catalog.data?.tiers.find((t) => t.key === key)?.label;

  return (
    <AdminScreen
      title="Sponsorlar"
      subtitle="Sponsor bantları ve yerleşimler"
      permission={PERMS}
      scroll={false}
      overlay={canManage ? <FAB icon="add" label="Yeni sponsor" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni sponsor" /> : null}
    >
      <AdminList<Sponsor[]>
        data={pairs}
        loading={list.isLoading || catalog.isLoading}
        error={list.error || catalog.error}
        onRetry={() => {
          void catalog.refetch();
          void list.refetch();
        }}
        refreshing={list.isRefetching}
        onRefresh={list.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Sponsor ara"
        filters={FILTERS}
        filter={filter}
        onFilter={setFilter}
        extraHeader={
          <SysStage
            eyebrow="Sponsor vitrini"
            title="Markalar nerede görünüyor"
            icon="megaphone"
            tone="gold"
            value={stats.total}
            valueLabel="sponsor"
            stats={[
              { label: "Aktif", value: stats.live, icon: "checkmark-circle", tone: "win" },
              { label: "Yayında", value: stats.broadcast, icon: "tv", tone: "danger" },
              { label: "Web/uygulama", value: stats.web, icon: "globe", tone: "info" },
            ]}
          />
        }
        emptyIcon="megaphone-outline"
        emptyTitle={items.length ? "Süzgeçle eşleşen sponsor yok" : "Henüz sponsor eklenmedi"}
        keyExtractor={(row) => row.map((s) => s.id).join("-")}
        renderItem={({ item: row }) => (
          <View style={styles.gridRow}>
            {row.map((item) => (
              <SponsorTile
                key={item.id}
                item={item}
                tier={tierLabel(item.tier)}
                city={item.cityId == null ? "Tüm iller" : nationwide ? cities.data?.find((c) => c.id === item.cityId)?.label ?? null : null}
                groups={[...new Set(item.placements.map((k) => groupOf(k)).filter(Boolean) as string[])]}
                onPress={() => setEditing(item)}
                onLongPress={canManage || canDelete ? () => setMenu(item) : undefined}
              />
            ))}
            {row.length === 1 ? <View style={styles.gridGhost} /> : null}
          </View>
        )}
      />

      <SponsorEditor
        visible={editing != null}
        onClose={() => setEditing(null)}
        initial={editing && editing !== "new" ? editing : null}
        catalog={catalog.data}
        cities={cities.data ?? []}
        onSubmit={(body) => save.mutateAsync(body)}
        onDelete={canDelete && editing && editing !== "new" ? () => void askDelete(editing) : undefined}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && setEditing(menu) },
          {
            label: menu?.active ? "Pasife al" : "Aktifleştir",
            icon: menu?.active ? "pause-circle-outline" : "play-circle-outline",
            hidden: !canManage || menu?.editable === false,
            onPress: () => menu && toggle.mutate(menu),
          },
          { label: "Sil", icon: "trash-outline", danger: true, hidden: !canDelete || menu?.editable === false, onPress: () => menu && void askDelete(menu) },
        ]}
      />
    </AdminScreen>
  );
}

const GROUP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { broadcast: "tv", led: "tablet-landscape", web: "globe", app: "phone-portrait" };

/** Logo karosu: marka renginde yumuşak zemin üstünde logo (yoksa monogram), ad, seviye, yerleşim ikonları. */
function SponsorTile({
  item,
  tier,
  city,
  groups,
  onPress,
  onLongPress,
}: {
  item: Sponsor;
  tier?: string;
  city: string | null;
  groups: string[];
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const logo = mediaUrl(item.images?.logo);
  const brand = item.brandColor || colors.brand;
  return (
    <Touchable feedback="card" onPress={onPress} onLongPress={onLongPress} style={[styles.tile, !item.live ? styles.tileMuted : null]} accessibilityRole="button" accessibilityLabel={`${item.name}${item.live ? ", yayında" : ""}`}>
      <View style={[styles.logo, { backgroundColor: withAlpha(brand, 0.14), borderColor: withAlpha(brand, 0.4) }]}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logoImage} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <Text style={[styles.monogram, { color: brand }]} {...textScale.badge}>
            {item.name.slice(0, 2).toLocaleUpperCase("tr-TR")}
          </Text>
        )}
        <View style={[styles.liveDot, { backgroundColor: item.live ? colors.win : colors.textTertiary }]} />
      </View>
      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
        {item.name}
      </Text>
      <Text style={styles.tier} numberOfLines={1} {...textScale.dense}>
        {[tier, city].filter(Boolean).join(" · ") || item.tagline || "—"}
      </Text>
      <View style={styles.tileFoot}>
        <View style={styles.groups}>
          {groups.map((g) => (
            <View key={g} style={styles.groupIcon}>
              <Ionicons name={GROUP_ICONS[g] ?? "ellipse"} size={11} color={colors.textSecondary} />
            </View>
          ))}
        </View>
        {item.editable === false ? <Ionicons name="lock-closed" size={12} color={colors.textTertiary} /> : null}
      </View>
      {item.startDate || item.endDate ? (
        <Text style={styles.dates} numberOfLines={1} {...textScale.badge}>
          {item.startDate ? formatDate(item.startDate) : "…"} – {item.endDate ? formatDate(item.endDate) : "…"}
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: "row", gap: space.sm },
  gridGhost: { flex: 1 },
  tile: { flex: 1, minWidth: 0, gap: 3, padding: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  tileMuted: { opacity: 0.7 },
  logo: { height: 92, borderRadius: radius.lg, borderWidth: hairline, alignItems: "center", justifyContent: "center", marginBottom: space.xs, overflow: "hidden" },
  logoImage: { width: "78%", height: "70%" },
  monogram: { ...type.scoreLg },
  liveDot: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  name: { ...type.h4, color: colors.textPrimary },
  tier: { ...type.caption, color: colors.textTertiary },
  tileFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  groups: { flexDirection: "row", gap: 4 },
  groupIcon: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  dates: { ...type.micro, color: colors.textTertiary },
});
