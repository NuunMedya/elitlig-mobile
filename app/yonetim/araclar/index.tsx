/**
 * ARAÇLAR MERKEZİ — kişisel çalışma araçlarının vitrini (web: /yonetim/araclar).
 *
 * TASARIM: en üstte gece sahnesi (saat Odometer ile döner, selam, üç cam
 * sayaç), hızlı kayıt, uygulama karoları (degrade IconTile + canlı özet),
 * tarih karolu 7 günlük akış ve yatay renkli not kartları.
 *
 * NE: selamlama ve saat, üç sayaç (açık iş, 7 günde etkinlik, bekleyen
 * alacak), her aracın CANLI özetini taşıyan kartlar (lib/adminModules.ts
 * TOOL_MODULES), önümüzdeki 7 gün, hızlı not kutusu (ilk satır başlık olur)
 * ve son notlar.
 *
 * VERİ: /api/tools/overview (ajanda, notlar, muhasebe, rehber, tablo
 * sayıları), /api/todos/summary (açık iş), /api/tools/projects (proje
 * sayısı, bugünkü aramalar). Odak sayacının günlük istatistiği cihazdadır.
 * Üç sorgu bağımsızdır: biri düşerse diğer kartlar yine dolar.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminScreen, type BadgeSpec } from "@/components/admin";
import { Pop, appTone } from "@/components/admin/home/AppTiles";
import { LineRow, Lines, TileButton, ToolStage } from "@/components/admin/tools/ToolKit";
import { QuickCapture } from "@/components/admin/tools/QuickCapture";
import { formatClock, relativeDayLocal } from "@/components/admin/tools/agendaUtils";
import { readTodayFocus, type FocusStats } from "@/components/admin/tools/focusUtils";
import { EmptyState, Reveal, SectionHeader, Skeleton, Touchable, withAlpha } from "@/components/ui";
import { formatMoney } from "@/lib/admin/format";
import { TOOL_APP_LIST, toolApp } from "@/lib/admin/toolApps";
import { eventColor } from "@/lib/admin/toolPalette";
import { getProjectSummaries, getToolsOverview, toolKeys } from "@/lib/api/admin/tools";
import { getTodoSummary, todoKeys } from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";


const greeting = (hour: number) => (hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar");

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const routeOf = (key: string) => toolApp(key)?.route ?? "/yonetim/araclar";

export default function ToolsHubScreen() {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = useClock();
  const [focus, setFocus] = useState<FocusStats | null>(null);

  const overview = useQuery({ queryKey: toolKeys.overview(), queryFn: getToolsOverview });
  const todos = useQuery({ queryKey: todoKeys.summary(), queryFn: getTodoSummary, retry: false });
  const projects = useQuery({ queryKey: toolKeys.projects(), queryFn: getProjectSummaries, retry: false });

  // Odak sayacından dönünce bugünün turları tazelensin.
  useFocusEffect(
    useCallback(() => {
      void readTodayFocus().then(setFocus);
    }, [])
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: toolKeys.overview() });
    void queryClient.invalidateQueries({ queryKey: todoKeys.summary() });
    void queryClient.invalidateQueries({ queryKey: toolKeys.projects() });
    void readTodayFocus().then(setFocus);
  };

  const data = overview.data;
  const ledger = data?.ledger;
  const nextEvent = data?.upcoming?.[0];
  const summary = todos.data;

  const previews = useMemo<Record<string, { text: string; badge?: BadgeSpec | null }>>(() => {
    const list = projects.data ?? [];
    const calls = list.reduce((n, p) => n + (p.stats?.leads?.due || 0), 0);
    const late = list.reduce((n, p) => n + (p.stats?.steps?.overdue || 0), 0);
    return {
      projeler: list.length
        ? { text: `${list.length} proje`, badge: calls ? { label: `${calls} arama bugün`, tone: "warn" } : late ? { label: `${late} geciken adım`, tone: "danger" } : null }
        : { text: "Süreç, kişiler, sorular ve portföy" },
      gorevler: summary
        ? {
            text: `${summary.open || 0} açık iş`,
            badge: summary.overdue ? { label: `${summary.overdue} geciken`, tone: "danger" } : summary.today ? { label: `${summary.today} bugün`, tone: "info" } : null,
          }
        : { text: "Görevlerinizi planlayın" },
      ajanda: nextEvent
        ? { text: `${nextEvent.title} · ${relativeDayLocal(nextEvent.occurrence_start)}${nextEvent.all_day ? "" : ` ${formatClock(nextEvent.occurrence_start)}`}` }
        : { text: data ? "Önümüzdeki 7 gün boş" : "Ay, hafta ve gün görünümü" },
      "not-defteri": data?.counts
        ? { text: `${data.counts.notes} not${data.notes?.[0]?.title ? ` · son: ${data.notes[0].title}` : ""}` }
        : { text: "Fikirlerinizi kaydedin" },
      muhasebe: ledger
        ? { text: `Bu ay net ${formatMoney(ledger.net)}`, badge: ledger.overdue ? { label: `${ledger.overdue} vadesi geçen`, tone: "danger" } : null }
        : { text: "Hesaplar, virman ve defterler" },
      tablolar: data?.counts?.sheets != null ? { text: `${data.counts.sheets} tablo dosyası` } : { text: "Formüllü tablolar ve şablonlar" },
      rehber: data?.counts ? { text: `${data.counts.contacts} kişi kayıtlı` } : { text: "Kişi ve cari kartları" },
      "hesap-araclari": { text: "KDV · yüzde · bölüştürme · taksit" },
      "odak-sayaci": focus?.sessions ? { text: `Bugün ${focus.sessions} tur · ${focus.minutes} dk` } : { text: "Pomodoro ve kronometre" },
    };
  }, [projects.data, summary, nextEvent, data, ledger, focus]);

  const name = (auth.user?.fullName || auth.user?.username || "").split(" ")[0];
  // Mesajlar ve Talepler de birer uygulamadır; sayıları kendi rozetlerinde (sekme çubuğu, zil) görünür.
  const tools = TOOL_APP_LIST;

  const upcoming = data?.upcoming ?? [];
  const notes = data?.notes ?? [];

  return (
    <AdminScreen title="Araçlar" subtitle="Her araç kendi uygulaması" onRefresh={refresh} refreshing={overview.isRefetching}>
      <Reveal index={0}>
        <ToolStage
          icon="apps"
          tone="signature"
          overline={now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          value={formatClock(now)}
          caption={`${greeting(now.getHours())}${name ? `, ${name}` : ""}. Bugün ne üzerinde çalışıyoruz?`}
          stats={[
            { label: "açık iş", value: summary ? Number(summary.open ?? 0) : "–", tone: summary?.overdue ? "danger" : undefined, onPress: () => router.push(routeOf("gorevler") as never) },
            { label: "7 gün etkinlik", value: data ? upcoming.length : "–", tone: "accent", onPress: () => router.push(routeOf("ajanda") as never) },
            { label: "alacak", value: ledger ? formatMoney(ledger.receivable, true) : "–", tone: ledger?.receivable ? "warn" : undefined, onPress: () => router.push(routeOf("muhasebe") as never) },
          ]}
        />
      </Reveal>

      {overview.error ? (
        <Text style={styles.muted} {...textScale.long}>
          Araç özetleri şu an yüklenemedi; araçları yine de açabilirsiniz.
        </Text>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Hızlı kayıt" inset="flush" />
        <QuickCapture />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Uygulamalar" meta={`${tools.length} araç`} inset="flush" />
        <View style={styles.grid}>
          {tools.map((tool, index) => {
            const preview = previews[tool.key] ?? { text: tool.tagline };
            return (
              <Pop key={tool.key} index={index} style={styles.cell}>
                <TileButton
                  icon={tool.icon}
                  tone={appTone(tool.key)}
                  title={tool.shortTitle}
                  hint={preview.text}
                  badge={preview.badge ? { label: preview.badge.label, tone: preview.badge.tone } : null}
                  onPress={() => router.push(tool.route as never)}
                  style={styles.tile}
                />
              </Pop>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Önümüzdeki 7 gün" inset="flush" action={{ label: "Ajanda", onPress: () => router.push(routeOf("ajanda") as never) }} />
        {overview.isLoading ? (
          <View style={styles.gap}>
            <Skeleton height={60} radius="lg" />
            <Skeleton height={60} radius="lg" />
            <Skeleton height={60} radius="lg" />
          </View>
        ) : upcoming.length ? (
          <Lines inset={72}>
            {upcoming.map((item, index) => {
              const date = new Date(item.occurrence_start);
              const color = eventColor(item);
              return (
                <Reveal key={item.occurrence_key} index={index}>
                  <LineRow
                    leading={
                      <View style={[styles.dateTile, { borderColor: withAlpha(color, 0.55), backgroundColor: withAlpha(color, 0.16) }]}>
                        <Text style={styles.dateNum} {...textScale.badge}>
                          {date.getDate()}
                        </Text>
                        <Text style={[styles.dateMon, { color }]} {...textScale.badge}>
                          {upperTR(date.toLocaleDateString("tr-TR", { month: "short" }))}
                        </Text>
                      </View>
                    }
                    title={item.title}
                    meta={[relativeDayLocal(item.occurrence_start), item.all_day ? "Tüm gün" : formatClock(item.occurrence_start), item.location].filter(Boolean).join(" · ")}
                    metaIcon="time-outline"
                    stripe={color}
                    chevron
                    onPress={() => router.push(routeOf("ajanda") as never)}
                    accessibilityLabel={`${relativeDayLocal(item.occurrence_start)} ${item.all_day ? "tüm gün" : formatClock(item.occurrence_start)}: ${item.title}`}
                  />
                </Reveal>
              );
            })}
          </Lines>
        ) : (
          <EmptyState compact variant="inline" icon="calendar-clear-outline" title="Takvim boş" body="Maç, toplantı ya da ödeme günlerinizi ajandaya ekleyin." />
        )}
      </View>

      {notes.length ? (
        <View style={styles.section}>
          <SectionHeader title="Son notlar" inset="flush" action={{ label: "Tümü", onPress: () => router.push(routeOf("not-defteri") as never) }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.noteRail} style={styles.noteScroller}>
            {notes.map((note, index) => {
              const preview = note.body ? note.body.slice(0, 120) : note.checklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("\n");
              const tint = note.color || colors.brand;
              return (
                <Reveal key={note.id} index={index} axis="x">
                  <Touchable
                    feedback="card"
                    onPress={() => router.push(routeOf("not-defteri") as never)}
                    style={[styles.note, { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.4) }]}
                    accessibilityLabel={note.title || "Not"}
                  >
                    <View style={styles.noteHead}>
                      <View style={[styles.noteDot, { backgroundColor: tint }]} />
                      {note.pinned ? <Ionicons name="pin" size={13} color={colors.textSecondary} /> : null}
                    </View>
                    <Text style={styles.noteTitle} numberOfLines={2} {...textScale.dense}>
                      {note.title || (note.body || note.checklist?.[0]?.text || "Not").slice(0, 60)}
                    </Text>
                    {note.title && preview ? (
                      <Text style={styles.noteBody} numberOfLines={4} {...textScale.dense}>
                        {preview}
                      </Text>
                    ) : null}
                    {note.tags?.length ? (
                      <Text style={styles.noteTags} numberOfLines={1} {...textScale.dense}>
                        {note.tags.map((tag) => `#${tag}`).join("  ")}
                      </Text>
                    ) : null}
                  </Touchable>
                </Reveal>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  section: { gap: space.sm, marginTop: space.md },
  muted: { ...type.caption, color: colors.textTertiary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { flexBasis: "47%", flexGrow: 1 },
  tile: { flexBasis: "auto", minHeight: 124 },
  dateTile: { width: 44, height: 46, borderRadius: radius.md, borderWidth: hairline, alignItems: "center", justifyContent: "center" },
  dateNum: { ...type.metricSm, color: colors.textPrimary },
  dateMon: { ...type.nano },
  noteScroller: { marginHorizontal: -layout.screenPadding },
  noteRail: { gap: space.sm, paddingHorizontal: layout.screenPadding },
  note: { width: 200, minHeight: 150, gap: space.xs, padding: space.md, borderRadius: radius.xl, borderWidth: hairline },
  noteHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xxs },
  noteDot: { width: 10, height: 10, borderRadius: radius.pill },
  noteTitle: { ...type.h4, color: colors.textPrimary },
  noteBody: { ...type.caption, color: colors.textSecondary },
  noteTags: { ...type.labelXs, color: colors.textTertiary, marginTop: "auto" },
});
