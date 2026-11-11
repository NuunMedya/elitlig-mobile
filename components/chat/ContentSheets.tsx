/**
 * HAZIR İÇERİK FORMLARI (yalnız yönetim hesapları) — masaüstü Mesajlar'daki
 * ContentForms'un mobil karşılığı:
 *
 *   MatchesSheet  seçilen günün maçlarından "Günün maçları" kartı
 *   SignupSheet   "Ben talibim" görev anketi (spiker, reji… × seçilen maçlar)
 *   AwardSheet    Haftanın Enleri aday anketi (lig, sezon, tarih, kategoriler)
 *
 * Sunucu: POST /api/chat/conversations/:id/content/{matches|signup|award}
 * (services/chat/chatContent.js). Yetki sunucuda denetlenir; Haftanın Enleri
 * ayrıca görev atama (todos.assign) yetkisi ister.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Chip, ChipGroup, ErrorState, Input, SegmentedControl, SkeletonListRow, Touchable } from "@/components/ui";
import { getAwardLeagues, getAwardSeasons, getContentMatches, type AwardPollInput, type ContentMatch } from "@/lib/api/chat";
import { AWARD_CATEGORIES, DUTIES, isoDate, lastWeekRange, matchDayLabel, shiftDate } from "@/lib/chatUtils";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ---------- gün ve maç seçimi ---------- */

function useDayMatches(enabled: boolean) {
  const [date, setDate] = useState(() => isoDate());
  const query = useQuery({
    queryKey: ["chat", "content", "matches", date] as const,
    queryFn: () => getContentMatches(date),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  return { date, setDate, query, items: query.data?.items ?? EMPTY };
}
const EMPTY: ContentMatch[] = [];

function DayBar({ date, onChange }: { date: string; onChange: (next: string) => void }) {
  return (
    <View style={styles.dayBar}>
      <Touchable feedback="icon" haptic="selection" onPress={() => onChange(shiftDate(date, -1))} accessibilityRole="button" accessibilityLabel="Önceki gün" style={styles.dayButton}>
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
      </Touchable>
      <Text style={styles.dayLabel} {...textScale.dense}>{matchDayLabel(date)}</Text>
      <Touchable feedback="icon" haptic="selection" onPress={() => onChange(shiftDate(date, 1))} accessibilityRole="button" accessibilityLabel="Sonraki gün" style={styles.dayButton}>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Touchable>
    </View>
  );
}

function MatchPicker({ day, picked, onToggle, onAll }: { day: ReturnType<typeof useDayMatches>; picked: Set<number>; onToggle: (id: number) => void; onAll: (on: boolean) => void }) {
  const { items, query } = day;
  const all = items.length > 0 && items.every((m) => picked.has(m.id));
  return (
    <View style={styles.block}>
      <DayBar date={day.date} onChange={day.setDate} />
      {query.isLoading ? (
        <SkeletonListRow count={4} avatar={false} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="banner" />
      ) : !items.length ? (
        <Text style={styles.hint} {...textScale.dense}>Bu güne kayıtlı maç yok. Okla başka bir gün seç.</Text>
      ) : (
        <>
          <Touchable feedback="row" haptic="selection" onPress={() => onAll(!all)} accessibilityRole="checkbox" accessibilityState={{ checked: all }} accessibilityLabel="Tüm maçları seç" style={styles.matchRow}>
            <Ionicons name={all ? "checkbox" : "square-outline"} size={22} color={all ? colors.brand : colors.textTertiary} />
            <Text style={styles.matchAll} {...textScale.dense}>Tümünü seç · {picked.size}/{items.length}</Text>
          </Touchable>
          {items.map((match) => {
            const on = picked.has(match.id);
            const crew = Object.keys(match.crew ?? {});
            return (
              <Touchable key={match.id} feedback="row" haptic="selection" onPress={() => onToggle(match.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${match.home} - ${match.away}, ${match.time ?? ""}`} style={styles.matchRow}>
                <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.brand : colors.textTertiary} />
                <Text style={styles.matchTime} {...textScale.badge}>{match.time ?? "--:--"}</Text>
                <View style={styles.flex}>
                  <Text style={styles.matchTeams} numberOfLines={2} {...textScale.dense}>{match.home} – {match.away}</Text>
                  <Text style={styles.matchMeta} numberOfLines={1} {...textScale.dense}>
                    {[match.league, match.field, crew.length ? `${crew.map((key) => DUTIES.find((d) => d.key === key)?.label ?? key).join(", ")} atandı` : null].filter(Boolean).join(" · ") || "Saha girilmemiş"}
                  </Text>
                </View>
              </Touchable>
            );
          })}
        </>
      )}
    </View>
  );
}

function usePicked(items: ContentMatch[]) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Gün değişince o günün tüm maçları seçili gelir.
  useEffect(() => setPicked(new Set(items.map((m) => m.id))), [items]);
  const toggle = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = (on: boolean) => setPicked(on ? new Set(items.map((m) => m.id)) : new Set());
  return { picked, toggle, all };
}

interface SheetProps<T> {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Gönderim başarılıysa true döner; sayfa o zaman kapanır. */
  onSend: (body: T) => Promise<boolean>;
}

/* ---------- günün maçları ---------- */

export function MatchesSheet({ visible, title, onClose, onSend }: SheetProps<{ match_ids: number[]; date: string; note: string | null }>) {
  const day = useDayMatches(visible);
  const { picked, toggle, all } = usePicked(day.items);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = day.items.filter((m) => picked.has(m.id));
  const send = async () => {
    setBusy(true);
    const ok = await onSend({ match_ids: chosen.map((m) => m.id), date: day.date, note: note.trim() || null });
    setBusy(false);
    if (ok) {
      setNote("");
      onClose();
    }
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Günün maçlarını gönder"
      snap="full"
      footer={<Button label={chosen.length ? `${chosen.length} maçı gönder` : "En az bir maç seç"} icon="send" onPress={() => void send()} disabled={!chosen.length} loading={busy} fullWidth />}
    >
      <Text style={styles.lead} {...textScale.dense}>Seçtiğin maçlar “{title}” sohbetine tek kart olarak gider.</Text>
      <MatchPicker day={day} picked={picked} onToggle={toggle} onAll={all} />
      <View style={styles.block}>
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Ekipler 19:30'da sahada olsun." maxLength={500} multiline />
      </View>
    </BottomSheet>
  );
}

/* ---------- ben talibim ---------- */

type DeadlineKey = "none" | "tonight" | "tomorrowNoon" | "tomorrowNight";
const DEADLINES: { key: DeadlineKey; label: string }[] = [
  { key: "none", label: "Son tarih yok" },
  { key: "tonight", label: "Bu akşam 20:00" },
  { key: "tomorrowNoon", label: "Yarın 12:00" },
  { key: "tomorrowNight", label: "Yarın 20:00" },
];
function deadlineValue(key: DeadlineKey): string | null {
  if (key === "none") return null;
  const today = isoDate();
  if (key === "tonight") return `${today}T20:00`;
  return `${shiftDate(today, 1)}T${key === "tomorrowNoon" ? "12:00" : "20:00"}`;
}

export function SignupSheet({ visible, title, onClose, onSend }: SheetProps<{ title: string | null; match_ids: number[]; duties: string[]; note: string | null; deadline: string | null }>) {
  const day = useDayMatches(visible);
  const { picked, toggle, all } = usePicked(day.items);
  const [duties, setDuties] = useState<string[]>(["spiker", "reji"]);
  const [heading, setHeading] = useState("");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState<DeadlineKey>("none");
  const [busy, setBusy] = useState(false);
  const chosen = day.items.filter((m) => picked.has(m.id));
  const rows = chosen.length * duties.length;
  const autoTitle = `Görev talibi aranıyor: ${DUTIES.filter((d) => duties.includes(d.key)).map((d) => d.label).join(", ")}`;
  const toggleDuty = (key: string) => setDuties((list) => (list.includes(key) ? list.filter((x) => x !== key) : DUTIES.map((d) => d.key).filter((x) => x === key || list.includes(x))));
  const send = async () => {
    setBusy(true);
    const ok = await onSend({ title: heading.trim() || null, match_ids: chosen.map((m) => m.id), duties, note: note.trim() || null, deadline: deadlineValue(deadline) });
    setBusy(false);
    if (ok) {
      setHeading("");
      setNote("");
      onClose();
    }
  };
  const footLabel = rows > 80 ? "En çok 80 satır: maç ya da görev azalt" : rows ? `Anketi gönder · ${chosen.length} maç × ${duties.length} görev` : "Maç ve görev seç";
  return (
    <BottomSheet visible={visible} onClose={onClose} title="“Ben talibim” görev anketi" snap="full" footer={<Button label={footLabel} icon="send" onPress={() => void send()} disabled={!rows || rows > 80} loading={busy} fullWidth />}>
      <Text style={styles.lead} {...textScale.dense}>“{title}” sohbetindekiler satır satır talip olur; görevlendirmeyi karttan yaparsın.</Text>
      <Text style={styles.section} {...textScale.badge}>HANGİ GÖREVLER?</Text>
      <ChipGroup>
        {DUTIES.map((duty) => <Chip key={duty.key} label={duty.label} icon={duty.icon} selected={duties.includes(duty.key)} onPress={() => toggleDuty(duty.key)} />)}
      </ChipGroup>
      <MatchPicker day={day} picked={picked} onToggle={toggle} onAll={all} />
      <View style={styles.block}>
        <Input label="Başlık" value={heading} onChangeText={setHeading} placeholder={autoTitle} maxLength={160} />
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Önce gelen alır" maxLength={500} />
      </View>
      <Text style={styles.section} {...textScale.badge}>SON TARİH</Text>
      <ChipGroup>
        {DEADLINES.map((item) => <Chip key={item.key} label={item.label} selected={deadline === item.key} onPress={() => setDeadline(item.key)} size="sm" />)}
      </ChipGroup>
      <View style={styles.bottomGap} />
    </BottomSheet>
  );
}

/* ---------- haftanın enleri ---------- */

const SQUADS = [
  { key: "7", label: "7'li kadro" },
  { key: "8", label: "8'li kadro" },
];
const optionLabel = (item: { label?: string | null; name?: string | null; seasonName?: string | null; id: number }) => item.label || item.name || item.seasonName || `#${item.id}`;

export function AwardSheet({ visible, title, onClose, onSend }: SheetProps<AwardPollInput>) {
  const initial = useMemo(() => lastWeekRange(), []);
  const [week, setWeek] = useState("");
  const [start, setStart] = useState(initial.start);
  const [squad, setSquad] = useState("7");
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>(() => AWARD_CATEGORIES.map((c) => c.key));
  const [note, setNote] = useState("");
  const [dueDays, setDueDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const end = shiftDate(start, 6);

  const leagues = useQuery({ queryKey: ["chat", "award", "leagues"] as const, queryFn: getAwardLeagues, enabled: visible, staleTime: 5 * 60_000, retry: false });
  const seasons = useQuery({ queryKey: ["chat", "award", "seasons", leagueId] as const, queryFn: () => getAwardSeasons(leagueId ?? 0), enabled: visible && Boolean(leagueId), staleTime: 5 * 60_000, retry: false });

  const valid = categories.length > 0 && Boolean(leagueId) && Boolean(seasonId);
  const toggleCategory = (key: string) => setCategories((list) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]));
  const send = async () => {
    if (!leagueId || !seasonId) return;
    setBusy(true);
    const due = dueDays ? new Date(`${shiftDate(isoDate(), dueDays)}T12:00:00`).toISOString() : null;
    const ok = await onSend({ week: week.trim() || null, categories, league_id: leagueId, season_id: seasonId, start_date: start, end_date: end, squad_size: Number(squad), due_at: due, note: note.trim() || null });
    setBusy(false);
    if (ok) {
      setNote("");
      onClose();
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Haftanın Enleri anketi"
      snap="full"
      footer={<Button label={valid ? "Anketi gönder" : "Lig, sezon ve en az bir kategori seç"} icon="trophy" onPress={() => void send()} disabled={!valid} loading={busy} fullWidth />}
    >
      <Text style={styles.lead} {...textScale.dense}>
        “{title}” sohbetindeki yönetim ekibine Yapılacaklar'da birer aday öneri kartı, sana önerileri toplayacağın koordinasyon kartı açılır.
      </Text>
      <View style={styles.block}>
        <Input label="Hafta adı" value={week} onChangeText={setWeek} placeholder="Örn. 12. hafta" maxLength={60} />
        <SegmentedControl items={SQUADS} value={squad} onChange={setSquad} stretch size="sm" />
      </View>

      <Text style={styles.section} {...textScale.badge}>HAFTA</Text>
      <View style={styles.block}>
        <View style={styles.dayBar}>
          <Touchable feedback="icon" haptic="selection" onPress={() => setStart(shiftDate(start, -7))} accessibilityRole="button" accessibilityLabel="Önceki hafta" style={styles.dayButton}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </Touchable>
          <Text style={styles.dayLabel} {...textScale.dense}>{start.split("-").reverse().join(".")} – {end.split("-").reverse().join(".")}</Text>
          <Touchable feedback="icon" haptic="selection" onPress={() => setStart(shiftDate(start, 7))} accessibilityRole="button" accessibilityLabel="Sonraki hafta" style={styles.dayButton}>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Touchable>
        </View>
      </View>

      <Text style={styles.section} {...textScale.badge}>LİG</Text>
      {leagues.isLoading ? (
        <View style={styles.block}><SkeletonListRow count={2} avatar={false} /></View>
      ) : leagues.isError ? (
        <View style={styles.block}><ErrorState error={leagues.error} onRetry={() => void leagues.refetch()} variant="banner" /></View>
      ) : (
        <ChipGroup>
          {(leagues.data ?? []).map((league) => (
            <Chip
              key={league.id}
              label={optionLabel(league)}
              selected={leagueId === league.id}
              onPress={() => {
                setLeagueId(league.id);
                setSeasonId(null);
              }}
              size="sm"
            />
          ))}
        </ChipGroup>
      )}

      {leagueId ? (
        <>
          <Text style={styles.section} {...textScale.badge}>SEZON</Text>
          {seasons.isLoading ? (
            <View style={styles.block}><SkeletonListRow count={1} avatar={false} /></View>
          ) : seasons.isError ? (
            <View style={styles.block}><ErrorState error={seasons.error} onRetry={() => void seasons.refetch()} variant="banner" /></View>
          ) : (seasons.data ?? []).length ? (
            <ChipGroup>
              {(seasons.data ?? []).map((season) => <Chip key={season.id} label={optionLabel(season)} selected={seasonId === season.id} onPress={() => setSeasonId(season.id)} size="sm" />)}
            </ChipGroup>
          ) : (
            <Text style={[styles.hint, styles.inset]} {...textScale.dense}>Bu ligde sezon bulunamadı.</Text>
          )}
        </>
      ) : null}

      <Text style={styles.section} {...textScale.badge}>KATEGORİLER</Text>
      <View style={styles.wrapChips}>
        {AWARD_CATEGORIES.map((category) => <Chip key={category.key} label={category.label} selected={categories.includes(category.key)} onPress={() => toggleCategory(category.key)} size="sm" />)}
      </View>

      <Text style={styles.section} {...textScale.badge}>SON TARİH</Text>
      <ChipGroup>
        {[0, 1, 2, 3].map((days) => <Chip key={days} label={days === 0 ? "Yok" : days === 1 ? "Yarın 12:00" : `${days} gün sonra`} selected={dueDays === days} onPress={() => setDueDays(days)} size="sm" />)}
      </ChipGroup>
      <View style={styles.block}>
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Pazartesi 12:00'ye kadar" maxLength={500} />
      </View>
      <View style={styles.bottomGap} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  lead: { ...type.bodySm, color: colors.textSecondary, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  block: { paddingHorizontal: layout.screenPadding, paddingVertical: space.xs, gap: space.sm },
  inset: { paddingHorizontal: layout.screenPadding },
  section: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xs },
  hint: { ...type.bodySm, color: colors.textSecondary, paddingVertical: space.sm },
  dayBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  dayButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dayLabel: { ...type.h3, color: colors.textPrimary },
  matchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingVertical: space.xs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  matchAll: { ...type.label, color: colors.textSecondary },
  matchTime: { ...type.tableNumStrong, color: colors.textPrimary, width: 44 },
  matchTeams: { ...type.label, color: colors.textPrimary },
  matchMeta: { ...type.caption, color: colors.textTertiary },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: layout.screenPadding },
  bottomGap: { height: space.xl },
});
