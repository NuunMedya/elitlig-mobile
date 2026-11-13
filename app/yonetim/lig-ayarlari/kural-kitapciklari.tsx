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

import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { OpsRecord, StatusTiles } from "@/components/admin/matches/opsKit";
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
        extraHeader={
          status === "" && (query.data?.length ?? 0) > 0 ? (
            <StatusTiles
              items={[
                { key: "published", label: "Yayında", value: (query.data ?? []).filter((b) => b.status === "published").length, tone: "win", icon: "checkmark-circle-outline" },
                { key: "draft", label: "Taslak", value: (query.data ?? []).filter((b) => b.status !== "published").length, tone: "warn", icon: "create-outline" },
                { key: "seasons", label: "Sezonda", value: (query.data ?? []).reduce((n, b) => n + (b.seasons ?? []).filter((x) => !x.archived).length, 0), tone: "info", icon: "calendar-outline" },
              ]}
              value={null}
              onChange={(k) => k && k !== "seasons" && setStatus(k)}
            />
          ) : null
        }
        summary={`${rows.length} kitapçık · hangi sezonda geçerli olacağı Sezonlar ekranından seçilir`}
        keyExtractor={(b) => b.id}
        emptyIcon="book-outline"
        emptyTitle="Henüz kural kitapçığı yok"
        emptyBody={can.create ? "“Yeni kitapçık” ile ilkini ekle." : undefined}
        renderItem={({ item }) => (
          <OpsRecord
            title={item.title}
            subtitle={usage(item)}
            icon={item.kind === "rich" ? "document-text" : "book"}
            tone={item.status === "published" ? "mint" : "gold"}
            rail={item.status === "published" ? "win" : "warn"}
            status={{ label: RULE_BOOK_STATUS_LABELS[item.status] ?? item.status, tone: item.status === "published" ? "win" : "warn" }}
            specs={[
              { icon: item.kind === "rich" ? "text-outline" : "list-outline", label: RULE_BOOK_KIND_LABELS[item.kind] ?? item.kind },
              item.manage_summary?.scoring ? { icon: "calculator-outline", label: scoringSummary(item.manage_summary.scoring) } : null,
              item.manage_summary?.roster ? { icon: "people-outline", label: "Kadro kuralları", tone: "info" } : null,
              { icon: "time-outline", label: formatDateTime(item.updated_at || item.created_at) },
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
