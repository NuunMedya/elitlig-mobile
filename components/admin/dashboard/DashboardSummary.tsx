/**
 * DashboardSummary — web /editor kontrol panelinin (editor_pages/Editor.js)
 * mobil özet kartları. Tek dışa aktarılan bileşen; veri `useAdminDashboard()`.
 *
 * NE: özet sayaçlar (bekleyen talep, bugünkü maç, açık görev, mesaj, takım,
 * oyuncu) · Bugünün maçları (saat, durum, skor, görevli sayısı) · Talepler
 * (kategori kategori bekleyen adet, çubukla) · Yapılacaklarım (ilk 5) ·
 * Hızlı işlemler (yetkiye göre).
 *
 * KURGU (ikinci tur): maç satırı solda saat sütunu + faz noktası, ortada iki
 * takım alt alta ve sağda skor sütunu; talepler kategori başına altın
 * degrade çubuk; yapılacaklar öncelik şeridi ve son tarih hapıyla.
 *
 * NEDEN KART BAŞINA BOŞ/HATA DURUMU: kartlar bağımsız uçlardan gelir; biri
 * düşerse yalnız o kart "alınamadı" der, ekran çökmez (web ile aynı).
 * Kartlar yetkiye göre çıkar: maç yetkisi yoksa maç kartı hiç çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { memo, useCallback } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Panel } from "@/components/admin/RecordCard";
import { Badge, Chip, ChipGroup, GradientBar, IconTile, MetricGrid, MetricTile, Skeleton, Touchable } from "@/components/ui";
import { formatDateTime } from "@/lib/admin/format";
import {
  MATCH_PHASE_LABELS,
  useAdminDashboard,
  type DayMatch,
  type MatchPhase,
} from "@/lib/api/admin/dashboard";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface DashboardSummaryProps {
  /** Gezinme (varsayılan: expo-router push). Panel kendi gezinmesini vermek isterse. */
  onNavigate?: (route: string) => void;
  /** Hızlı işlemler şeridi (varsayılan açık). */
  showQuickActions?: boolean;
  /** Üstteki sayaç ızgarası (varsayılan açık). Yönetim ana ekranı kendi sahnesinde gösterdiği için kapatır. */
  showMetrics?: boolean;
  /** Bugünün maçları kartında gösterilecek en fazla maç (varsayılan 6). */
  maxMatches?: number;
  style?: StyleProp<ViewStyle>;
}


const fmt = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("tr-TR"));

export function DashboardSummary({ onNavigate, showQuickActions = true, showMetrics = true, maxMatches = 6, style }: DashboardSummaryProps) {
  const router = useRouter();
  const data = useAdminDashboard();
  const go = useCallback((route: string) => (onNavigate ? onNavigate(route) : router.push(route as never)), [onNavigate, router]);

  const requestsTotal = data.requests?.total ?? null;
  const todo = data.todoSummary;
  const matches = data.matches;
  const maxOpen = Math.max(1, data.openCategories[0]?.open ?? 1);

  return (
    <View style={[styles.root, style]}>
      {showMetrics ? (
        <MetricGrid columns={2}>
          <MetricTile
            label="Bekleyen talep"
            value={data.requests ? fmt(requestsTotal) : "—"}
            hint={data.openCategories[0] ? `En çok: ${data.openCategories[0].label}` : data.requests ? "Hepsi sonuçlandı" : "Yükleniyor"}
            tone={requestsTotal ? "warn" : "neutral"}
            icon="file-tray-full-outline"
            onPress={() => go("/yonetim/talepler")}
          />
          {data.canMatches ? (
            <MetricTile
              label="Bugünkü maç"
              value={matches ? fmt(matches.length) : "—"}
              hint={data.liveCount ? `${data.liveCount} maç oynanıyor` : matches ? "Günün programı" : "Yüklenemedi"}
              tone={data.liveCount ? "live" : "neutral"}
              icon="football-outline"
              onPress={() => go("/yonetim/maclar")}
            />
          ) : null}
          <MetricTile
            label="Açık görev"
            value={todo ? fmt(todo.open) : "—"}
            hint={todo?.overdue ? `${todo.overdue} geciken` : todo?.today ? `${todo.today} bugün` : "Gecikme yok"}
            tone={todo?.overdue ? "danger" : "neutral"}
            icon="checkbox-outline"
            onPress={() => go("/yonetim/gorevler")}
          />
          <MetricTile
            label="Mesajlar"
            value={fmt(data.unread)}
            hint={data.unread ? "okunmamış mesaj" : "Gelen kutusu temiz"}
            tone={data.unread ? "brand" : "neutral"}
            icon="chatbubbles-outline"
            onPress={() => go("/mesajlar")}
          />
          {data.canTeams ? (
            <MetricTile
              label="Takım"
              value={fmt(data.counts?.teams)}
              hint={data.counts?.scope && data.counts.scope !== "all" ? data.counts.scope : "Tüm iller"}
              icon="shield-half-outline"
              onPress={() => go("/yonetim/takimlar")}
            />
          ) : null}
          {data.canPlayers ? (
            <MetricTile
              label="Oyuncu"
              value={fmt(data.counts?.players)}
              hint={data.counts ? `${fmt(data.counts.matches)} maç kaydı` : undefined}
              icon="people-outline"
              onPress={() => go("/yonetim/oyuncular")}
            />
          ) : null}
        </MetricGrid>
      ) : null}

      {showQuickActions && data.quickActions.length ? (
        <ChipGroup scrollable contentPadding={0}>
          {data.quickActions.map((action) => (
            <Chip key={action.key} label={action.label} icon={action.icon} size="sm" onPress={() => go(action.route)} />
          ))}
        </ChipGroup>
      ) : null}

      {data.canMatches ? (
        <Panel
          title={matches?.length ? `Günün maçları · ${matches.length}` : "Günün maçları"}
          action={{ label: "Tüm maçlar", onPress: () => go("/yonetim/maclar") }}
          padded={false}
        >
          {matches == null ? (
            data.loading ? (
              <View style={styles.skeletons}>
                <Skeleton height={52} radius="md" />
                <Skeleton height={52} radius="md" />
              </View>
            ) : (
              <EmptyLine icon="cloud-offline-outline" text="Günün programı şu an alınamadı." />
            )
          ) : matches.length === 0 ? (
            <EmptyLine icon="calendar-outline" text="Bugün için planlanmış maç yok." />
          ) : (
            <View>
              {matches.slice(0, maxMatches).map((match, index) => (
                <MatchLine key={match.id} match={match} first={index === 0} onPress={() => go(`/yonetim/maclar?mac=${match.id}`)} />
              ))}
              {matches.length > maxMatches ? (
                <Text style={styles.more} {...textScale.dense}>
                  +{matches.length - maxMatches} maç daha
                </Text>
              ) : null}
            </View>
          )}
        </Panel>
      ) : null}

      <Panel
        title={requestsTotal ? `Onay bekleyen talepler · ${requestsTotal}` : "Talepler"}
        action={{ label: "Talepler'e git", onPress: () => go("/yonetim/talepler") }}
      >
        {data.openCategories.length ? (
          <View style={styles.bars}>
            {data.openCategories.map((category) => (
              <Touchable
                key={category.key}
                feedback="row"
                onPress={() => go(`/yonetim/talepler?kategori=${encodeURIComponent(category.key)}`)}
                style={styles.barRow}
                accessibilityRole="button"
                accessibilityLabel={`${category.label}: ${category.open} bekleyen`}
              >
                <View style={styles.barHead}>
                  <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                    {category.label}
                  </Text>
                  <Text style={styles.barValue} {...textScale.badge}>
                    {category.open}
                  </Text>
                </View>
                <GradientBar value={category.open / maxOpen} height={6} gradient={colors.tileTones.gold} />
              </Touchable>
            ))}
          </View>
        ) : (
          <EmptyLine
            icon={data.requests ? "checkmark-circle-outline" : "hourglass-outline"}
            text={data.requests ? "Tüm talepler sonuçlandı." : "Talepler yükleniyor."}
            inset={false}
          />
        )}
      </Panel>

      <Panel title="Yapılacaklarım" action={{ label: "Listem", onPress: () => go("/yonetim/gorevler") }} padded={false}>
        {todo ? (
          <View style={styles.todoStats}>
            <TodoStat value={todo.open} label="Açık" tone="brand" />
            <TodoStat value={todo.overdue} label="Geciken" tone={todo.overdue ? "danger" : "neutral"} />
            <TodoStat value={todo.today} label="Bugün" tone="neutral" />
            <TodoStat value={todo.matchDuties} label="Maç görevi" tone="neutral" />
          </View>
        ) : null}
        {data.todos.length ? (
          data.todos.map((item, index) => (
            <Touchable
              key={item.id}
              feedback="row"
              onPress={() => go(`/yonetim/gorevler?id=${item.id}`)}
              style={[styles.todo, index === 0 && !todo ? null : styles.todoDivided]}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View
                style={[
                  styles.todoStripe,
                  { backgroundColor: item.overdue ? colors.danger : item.priority === "high" ? colors.warn : "transparent" },
                ]}
              />
              <IconTile icon={TODO_ICONS[item.kind] ?? "checkbox-outline"} tone={item.overdue ? "red" : item.kind === "match_duty" ? "cyan" : "violet"} size={32} glow={false} />
              <View style={styles.todoText}>
                <Text style={styles.todoTitle} numberOfLines={1} {...textScale.dense}>
                  {item.title}
                </Text>
                <Text style={styles.todoMeta} numberOfLines={1} {...textScale.dense}>
                  {item.dutyLabel ? `${item.dutyLabel} görevi` : item.kindLabel}
                </Text>
              </View>
              {item.dueAt ? (
                <Badge label={item.overdue ? "Gecikti" : shortDue(item.dueAt)} tone={item.overdue ? "danger" : "neutral"} size="xs" icon="time-outline" />
              ) : null}
            </Touchable>
          ))
        ) : (
          <EmptyLine icon="checkmark-done-outline" text="Listende açık kart yok." />
        )}
      </Panel>
    </View>
  );
}

const TODO_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  task: "checkbox-outline",
  reminder: "notifications-outline",
  note: "document-text-outline",
  match_duty: "mic-outline",
  match_moment: "flash-outline",
  award_nomination: "star-outline",
  award_coordination: "trophy-outline",
  sheet_share: "grid-outline",
};

/** Kısa son tarih: "Bugün 18:00", "Yarın", "14 Kas". */
function shortDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDateTime(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(date) - start(new Date())) / 86_400_000);
  const clock = date.getHours() === 23 && date.getMinutes() === 59 ? "" : ` ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 0) return `Bugün${clock}`;
  if (days === 1) return `Yarın${clock}`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function TodoStat({ value, label, tone }: { value: number; label: string; tone: "brand" | "danger" | "neutral" }) {
  const color = tone === "brand" ? colors.brandAccent : tone === "danger" ? colors.danger : colors.textPrimary;
  return (
    <View style={styles.todoStat}>
      <Text style={[styles.todoStatValue, { color }]} {...textScale.badge}>
        {fmt(value)}
      </Text>
      <Text style={styles.todoStatLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const PHASE_DOT: Record<MatchPhase, string> = {
  upcoming: colors.textTertiary,
  live: colors.live,
  done: colors.win,
  late: colors.warn,
};

const MatchLine = memo(function MatchLine({
  match,
  first,
  onPress,
}: {
  match: DayMatch & { phase: MatchPhase };
  first: boolean;
  onPress: () => void;
}) {
  const crew = Object.values(match.crew || {}).filter((person) => person?.name).length;
  const scored = match.home_score != null && match.away_score != null;
  const live = match.phase === "live";
  return (
    <Touchable
      feedback="row"
      onPress={onPress}
      style={[styles.match, first ? null : styles.matchBorder, live ? styles.matchLive : null]}
      accessibilityRole="button"
      accessibilityLabel={`${match.time ?? ""} ${match.home} ${scored ? `${match.home_score} ${match.away_score}` : "karşı"} ${match.away}, ${MATCH_PHASE_LABELS[match.phase]}`}
    >
      {live ? <View style={styles.matchLiveStripe} /> : null}
      <View style={styles.matchTime}>
        <Text style={[styles.time, live ? styles.timeLive : null]} {...textScale.badge}>
          {match.time ? match.time.slice(0, 5) : "--:--"}
        </Text>
        <View style={styles.phaseRow}>
          <View style={[styles.phaseDot, { backgroundColor: PHASE_DOT[match.phase] }]} />
          <Text style={[styles.phaseText, { color: PHASE_DOT[match.phase] }]} numberOfLines={2} {...textScale.badge}>
            {MATCH_PHASE_LABELS[match.phase]}
          </Text>
        </View>
      </View>
      <View style={styles.matchMain}>
        <View style={styles.teamRow}>
          <Text style={styles.teams} numberOfLines={1} {...textScale.dense}>
            {match.home}
          </Text>
          {scored ? (
            <Text style={[styles.score, live ? styles.scoreLive : null]} {...textScale.badge}>
              {match.home_score}
            </Text>
          ) : null}
        </View>
        <View style={styles.teamRow}>
          <Text style={styles.teams} numberOfLines={1} {...textScale.dense}>
            {match.away}
          </Text>
          {scored ? (
            <Text style={[styles.score, live ? styles.scoreLive : null]} {...textScale.badge}>
              {match.away_score}
            </Text>
          ) : null}
        </View>
        <View style={styles.matchFoot}>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[match.field, match.league].filter(Boolean).join(" · ") || "—"}
          </Text>
          <Badge
            label={crew ? `${crew} görevli` : "Görevli yok"}
            tone={crew ? "neutral" : "warn"}
            size="xs"
            icon={crew ? "id-card-outline" : "person-remove-outline"}
          />
        </View>
      </View>
    </Touchable>
  );
});

function EmptyLine({ icon, text, inset = true }: { icon: keyof typeof Ionicons.glyphMap; text: string; inset?: boolean }) {
  return (
    <View style={[styles.empty, inset ? styles.emptyInset : null]}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.emptyText} {...textScale.dense}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  skeletons: { gap: space.sm, padding: space.lg },
  more: { ...type.caption, color: colors.textTertiary, paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: hairline, borderTopColor: colors.separator },
  match: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  matchBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  matchLive: { backgroundColor: colors.liveDim },
  matchLiveStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.live },
  matchTime: { width: 72, gap: space.xxs, paddingTop: space.xxs },
  time: { ...type.metricSm, color: colors.textPrimary },
  timeLive: { color: colors.live },
  phaseRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },

  phaseDot: { width: 6, height: 6, borderRadius: radius.pill, marginTop: 4 },
  phaseText: { ...type.micro, flexShrink: 1 },
  matchMain: { flex: 1, gap: space.xxs },
  teamRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  teams: { ...type.h4, color: colors.textPrimary, flex: 1 },
  score: { ...type.numSmStrong, color: colors.textPrimary, minWidth: 16, textAlign: "right" },
  scoreLive: { color: colors.live },
  matchFoot: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  meta: { ...type.caption, color: colors.textTertiary, flex: 1 },
  bars: { gap: space.md },
  barRow: { gap: space.s },
  barHead: { flexDirection: "row", alignItems: "baseline", gap: space.md },
  barLabel: { ...type.label, color: colors.textPrimary, flex: 1 },
  barValue: { ...type.numSmStrong, color: colors.warn },
  todoStats: { flexDirection: "row", paddingHorizontal: space.sm, paddingBottom: space.md },
  todoStat: { flex: 1, alignItems: "center", gap: space.xxs },
  todoStatValue: { ...type.metricSm },
  todoStatLabel: { ...type.micro, color: colors.textTertiary },
  todo: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  todoDivided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  todoStripe: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  todoText: { flex: 1, gap: 2 },
  todoTitle: { ...type.h4, color: colors.textPrimary },
  todoMeta: { ...type.caption, color: colors.textTertiary },
  empty: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  emptyInset: { paddingHorizontal: space.lg, paddingBottom: space.md },
  emptyText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
