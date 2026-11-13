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

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminList, AdminScreen, DateField, InfoLine, Panel } from "@/components/admin";
import { CountTiles, toneBg, toneFg, toneTile } from "@/components/admin/system/SysKit";
import { Avatar, Badge, BottomSheet, Button, Chip, ChipGroup, IconTile, Tabs, Toggle, Touchable } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
            {stats ? (
              <CountTiles
                items={[
                  { key: "count", label: "Son 24 saat", value: stats.count, icon: "pulse", tone: "brand" },
                  { key: "users", label: "Kullanıcı", value: stats.users, icon: "people", tone: "accent" },
                  { key: "fail", label: "Hata (liste)", value: items.filter(isFailedLog).length, icon: "alert-circle", tone: "danger" },
                ]}
              />
            ) : null}
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
        summary={items.length ? `${items.length} kayıt yüklendi` : null}
        gap={0}
        keyExtractor={(e) => String(e.id)}
        emptyIcon="list-outline"
        emptyTitle={hasFilters ? "Süzgeçlere uyan kayıt yok" : "Henüz kayıt yok"}
        renderItem={({ item, index }) => {
          const meta = logKindMeta(item);
          const failed = isFailedLog(item);
          const newDay = index === 0 || isoDay(items[index - 1]?.createdAt) !== isoDay(item.createdAt);
          const lastOfDay = index === items.length - 1 || isoDay(items[index + 1]?.createdAt) !== isoDay(item.createdAt);
          const tone = failed ? "danger" : meta.tone;
          return (
            <View>
              {newDay ? (
                <View style={styles.dayRow}>
                  <IconTile icon="calendar" tone="neutral" size={22} glow={false} />
                  <Text style={styles.day} accessibilityRole="header" {...textScale.dense}>
                    {dayLabel(item.createdAt)}
                  </Text>
                </View>
              ) : null}
              {/* Zaman çizelgesi: saat · eksen üstünde tür pulu · kart. */}
              <Touchable feedback="row" onPress={() => setOpen(item)} style={styles.tl} accessibilityRole="button" accessibilityLabel={`${formatTime(item.createdAt)}, ${item.action || item.url}, ${item.username ?? ""}`}>
                <Text style={[styles.time, failed ? { color: colors.danger } : null]} {...textScale.badge}>
                  {formatTime(item.createdAt)}
                </Text>
                <View style={styles.axis}>
                  <View style={[styles.axisLine, newDay ? styles.axisTopGap : null, lastOfDay ? styles.axisBottomGap : null]} />
                  <View style={[styles.pul, { backgroundColor: toneBg(tone), borderColor: toneFg(tone) }]}>
                    <Ionicons name={logIcon(item)} size={13} color={toneFg(tone)} />
                  </View>
                </View>
                <View style={[styles.card, failed ? styles.cardFailed : null]}>
                  <Text style={styles.cardTitle} numberOfLines={2} {...textScale.dense}>
                    {item.action || item.url || item.route || "—"}
                  </Text>
                  {item.url || item.route ? (
                    <Text style={styles.route} numberOfLines={1} {...textScale.badge}>
                      {[item.method && item.method !== "GET" ? item.method : null, item.url || item.route].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                  <View style={styles.who}>
                    <Avatar name={item.username || "?"} size={18} />
                    <Text style={styles.whoText} numberOfLines={1} {...textScale.dense}>
                      {[item.username || `#${item.user_id ?? "—"}`, ROLE_LABELS[item.user_role ?? ""] ?? item.user_role, item.city].filter(Boolean).join(" · ")}
                    </Text>
                    <Badge label={failed ? String(item.status_code) : meta.label} tone={tone} size="xs" />
                  </View>
                </View>
              </Touchable>
            </View>
          );
        }}
      />

      <BottomSheet visible={open != null} onClose={() => setOpen(null)} title={open?.action || "Kayıt ayrıntısı"} snap="half">
        {open ? (
          <View style={styles.gap}>
            <View style={styles.sheetHead}>
              <IconTile icon={logIcon(open)} tone={toneTile(isFailedLog(open) ? "danger" : logKindMeta(open).tone)} size={44} />
              <View style={styles.flex}>
                <Text style={styles.sheetTitle} numberOfLines={3} {...textScale.dense}>
                  {open.action || open.url || "—"}
                </Text>
                <View style={styles.sheetBadges}>
                  <Badge label={logKindMeta(open).label} tone={logKindMeta(open).tone} size="xs" />
                  <Badge label={`${open.status_code || "—"}`} tone={isFailedLog(open) ? "danger" : "win"} icon={isFailedLog(open) ? "close-circle" : "checkmark-circle"} size="xs" />
                  {open.duration_ms != null ? <Badge label={`${open.duration_ms} ms`} size="xs" /> : null}
                </View>
              </View>
            </View>
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

/** Kayıt türü → zaman çizelgesi pulu. */
function logIcon(item: ActivityLog): keyof typeof Ionicons.glyphMap {
  if (item.kind === "page_view") return "eye";
  if (item.kind === "auth") return isFailedLog(item) ? "lock-closed" : "log-in";
  const m = String(item.method || "").toUpperCase();
  if (m === "DELETE") return "trash";
  if (m === "POST") return "add";
  return "create";
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, marginBottom: space.xs },
  tl: { flexDirection: "row", alignItems: "stretch", gap: space.sm },
  time: { ...type.tableNumStrong, color: colors.textSecondary, width: 40, paddingTop: space.md, textAlign: "right" },
  axis: { width: 26, alignItems: "center" },
  axisLine: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.separator },
  axisTopGap: { top: space.md },
  axisBottomGap: { bottom: "60%" },
  pul: { width: 26, height: 26, borderRadius: 13, marginTop: space.sm + 2, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  card: { flex: 1, minWidth: 0, gap: 3, padding: space.md, marginBottom: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardFailed: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  cardTitle: { ...type.label, color: colors.textPrimary },
  route: { ...type.micro, color: colors.textTertiary },
  who: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  whoText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space.md, paddingBottom: space.sm },
  sheetTitle: { ...type.h3, color: colors.textPrimary },
  sheetBadges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  flex: { flex: 1 },
  dates: { flexDirection: "row", gap: space.sm },
  day: { ...type.overline, color: colors.textSecondary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toggleLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
});
