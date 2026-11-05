/**
 * DashboardSummary — web /editor kontrol panelinin (editor_pages/Editor.js)
 * mobil özet kartları. Tek dışa aktarılan bileşen; veri `useAdminDashboard()`.
 *
 * NE: özet sayaçlar (bekleyen talep, bugünkü maç, açık görev, mesaj, takım,
 * oyuncu) · Bugünün maçları (saat, durum, skor, görevli sayısı) · Talepler
 * (kategori kategori bekleyen adet, çubukla) · Yapılacaklarım (ilk 5) ·
 * Hızlı işlemler (yetkiye göre).
 *
 * NEDEN KART BAŞINA BOŞ/HATA DURUMU: kartlar bağımsız uçlardan gelir; biri
 * düşerse yalnız o kart "alınamadı" der, ekran çökmez (web ile aynı).
 * Kartlar yetkiye göre çıkar: maç yetkisi yoksa maç kartı hiç çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { memo, useCallback } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Panel } from "@/components/admin";
import { Badge, Chip, ChipGroup, MetricGrid, MetricTile, Skeleton, Touchable, type Tone } from "@/components/ui";
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
  /** Bugünün maçları kartında gösterilecek en fazla maç (varsayılan 6). */
  maxMatches?: number;
  style?: StyleProp<ViewStyle>;
}

const PHASE_TONE: Record<MatchPhase, Tone> = { upcoming: "neutral", live: "live", done: "win", late: "warn" };

const fmt = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("tr-TR"));

export function DashboardSummary({ onNavigate, showQuickActions = true, maxMatches = 6, style }: DashboardSummaryProps) {
  const router = useRouter();
  const data = useAdminDashboard();
  const go = useCallback((route: string) => (onNavigate ? onNavigate(route) : router.push(route as never)), [onNavigate, router]);

  const requestsTotal = data.requests?.total ?? null;
  const todo = data.todoSummary;
  const matches = data.matches;

  return (
    <View style={[styles.root, style]}>
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
          onPress={() => go("/yonetim/sohbet")}
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

      {showQuickActions && data.quickActions.length ? (
        <ChipGroup scrollable contentPadding={0}>
          {data.quickActions.map((action) => (
            <Chip key={action.key} label={action.label} icon={action.icon} size="sm" onPress={() => go(action.route)} />
          ))}
        </ChipGroup>
      ) : null}

      {data.canMatches ? (
        <Panel
          title="Bugünün maçları"
          action={{ label: "Tüm maçlar", onPress: () => go("/yonetim/maclar") }}
          padded={false}
        >
          {matches == null ? (
            data.loading ? (
              <View style={styles.skeletons}>
                <Skeleton height={44} radius="md" />
                <Skeleton height={44} radius="md" />
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

      <Panel title="Talepler" action={{ label: "Talepler'e git", onPress: () => go("/yonetim/talepler") }}>
        {data.openCategories.length ? (
          <View style={styles.bars}>
            {data.openCategories.map((category) => {
              const max = Math.max(1, data.openCategories[0].open);
              return (
                <Touchable
                  key={category.key}
                  onPress={() => go(`/yonetim/talepler?kategori=${encodeURIComponent(category.key)}`)}
                  style={styles.barRow}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.label}: ${category.open} bekleyen`}
                >
                  <Text style={styles.barLabel} numberOfLines={1} {...textScale.dense}>
                    {category.label}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(8, (category.open / max) * 100)}%` }]} />
                  </View>
                  <Text style={styles.barValue} {...textScale.badge}>
                    {category.open}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        ) : (
          <EmptyLine
            icon={data.requests ? "checkmark-circle-outline" : "hourglass-outline"}
            text={data.requests ? "Tüm talepler sonuçlandı." : "Talepler yükleniyor."}
            inset={false}
          />
        )}
      </Panel>

      <Panel title="Yapılacaklarım" action={{ label: "Listem", onPress: () => go("/yonetim/gorevler") }}>
        {todo ? (
          <Text style={styles.sub} {...textScale.dense}>
            {todo.open
              ? [`${todo.open} açık`, todo.overdue ? `${todo.overdue} geciken` : null, todo.matchDuties ? `${todo.matchDuties} maç görevi` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Bekleyen işin yok"}
          </Text>
        ) : null}
        {data.todos.length ? (
          data.todos.map((item) => (
            <Touchable
              key={item.id}
              onPress={() => go(`/yonetim/gorevler?id=${item.id}`)}
              style={styles.todo}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <Ionicons
                name={item.overdue ? "alert-circle-outline" : "ellipse-outline"}
                size={18}
                color={item.overdue ? colors.danger : colors.textTertiary}
              />
              <View style={styles.todoText}>
                <Text style={styles.todoTitle} numberOfLines={1} {...textScale.dense}>
                  {item.title}
                </Text>
                <Text style={[styles.todoMeta, item.overdue ? styles.danger : null]} numberOfLines={1} {...textScale.dense}>
                  {item.dutyLabel ? `${item.dutyLabel} görevi` : item.kindLabel}
                  {item.dueAt ? ` · ${item.overdue ? "Gecikti · " : ""}${formatDateTime(item.dueAt)}` : ""}
                </Text>
              </View>
            </Touchable>
          ))
        ) : (
          <EmptyLine icon="checkmark-done-outline" text="Listende açık kart yok." inset={false} />
        )}
      </Panel>
    </View>
  );
}

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
  return (
    <Touchable
      onPress={onPress}
      style={[styles.match, first ? null : styles.matchBorder]}
      accessibilityRole="button"
      accessibilityLabel={`${match.time ?? ""} ${match.home} ${scored ? `${match.home_score} ${match.away_score}` : "karşı"} ${match.away}, ${MATCH_PHASE_LABELS[match.phase]}`}
    >
      <View style={styles.matchTime}>
        <Text style={styles.time} {...textScale.badge}>
          {match.time || "--:--"}
        </Text>
        <Badge label={MATCH_PHASE_LABELS[match.phase]} tone={PHASE_TONE[match.phase]} size="xs" dot={match.phase === "live"} />
      </View>
      <View style={styles.matchMain}>
        <Text style={styles.teams} numberOfLines={1} {...textScale.dense}>
          {match.home} <Text style={styles.score}>{scored ? `${match.home_score}–${match.away_score}` : "vs"}</Text> {match.away}
        </Text>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {[match.league, match.field].filter(Boolean).join(" · ") || "—"}
        </Text>
      </View>
      <View style={styles.crew}>
        <Ionicons name={crew ? "id-card-outline" : "person-remove-outline"} size={14} color={crew ? colors.textTertiary : colors.warn} />
        <Text style={[styles.crewText, crew ? null : styles.warn]} {...textScale.badge}>
          {crew ? `${crew} görevli` : "Görevli yok"}
        </Text>
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
  more: { ...type.caption, color: colors.textTertiary, paddingHorizontal: space.lg, paddingBottom: space.md },
  match: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  matchBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  matchTime: { width: 72, gap: space.xxs, alignItems: "flex-start" },
  time: { ...type.numSmStrong, color: colors.textPrimary },
  matchMain: { flex: 1, gap: 2 },
  teams: { ...type.h4, color: colors.textPrimary },
  score: { color: colors.brandAccent },
  meta: { ...type.caption, color: colors.textTertiary },
  crew: { alignItems: "flex-end", gap: 2 },
  crewText: { ...type.micro, color: colors.textTertiary },
  warn: { color: colors.warn },
  bars: { gap: space.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xxs },
  barLabel: { ...type.bodySm, color: colors.textPrimary, width: 120 },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.warn },
  barValue: { ...type.numSmStrong, color: colors.textPrimary, minWidth: 24, textAlign: "right" },
  sub: { ...type.caption, color: colors.textTertiary },
  todo: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  todoText: { flex: 1, gap: 2 },
  todoTitle: { ...type.body, color: colors.textPrimary },
  todoMeta: { ...type.caption, color: colors.textTertiary },
  danger: { color: colors.danger },
  empty: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  emptyInset: { paddingHorizontal: space.lg, paddingBottom: space.md },
  emptyText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
