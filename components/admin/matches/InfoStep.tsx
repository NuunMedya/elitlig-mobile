/**
 * 1. ADIM — MAÇ ÖNCESİ (web Update_Match / "Maç Bilgileri").
 *
 * Eşleşme (ev/deplasman, lig, sezon, grup), zaman ve saha, durum, canlı yayın
 * linki ve görevlendirmeler (spiker, reji, hakem, fotoğrafçı, sağlıkçı).
 * Kaydet yalnızca değişen formu PATCH eder; görevlendirmeler ayrı uçta tutulur
 * ve boş bırakılan görev kaldırılsın diye hepsi birlikte gönderilir.
 *
 * Sonuç tescili (elle / hükmen) ve maçı silme de bu adımdadır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import {
  DateField,
  SelectField,
  confirmAction,
  useAdminMutation,
  type Option,
} from "@/components/admin";
import { Badge, Input, Skeleton } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  FALLBACK_DUTIES,
  MATCH_STATUS_OPTIONS,
  cleanText,
  deleteMatch,
  getActiveVenues,
  getMatchAssignments,
  getSeasonGroups,
  getStaffOptions,
  getTeamsForCity,
  normalizeMatchStatus,
  saveMatchAssignments,
  statusLabelOf,
  updateMatch,
  type AdminMatch,
} from "@/lib/api/admin/matches";
import { getLeagues, getSeasons } from "@/lib/api/meta";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, space } from "@/theme";

import { STEPS, dayOf, hhmm, stepAvailability, type StepKey } from "./model";
import { CheckGrid, FieldPair, NextStepCard, OpsGroup, OpsRow, VersusDivider, type CheckItem } from "./opsKit";
import { Note, StepSaveBar, TimeField, statusTone } from "./parts";
import { ResultSheet } from "./ResultSheet";

interface InfoForm {
  home_team_id: number | null;
  away_team_id: number | null;
  first_team_name: string;
  second_team_name: string;
  league_id: number | null;
  league_name: string;
  season_id: number | null;
  match_season: string;
  group_id: number | null;
  date: string;
  time: string;
  match_field: string;
  mac_durumu: string;
  match_video: string;
}

const toForm = (m: AdminMatch): InfoForm => ({
  home_team_id: m.home_team_id ?? null,
  away_team_id: m.away_team_id ?? null,
  first_team_name: m.first_team_name || "",
  second_team_name: m.second_team_name || "",
  league_id: m.league_id ?? null,
  league_name: m.league_name || "",
  season_id: m.season_id ?? null,
  match_season: m.match_season || "",
  group_id: m.group_id ?? null,
  date: dayOf(m.date),
  time: hhmm(m.time),
  match_field: m.match_field || "",
  mac_durumu: normalizeMatchStatus(m.mac_durumu) ?? "taslak",
  match_video: cleanText(m.match_video),
});

const NEXT_STEP: Record<string, { text: string; step?: StepKey; label?: string }> = {
  taslak: {
    text: "Maç taslak: sitede görünmez, canlı akış ve maç sonu kilitlidir. Durumu “Zamanlandı” yapıp kaydet; kadroyu şimdiden girebilirsin.",
    step: "kadro",
    label: "Kadroya geç",
  },
  zamanlanmis: {
    text: "Sıradaki adım iki takımın kadrosunu girmek. Maç canlı takip edilmeden oynandıysa sonucu ve ayrıntıları Maç sonu adımından girebilirsin.",
    step: "kadro",
    label: "Kadroya geç",
  },
  canli: { text: "Maç canlı. Olaylar ve skor Canlı akış adımından yönetilir.", step: "canli", label: "Canlı akışa git" },
  yayinlanmis: { text: "Maç tamamlandı. Puanlar, manşet ve maçın enleri Maç sonu adımında.", step: "mac-sonu", label: "Maç sonuna git" },
};

export function InfoStep({
  match,
  cityId,
  onGoStep,
  onDirtyChange,
}: {
  match: AdminMatch;
  cityId: number | null;
  onGoStep: (step: StepKey) => void;
  /** Kaydedilmemiş değişiklik var mı (adım değişiminde uyarı için). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const matchId = Number(match.id);
  const canEdit = hasAnyPermission(auth.user, ["matches.update"]);
  const canDelete = hasAnyPermission(auth.user, ["matches.delete"]);
  const canAssign = hasAnyPermission(auth.user, ["staff.assign"]);
  const canSeeStaff = hasAnyPermission(auth.user, ["staff.view", "staff.assign"]);
  const canResult = hasAnyPermission(auth.user, ["matches.update", "matches.live"]);

  const original = useMemo(() => toForm(match), [match]);
  const [form, setForm] = useState<InfoForm>(original);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [savedAssignments, setSavedAssignments] = useState<Record<string, string>>({});
  const [resultOpen, setResultOpen] = useState(false);

  /**
   * Maç kaydı arka planda tazelenince (yoklama, başka bir adımın kaydı, skor
   * eşitlemesi) form KÖRLEMESİNE sıfırlanmaz: yalnız sunucuda gerçekten değişen
   * alanlar yenilenir, yöneticinin o an düzenlediği alanlar korunur.
   */
  const previousOriginal = useRef(original);
  useEffect(() => {
    const before = previousOriginal.current;
    previousOriginal.current = original;
    if (before === original) return;
    setForm((current) => {
      const next = { ...current };
      (Object.keys(original) as (keyof InfoForm)[]).forEach((key) => {
        const untouched = String(current[key] ?? "") === String(before[key] ?? "");
        if (untouched) (next as Record<keyof InfoForm, unknown>)[key] = original[key];
      });
      return next;
    });
  }, [original]);

  const effectiveCity = match.city_id ?? cityId;

  /* ───────── seçenek kaynakları ───────── */
  const teamsQuery = useQuery({
    queryKey: ["admin", "matches", "teams", match.city || "all"],
    queryFn: () => getTeamsForCity(match.city),
    staleTime: 5 * 60_000,
  });
  const leaguesQuery = useQuery({
    queryKey: ["admin", "matches", "leagues", effectiveCity],
    queryFn: () => getLeagues(effectiveCity as number),
    enabled: Boolean(effectiveCity),
    staleTime: 5 * 60_000,
  });
  const seasonsQuery = useQuery({
    queryKey: ["admin", "matches", "seasons", effectiveCity, form.league_id],
    queryFn: () => getSeasons(effectiveCity as number, form.league_id as number),
    enabled: Boolean(effectiveCity && form.league_id),
    staleTime: 5 * 60_000,
  });
  const groupsQuery = useQuery({
    queryKey: ["admin", "matches", "groups", form.season_id],
    queryFn: () => getSeasonGroups(form.season_id as number),
    enabled: Boolean(form.season_id),
    staleTime: 5 * 60_000,
  });
  const venuesQuery = useQuery({
    queryKey: ["admin", "matches", "venues"],
    queryFn: getActiveVenues,
    staleTime: 5 * 60_000,
  });
  const staffQuery = useQuery({
    queryKey: ["admin", "matches", "staff-options", matchId],
    queryFn: () => getStaffOptions({ matchId }),
    enabled: canSeeStaff,
    retry: false,
  });
  const assignQuery = useQuery({
    queryKey: ["admin", "matches", "assignments", matchId],
    queryFn: () => getMatchAssignments(matchId),
    enabled: canSeeStaff,
    retry: false,
  });

  useEffect(() => {
    if (!assignQuery.data) return;
    const current: Record<string, string> = {};
    Object.entries(assignQuery.data.assignments ?? {}).forEach(([duty, item]) => {
      if (item?.staffId) current[duty] = String(item.staffId);
    });
    setAssignments(current);
    setSavedAssignments(current);
  }, [assignQuery.data]);

  const teamOptions: Option<number>[] = useMemo(
    () => (teamsQuery.data ?? []).map((t) => ({ value: Number(t.id), label: t.team_name, hint: t.current_league ?? null })),
    [teamsQuery.data]
  );
  const leagueOptions: Option<number>[] = (leaguesQuery.data ?? []).map((l) => ({ value: l.id, label: l.label }));
  const seasonOptions: Option<number>[] = (seasonsQuery.data ?? []).map((s) => ({ value: s.id, label: s.label }));
  const groups = groupsQuery.data ?? [];
  const venueOptions: Option<string>[] = useMemo(() => {
    const wanted = (match.city || "").toLocaleLowerCase("tr-TR");
    const list = (venuesQuery.data ?? [])
      .filter((v) => v.name && (!wanted || !v.city || v.city.toLocaleLowerCase("tr-TR") === wanted))
      .map((v) => ({ value: v.name, label: v.name, hint: v.location || null }));
    // Listede olmayan eski saha adı kaybolmasın.
    if (form.match_field && !list.some((o) => o.value === form.match_field)) {
      list.unshift({ value: form.match_field, label: form.match_field, hint: "Kayıtlı saha" });
    }
    return list;
  }, [venuesQuery.data, match.city, form.match_field]);

  const duties = staffQuery.data?.duties?.length ? staffQuery.data.duties : FALLBACK_DUTIES;
  const staffOptionsFor = (duty: string): Option<string>[] => {
    const all = staffQuery.data?.items ?? [];
    const has = (p: (typeof all)[number]) => (p.duties?.length ? p.duties : [p.duty]).includes(duty);
    // O görevi yapanlar önce, diğerleri sonra.
    return [...all.filter(has), ...all.filter((p) => !has(p))].map((p) => ({
      value: String(p.id),
      label: p.fullName,
      hint: has(p) ? null : "Başka görevde kayıtlı",
    }));
  };

  /* ───────── kaydet ───────── */
  const changed = (Object.keys(form) as (keyof InfoForm)[]).filter((k) => String(form[k] ?? "") !== String(original[k] ?? ""));
  const assignmentsChanged = JSON.stringify(assignments) !== JSON.stringify(savedAssignments);
  // Kaydedilebilir değişiklik: her bölüm kendi yetkisiyle sayılır (403 önlenir).
  const dirty = (changed.length > 0 && canEdit) || (assignmentsChanged && canAssign);
  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);
  const sameTeams = Boolean(form.home_team_id && form.home_team_id === form.away_team_id);
  const hasGroups = groups.length > 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  };

  const save = useAdminMutation(
    async () => {
      if (changed.length && canEdit) {
        await updateMatch(matchId, {
          first_team_name: form.first_team_name,
          second_team_name: form.second_team_name,
          home_team_id: form.home_team_id,
          away_team_id: form.away_team_id,
          league_name: form.league_name,
          match_season: form.match_season,
          league_id: form.league_id,
          season_id: form.season_id,
          // Sezonun grubu yoksa null: sunucu takım üyeliklerinden yeniden türetir.
          group_id: hasGroups && form.group_id ? form.group_id : null,
          date: form.date || null,
          time: form.time || null,
          match_field: form.match_field || "",
          mac_durumu: form.mac_durumu || "taslak",
          match_video: form.match_video.trim(),
        });
      }
      if (assignmentsChanged && canAssign) {
        await saveMatchAssignments(matchId, assignments);
        setSavedAssignments(assignments);
      }
    },
    { success: "Maç bilgileri kaydedildi.", invalidate: [["admin", "matches"]] }
  );

  const remove = useAdminMutation(() => deleteMatch(matchId), {
    success: "Maç silindi.",
    invalidate: [["admin", "matches"]],
    onSuccess: () => router.back(),
  });

  const askDelete = async () => {
    const ok = await confirmAction({
      title: "Maçı sil",
      message: `${match.first_team_name} – ${match.second_team_name}\n\nMaç, kadrosu ve istatistikleri çöp kutusuna taşınır; puan durumu yeniden hesaplanır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(undefined);
  };

  const askSave = async () => {
    // Yayına alma puan durumunu hesaplatır ve bildirim gönderir: onay ister.
    if (form.mac_durumu !== original.mac_durumu && (form.mac_durumu === "yayinlanmis" || form.mac_durumu === "taslak")) {
      const ok = await confirmAction({
        title: form.mac_durumu === "yayinlanmis" ? "Maçı tamamla" : "Taslağa al",
        message:
          form.mac_durumu === "yayinlanmis"
            ? "Skor kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider."
            : "Maç üye tarafında görünmez olur ve puan durumundan düşer.",
        confirmLabel: "Kaydet",
      });
      if (!ok) return;
    }
    save.mutate(undefined);
  };

  const next = NEXT_STEP[original.mac_durumu];
  const nextReady = next?.step ? stepAvailability(next.step, match.mac_durumu).ready : false;
  const nextMeta = next?.step ? STEPS.find((s) => s.key === next.step) : null;

  /* Hazırlık denetimi: kaydedilmiş + düzenlenen değerlere göre canlı hesaplanır. */
  const assignedCount = duties.filter((d) => Boolean(assignments[d.key])).length;
  const checks: CheckItem[] = [
    { label: "Eşleşme", ok: Boolean(form.home_team_id && form.away_team_id && !sameTeams), hint: sameTeams ? "Aynı takım" : "Takım seç" },
    { label: "Lig ve sezon", ok: Boolean(form.league_id && form.season_id), hint: "Sezon seç" },
    { label: "Tarih ve saat", ok: Boolean(form.date && form.time), hint: form.date ? "Saat yok" : "Tarih yok" },
    { label: "Saha", ok: Boolean(form.match_field), hint: "Saha seç" },
    { label: "Yayın linki", ok: Boolean(form.match_video.trim()), optional: true },
    ...(canSeeStaff ? [{ label: "Görevliler", ok: assignedCount > 0, optional: true, hint: `${assignedCount}/${duties.length} atandı` }] : []),
  ];

  return (
    <View style={styles.stack}>
      {next ? (
        <NextStepCard
          icon={nextMeta?.icon ?? "information-circle-outline"}
          overline={next.step && nextReady ? "Sıradaki adım" : "Durum"}
          title={next.step && nextReady ? next.label ?? "Devam" : statusLabelOf(original.mac_durumu)}
          text={next.text}
          onPress={next.step && nextReady ? () => onGoStep(next.step!) : undefined}
          actionLabel={next.label}
        />
      ) : null}

      <CheckGrid title="Maç hazırlığı" items={checks} />

      <OpsGroup title="Eşleşme" icon="git-compare-outline" tone="violet" hint="Takımlar ve maçın bağlı olduğu lig, sezon, grup.">
        <SelectField<number>
          label="Ev sahibi"
          value={form.home_team_id}
          options={teamOptions}
          valueLabel={form.first_team_name || null}
          icon="home-outline"
          disabled={!canEdit}
          onChange={(v, o) => setForm((f) => ({ ...f, home_team_id: v, first_team_name: o?.label ?? f.first_team_name }))}
        />
        <VersusDivider />
        <SelectField<number>
          label="Deplasman"
          value={form.away_team_id}
          options={teamOptions}
          valueLabel={form.second_team_name || null}
          icon="airplane-outline"
          disabled={!canEdit}
          error={sameTeams ? "Bir takım kendisiyle eşleşemez." : undefined}
          onChange={(v, o) => setForm((f) => ({ ...f, away_team_id: v, second_team_name: o?.label ?? f.second_team_name }))}
        />
        <View style={styles.sep} />
        <SelectField<number>
          label="Lig"
          value={form.league_id}
          options={leagueOptions}
          valueLabel={form.league_name || null}
          icon="trophy-outline"
          disabled={!canEdit}
          onChange={(v, o) =>
            setForm((f) => ({
              ...f,
              league_id: v,
              league_name: o?.label ?? "",
              // Lig değişince ona ait olmayan sezon seçimi bırakılır.
              season_id: v === f.league_id ? f.season_id : null,
              match_season: v === f.league_id ? f.match_season : "",
              group_id: v === f.league_id ? f.group_id : null,
            }))
          }
        />
        <SelectField<number>
          label="Sezon"
          value={form.season_id}
          options={seasonOptions}
          valueLabel={form.match_season || null}
          icon="calendar-outline"
          disabled={!canEdit || !form.league_id}
          onChange={(v, o) => setForm((f) => ({ ...f, season_id: v, match_season: o?.label ?? "", group_id: null }))}
        />
        {hasGroups ? (
          <SelectField<number>
            label="Grup"
            value={form.group_id}
            options={groups.map((g) => ({ value: g.id, label: g.group_name }))}
            icon="grid-outline"
            disabled={!canEdit}
            onChange={(v) => setForm((f) => ({ ...f, group_id: v }))}
          />
        ) : null}
      </OpsGroup>

      <OpsGroup title="Zaman ve saha" icon="time-outline" tone="cyan">
        <FieldPair>
          <DateField label="Tarih" value={form.date || null} onChange={(v) => setForm((f) => ({ ...f, date: v ?? "" }))} />
          <TimeField label="Saat" value={form.time} onChange={(v) => setForm((f) => ({ ...f, time: v ?? "" }))} />
        </FieldPair>
        <SelectField<string>
          label="Saha"
          value={form.match_field || null}
          options={venueOptions}
          icon="location-outline"
          placeholder="Saha ve Maç Planlama'daki sahalardan seç"
          disabled={!canEdit}
          onChange={(v) => setForm((f) => ({ ...f, match_field: v ?? "" }))}
        />
      </OpsGroup>

      <OpsGroup
        title="Durum ve yayın"
        icon="radio-outline"
        tone="pink"
        right={<Badge label={statusLabelOf(form.mac_durumu)} tone={statusTone(form.mac_durumu)} size="xs" dot />}
      >
        <SelectField<string>
          label="Durum"
          value={form.mac_durumu}
          options={MATCH_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
          icon="flag-outline"
          clearable={false}
          disabled={!canEdit}
          onChange={(v) => setForm((f) => ({ ...f, mac_durumu: v ?? f.mac_durumu }))}
        />
        <Input
          label="Canlı yayın linki"
          floating
          value={form.match_video}
          onChangeText={(t) => setForm((f) => ({ ...f, match_video: t }))}
          placeholder="https://youtube.com/live/…"
          autoCapitalize="none"
          keyboardType="url"
          leadingIcon="videocam-outline"
          editable={canEdit}
        />
      </OpsGroup>

      {canSeeStaff ? (
        <OpsGroup
          title="Görevlendirme"
          icon="people-outline"
          tone="gold"
          hint="Boş bırakılan görev kaydedince kaldırılır."
          right={
            staffQuery.isSuccess ? (
              <Badge label={`${assignedCount}/${duties.length}`} tone={assignedCount === duties.length ? "win" : assignedCount ? "info" : "neutral"} size="xs" />
            ) : null
          }
        >
          {staffQuery.isLoading || assignQuery.isLoading ? (
            <View style={styles.skeletons}>
              <Skeleton height={58} radius="md" />
              <Skeleton height={58} radius="md" />
            </View>
          ) : staffQuery.isError ? (
            <Note tone="warn" text="Personel listesi okunamadı. Görevlendirme için Personel yetkisi gerekir." />
          ) : !staffQuery.data?.items?.length && !Object.values(assignments).some(Boolean) ? (
            <Note text="Bu ilde görevlendirilebilecek personel yok. Personel sayfasından bu ile personel ekle." />
          ) : (
            duties.map((duty) => (
              <SelectField<string>
                key={duty.key}
                label={duty.label}
                value={assignments[duty.key] || null}
                valueLabel={assignQuery.data?.assignments?.[duty.key]?.name ?? null}
                options={staffOptionsFor(duty.key)}
                icon={DUTY_ICON[duty.key] ?? "person-outline"}
                placeholder="Görevli seç"
                clearable
                disabled={!canAssign}
                onChange={(v) => setAssignments((a) => ({ ...a, [duty.key]: v ?? "" }))}
              />
            ))
          )}
        </OpsGroup>
      ) : null}

      <StepSaveBar
        visible={canEdit || canAssign}
        label={dirty ? "Değişiklikleri kaydet" : "Kaydedildi"}
        onPress={() => void askSave()}
        loading={save.isPending}
        disabled={!dirty || sameTeams}
      />

      {canResult || canDelete ? (
        <OpsGroup title="Sonuç ve kayıt" flush>
          {canResult ? (
            <OpsRow
              icon="ribbon-outline"
              tone="gold"
              title="Sonucu tescil et"
              meta="Canlı olay girmeden elle ya da hükmen; puan durumu yeniden hesaplanır"
              onPress={() => setResultOpen(true)}
            />
          ) : null}
          {canDelete ? (
            <OpsRow
              icon="trash-outline"
              tone="red"
              title={remove.isPending ? "Siliniyor…" : "Maçı sil"}
              meta="Kadro ve istatistiklerle birlikte çöp kutusuna taşınır"
              divider={canResult}
              onPress={remove.isPending ? undefined : () => void askDelete()}
            />
          ) : null}
        </OpsGroup>
      ) : null}

      <ResultSheet visible={resultOpen} onClose={() => setResultOpen(false)} match={match} onSaved={invalidate} />
    </View>
  );
}

/** Görev anahtarı → ikon (bilinmeyen görev kişi ikonuyla). */
const DUTY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  spiker: "mic-outline",
  reji: "videocam-outline",
  hakem: "flag-outline",
  fotografci: "camera-outline",
  saglikci: "medkit-outline",
};

const styles = StyleSheet.create({
  stack: { gap: space.md },
  sep: { height: hairline, backgroundColor: colors.separator, marginVertical: space.xxs },
  skeletons: { gap: space.m },
});
