/**
 * İŞLEM KAYITLARI — kim, ne zaman, ne yaptı (web pages/management/activityLogs/ActivityLogs.js).
 *
 * NE: iki sekme (Yönetim / Üyeler; son 24 saatin kayıt sayısı rozette).
 * Arama, kayıt türü çipleri (işlem, giriş/çıkış, sayfa ziyareti), işlem türü
 * (ekleme, güncelleme, silme), tarih aralığı, "yalnız başarısız" süzgeci ve
 * kişi süzgeci. Kayıtlar yeniden eskiye, gün başlıklarıyla; sona gelince
 * daha eskiler yüklenir (sunucu imleci `before`). Kayda dokununca ayrıntı
 * alt sayfası: istek, sonuç, IP, tarayıcı, gönderilen alanlar ve "yalnız bu
 * kullanıcının kayıtları".
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, DateField, InfoLine, Panel, RecordCard } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Tabs, Toggle } from "@/components/ui";
import { formatDateTime, formatLongDay, formatTime, isoDay } from "@/lib/admin/format";
import { ROLE_LABELS } from "@/lib/api/admin";
import {
  EMPTY_LOG_FILTERS,
  LOG_AUDIENCES,
  LOG_KIND_OPTIONS,
  LOG_METHOD_OPTIONS,
  buildLogQuery,
  getActivityLogs,
  getActivitySummary,
  isFailedLog,
  logDetailPairs,
  logKindMeta,
  systemKeys,
  type ActivityLog,
  type LogAudience,
  type LogFilters,
  type LogKind,
  type LogMethod,
} from "@/lib/api/admin/system";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["activity_logs.view"];

function dayLabel(iso: string): string {
  const key = isoDay(iso);
  const today = isoDay();
  const yesterday = isoDay(new Date(Date.now() - 86_400_000));
  if (key === today) return "Bugün";
  if (key === yesterday) return "Dün";
  return formatLongDay(iso);
}

export default function ActivityLogsScreen() {
  const [audience, setAudience] = useState<LogAudience>("management");
  const [filters, setFilters] = useState<LogFilters>(EMPTY_LOG_FILTERS);
  const [open, setOpen] = useState<ActivityLog | null>(null);
  const [showMore, setShowMore] = useState(false);

  const summary = useQuery({ queryKey: [...systemKeys.logs, "summary"], queryFn: getActivitySummary, retry: false });
  const query = useInfiniteQuery({
    queryKey: [...systemKeys.logs, "list", audience, filters],
    queryFn: ({ pageParam }) => getActivityLogs(buildLogQuery(audience, filters, pageParam)),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const set = (patch: Partial<LogFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Boolean(filters.q || filters.kind || filters.method || filters.from || filters.to || filters.errors || filters.userId);
  const stats = summary.data?.[audience];

  return (
    <AdminScreen
      title="İşlem kayıtları"
      permission={PERMS}
      scroll={false}
      bottom={
        <Tabs
          items={LOG_AUDIENCES.map((a) => ({ key: a.key, label: a.label, badge: summary.data?.[a.key]?.count || undefined }))}
          value={audience}
          onChange={(key) => {
            setAudience(key);
            // Kişi süzgeci sekmeye özeldir; diğer süzgeçler korunur.
            set({ userId: "", userName: "" });
          }}
          distribute="equal"
        />
      }
    >
      <AdminList
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => {
          void query.refetch();
          void summary.refetch();
        }}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={filters.q}
        onSearch={(q) => set({ q })}
        searchPlaceholder="Kullanıcı adı, işlem ya da sayfa ara"
        filters={LOG_KIND_OPTIONS.map((o) => ({ key: o.key || "all", label: o.label }))}
        filter={filters.kind || "all"}
        onFilter={(key) => set({ kind: (key === "all" ? "" : key) as LogKind })}
        extraHeader={
          <View style={styles.gap}>
            <ChipGroup scrollable contentPadding={0}>
              {filters.userId ? (
                <Chip label={`Kullanıcı: ${filters.userName}`} size="sm" selected onDismiss={() => set({ userId: "", userName: "" })} />
              ) : null}
              <Chip
                label={showMore ? "Süzgeçleri gizle" : "Daha fazla süzgeç"}
                icon="options-outline"
                size="sm"
                selected={showMore || Boolean(filters.method || filters.from || filters.to || filters.errors)}
                onPress={() => setShowMore((v) => !v)}
              />
              {hasFilters ? <Chip label="Tümünü temizle" icon="close" size="sm" onPress={() => setFilters(EMPTY_LOG_FILTERS)} /> : null}
            </ChipGroup>
            {showMore ? (
              <Panel>
                <ChipGroup scrollable contentPadding={0}>
                  {LOG_METHOD_OPTIONS.map((o) => (
                    <Chip key={o.key || "all"} label={o.label} size="sm" selected={filters.method === o.key} onPress={() => set({ method: o.key as LogMethod })} />
                  ))}
                </ChipGroup>
                <View style={styles.dates}>
                  <View style={styles.flex}>
                    <DateField label="Başlangıç" value={filters.from || null} onChange={(v) => set({ from: v ?? "" })} clearable />
                  </View>
                  <View style={styles.flex}>
                    <DateField label="Bitiş" value={filters.to || null} onChange={(v) => set({ to: v ?? "" })} clearable />
                  </View>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel} {...textScale.dense}>
                    Yalnız başarısız işlemler
                  </Text>
                  <Toggle value={filters.errors} onValueChange={(v) => set({ errors: v })} accessibilityLabel="Yalnız başarısız işlemler" />
                </View>
              </Panel>
            ) : null}
          </View>
        }
        summary={stats ? `Son 24 saat: ${stats.count.toLocaleString("tr-TR")} kayıt · ${stats.users.toLocaleString("tr-TR")} kullanıcı` : null}
        keyExtractor={(e) => String(e.id)}
        emptyIcon="list-outline"
        emptyTitle={hasFilters ? "Süzgeçlere uyan kayıt yok" : "Henüz kayıt yok"}
        renderItem={({ item, index }) => {
          const meta = logKindMeta(item);
          const failed = isFailedLog(item);
          const newDay = index === 0 || isoDay(items[index - 1]?.createdAt) !== isoDay(item.createdAt);
          return (
            <View style={styles.gap}>
              {newDay ? (
                <Text style={styles.day} {...textScale.dense}>
                  {dayLabel(item.createdAt)}
                </Text>
              ) : null}
              <RecordCard
                title={item.action || item.url || item.route || "—"}
                subtitle={item.url || item.route}
                meta={[formatTime(item.createdAt), item.username || `#${item.user_id ?? "—"}`, ROLE_LABELS[item.user_role ?? ""] ?? item.user_role, item.city]
                  .filter(Boolean)
                  .join(" · ")}
                icon={item.kind === "page_view" ? "document-outline" : item.kind === "auth" ? "log-in-outline" : "flash-outline"}
                iconTone={failed ? "danger" : meta.tone}
                badges={[{ label: meta.label, tone: meta.tone }, failed ? { label: String(item.status_code), tone: "danger" } : null]}
                numberOfLines={1}
                onPress={() => setOpen(item)}
              />
            </View>
          );
        }}
      />

      <BottomSheet visible={open != null} onClose={() => setOpen(null)} title={open?.action || "Kayıt ayrıntısı"} snap="half">
        {open ? (
          <View style={styles.gap}>
            <InfoLine label="Zaman" value={formatDateTime(open.createdAt)} />
            <InfoLine
              label="Kullanıcı"
              value={`${open.username || "—"} (#${open.user_id ?? "—"}) · ${ROLE_LABELS[open.user_role ?? ""] ?? open.user_role ?? "—"}`}
            />
            {open.city ? <InfoLine label="İl" value={open.city} /> : null}
            <InfoLine label="İstek" value={[open.method, open.route].filter(Boolean).join(" ") || "—"} />
            {open.url ? <InfoLine label="Adres" value={open.url} /> : null}
            {open.entity_id ? <InfoLine label="Kayıt" value={open.entity_type ? `${open.entity_type} #${open.entity_id}` : `#${open.entity_id}`} /> : null}
            <InfoLine
              label="Sonuç"
              value={`${open.status_code || "—"}${open.duration_ms != null ? ` · ${open.duration_ms} ms` : ""}`}
              tone={isFailedLog(open) ? "danger" : undefined}
            />
            <InfoLine label="IP" value={open.ip || "—"} />
            <InfoLine label="Tarayıcı" value={open.user_agent || "—"} />
            {logDetailPairs(open.details).length ? (
              <Panel title="Gönderilen bilgiler">
                {logDetailPairs(open.details).map(([key, value]) => (
                  <InfoLine key={key || "value"} label={key || "değer"} value={value} />
                ))}
              </Panel>
            ) : null}
            {open.user_id != null && String(filters.userId) !== String(open.user_id) ? (
              <Button
                label={`Yalnız ${open.username || "bu kullanıcının"} kayıtları`}
                icon="funnel-outline"
                variant="secondary"
                onPress={() => {
                  set({ userId: String(open.user_id), userName: open.username || `#${open.user_id}` });
                  setOpen(null);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1 },
  dates: { flexDirection: "row", gap: space.sm },
  day: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toggleLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
});
