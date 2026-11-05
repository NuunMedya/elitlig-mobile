/**
 * ARAÇLAR MERKEZİ — kişisel çalışma araçlarının vitrini (web: /yonetim/araclar).
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
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, RecordCard, StatRow, useAdminMutation, type BadgeSpec } from "@/components/admin";
import { formatClock, relativeDayLocal } from "@/components/admin/tools/agendaUtils";
import { readTodayFocus, type FocusStats } from "@/components/admin/tools/focusUtils";
import { Button, EmptyState, Input, SectionHeader, Skeleton, Touchable, withAlpha, type Tone } from "@/components/ui";
import { TOOL_MODULES } from "@/lib/adminModules";
import { formatMoney } from "@/lib/admin/format";
import { eventColor } from "@/lib/admin/toolPalette";
import { createNote, getProjectSummaries, getToolsOverview, toolKeys } from "@/lib/api/admin/tools";
import { getTodoSummary, todoKeys } from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const TONES: Record<string, Tone> = {
  projeler: "brand",
  gorevler: "danger",
  ajanda: "info",
  "not-defteri": "warn",
  muhasebe: "win",
  tablolar: "accent",
  rehber: "info",
  "hesap-araclari": "neutral",
  "odak-sayaci": "brand",
};

const greeting = (hour: number) => (hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar");

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const routeOf = (key: string) => TOOL_MODULES.find((m) => m.key === key)?.route ?? "/yonetim/araclar";

export default function ToolsHubScreen() {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const now = useClock();
  const [quick, setQuick] = useState("");
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

  const saveQuick = useAdminMutation(
    (text: string) => {
      const [first, ...rest] = text.split("\n");
      return createNote(rest.length ? { title: first, body: rest.join("\n") } : { title: "", body: first });
    },
    {
      success: "Not defterine eklendi.",
      invalidate: [toolKeys.overview(), toolKeys.notesAll()],
      onSuccess: () => setQuick(""),
    }
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
  const tools = TOOL_MODULES.filter((m) => m.key !== "mesajlar");

  return (
    <AdminScreen title="Araçlar" onRefresh={refresh} refreshing={overview.isRefetching}>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Text style={styles.hello} {...textScale.dense}>
            {greeting(now.getHours())}
            {name ? `, ${name}` : ""}
          </Text>
          <Text style={styles.date} {...textScale.dense}>
            {now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </View>
        <Text style={styles.clock} accessibilityLabel={`Saat ${formatClock(now)}`} {...textScale.badge}>
          {formatClock(now)}
        </Text>
      </View>

      <StatRow
        items={[
          { label: "açık iş", value: summary ? String(summary.open ?? 0) : "–", tone: summary?.overdue ? "danger" : undefined, onPress: () => router.push(routeOf("gorevler") as never) },
          { label: "7 günde etkinlik", value: data ? String(data.upcoming.length) : "–", onPress: () => router.push(routeOf("ajanda") as never) },
          { label: "bekleyen alacak", value: ledger ? formatMoney(ledger.receivable, true) : "–", onPress: () => router.push(routeOf("muhasebe") as never) },
        ]}
      />

      {overview.error ? (
        <Text style={styles.muted} {...textScale.long}>
          Araç özetleri şu an yüklenemedi; araçları yine de açabilirsiniz.
        </Text>
      ) : null}

      <SectionHeader title="Araçlar" size="group" inset="flush" />
      <View style={styles.cards}>
        {tools.map((tool) => {
          const preview = previews[tool.key] ?? { text: tool.description };
          return (
            <RecordCard
              key={tool.key}
              title={tool.title}
              subtitle={tool.description}
              meta={overview.isLoading && !preview.badge ? null : preview.text}
              icon={tool.icon}
              iconTone={TONES[tool.key] ?? "brand"}
              badges={[preview.badge]}
              onPress={() => router.push(tool.route as never)}
              numberOfLines={2}
            />
          );
        })}
      </View>

      <SectionHeader title="Önümüzdeki 7 gün" size="group" inset="flush" action={{ label: "Ajandayı aç", onPress: () => router.push(routeOf("ajanda") as never) }} />
      {overview.isLoading ? (
        <View style={styles.gap}>
          <Skeleton height={48} radius="md" />
          <Skeleton height={48} radius="md" />
        </View>
      ) : data?.upcoming?.length ? (
        <View style={styles.list}>
          {data.upcoming.map((item, index) => (
            <Touchable
              key={item.occurrence_key}
              feedback="row"
              onPress={() => router.push(routeOf("ajanda") as never)}
              style={[styles.upcoming, index ? styles.divided : null]}
              accessibilityLabel={`${relativeDayLocal(item.occurrence_start)} ${item.all_day ? "tüm gün" : formatClock(item.occurrence_start)}: ${item.title}`}
            >
              <View style={[styles.bar, { backgroundColor: eventColor(item) }]} />
              <View style={styles.when}>
                <Text style={styles.whenDay} numberOfLines={1} {...textScale.dense}>
                  {relativeDayLocal(item.occurrence_start)}
                </Text>
                <Text style={styles.whenTime} {...textScale.badge}>
                  {item.all_day ? "Tüm gün" : formatClock(item.occurrence_start)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.upTitle} numberOfLines={1} {...textScale.dense}>
                  {item.title}
                </Text>
                {item.location ? (
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {item.location}
                  </Text>
                ) : null}
              </View>
            </Touchable>
          ))}
        </View>
      ) : (
        <EmptyState compact variant="inline" icon="calendar-clear-outline" title="Takvim boş" body="Maç, toplantı ya da ödeme günlerinizi ajandaya ekleyin." />
      )}

      <SectionHeader title="Hızlı not" size="group" inset="flush" action={{ label: "Tüm notlar", onPress: () => router.push(routeOf("not-defteri") as never) }} />
      <View style={styles.quick}>
        <Input
          value={quick}
          onChangeText={setQuick}
          placeholder="Aklınıza geleni yazın… İlk satır başlık olur."
          multiline
          numberOfLines={3}
          accessibilityLabel="Hızlı not"
        />
        <Button
          label="Kaydet"
          size="sm"
          icon="checkmark"
          onPress={() => saveQuick.mutate(quick.trim())}
          disabled={!quick.trim()}
          loading={saveQuick.isPending}
          style={styles.quickBtn}
          haptic="success"
        />
      </View>

      {data?.notes?.length ? (
        <View style={styles.notes}>
          {data.notes.map((note) => {
            const preview = note.body ? note.body.slice(0, 90) : note.checklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("  ");
            return (
              <Touchable
                key={note.id}
                feedback="card"
                onPress={() => router.push(routeOf("not-defteri") as never)}
                style={[styles.note, note.color ? { backgroundColor: withAlpha(note.color, 0.22), borderLeftColor: note.color, borderLeftWidth: 4 } : null]}
                accessibilityLabel={note.title || "Not"}
              >
                <Text style={styles.noteTitle} numberOfLines={1} {...textScale.dense}>
                  {note.pinned ? "Sabit · " : ""}
                  {note.title || (note.body || note.checklist?.[0]?.text || "Not").slice(0, 60)}
                </Text>
                {note.title && preview ? (
                  <Text style={styles.muted} numberOfLines={2} {...textScale.dense}>
                    {preview}
                  </Text>
                ) : null}
              </Touchable>
            );
          })}
        </View>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.sm },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
  },
  hello: { ...type.h1, color: colors.textPrimary },
  date: { ...type.bodySm, color: colors.textSecondary, marginTop: 2 },
  clock: { ...type.scoreLg, color: colors.brandAccent },
  muted: { ...type.caption, color: colors.textTertiary },
  cards: { gap: space.sm },
  list: { borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1, overflow: "hidden" },
  upcoming: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.m, paddingRight: space.md },
  divided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  bar: { width: 4, alignSelf: "stretch" },
  when: { width: 92 },
  whenDay: { ...type.labelSm, color: colors.textPrimary },
  whenTime: { ...type.numSm, color: colors.textTertiary },
  upTitle: { ...type.h4, color: colors.textPrimary },
  quick: { gap: space.sm },
  quickBtn: { alignSelf: "flex-end" },
  notes: { gap: space.sm },
  note: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  noteTitle: { ...type.h4, color: colors.textPrimary },
});
