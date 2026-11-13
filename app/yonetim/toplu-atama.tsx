/**
 * TOPLU PERSONEL ATAMA — maçlara spiker, reji, hakem, fotoğrafçı, sağlıkçı.
 *
 * Web: pages/management/staffBulk/StaffBulkAssign.js. Maçlar tarih sırasıyla
 * gün gün gruplanır; her maçın görev satırına dokununca personel seçim alt
 * sayfası açılır (o görevi yapanlar üstte, yalnız maçın ilinin personeli).
 * Değişiklikler TASLAKTA birikir ve alttaki "Tümünü kaydet" tek istekte
 * (PUT /api/staff/matches/bulk) gönderir; kaydedilemeyen maçlar işaretlenir.
 *
 * ÇAKIŞMA: aynı kişi aynı gün ve saatte iki maça atanırsa satır uyarı verir
 * (web findConflicts ile aynı kural). "Hızlı doldur" görünen maçlarda boş
 * kalan görevi aynı kişiyle doldurur. Kaydedilmemiş değişiklik varken
 * ekrandan çıkmak ya da dönem değiştirmek onay ister.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { AdminScreen, OptionSheet, SelectField, confirmAction, useAdminMutation } from "@/components/admin";
import { StaffPickerSheet } from "@/components/admin/staff/StaffPickerSheet";
import {
  BottomSheet,
  Badge,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientBar,
  Input,
  SegmentedControl,
  SkeletonListRow,
  Touchable,
  refreshControlProps,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { CountStrip, DangerNote, SelectionBar } from "@/components/admin/team/ManageKit";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatLongDay } from "@/lib/admin/format";
import {
  applySavedAssignments,
  buildBulkAssignments,
  currentStaffId,
  FALLBACK_DUTIES,
  findConflicts,
  getAssignableMatches,
  isDutyChanged,
  isMatchChanged,
  listStaff,
  missingCount,
  saveBulkAssignments,
  sortByDate,
  splitByDuty,
  staffInCity,
  type AssignableMatch,
  type Drafts,
  type StaffDuty,
  type StaffMember,
} from "@/lib/api/admin/staff";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const PERMS = ["staff.assign"] as const;

type RangeKey = "upcoming" | "past7" | "past30" | "all";
const RANGES: (SegmentedItem<RangeKey> & { params: { range: "upcoming" | "past" | "all"; days?: number } })[] = [
  { key: "upcoming", label: "Yaklaşan", params: { range: "upcoming" } },
  { key: "past7", label: "Son 7 gün", params: { range: "past", days: 7 } },
  { key: "past30", label: "Son 30 gün", params: { range: "past", days: 30 } },
  { key: "all", label: "Tümü", params: { range: "all" } },
];

const norm = (v: unknown) => String(v || "").toLocaleLowerCase("tr-TR");

export default function StaffBulkAssignScreen() {
  const auth = useAuth();
  const toast = useToast();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const canAssign = hasAnyPermission(auth.user, ["staff.assign"]);

  const [range, setRange] = useState<RangeKey>("upcoming");
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ match: AssignableMatch; duty: StaffDuty } | null>(null);
  const [sheet, setSheet] = useState<null | "league" | "season" | "fill">(null);
  const [fill, setFill] = useState<{ duty: string; staffId: string | null }>({ duty: "spiker", staffId: null });
  // Kaydedilen satırlar sunucu yanıtıyla yerinde güncellenir (yeniden çekmeden).
  const [saved, setSaved] = useState<Record<string, AssignableMatch>>({});

  const preset = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const matchesQuery = useQuery({
    queryKey: ["admin", "staff", "assignable", range],
    queryFn: () => getAssignableMatches(preset.params),
  });
  const staffQuery = useQuery({ queryKey: ["admin", "staff", "list", "active"], queryFn: () => listStaff({ status: "active" }) });

  const matches = useMemo(
    () => (matchesQuery.data?.items ?? []).map((m) => saved[String(m.id)] ?? m),
    [matchesQuery.data, saved]
  );
  const duties = matchesQuery.data?.duties?.length ? matchesQuery.data.duties : FALLBACK_DUTIES;
  const staff = useMemo(() => staffQuery.data?.items ?? [], [staffQuery.data]);
  const staffById = useMemo(() => new Map(staff.map((p) => [String(p.id), p])), [staff]);
  const byId = useMemo(() => new Map(matches.map((m) => [String(m.id), m])), [matches]);

  const { items: changes, changes: changeCount } = useMemo(() => buildBulkAssignments(drafts, byId, duties), [drafts, byId, duties]);
  const dirty = changeCount > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Kaydedilmemiş değişiklik varken geri çıkışı onaya bağla.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      void confirmAction({
        title: "Kaydedilmemiş değişiklikler var",
        message: "Ekrandan çıkarsan taslaktaki görevlendirmeler silinir.",
        confirmLabel: "Çık",
        destructive: true,
      }).then((ok) => ok && navigation.dispatch(event.data.action));
    });
    return unsubscribe;
  }, [navigation]);

  const leagues = useMemo(
    () => Array.from(new Set(matches.map((m) => m.league).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "tr")),
    [matches]
  );
  const seasons = useMemo(
    () =>
      Array.from(new Set(matches.filter((m) => !league || m.league === league).map((m) => m.season).filter(Boolean) as string[])).sort((a, b) =>
        b.localeCompare(a, "tr", { numeric: true })
      ),
    [matches, league]
  );

  const conflicts = useMemo(() => findConflicts(matches, duties, drafts), [matches, duties, drafts]);

  const filtered = useMemo(() => {
    const needle = norm(search.trim());
    let list = matches;
    if (league) list = list.filter((m) => m.league === league);
    if (season) list = list.filter((m) => m.season === season);
    if (needle) {
      list = list.filter((m) => {
        const names = duties.map((d) => staffById.get(currentStaffId(m, d.key, drafts))?.fullName || m.crew?.[d.key]?.name || "");
        return norm([m.label, m.field, m.league, m.city, ...names].join(" ")).includes(needle);
      });
    }
    if (onlyMissing) list = list.filter((m) => missingCount(m, duties, drafts) > 0);
    if (onlyChanged) list = list.filter((m) => isMatchChanged(m, duties, drafts));
    return sortByDate(list, sort);
  }, [matches, league, season, search, onlyMissing, onlyChanged, sort, duties, drafts, staffById]);

  const sections = useMemo(() => {
    const out: { day: string | null; data: AssignableMatch[] }[] = [];
    filtered.forEach((m) => {
      const last = out[out.length - 1];
      if (last && last.day === m.day) last.data.push(m);
      else out.push({ day: m.day, data: [m] });
    });
    return out;
  }, [filtered]);

  const stats = useMemo(() => {
    let full = 0;
    let missing = 0;
    matches.forEach((m) => {
      const c = missingCount(m, duties, drafts);
      if (!c) full += 1;
      missing += c;
    });
    const conflictMatches = new Set([...conflicts.keys()].map((k) => k.split(":")[0])).size;
    return { total: matches.length, full, missing, conflictMatches };
  }, [matches, duties, drafts, conflicts]);

  const setDraft = useCallback((matchId: number, duty: string, value: string) => {
    setDrafts((cur) => ({ ...cur, [matchId]: { ...(cur[matchId] || {}), [duty]: value } }));
    setRowErrors((cur) => (cur[matchId] ? { ...cur, [matchId]: "" } : cur));
  }, []);

  const resetRow = useCallback((matchId: number) => {
    setDrafts((cur) => {
      if (!cur[matchId]) return cur;
      const next = { ...cur };
      delete next[matchId];
      return next;
    });
    setRowErrors((cur) => ({ ...cur, [matchId]: "" }));
  }, []);

  const changeRange = async (next: RangeKey) => {
    if (next === range) return;
    if (dirty) {
      const ok = await confirmAction({
        title: "Kaydedilmemiş değişiklikler var",
        message: "Liste değişirse taslaktaki görevlendirmeler silinecek.",
        confirmLabel: "Devam et",
        destructive: true,
      });
      if (!ok) return;
    }
    setDrafts({});
    setRowErrors({});
    setSaved({});
    setLeague(null);
    setSeason(null);
    setRange(next);
  };

  const discardAll = async () => {
    const ok = await confirmAction({ title: "Tüm değişiklikler silinsin mi?", confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    setDrafts({});
    setRowErrors({});
  };

  /** Görünen maçlarda seçilen görevi boş olanlara aynı kişiyi yazar (yalnız kişinin ilindeki maçlar). */
  const fillPerson = fill.staffId ? staffById.get(fill.staffId) ?? null : null;
  const fillTargets = filtered.filter((m) => !currentStaffId(m, fill.duty, drafts) && (!fillPerson || staffInCity(fillPerson, m)));
  const applyFill = () => {
    if (!fill.staffId || !fillTargets.length) return;
    setDrafts((cur) => {
      const next = { ...cur };
      fillTargets.forEach((m) => (next[m.id] = { ...(next[m.id] || {}), [fill.duty]: fill.staffId as string }));
      return next;
    });
    const dutyLabel = duties.find((d) => d.key === fill.duty)?.label || fill.duty;
    toast.show({ message: `${fillPerson?.fullName || "Personel"}, ${fillTargets.length} maçta ${dutyLabel} olarak taslağa eklendi. Kaydetmeyi unutma.`, tone: "neutral" });
    setSheet(null);
  };

  const save = useAdminMutation(() => saveBulkAssignments(changes), {
    silentError: false,
    success: (r) => (r.errors?.length ? null : r.message),
    invalidate: [["admin", "staff", "list"]],
    onSuccess: (r) => {
      const updated = r.updated ?? [];
      const errors = r.errors ?? [];
      setSaved((cur) => {
        const next = { ...cur };
        updated.forEach((u) => {
          const m = byId.get(String(u.matchId));
          if (m) next[String(u.matchId)] = applySavedAssignments(m, u.assignments);
        });
        return next;
      });
      setDrafts((cur) => {
        const next = { ...cur };
        updated.forEach((u) => delete next[u.matchId]);
        return next;
      });
      const errs: Record<string, string> = {};
      errors.forEach((e) => {
        if (e.matchId != null) errs[e.matchId] = e.error || "Kaydedilemedi.";
      });
      setRowErrors(errs);
      if (errors.length) {
        setOnlyChanged(true);
        toast.show({ message: `${updated.length} maç kaydedildi, ${errors.length} maç kaydedilemedi. Hatalı satırlar işaretlendi.`, tone: "warn" });
      }
    },
  });

  const optionsFor = useCallback(
    (m: AssignableMatch, duty: string) => splitByDuty(staff.filter((p) => staffInCity(p, m)), duty),
    [staff]
  );

  const header = (
    <View style={styles.header}>
      <SegmentedControl<RangeKey> items={RANGES} value={range} onChange={(k) => void changeRange(k)} size="sm" />
      <CountStrip
        items={[
          { key: "total", label: "Maç", value: stats.total, icon: "football" },
          { key: "full", label: "Tamam", value: stats.full, tone: "win", icon: "checkmark-circle" },
          { key: "missing", label: "Boş görev", value: stats.missing, tone: stats.missing ? "warn" : "neutral", icon: "person-add", selected: onlyMissing, onPress: () => setOnlyMissing((v) => !v) },
        ]}
      />
      {stats.total ? (
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel} {...textScale.dense}>
              Kadrosu tamamlanan maç
            </Text>
            <Text style={styles.progressValue} {...textScale.badge}>
              %{Math.round((stats.full / stats.total) * 100)}
            </Text>
          </View>
          <GradientBar value={stats.full / stats.total} />
        </View>
      ) : null}
      {stats.conflictMatches ? (
        <DangerNote
          icon="time"
          title={`${stats.conflictMatches} maçta saat çakışması`}
          body="Aynı kişi aynı gün ve saatte iki maça atanmış. Kırmızı işaretli görevleri düzelt."
        />
      ) : null}
      {canAssign && !staffQuery.isLoading && staff.length === 0 ? (
        <DangerNote tone="warn" title="Personel listesi boş" body="Önce Personel ekranından kişi ekle." />
      ) : null}
      <Input
        variant="search"
        leadingIcon="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Takım, saha, lig ya da personel ara"
        autoCorrect={false}
      />
      <ChipGroup scrollable contentPadding={0}>
        {canAssign && staff.length > 0 ? <Chip size="sm" icon="flash" label="Hızlı doldur" tone="warn" selected onPress={() => setSheet("fill")} /> : null}
        <Chip
          size="sm"
          icon="trophy-outline"
          label={league ?? "Tüm ligler"}
          selected={Boolean(league)}
          onPress={() => setSheet("league")}
          onDismiss={league ? () => { setLeague(null); setSeason(null); } : undefined}
        />
        <Chip
          size="sm"
          icon="calendar-outline"
          label={season ?? "Tüm sezonlar"}
          selected={Boolean(season)}
          onPress={() => setSheet("season")}
          onDismiss={season ? () => setSeason(null) : undefined}
        />
        <Chip size="sm" icon={sort === "asc" ? "arrow-up" : "arrow-down"} label={sort === "asc" ? "Eskiden yeniye" : "Yeniden eskiye"} onPress={() => setSort(sort === "asc" ? "desc" : "asc")} />
        <Chip size="sm" label="Değiştirilenler" selected={onlyChanged} onPress={() => setOnlyChanged((v) => !v)} />
      </ChipGroup>
    </View>
  );

  const pickerOptions = picker ? optionsFor(picker.match, picker.duty.key) : { primary: [], others: [] };
  const pickerConflict = picker ? conflicts.get(`${picker.match.id}:${picker.duty.key}`) : undefined;
  const fillOptions = splitByDuty(staff, fill.duty);

  return (
    <AdminScreen title="Toplu personel atama" subtitle="Maçlara personeli tek ekrandan ata" permission={PERMS} scroll={false}>
      <SectionList
        sections={sections}
        keyExtractor={(m) => String(m.id)}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.content, { paddingBottom: dirty ? 170 + insets.bottom : space.giant * 2 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            {...refreshControlProps(matchesQuery.isRefetching, () => {
              // Sunucunun taze listesi gelince yerinde işlenen kayıtlar düşer.
              setSaved({});
              void matchesQuery.refetch();
              void staffQuery.refetch();
            })}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayRow}>
            <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.dayRail} />
            <Text style={styles.day} {...textScale.dense}>
              {section.day ? upperTR(formatLongDay(`${section.day}T12:00:00`)) : "TARİHİ BELİRSİZ"}
            </Text>
            <Text style={styles.dayCount} {...textScale.dense}>
              {section.data.length} maç
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <MatchAssignCard
            match={item}
            duties={duties}
            drafts={drafts}
            conflicts={conflicts}
            staffById={staffById}
            error={rowErrors[item.id]}
            disabled={!canAssign || save.isPending}
            onPick={(duty) => setPicker({ match: item, duty })}
            onReset={() => resetRow(item.id)}
          />
        )}
        ListEmptyComponent={
          matchesQuery.isLoading ? (
            <SkeletonListRow count={5} />
          ) : matchesQuery.error ? (
            <ErrorState error={matchesQuery.error} onRetry={() => void matchesQuery.refetch()} variant="inline" />
          ) : (
            <EmptyState icon="calendar-outline" title="Maç yok" body="Bu dönemde ya da süzgeçlerle eşleşen maç bulunamadı." variant="inline" />
          )
        }
        initialNumToRender={6}
        windowSize={7}
      />

      {dirty ? (
        <View style={[styles.saveBar, { bottom: space.md + insets.bottom }]}>
          <SelectionBar count={changeCount} noun={`değişiklik · ${changes.length} maç taslakta`} onClear={() => void discardAll()}>
            <Button label="Tümünü kaydet" icon="save-outline" loading={save.isPending} onPress={() => save.mutate(undefined)} haptic="success" fullWidth />
          </SelectionBar>
        </View>
      ) : null}

      {picker ? (
        <StaffPickerSheet
          visible
          onClose={() => setPicker(null)}
          title={`${picker.duty.label} · ${picker.match.label}`}
          primaryLabel={`${picker.duty.label} olanlar`}
          primary={pickerOptions.primary}
          others={pickerOptions.others}
          value={currentStaffId(picker.match, picker.duty.key, drafts)}
          warning={pickerConflict ? `Aynı saatte başka maçta da görevli: ${pickerConflict.join(", ")}` : null}
          onSelect={(id) => setDraft(picker.match.id, picker.duty.key, id)}
        />
      ) : null}

      <OptionSheet<string>
        visible={sheet === "league"}
        onClose={() => setSheet(null)}
        title="Lig"
        options={leagues.map((l) => ({ value: l, label: l }))}
        value={league}
        clearable
        onSelect={(v) => {
          setLeague((v as string | null) ?? null);
          setSeason(null);
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "season"}
        onClose={() => setSheet(null)}
        title="Sezon"
        options={seasons.map((s) => ({ value: s, label: s }))}
        value={season}
        clearable
        onSelect={(v) => {
          setSeason((v as string | null) ?? null);
          setSheet(null);
        }}
      />
      <BottomSheet
        visible={sheet === "fill"}
        onClose={() => setSheet(null)}
        title="Hızlı doldur"
        footer={
          <Button
            label={fill.staffId ? `${fillTargets.length} maça uygula` : "Personel seç"}
            onPress={applyFill}
            disabled={!fill.staffId || !fillTargets.length}
          />
        }
      >
        <View style={styles.fill}>
          <Text style={styles.muted} {...textScale.long}>
            Görünen maçlarda seçilen görevi boş olanlara aynı kişi yazılır. Kişi yalnız kendi ilindeki maçlara atanır.
          </Text>
          <SelectField<string>
            label="Görev"
            value={fill.duty}
            options={duties.map((d) => ({ value: d.key, label: d.label }))}
            onChange={(v) => setFill({ duty: v ?? "spiker", staffId: null })}
          />
          <SelectField<string>
            label="Personel"
            value={fill.staffId}
            clearable
            options={[...fillOptions.primary, ...fillOptions.others].map((p) => ({
              value: String(p.id),
              label: p.fullName,
              hint: p.dutyLabels?.join(", ") || null,
            }))}
            onChange={(v) => setFill((prev) => ({ ...prev, staffId: v }))}
          />
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

const MatchAssignCard = memo(function MatchAssignCard({
  match,
  duties,
  drafts,
  conflicts,
  staffById,
  error,
  disabled,
  onPick,
  onReset,
}: {
  match: AssignableMatch;
  duties: StaffDuty[];
  drafts: Drafts;
  conflicts: Map<string, string[]>;
  staffById: Map<string, StaffMember>;
  error?: string;
  disabled: boolean;
  onPick: (duty: StaffDuty) => void;
  onReset: () => void;
}) {
  const changed = isMatchChanged(match, duties, drafts);
  const missing = missingCount(match, duties, drafts);
  const filled = duties.length - missing;
  return (
    <View style={[styles.card, changed ? styles.cardChanged : null, error ? styles.cardError : null]}>
      <View style={styles.cardHead}>
        <View style={styles.timeBox}>
          <Text style={styles.time} {...textScale.badge}>
            {match.time || "--:--"}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.teams} numberOfLines={2} {...textScale.dense}>
            {match.label}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[match.league, match.field, match.city].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Badge label={missing ? `${filled}/${duties.length}` : "Tamam"} tone={missing ? "warn" : "win"} icon={missing ? undefined : "checkmark"} size="xs" />
      </View>
      <GradientBar value={duties.length ? filled / duties.length : 0} height={3} gradient={missing ? undefined : colors.tileTones.mint} />
      {error ? <DangerNote title="Kaydedilemedi" body={error} /> : null}
      <View style={styles.slots}>
        {duties.map((d) => {
          const value = currentStaffId(match, d.key, drafts);
          const dutyChanged = isDutyChanged(match, d.key, drafts);
          const conflict = conflicts.get(`${match.id}:${d.key}`);
          const saved = match.crew?.[d.key];
          const name = value ? staffById.get(value)?.fullName || (saved && String(saved.staffId) === value ? saved.name : `Personel #${value}`) : null;
          return (
            <Touchable
              key={d.key}
              feedback="card"
              onPress={() => onPick(d)}
              disabled={disabled}
              style={[styles.slot, !name ? styles.slotEmpty : null, dutyChanged ? styles.slotChanged : null, conflict ? styles.slotConflict : null]}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${name || "seçilmedi"}${conflict ? ", saat çakışması" : ""}`}
            >
              <View style={styles.slotHead}>
                <Ionicons name={DUTY_ICON[d.key] ?? "person"} size={12} color={conflict ? colors.danger : dutyChanged ? colors.brandAccent : colors.textTertiary} />
                <Text style={[styles.slotLabel, conflict ? { color: colors.danger } : null]} numberOfLines={1} {...textScale.badge}>
                  {upperTR(d.label)}
                </Text>
                {dutyChanged ? <View style={styles.dot} /> : null}
              </View>
              {name ? (
                <Text style={[styles.slotName, dutyChanged ? styles.changed : null]} numberOfLines={1} {...textScale.dense}>
                  {name}
                </Text>
              ) : (
                <View style={styles.slotAdd}>
                  <Ionicons name="add" size={14} color={colors.textTertiary} />
                  <Text style={styles.placeholder} {...textScale.dense}>
                    Ata
                  </Text>
                </View>
              )}
              {conflict ? (
                <Text style={styles.conflict} numberOfLines={2} {...textScale.badge}>
                  Aynı saatte: {conflict.join(", ")}
                </Text>
              ) : null}
            </Touchable>
          );
        })}
      </View>
      {changed ? (
        <Button label="Bu maçı geri al" variant="ghost" size="sm" icon="arrow-undo-outline" onPress={onReset} disabled={disabled} />
      ) : null}
    </View>
  );
});

/** Görev simgesi (spiker mikrofon, reji kamera…). */
const DUTY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  spiker: "mic",
  reji: "videocam",
  hakem: "flag",
  fotografci: "camera",
  saglikci: "medkit",
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.sm },
  progress: { gap: space.s },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  progressLabel: { ...type.labelSm, color: colors.textSecondary },
  progressValue: { ...type.scoreXs, color: colors.textPrimary },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  dayRail: { width: 3, height: 13, borderRadius: radius.pill },
  day: { ...type.overline, color: colors.textSecondary, flex: 1 },
  dayCount: { ...type.caption, color: colors.textTertiary },
  card: {
    gap: space.sm,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardChanged: { borderColor: colors.brandBorder },
  cardError: { borderColor: colors.danger },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  timeBox: { paddingHorizontal: space.sm, paddingVertical: space.s, borderRadius: radius.md, backgroundColor: colors.surface2, minWidth: 56, alignItems: "center" },
  time: { ...type.scoreXs, color: colors.textPrimary },
  flex: { flex: 1, minWidth: 0 },
  teams: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: 1 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  slot: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 54,
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  slotEmpty: { backgroundColor: colors.surface1, borderStyle: "dashed", borderColor: colors.borderStrong },
  slotChanged: { borderColor: colors.brandBorder, backgroundColor: colors.brandDim },
  slotConflict: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  slotHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  slotLabel: { ...type.micro, color: colors.textTertiary, flex: 1 },
  slotName: { ...type.label, color: colors.textPrimary },
  slotAdd: { flexDirection: "row", alignItems: "center", gap: 2 },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.brandAccent },
  placeholder: { ...type.labelSm, color: colors.textTertiary },
  changed: { color: colors.brandAccent },
  conflict: { ...type.meta, color: colors.danger },
  muted: { ...type.bodySm, color: colors.textSecondary },
  fill: { gap: space.md },
  saveBar: {
    position: "absolute",
    left: layout.screenPadding,
    right: layout.screenPadding,
  },
});
