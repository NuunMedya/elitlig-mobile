/**
 * TALEPLER — onay merkezi (web /yonetim/talepler?kategori=&durum=, Talepler.js).
 *
 * NE: takımlardan ve üyelerden gelen onay bekleyen işlemler (profil
 * değişikliği, sahiplenme, yeni üye, transfer, kadro, maç talebi, disiplin,
 * müsaitlik, mesaj…). Kategori çipleri açık talep sayısıyla (summary), durum
 * segmenti (Bekleyen / Bilgilendirme / Sonuçlanan), arama, sonsuz liste.
 *
 * KART → AYRINTI: talebin kendi düğmeleri. `api` taşıyan düğme (Onayla /
 * Reddet …) onay sorusundan sonra ilgili mevcut uca gider; sayfa düğmesi
 * uygulamadaki yerel yönetim ekranını açar. "Kapat" talebi elle sonuçlandırır
 * ve isteğe bağlı not yazdırır (sonuç etiketi olarak saklanır).
 *
 * PARAMETRELER: ?durum=open|info|resolved, ?kategori=profile|transfer|…
 * (bildirimden ya da başka ekrandan doğrudan bir başlığa gelinir).
 */

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, FormSheet, InfoLine, RecordCard, useAdminMutation, type FilterOption } from "@/components/admin";
import { Badge, BottomSheet, Button, SegmentedControl, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  actionRoute,
  actorRoute,
  adminPathToRoute,
  CATEGORY_ICONS,
  dismissRequest,
  FALLBACK_CATEGORIES,
  getRequestsSummary,
  listRequests,
  REQUEST_STATUS_LABELS,
  runRequestAction,
  type ManagementRequest,
  type RequestAction,
  type RequestStatus,
} from "@/lib/api/admin/requests";
import { colors, space, textScale, type } from "@/theme";

const STATUSES: RequestStatus[] = ["open", "info", "resolved"];
const PAGE = 30;
const POLL_MS = 60_000;

export default function RequestsScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ durum?: string; kategori?: string }>();
  const [status, setStatus] = useState<RequestStatus>(STATUSES.includes(params.durum as RequestStatus) ? (params.durum as RequestStatus) : "open");
  const [category, setCategory] = useState<string>(params.kategori ? String(params.kategori) : "");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<ManagementRequest | null>(null);
  const [dismissing, setDismissing] = useState<ManagementRequest | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ["admin", "requests", "summary"], queryFn: getRequestsSummary, refetchInterval: POLL_MS });
  const categories = summary.data?.categories?.length ? summary.data.categories : FALLBACK_CATEGORIES;
  const byKey = useMemo(() => Object.fromEntries(categories.map((c) => [c.key, c])), [categories]);

  const query = useInfiniteQuery({
    queryKey: ["admin", "requests", "list", status, category, q],
    queryFn: ({ pageParam }) => listRequests({ status, category: category || undefined, q: q || undefined, page: pageParam, limit: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    refetchInterval: POLL_MS,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const refreshAll = () => void queryClient.invalidateQueries({ queryKey: ["admin", "requests"] });

  const filters: FilterOption[] = [
    { key: "", label: "Tümü", count: summary.data?.total || undefined },
    ...categories.map((c) => ({ key: c.key, label: c.label, count: c.open || undefined })),
  ];

  const run = async (item: ManagementRequest, action: RequestAction) => {
    if (!action.api) {
      const route = actionRoute(action);
      if (route) {
        setDetail(null);
        router.push(route as Href);
      }
      return;
    }
    const text = action.api.confirm || (action.style === "danger" ? `${item.title || "Talep"}: “${action.label}” işlemi yapılsın mı?` : "");
    if (text) {
      const ok = await confirmAction({ title: action.label, message: text, confirmLabel: action.label, destructive: action.style === "danger" });
      if (!ok) return;
    }
    setBusyKey(`${item.id}:${action.key}`);
    try {
      const result = await runRequestAction(action);
      toast.show({ message: result?.message || `${action.label}: işlem tamamlandı.`, tone: "success" });
      setDetail(null);
      refreshAll();
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusyKey(null);
    }
  };

  const dismiss = useAdminMutation((v: { item: ManagementRequest; label?: string }) => dismissRequest(v.item.id, v.label), {
    success: (_r, v) => (v.item.status === "info" ? "Bilgilendirme kaldırıldı." : "Talep kapatıldı."),
    invalidate: [["admin", "requests"]],
    onSuccess: () => setDetail(null),
  });

  const startDismiss = (item: ManagementRequest) => {
    if (item.status === "info") {
      dismiss.mutate({ item, label: "Görüldü" });
      return;
    }
    setDetail(null);
    setTimeout(() => setDismissing(item), 250);
  };

  return (
    <AdminScreen
      app="talepler"
      title="Talepler"
      subtitle={summary.data ? `${summary.data.total} bekleyen talep` : "Onay merkezi"}
      scroll={false}
      bottom={
        <View style={styles.segment}>
          <SegmentedControl<RequestStatus>
            items={STATUSES.map((key) => ({ key, label: REQUEST_STATUS_LABELS[key] }))}
            value={status}
            onChange={setStatus}
            size="sm"
          />
        </View>
      }
    >
      <AdminList<ManagementRequest>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={refreshAll}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Talep ara (başlık, açıklama)"
        filters={filters}
        filter={category}
        onFilter={setCategory}
        extraHeader={
          category && byKey[category] && category !== "general" && adminPathToRoute(byKey[category].path) ? (
            <Button
              label={`${byKey[category].label}: tüm kayıtlar`}
              icon="arrow-forward"
              iconPosition="right"
              variant="ghost"
              size="sm"
              onPress={() => router.push(adminPathToRoute(byKey[category].path) as Href)}
            />
          ) : null
        }
        summary={query.data ? `${total} ${REQUEST_STATUS_LABELS[status].toLocaleLowerCase("tr-TR")} talep` : null}
        keyExtractor={(r) => String(r.id)}
        emptyIcon={status === "open" ? "checkmark-done-outline" : status === "info" ? "information-circle-outline" : "archive-outline"}
        emptyTitle={q ? "Aramayla eşleşen talep yok" : status === "open" ? "Bekleyen talep yok" : status === "info" ? "Bilgilendirme yok" : "Sonuçlanan talep yok"}
        emptyBody={status === "open" ? "Yeni talepler geldiğinde burada görünür." : "Bekleyen talepler sonuçlandıkça burada listelenir."}
        renderItem={({ item }) => (
          <RecordCard
            title={item.title || "Talep"}
            subtitle={item.description || null}
            meta={[item.actor?.name, item.city, timeAgo(item.created_at)].filter(Boolean).join(" · ")}
            icon={CATEGORY_ICONS[item.category] ?? "notifications-outline"}
            iconTone={item.status === "open" ? "brand" : "neutral"}
            muted={item.status === "resolved"}
            badges={[
              !category ? { label: byKey[item.category]?.label ?? item.category } : null,
              item.status === "info" ? { label: "Bilgilendirme", tone: "info", icon: "information-circle" } : null,
              item.status === "resolved" ? { label: item.resolved_label || "Sonuçlandı", tone: "win", icon: "checkmark" } : null,
              item.status === "open" && item.actions?.some((a) => a.api) ? { label: "Onay bekliyor", tone: "warn" } : null,
            ]}
            onPress={() => setDetail(item)}
          />
        )}
      />

      <BottomSheet
        visible={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? byKey[detail.category]?.label ?? "Talep" : "Talep"}
        snap="half"
      >
        {detail ? (
          <RequestDetail
            item={detail}
            busyKey={busyKey}
            onAction={(action) => void run(detail, action)}
            onDismiss={() => startDismiss(detail)}
            dismissing={dismiss.isPending}
            onOpen={(route) => {
              setDetail(null);
              router.push(route as Href);
            }}
          />
        ) : null}
      </BottomSheet>

      <FormSheet
        visible={dismissing != null}
        onClose={() => setDismissing(null)}
        title="Talebi kapat"
        intro="Talep işlem yapılmadan “Sonuçlanan” bölümüne taşınır. Asıl kaydı ilgili sayfadan yine yönetebilirsin."
        snap="content"
        submitLabel="Kapat"
        fields={[{ key: "note", label: "Not (isteğe bağlı)", kind: "text", maxLength: 160, placeholder: "Örn. Telefonla çözüldü" }]}
        initial={{ note: "" }}
        onSubmit={(v) => dismiss.mutateAsync({ item: dismissing!, label: String(v.note ?? "").trim() || "Elle kapatıldı" })}
      />
    </AdminScreen>
  );
}

function RequestDetail({
  item,
  busyKey,
  onAction,
  onDismiss,
  dismissing,
  onOpen,
}: {
  item: ManagementRequest;
  busyKey: string | null;
  onAction: (action: RequestAction) => void;
  onDismiss: () => void;
  dismissing: boolean;
  onOpen: (route: string) => void;
}) {
  const resolved = item.status === "resolved";
  const actions = (item.actions ?? []).filter((a) => a && (a.api || actionRoute(a)));
  const related = adminPathToRoute(item.path);
  const actor = actorRoute(item);
  const busy = Boolean(busyKey?.startsWith(`${item.id}:`)) || dismissing;

  return (
    <View style={styles.detail}>
      <Text style={styles.title} {...textScale.dense}>
        {item.title || "Talep"}
      </Text>
      {item.description ? (
        <Text style={styles.body} selectable {...textScale.long}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.badges}>
        {item.status === "info" ? <Badge label="Bilgilendirme" tone="info" size="xs" /> : null}
        {resolved ? <Badge label={item.resolved_label || "Sonuçlandı"} tone="win" size="xs" /> : null}
      </View>
      <View>
        {item.actor?.name ? <InfoLine label="Talep eden" value={item.actor.name} /> : null}
        {item.city ? <InfoLine label="İl" value={item.city} /> : null}
        <InfoLine label="Tarih" value={formatDateTime(item.created_at)} />
        {resolved && item.resolved_at ? <InfoLine label="Sonuçlandı" value={formatDateTime(item.resolved_at)} /> : null}
      </View>

      {!resolved && actions.length ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              icon={action.api ? (action.style === "danger" ? "close" : "checkmark") : "arrow-forward"}
              variant={action.api ? (action.style === "danger" ? "danger" : action.style === "secondary" ? "secondary" : "primary") : "secondary"}
              loading={busyKey === `${item.id}:${action.key}`}
              disabled={busy}
              onPress={() => onAction(action)}
              fullWidth
            />
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {actor ? <Button label="Talep eden" icon="person-outline" variant="ghost" size="sm" onPress={() => onOpen(actor)} /> : null}
        {related && related !== "/yonetim/talepler" ? <Button label="İlgili sayfa" icon="open-outline" variant="ghost" size="sm" onPress={() => onOpen(related)} /> : null}
        {!resolved ? (
          <Button
            label={item.status === "info" ? "Görüldü" : "Kapat"}
            icon={item.status === "info" ? "eye-outline" : "archive-outline"}
            variant="ghost"
            size="sm"
            loading={dismissing}
            disabled={busy}
            onPress={onDismiss}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  detail: { gap: space.md },
  title: { ...type.h3, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary },
  badges: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  actions: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
