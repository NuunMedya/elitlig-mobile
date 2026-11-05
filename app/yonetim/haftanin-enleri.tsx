/**
 * HAFTANIN ENLERİ — haftanın oyuncusu, mevki enleri, takımı ve kadrosu.
 *
 * Web: pages/management/weeklyAwards/WeeklyAwards.js. Liste (durum süzgeci +
 * arama) → sete dokununca dört adımlı düzenleyici
 * (components/admin/weeklyAwards/AwardSetEditor). Basılı tutunca hızlı
 * eylemler: yayından al (piyasa değeri korunur), taslağa al (etki geri alınır),
 * yeniden yayınla, sil (yalnız taslak / arşiv; weekly_awards.delete).
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ActionSheet, AdminList, AdminScreen, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { AwardSetEditor } from "@/components/admin/weeklyAwards/AwardSetEditor";
import { FAB, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  deleteAwardSet,
  emptyAwardForm,
  formFromSet,
  getAwardSet,
  listAwardSets,
  publishAwardSet,
  SET_STATUS_LABELS,
  unpublishAwardSet,
  withdrawAwardSet,
  type AdminAwardSet,
  type AwardForm,
} from "@/lib/api/admin/weeklyAwards";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["weekly_awards.view", "weekly_awards.update"] as const;

const FILTERS = [
  { key: "ALL", label: "Tümü" },
  { key: "DRAFT", label: "Taslak" },
  { key: "PUBLISHED", label: "Yayında" },
  { key: "UNPUBLISHED", label: "Yayından alındı" },
];

export default function WeeklyAwardsAdminScreen() {
  const auth = useAuth();
  const toast = useToast();
  const canCreate = hasAnyPermission(auth.user, ["weekly_awards.create"]);
  const canPublish = hasAnyPermission(auth.user, ["weekly_awards.publish"]);
  const canUnpublish = hasAnyPermission(auth.user, ["weekly_awards.unpublish"]);
  const canDelete = hasAnyPermission(auth.user, ["weekly_awards.delete"]);
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AwardForm | null>(null);
  const [menu, setMenu] = useState<AdminAwardSet | null>(null);

  const list = useQuery({ queryKey: ["admin", "weeklyAwards", "list"], queryFn: () => listAwardSets(), enabled: !editing });
  const invalidate = [["admin", "weeklyAwards", "list"]];
  const withdraw = useAdminMutation((s: AdminAwardSet) => withdrawAwardSet(s.id), { success: "Yayından alındı. Oyuncuların piyasa değeri korunuyor.", invalidate });
  const unpublish = useAdminMutation((s: AdminAwardSet) => unpublishAwardSet(s.id), { success: "Taslağa alındı. Ödülün piyasa değeri etkisi geri alındı.", invalidate });
  const republish = useAdminMutation((s: AdminAwardSet) => publishAwardSet(s.id), {
    success: (r) => (r.warnings?.length ? `Yeniden yayınlandı · ${r.warnings.length} doğrulama uyarısı var.` : "Yeniden yayınlandı. Anasayfada tekrar görünecek."),
    invalidate,
  });
  const remove = useAdminMutation((s: AdminAwardSet) => deleteAwardSet(s.id), { success: "Ödül seti silindi.", invalidate });

  const open = async (id: number) => {
    try {
      setEditing(formFromSet(await getAwardSet(id)));
    } catch (e) {
      toast.show({ message: errorText(e), tone: "danger" });
    }
  };

  if (editing) {
    return (
      <AdminScreen title={editing.id ? editing.title || "Ödül seti" : "Yeni ödül seti"} subtitle="Haftanın enleri" permission={PERMS}>
        <AwardSetEditor initial={editing} onClose={() => setEditing(null)} />
      </AdminScreen>
    );
  }

  const nameOf = (s: AdminAwardSet) => s.title || `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`;
  const items = (list.data ?? []).filter((s) => (status === "ALL" || s.status === status) && (!q.trim() || nameOf(s).toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))));

  return (
    <AdminScreen
      title="Haftanın enleri"
      subtitle="Haftanın oyuncusu, kadrosu ve ödüller"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni set" extended onPress={() => setEditing(emptyAwardForm())} accessibilityLabel="Yeni ödül seti" /> : null}
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
        searchPlaceholder="Set ara"
        filters={FILTERS.map((f) => ({ ...f, count: f.key === "ALL" ? list.data?.length : list.data?.filter((s) => s.status === f.key).length }))}
        filter={status}
        onFilter={setStatus}
        emptyIcon="ribbon-outline"
        emptyTitle="Ödül seti yok"
        emptyBody="Haftanın oyuncusunu, mevki enlerini ve kadroyu seçip yayınla."
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => (
          <RecordCard
            title={nameOf(item)}
            subtitle={`${formatDate(item.start_date)} – ${formatDate(item.end_date)}`}
            meta={`${(item.items ?? []).length} ödül${item.formation ? ` · ${item.formation}` : ""}`}
            icon="ribbon-outline"
            iconTone={item.status === "PUBLISHED" ? "win" : item.status === "UNPUBLISHED" ? "warn" : "neutral"}
            badges={[{ label: SET_STATUS_LABELS[item.status] ?? item.status, tone: item.status === "PUBLISHED" ? "win" : item.status === "UNPUBLISHED" ? "warn" : "neutral" }]}
            onPress={() => void open(item.id)}
            onLongPress={() => setMenu(item)}
          />
        )}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu ? nameOf(menu) : undefined}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && void open(menu.id) },
          { label: "Yayından al", hint: "Piyasa değeri korunur", icon: "eye-off-outline", hidden: !canUnpublish || menu?.status !== "PUBLISHED", onPress: () => menu && withdraw.mutate(menu) },
          {
            label: "Taslağa al",
            hint: "Piyasa değeri etkisi geri alınır",
            icon: "arrow-undo-outline",
            hidden: !canUnpublish || (menu?.status !== "PUBLISHED" && menu?.status !== "UNPUBLISHED"),
            onPress: async () => {
              const s = menu;
              if (s && (await confirmAction({ title: "Taslağa alınsın mı?", message: "Piyasa değeri etkisi geri alınır.", confirmLabel: "Taslağa al", destructive: true }))) unpublish.mutate(s);
            },
          },
          { label: "Yeniden yayınla", icon: "megaphone-outline", hidden: !canPublish || menu?.status !== "UNPUBLISHED", onPress: () => menu && republish.mutate(menu) },
          {
            label: "Sil",
            icon: "trash-outline",
            danger: true,
            hidden: !canDelete || menu?.status === "PUBLISHED" || menu?.status === "UNPUBLISHED",
            onPress: async () => {
              const s = menu;
              if (s && (await confirmAction({ title: `“${nameOf(s)}” silinsin mi?`, confirmLabel: "Sil", destructive: true }))) remove.mutate(s);
            },
          },
        ]}
      />
    </AdminScreen>
  );
}
