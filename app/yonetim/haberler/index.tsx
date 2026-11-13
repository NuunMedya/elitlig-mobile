/**
 * HABERLER — haber ve yazı yönetimi listesi (web /editor/haberler, NewsManager.js).
 *
 * NE: durum çipleri (Tümü / Yayında / Taslak / Sabit), kategori şeridi,
 * başlıkta arama (sunucu), sayfalı sonsuz liste. Karta dokunmak düzenleyiciyi
 * açar (/yonetim/haberler/[id]); uzun basmak hızlı işlemler: yayınla / taslağa
 * al, sabitle, önizle, bağlantıyı paylaş, sil. Köşe yazıları da haber olarak
 * buradan yayınlanır (web'deki "Yazı ekle" aynı formu açar).
 *
 * "Sabit" süzgeci sunucuda yoktur; sabit haberler sıralamada en üstte durduğu
 * için yüklenen sayfalardan süzülür.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation, type FilterOption } from "@/components/admin";
import { NewsCard, newsCategoryTile, useNewsScope } from "@/components/admin/news/NewsParts";
import { CountTiles } from "@/components/admin/system/SysKit";
import { Chip, ChipGroup, FAB } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  deleteNews,
  listAdminNews,
  NEWS_CATEGORY_LABELS,
  updateNews,
  type AdminNews,
  type NewsCategory,
} from "@/lib/api/admin/news";
import { webNewsUrl } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

type StatusFilter = "" | "published" | "draft" | "pinned";

const FILTERS: FilterOption<StatusFilter>[] = [
  { key: "", label: "Tümü" },
  { key: "published", label: "Yayında" },
  { key: "draft", label: "Taslak" },
  { key: "pinned", label: "Sabit" },
];

const PAGE = 30;

export default function NewsListScreen() {
  const auth = useAuth();
  const router = useRouter();
  const scope = useNewsScope(auth.user);
  const [status, setStatus] = useState<StatusFilter>("");
  const [category, setCategory] = useState<NewsCategory | "">("");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<AdminNews | null>(null);

  const canCreate = hasAnyPermission(auth.user, ["news.create"]);
  const canUpdate = hasAnyPermission(auth.user, ["news.update"]);
  const canPublish = hasAnyPermission(auth.user, ["news.publish"]);
  const canDelete = hasAnyPermission(auth.user, ["news.delete"]);

  const query = useInfiniteQuery({
    queryKey: ["admin", "news", "list", status, category, q],
    queryFn: ({ pageParam }) =>
      listAdminNews({
        status: status === "pinned" ? undefined : status || undefined,
        category: category || undefined,
        search: q || undefined,
        page: pageParam,
        limit: status === "pinned" ? 100 : PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages && status !== "pinned" ? last.page + 1 : undefined),
    enabled: canUpdate,
  });

  const items = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.items) ?? [];
    return status === "pinned" ? all.filter((n) => n.pinned) : all;
  }, [query.data, status]);
  const total = query.data?.pages[0]?.total;

  const quick = useAdminMutation(
    ({ item, patch }: { item: AdminNews; patch: Partial<Pick<AdminNews, "status" | "pinned">> }) => updateNews(item.id, patch),
    {
      success: (_r, { patch }) =>
        patch.status === "published" ? "Haber yayına alındı." : patch.status === "draft" ? "Haber taslağa alındı." : patch.pinned ? "Haber sabitlendi." : "Sabitleme kaldırıldı.",
      invalidate: [["admin", "news"]],
    }
  );
  const remove = useAdminMutation((item: AdminNews) => deleteNews(item.id), {
    success: "Haber silindi. Çöp kutusundan geri alınabilir.",
    invalidate: [["admin", "news"]],
  });

  const askDelete = async (item: AdminNews) => {
    const ok = await confirmAction({ title: "Haber silinsin mi?", message: `“${item.title}” silinecek.`, confirmLabel: "Sil", destructive: true });
    if (ok) remove.mutate(item);
  };

  const editable = (item: AdminNews) => canUpdate && scope.canEditItem(item);

  return (
    <AdminScreen
      title="Haberler"
      subtitle={scope.nationwide ? "Türkiye geneli ve il haberleri" : `${scope.ownCityName ?? "İlin"} haberleri`}
      permission={["news.create", "news.update"]}
      scroll={false}
      overlay={
        canCreate ? (
          <FAB icon="add" label="Yeni haber" extended onPress={() => router.push("/yonetim/haberler/yeni" as Href)} accessibilityLabel="Yeni haber" />
        ) : null
      }
    >
      <AdminList<AdminNews>
        data={canUpdate ? items : []}
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
        searchPlaceholder="Başlıkta ara"
        filters={FILTERS}
        filter={status}
        onFilter={(key) => setStatus(key as StatusFilter)}
        extraHeader={
          <View style={styles.header}>
            {canUpdate && query.data ? (
              <CountTiles<StatusFilter>
                value={status || null}
                onChange={(key) => setStatus(key ?? "")}
                items={[
                  { key: "published", label: "Yayında", value: items.filter((n) => n.status === "published").length, icon: "radio-button-on", tone: "win" },
                  { key: "draft", label: "Taslak", value: items.filter((n) => n.status !== "published").length, icon: "document-outline", tone: "neutral" },
                  { key: "pinned", label: "Sabit", value: items.filter((n) => n.pinned).length, icon: "pin", tone: "brand" },
                ]}
              />
            ) : null}
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Tüm kategoriler" icon="apps-outline" selected={!category} onPress={() => setCategory("")} size="sm" />
              {(Object.keys(NEWS_CATEGORY_LABELS) as NewsCategory[]).map((key) => (
                <Chip key={key} label={NEWS_CATEGORY_LABELS[key]} icon={newsCategoryTile(key).icon} selected={category === key} onPress={() => setCategory(key)} size="sm" />
              ))}
            </ChipGroup>
          </View>
        }
        summary={total != null && status !== "pinned" ? `${total} haber` : status === "pinned" && query.data ? `${items.length} sabit haber` : null}
        keyExtractor={(n) => n.id}
        emptyIcon="newspaper-outline"
        emptyTitle={canUpdate ? "Bu filtrede haber yok" : "Listeyi görme yetkin yok"}
        emptyBody={canUpdate ? "“Yeni haber” ile ilk haberi ya da yazıyı ekle." : "Yeni haber yazabilirsin; listeyi görmek için news.update yetkisi gerekir."}
        emptyAction={canCreate ? { label: "Yeni haber", onPress: () => router.push("/yonetim/haberler/yeni" as Href) } : undefined}
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            scope={scope.scopeLabel(item)}
            locked={!scope.canEditItem(item)}
            onPress={() => (editable(item) ? router.push(`/yonetim/haberler/${encodeURIComponent(item.id)}` as Href) : router.push(`/haber/${encodeURIComponent(item.id)}` as Href))}
            onLongPress={() => setMenu(item)}
          />
        )}
      />

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.title}
        actions={
          menu
            ? [
                { label: "Düzenle", icon: "create-outline", hidden: !editable(menu), onPress: () => router.push(`/yonetim/haberler/${encodeURIComponent(menu.id)}` as Href) },
                {
                  label: menu.status === "published" ? "Taslağa al" : "Yayınla",
                  icon: menu.status === "published" ? "eye-off-outline" : "paper-plane-outline",
                  hidden: !editable(menu) || (menu.status !== "published" && !canPublish),
                  onPress: () => quick.mutate({ item: menu, patch: { status: menu.status === "published" ? "draft" : "published" } }),
                },
                {
                  label: menu.pinned ? "Sabitlemeyi kaldır" : "Listenin başına sabitle",
                  icon: menu.pinned ? "pin-outline" : "pin",
                  hidden: !editable(menu),
                  onPress: () => quick.mutate({ item: menu, patch: { pinned: !menu.pinned } }),
                },
                { label: "Önizle", icon: "eye-outline", onPress: () => router.push(`/haber/${encodeURIComponent(menu.id)}` as Href) },
                {
                  label: "Bağlantıyı paylaş",
                  icon: "share-social-outline",
                  hidden: menu.status !== "published",
                  onPress: () => void Share.share({ message: `${menu.title}\n${webNewsUrl(menu.id)}` }),
                },
                { label: "Sil", icon: "trash-outline", danger: true, hidden: !canDelete || !scope.canEditItem(menu), onPress: () => void askDelete(menu) },
              ]
            : []
        }
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md },
});
