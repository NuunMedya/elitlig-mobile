/**
 * KURA ÇEKİMİ — grup ve eleme ağacı kuraları, torba prensibiyle.
 *
 * Web: pages/management/draws/DrawAdmin.js. Liste (arama + durum süzgeci)
 * → kuraya dokununca üç adımlı düzenleyici (components/admin/draws/DrawEditor).
 * Çekiliş tohumla kaydedilir; aynı kura gerektiğinde birebir yeniden üretilir.
 * Silme yetkisi ayrıdır (draws.delete) ve onay ister.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { AdminList, AdminScreen, ActionSheet, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { DrawEditor } from "@/components/admin/draws/DrawEditor";
import { FAB, SkeletonCard, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { deleteDraw, DRAW_STATUS_LABELS, getDraw, listDraws, type Draw } from "@/lib/api/admin/draws";
import { useAuth } from "@/providers/AuthProvider";
import { layout, space } from "@/theme";

const PERMS = ["draws.view", "draws.run"] as const;

const STATUS_FILTERS = [
  { key: "ALL", label: "Tümü" },
  { key: "SETUP", label: "Kurulum" },
  { key: "READY", label: "Çekilişe hazır" },
  { key: "COMPLETED", label: "Tamamlandı" },
];

export default function DrawsScreen() {
  const auth = useAuth();
  const canCreate = hasAnyPermission(auth.user, ["draws.create"]);
  const canDelete = hasAnyPermission(auth.user, ["draws.delete"]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ draw: Draw | null } | null>(null);
  const [opening, setOpening] = useState(false);
  const [menu, setMenu] = useState<Draw | null>(null);
  const toast = useToast();

  const query = useQuery({ queryKey: ["admin", "draws", "list", status, search], queryFn: () => listDraws({ status, search }), enabled: !editor });
  const remove = useAdminMutation((id: number) => deleteDraw(id), { success: "Kura silindi.", invalidate: [["admin", "draws", "list"]] });

  const open = async (id: number) => {
    setOpening(true);
    try {
      setEditor({ draw: await getDraw(id) });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setOpening(false);
    }
  };

  if (editor) {
    return (
      <AdminScreen title={editor.draw?.name || "Yeni kura"} subtitle="Kura çekimi" permission={PERMS}>
        <DrawEditor initial={editor.draw} onClose={() => setEditor(null)} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Kura çekimi"
      subtitle="Torbalar, grup ve eleme kuraları"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni kura" extended onPress={() => setEditor({ draw: null })} accessibilityLabel="Yeni kura" /> : null}
    >
      {opening ? (
        <ScrollView contentContainerStyle={styles.loading}>
          <SkeletonCard />
        </ScrollView>
      ) : (
        <AdminList
          data={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          refreshing={query.isRefetching}
          onRefresh={query.refetch}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Kura adı"
          filters={STATUS_FILTERS}
          filter={status}
          onFilter={setStatus}
          emptyIcon="shuffle-outline"
          emptyTitle="Kura yok"
          emptyBody="Grup ve eleme ağacı kuralarını torba prensibine göre çek."
          keyExtractor={(d) => String(d.id)}
          renderItem={({ item }) => (
            <RecordCard
              title={item.name}
              subtitle={`${item.format === "GROUP" ? `Grup kurası · ${item.groupCount ?? "?"} grup` : "Eleme ağacı"} · ${item.teamCount} takım · ${item.potCount} torba`}
              meta={item.updatedAt ? `Güncellendi ${timeAgo(item.updatedAt)}` : null}
              icon={item.format === "GROUP" ? "grid-outline" : "git-network-outline"}
              iconTone={item.status === "COMPLETED" ? "win" : item.status === "READY" ? "accent" : "neutral"}
              badges={[{ label: DRAW_STATUS_LABELS[item.status] || item.status, tone: item.status === "COMPLETED" ? "win" : item.status === "READY" ? "accent" : "neutral" }]}
              onPress={() => void open(item.id)}
              onLongPress={canDelete ? () => setMenu(item) : undefined}
            />
          )}
        />
      )}
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={[
          { label: "Aç", icon: "open-outline", onPress: () => menu && void open(menu.id) },
          {
            label: "Kurayı sil",
            icon: "trash-outline",
            danger: true,
            onPress: async () => {
              const d = menu;
              if (!d) return;
              if (await confirmAction({ title: "Kura silinsin mi?", message: `“${d.name}” torbaları ve sonucuyla birlikte silinecek.`, confirmLabel: "Sil", destructive: true })) remove.mutate(d.id);
            },
          },
        ]}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  loading: { padding: layout.screenPadding, gap: space.md },
});
