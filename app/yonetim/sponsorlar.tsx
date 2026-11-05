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
import { useMemo, useState } from "react";

import { ActionSheet, AdminList, AdminScreen, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { SponsorEditor } from "@/components/admin/broadcast/SponsorEditor";
import { FAB, MetricGrid, MetricTile } from "@/components/ui";
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

const PERMS = ["sponsors.view", "sponsors.manage"] as const;

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "live", label: "Yayında" },
  { key: "inactive", label: "Pasif / süresi dolan" },
  { key: "broadcast", label: "Yayın alanı" },
  { key: "web", label: "Web alanı" },
];

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
    broadcast: items.filter((s) => s.live && s.placements.some((k) => groupOf(k) !== "web")).length,
    web: items.filter((s) => s.live && s.placements.some((k) => groupOf(k) === "web")).length,
  };
  const visible = items.filter((s) => {
    const text = q.trim().toLocaleLowerCase("tr-TR");
    if (text && ![s.name, s.tagline, s.contactName].join(" ").toLocaleLowerCase("tr-TR").includes(text)) return false;
    if (filter === "live") return s.live;
    if (filter === "inactive") return !s.live;
    if (filter === "broadcast") return s.placements.some((k) => groupOf(k) !== "web");
    if (filter === "web") return s.placements.some((k) => groupOf(k) === "web");
    return true;
  });

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
      <AdminList
        data={visible}
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
          <MetricGrid columns={2}>
            <MetricTile label="Toplam" value={String(stats.total)} icon="megaphone-outline" />
            <MetricTile label="Aktif" value={String(stats.live)} icon="checkmark-circle-outline" tone="win" />
            <MetricTile label="Yayında" value={String(stats.broadcast)} icon="tv-outline" tone="brand" />
            <MetricTile label="Web sitesinde" value={String(stats.web)} icon="globe-outline" tone="accent" />
          </MetricGrid>
        }
        emptyIcon="megaphone-outline"
        emptyTitle={items.length ? "Süzgeçle eşleşen sponsor yok" : "Henüz sponsor eklenmedi"}
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => (
          <RecordCard
            title={item.name}
            subtitle={[tierLabel(item.tier), item.tagline].filter(Boolean).join(" · ") || null}
            meta={[
              item.startDate || item.endDate ? `${item.startDate ? formatDate(item.startDate) : "…"} – ${item.endDate ? formatDate(item.endDate) : "…"}` : null,
              item.cityId == null ? "Tüm iller" : nationwide ? cities.data?.find((c) => c.id === item.cityId)?.label : null,
            ]
              .filter(Boolean)
              .join(" · ") || null}
            avatar={{ name: item.name, image: mediaUrl(item.images?.logo) }}
            accentColor={item.brandColor || null}
            muted={!item.live}
            badges={[
              item.live ? { label: "Yayında", tone: "win" } : { label: item.active ? "Süresi dışında" : "Pasif", tone: "neutral" },
              item.placements.some((k) => groupOf(k) === "broadcast") ? { label: "Yayın", tone: "brand", icon: "tv-outline" } : null,
              item.placements.some((k) => groupOf(k) === "led") ? { label: "LED", tone: "accent" } : null,
              item.placements.some((k) => groupOf(k) === "web") ? { label: "Web", tone: "info", icon: "globe-outline" } : null,
              item.editable === false ? { label: "Salt okunur", tone: "neutral", icon: "lock-closed-outline" } : null,
            ]}
            onPress={() => setEditing(item)}
            onLongPress={canManage || canDelete ? () => setMenu(item) : undefined}
          />
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
