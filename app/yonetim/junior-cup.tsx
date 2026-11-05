/**
 * JUNIOR CUP — özel lig sayfaları (lig portalları).
 *
 * Web: pages/management/leaguePortals/LeaguePortalsAdmin.js. Liste →
 * sayfaya dokununca düzenleyici (genel, ligler, renkler, üst menü, anasayfa,
 * görünüm). Sayfa elitlig.com/<adres> altında yayınlanır; listeden adres
 * açılır ya da kopyalanır. Silme onay ister ve geri alınamaz.
 */

import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ActionSheet, AdminList, AdminScreen, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { PortalEditor } from "@/components/admin/portals/PortalEditor";
import { Button, FAB, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { WEB_BASE_URL } from "@/lib/config";
import { mediaUrl } from "@/lib/format";
import {
  createPortal,
  deletePortal,
  emptyPortal,
  getPortalCatalog,
  listPortals,
  portalPayload,
  updatePortal,
  type LeaguePortal,
  type PortalPayload,
} from "@/lib/api/admin/portals";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["league_portals.view", "league_portals.manage"] as const;

export default function LeaguePortalsScreen() {
  const auth = useAuth();
  const toast = useToast();
  const canManage = hasAnyPermission(auth.user, ["league_portals.manage"]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LeaguePortal | "new" | null>(null);
  const [menu, setMenu] = useState<LeaguePortal | null>(null);

  const catalog = useQuery({ queryKey: ["admin", "portals", "catalog"], queryFn: getPortalCatalog, staleTime: 600_000 });
  const list = useQuery({ queryKey: ["admin", "portals", "list"], queryFn: listPortals });

  // Düzenleyicide lig adları için: sayfalarda görülen ligler.
  const knownLeagues = useMemo(() => {
    const map: Record<number, { label: string; cityId: number | null }> = {};
    (list.data ?? []).forEach((p) => (p.leagues ?? []).forEach((l) => (map[l.id] = { label: l.label, cityId: l.cityId })));
    return map;
  }, [list.data]);

  const invalidate = [["admin", "portals", "list"]];
  const save = useAdminMutation(
    (body: PortalPayload) => (editing && editing !== "new" ? updatePortal(editing.id, body) : createPortal(body)),
    {
      success: (r) => r.message,
      invalidate,
      onSuccess: (r) => setEditing(r.portal),
    }
  );
  const toggle = useAdminMutation((p: LeaguePortal) => updatePortal(p.id, { active: !p.active }), {
    success: (r) => (r.portal.active ? `${r.portal.name} yayına alındı.` : `${r.portal.name} yayından kaldırıldı.`),
    invalidate,
  });
  const remove = useAdminMutation((p: LeaguePortal) => deletePortal(p.id), { success: (r) => r.message, invalidate });

  const urlOf = (p: LeaguePortal) => `${WEB_BASE_URL}/${p.slug}`;
  const askDelete = async (p: LeaguePortal) => {
    const ok = await confirmAction({
      title: "Lig sayfası silinsin mi?",
      message: `“${p.name}” sayfası ve tüm görünüm ayarları silinecek; elitlig.com/${p.slug} adresi çalışmayacak. Ligler ve sezonlar silinmez.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) {
      remove.mutate(p);
      setEditing(null);
    }
  };

  if (editing) {
    const isNew = editing === "new";
    return (
      <AdminScreen
        title={isNew ? "Yeni lig sayfası" : editing.name}
        subtitle={isNew ? "Junior Cup" : `elitlig.com/${editing.slug}`}
        permission={PERMS}
        actions={!isNew ? [{ icon: "open-outline", onPress: () => void Linking.openURL(urlOf(editing)), accessibilityLabel: "Sayfayı aç" }] : undefined}
      >
        <Button label="Sayfa listesi" icon="chevron-back" variant="ghost" size="sm" onPress={() => setEditing(null)} />
        <PortalEditor
          key={isNew ? "new" : `${editing.id}-${editing.updatedAt}`}
          initial={isNew ? emptyPortal(catalog.data) : portalPayload(editing)}
          catalog={catalog.data}
          knownLeagues={knownLeagues}
          canManage={canManage}
          isNew={isNew}
          onSave={(body) => save.mutateAsync(body)}
        />
        {!isNew && canManage ? <Button label="Sayfayı sil" icon="trash-outline" variant="danger" onPress={() => void askDelete(editing)} /> : null}
      </AdminScreen>
    );
  }

  const items = (list.data ?? []).filter((p) => !q.trim() || [p.name, p.slug, p.shortName].join(" ").toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));

  return (
    <AdminScreen
      title="Junior Cup"
      subtitle="Lig portalları ve turnuva sayfaları"
      permission={PERMS}
      scroll={false}
      overlay={canManage ? <FAB icon="add" label="Yeni sayfa" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni lig sayfası" /> : null}
    >
      <AdminList
        data={items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        refreshing={list.isRefetching}
        onRefresh={list.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Sayfa ara"
        emptyIcon="star-outline"
        emptyTitle="Henüz lig sayfası yok"
        emptyBody="Seçtiğin ligleri kendi logosu, renkleri ve düzeniyle kısa bir adreste yayınla."
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <RecordCard
            title={item.name}
            subtitle={`elitlig.com/${item.slug}`}
            meta={[(item.leagues ?? []).map((l) => l.label).join(", ") || "Lig seçilmedi", item.updatedAt ? timeAgo(item.updatedAt) : null].filter(Boolean).join(" · ")}
            avatar={{ name: item.shortName || item.name, image: mediaUrl(item.logoUrl) }}
            accentColor={item.theme?.light?.primary || null}
            muted={!item.active}
            badges={[item.active ? { label: "Yayında", tone: "win" } : { label: "Kapalı", tone: "neutral" }, { label: `${item.leagueIds.length} lig`, tone: "info" }]}
            onPress={() => setEditing(item)}
            onLongPress={() => setMenu(item)}
          />
        )}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && setEditing(menu) },
          { label: "Sayfayı aç", icon: "open-outline", onPress: () => menu && void Linking.openURL(urlOf(menu)) },
          {
            label: "Adresi kopyala",
            icon: "copy-outline",
            onPress: async () => {
              if (!menu) return;
              await Clipboard.setStringAsync(urlOf(menu));
              toast.show({ message: "Adres kopyalandı.", tone: "success" });
            },
          },
          { label: menu?.active ? "Yayından kaldır" : "Yayına al", icon: "power-outline", hidden: !canManage, onPress: () => menu && toggle.mutate(menu) },
          { label: "Sil", icon: "trash-outline", danger: true, hidden: !canManage, onPress: () => menu && void askDelete(menu) },
        ]}
      />
    </AdminScreen>
  );
}
