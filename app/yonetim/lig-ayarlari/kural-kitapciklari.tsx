/**
 * KURAL KİTAPÇIKLARI — web editor_pages/RuleBooksManager.js liste görünümü.
 *
 * Kitapçık yazılır; hangi sezonda geçerli olacağı Sezonlar ekranından seçilir.
 * Liste durum süzgeçli (yayında / taslak); her kartta kullanan sezonlar ve
 * puanlama özeti. Dokununca: düzenle, kopyala (başka il / sezon için), sil.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { ActionSheet, AdminList, AdminScreen, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { FAB } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/format";
import {
  RULE_BOOK_KIND_LABELS,
  RULE_BOOK_STATUS_LABELS,
  deleteRuleBook,
  listRuleBooks,
  scoringSummary,
  type RuleBook,
} from "@/lib/api/admin/leagues";
import { foldText } from "@/lib/api/admin/lookups";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["rule_books.create", "rule_books.update"];
const KEY = ["admin", "rule-books"] as const;

const usage = (b: RuleBook) => {
  const list = (b.seasons ?? []).filter((s) => !s.archived);
  if (!list.length) return "Henüz bir sezonda kullanılmıyor";
  const names = list.map((s) => [s.league_name, s.name].filter(Boolean).join(" "));
  return `${list.length} sezonda: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
};

export default function RuleBooksScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const can = {
    create: hasPermission(user, "rule_books.create"),
    update: hasPermission(user, "rule_books.update"),
    remove: hasPermission(user, "rule_books.delete"),
  };
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<RuleBook | null>(null);

  const query = useQuery({ queryKey: [...KEY, status], queryFn: () => listRuleBooks(status), enabled: can.update });
  const rows = useMemo(() => {
    const needle = foldText(q);
    return (query.data ?? []).filter((b) => !needle || foldText(`${b.title} ${b.summary ?? ""}`).includes(needle));
  }, [query.data, q]);

  const remove = useAdminMutation((b: RuleBook) => deleteRuleBook(b.id), {
    success: "Kural kitapçığı silindi.",
    invalidate: [KEY, ["admin", "seasons"]],
  });

  const askDelete = async (b: RuleBook) => {
    const active = (b.seasons ?? []).filter((s) => !s.archived).length;
    const ok = await confirmAction({
      title: "Kitapçık silinsin mi?",
      message: `"${b.title}" silinecek.${
        active ? `\n\n${active} sezon bu kitapçığı kullanıyor; o sezonlarda kitapçık görünmez, puanlama ve kadro kuralları olduğu gibi kalır.` : ""
      }`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(b);
  };

  return (
    <AdminScreen
      title="Kural kitapçıkları"
      permission={PERMS}
      scroll={false}
      overlay={
        can.create ? (
          <FAB icon="add" label="Yeni kitapçık" extended onPress={() => router.push("/yonetim/lig-ayarlari/kitapcik")} accessibilityLabel="Yeni kitapçık" />
        ) : null
      }
    >
      <AdminList
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Kitapçık ara"
        filters={[
          { key: "", label: "Tümü" },
          { key: "published", label: "Yayında" },
          { key: "draft", label: "Taslak" },
        ]}
        filter={status}
        onFilter={setStatus}
        summary={`${rows.length} kitapçık · hangi sezonda geçerli olacağı Sezonlar ekranından seçilir`}
        keyExtractor={(b) => b.id}
        emptyIcon="book-outline"
        emptyTitle="Henüz kural kitapçığı yok"
        emptyBody={can.create ? "“Yeni kitapçık” ile ilkini ekle." : undefined}
        renderItem={({ item }) => (
          <RecordCard
            title={item.title}
            subtitle={usage(item)}
            meta={[
              item.manage_summary ? scoringSummary(item.manage_summary.scoring) : null,
              item.manage_summary?.roster ? "kadro kuralları" : null,
              formatDateTime(item.updated_at || item.created_at),
            ]
              .filter(Boolean)
              .join(" · ")}
            icon="book-outline"
            iconTone={item.status === "published" ? "win" : "neutral"}
            badges={[
              { label: RULE_BOOK_STATUS_LABELS[item.status] ?? item.status, tone: item.status === "published" ? "win" : "warn" },
              { label: RULE_BOOK_KIND_LABELS[item.kind] ?? item.kind },
            ]}
            onPress={() => setSelected(item)}
          />
        )}
      />

      <ActionSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.title}
        actions={
          selected
            ? [
                {
                  label: "Düzenle",
                  hint: "Başlık, durum, içerik, puanlama ve kadro kuralları",
                  icon: "create-outline",
                  hidden: !can.update,
                  onPress: () => router.push(`/yonetim/lig-ayarlari/kitapcik?id=${encodeURIComponent(selected.id)}`),
                },
                {
                  label: "Kopyala",
                  hint: "Başka il / sezon için bu kitapçıktan başla",
                  icon: "copy-outline",
                  hidden: !can.create,
                  onPress: () => router.push(`/yonetim/lig-ayarlari/kitapcik?kopya=${encodeURIComponent(selected.id)}`),
                },
                { label: "Sil", icon: "trash-outline", danger: true, hidden: !can.remove, onPress: () => void askDelete(selected) },
              ]
            : []
        }
      />
    </AdminScreen>
  );
}
