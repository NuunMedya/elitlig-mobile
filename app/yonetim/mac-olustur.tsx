/**
 * MAÇ OLUŞTUR (web MatchCreateStep / "Yeni maç").
 *
 * Sıra: kapsam (il → lig → sezon → grup) → eşleşme (ev / deplasman takım
 * araması) → zaman ve saha → başlangıç durumu → görevlendirme (isteğe bağlı).
 *
 * KAYIT: POST /maclar/add-fikstur maçı daima TASLAK açar; "Zamanlandı"
 * seçildiyse ardından PATCH ile durum yazılır. Görevlendirme kaydedilemezse
 * maç geçersiz sayılmaz; maç ekranından tamamlanabilir. Başarıda yeni maçın
 * iş akışı ekranı açılır.
 *
 * BAŞLANGIÇ DURUMU varsayılanı "Zamanlandı"dır: taslak maç sitede ve Yayın
 * Stüdyosu listesinde görünmez, canlı akış ve maç sonu adımları kilitli kalır;
 * saha kenarında maç açan operatör bunu "bölüm yok" diye okuyordu.
 *
 * `?donus=studyo`: Yayın Stüdyosu'ndan açıldıysa kayıttan sonra stüdyoya geri
 * dönülür; yeni maç listede seçili gelir (lib/admin/studioHandoff).
 *
 * HAFTA: maç kaydında hafta / tur alanı yok (models/matches.js); bu yüzden
 * sorulmaz.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminScreen, DateField, SelectField, type Option } from "@/components/admin";
import { InfoPill, OpsGroup, OpsStage } from "@/components/admin/matches/opsKit";
import { ScopeFields, useInitialScope, type AdminScope } from "@/components/admin/matches/ScopeFields";
import { Note, TimeField } from "@/components/admin/matches/parts";
import { Badge, Button, GradientBar, TeamLogo, Touchable, useToast } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { formatDayHeading } from "@/lib/format";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { isoDay } from "@/lib/admin/format";
import { leaveStudioMatch } from "@/lib/admin/studioHandoff";
import {
  FALLBACK_DUTIES,
  createFixture,
  getActiveVenues,
  getStaffOptions,
  getTeamsForCity,
  saveMatchAssignments,
  updateMatch,
} from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["matches.create"] as const;

export default function MatchCreateScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = useInitialScope();
  const params = useLocalSearchParams<{ donus?: string }>();
  const fromStudio = (Array.isArray(params.donus) ? params.donus[0] : params.donus) === "studyo";
  const canAssign = hasAnyPermission(auth.user, ["staff.assign"]);
  const logos = useTeamLogos();

  const [scope, setScope] = useState<AdminScope | null>(null);
  const [hasGroups, setHasGroups] = useState(false);
  const [home, setHome] = useState<{ id: number; name: string } | null>(null);
  const [away, setAway] = useState<{ id: number; name: string } | null>(null);
  const [date, setDate] = useState<string>(isoDay());
  const [time, setTime] = useState<string>("20:00");
  const [venue, setVenue] = useState<string>("");
  const [status, setStatus] = useState<"taslak" | "zamanlanmis">("zamanlanmis");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scope && initial) setScope(initial);
  }, [initial, scope]);

  const city = scope?.cityLabel || auth.user?.city || "";

  const teams = useQuery({
    queryKey: ["admin", "matches", "teams", city || "all"],
    queryFn: () => getTeamsForCity(city || null),
    staleTime: 5 * 60_000,
  });
  const venues = useQuery({ queryKey: ["admin", "matches", "venues"], queryFn: getActiveVenues, staleTime: 5 * 60_000 });
  const staff = useQuery({
    queryKey: ["admin", "matches", "staff-options", "city", city],
    queryFn: () => getStaffOptions({ city: city || undefined }),
    enabled: canAssign,
    retry: false,
  });

  const teamOptions = (exclude?: number | null): Option<number>[] =>
    (teams.data ?? [])
      .filter((t) => Number(t.id) !== exclude && t.active !== 0 && t.active !== "0" && t.active !== false)
      .map((t) => ({ value: Number(t.id), label: t.team_name, hint: t.current_league ?? null }));

  const venueOptions: Option<string>[] = useMemo(() => {
    const wanted = city.toLocaleLowerCase("tr-TR");
    return (venues.data ?? [])
      .filter((v) => v.name && (!wanted || !v.city || v.city.toLocaleLowerCase("tr-TR") === wanted))
      .map((v) => ({ value: v.name, label: v.name, hint: v.location || null }));
  }, [venues.data, city]);

  const duties = staff.data?.duties?.length ? staff.data.duties : FALLBACK_DUTIES;

  const submit = async () => {
    setError(null);
    if (!scope?.cityId || !city) return setError("İl seçilmeli.");
    if (!scope.leagueId || !scope.seasonId) return setError("Lig ve sezon seçimi zorunludur.");
    if (hasGroups && !scope.groupId) return setError("Bu sezon gruplara ayrılmış; grubu seç.");
    if (!home || !away) return setError("İki takımı da seç.");
    if (home.id === away.id) return setError("Aynı takımı iki kez seçemezsin.");
    if (!date || !time) return setError("Tarih ve saat seçmelisin.");

    setSaving(true);
    try {
      const created = await createFixture({
        first_team_name: home.name,
        second_team_name: away.name,
        date,
        time,
        match_field: venue,
        league_name: scope.leagueLabel,
        match_season: scope.seasonLabel,
        match_title: `${home.name} vs ${away.name}`,
        city,
        is_it_fixture: true,
        home_team_id: home.id,
        away_team_id: away.id,
        league_id: scope.leagueId,
        season_id: scope.seasonId,
        group_id: hasGroups ? scope.groupId : null,
      });
      const newId = Number(created?.id);
      if (!newId) {
        setError("Maç oluşturuldu ancak kimliği alınamadı. Maç listesinden kontrol et.");
        return;
      }
      const picked = Object.fromEntries(Object.entries(assignments).filter(([, v]) => v));
      const warnings: string[] = [];
      if (canAssign && Object.keys(picked).length) {
        await saveMatchAssignments(newId, picked).catch(() => warnings.push("görevlendirmeler"));
      }
      if (status !== "taslak") {
        await updateMatch(newId, { mac_durumu: status }).catch(() => warnings.push("durum"));
      }
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      void queryClient.invalidateQueries({ queryKey: ["studio"] });
      const stayedDraft = status === "taslak" || warnings.includes("durum");
      if (fromStudio) {
        /* Stüdyo taslak maçı ve 14 günden ileri / geçmiş maçı listelemez. */
        const days = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${isoDay()}T00:00:00`).getTime()) / 86_400_000);
        const hidden = stayedDraft
          ? "Maç taslak olduğu için stüdyo listesinde görünmez; Maçlar'dan zamanla."
          : days < 0 || days > 14
            ? "Maç oluşturuldu; stüdyo yalnız bugünü ve önümüzdeki 14 günü listeler."
            : null;
        toast.show({ message: hidden ?? "Maç oluşturuldu ve stüdyoda seçildi.", tone: hidden ? "warn" : "success" });
        if (!hidden) leaveStudioMatch(newId);
        if (router.canGoBack()) router.back();
        else router.replace("/yonetim/studyo");
        return;
      }
      toast.show({
        message: warnings.length
          ? `Maç oluşturuldu; ${warnings.join(" ve ")} kaydedilemedi. Maç öncesi adımından tamamla.`
          : "Maç oluşturuldu.",
        tone: warnings.length ? "warn" : "success",
      });
      router.replace({ pathname: "/yonetim/mac/[id]", params: { id: String(newId), adim: stayedDraft ? "bilgiler" : "kadro" } });
    } catch (e) {
      setError(errorText(e));
      Alert.alert("Maç oluşturulamadı", errorText(e));
    } finally {
      setSaving(false);
    }
  };

  /* Adım tamamlanma durumu — üst ilerleme şeridi ve bölüm başlıklarındaki onay. */
  const doneScope = Boolean(scope?.cityId && scope.leagueId && scope.seasonId && (!hasGroups || scope.groupId));
  const doneTeams = Boolean(home && away && home.id !== away.id);
  const doneTime = Boolean(date && time);
  const doneVenue = Boolean(venue);
  const progress = [doneScope, doneTeams, doneTime, doneVenue].filter(Boolean).length;
  const ready = doneScope && doneTeams && doneTime;

  const check = (done: boolean, optional?: boolean) => (
    <View style={[styles.check, done ? styles.checkOn : null]}>
      <Ionicons name={done ? "checkmark" : optional ? "remove" : "ellipse-outline"} size={12} color={done ? colors.textOnStatus : colors.textTertiary} />
    </View>
  );

  return (
    <AdminScreen title="Maç oluştur" subtitle="Eşleşme, zaman ve saha" permission={PERMS}>
      {/* CANLI ÖNİZLEME — form doldukça maç kartı sahnede belirir. */}
      <OpsStage height={220}>
        <View style={styles.previewTop}>
          <Badge label={status === "taslak" ? "TASLAK" : "ZAMANLANDI"} tone={status === "taslak" ? "neutral" : "info"} size="xs" />
          <Text style={styles.previewScope} numberOfLines={1} {...textScale.dense}>
            {[scope?.leagueLabel, scope?.seasonLabel].filter(Boolean).join(" · ") || scope?.cityLabel || "Kapsam seçilmedi"}
          </Text>
        </View>
        <View style={styles.previewTeams}>
          <PreviewTeam name={home?.name} logo={home ? logos.logoFor(home.id, home.name) : null} side="EV SAHİBİ" />
          <View style={styles.previewCenter}>
            <Text style={styles.previewTime} {...textScale.badge}>
              {time || "––:––"}
            </Text>
            <Text style={styles.previewDate} numberOfLines={1} {...textScale.badge}>
              {date ? formatDayHeading(date) : "Tarih yok"}
            </Text>
          </View>
          <PreviewTeam name={away?.name} logo={away ? logos.logoFor(away.id, away.name) : null} side="DEPLASMAN" />
        </View>
        <View style={styles.previewFoot}>
          <InfoPill icon="location-outline" label={venue || "Saha seçilmedi"} onDark={Boolean(venue)} tone={venue ? undefined : "warn"} />
          <View style={styles.flex} />
          <Text style={styles.previewProgress} {...textScale.badge}>
            {progress}/4
          </Text>
        </View>
        <GradientBar value={progress / 4} height={4} track={colors.inkPill} />
      </OpsStage>

      <Note
        text={
          fromStudio
            ? "Kayıttan sonra stüdyoya dönersin; maç listede seçili gelir. Kadro ve maç sonu kısayolları seçili maçın altındadır."
            : "Kadro, canlı akış ve maç sonu adımları maç kaydedildikten sonra açılır."
        }
      />

      <OpsGroup title="1 · Kapsam" icon="earth-outline" tone="violet" hint="İl → lig → sezon (varsa grup)" right={check(doneScope)}>
        {scope ? (
          <ScopeFields
            value={scope}
            onChange={(next) => {
              if (next.cityId !== scope.cityId) {
                setHome(null);
                setAway(null);
                setVenue("");
              }
              setScope(next);
            }}
            withGroup
            groupRequired
            onGroupsLoaded={setHasGroups}
          />
        ) : null}
      </OpsGroup>

      <OpsGroup title="2 · Eşleşme" icon="git-compare-outline" tone="cyan" hint="Takımlar seçili ildeki aktif takımlardan aranır" right={check(doneTeams)}>
        <SelectField<number>
          label="Ev sahibi"
          required
          value={home?.id ?? null}
          valueLabel={home?.name ?? null}
          options={teamOptions(away?.id)}
          icon="shield-outline"
          placeholder={teams.isLoading ? "Takımlar yükleniyor…" : "Takım ara ve seç"}
          onChange={(v, o) => setHome(v != null ? { id: v, name: o?.label ?? "" } : null)}
        />
        <View style={styles.vsRow}>
          <View style={styles.vsLine} />
          <Text style={styles.vsText} {...textScale.badge}>
            VS
          </Text>
          <View style={styles.vsLine} />
        </View>
        <SelectField<number>
          label="Deplasman"
          required
          value={away?.id ?? null}
          valueLabel={away?.name ?? null}
          options={teamOptions(home?.id)}
          icon="shield-outline"
          placeholder={teams.isLoading ? "Takımlar yükleniyor…" : "Takım ara ve seç"}
          onChange={(v, o) => setAway(v != null ? { id: v, name: o?.label ?? "" } : null)}
        />
      </OpsGroup>

      <OpsGroup title="3 · Zaman ve saha" icon="calendar-outline" tone="mint" hint="Saha listesi Saha Yönetimi'ndeki aktif sahalardır" right={check(doneTime && doneVenue, !doneVenue && doneTime)}>
        <View style={styles.twoCol}>
          <View style={styles.flex}>
            <DateField label="Tarih" required value={date} onChange={(v) => setDate(v ?? "")} />
          </View>
          <View style={styles.flex}>
            <TimeField label="Saat" required value={time} onChange={(v) => setTime(v ?? "")} />
          </View>
        </View>
        <SelectField<string>
          label="Saha"
          value={venue || null}
          options={venueOptions}
          icon="location-outline"
          placeholder="Saha ve Maç Planlama'daki sahalardan seç"
          onChange={(v) => setVenue(v ?? "")}
        />
      </OpsGroup>

      <OpsGroup title="4 · Başlangıç durumu" icon="flag-outline" tone="gold">
        <View style={styles.statusRow} accessibilityRole="radiogroup">
          {(
            [
              { key: "zamanlanmis", label: "Zamanlandı", icon: "calendar", body: "Fikstürde yayında; tüm adımlar açık." },
              { key: "taslak", label: "Taslak", icon: "document-outline", body: "Gizli; canlı ve maç sonu kilitli." },
            ] as const
          ).map((option) => {
            const on = status === option.key;
            return (
              <Touchable
                key={option.key}
                feedback="card"
                haptic="selection"
                onPress={() => setStatus(option.key)}
                style={[styles.statusCard, on ? styles.statusCardOn : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${option.label}: ${option.body}`}
              >
                <View style={styles.statusHead}>
                  <Ionicons name={option.icon} size={16} color={on ? colors.brandAccent : colors.textTertiary} />
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={16} color={on ? colors.brandAccent : colors.textTertiary} />
                </View>
                <Text style={[styles.statusLabel, on ? styles.statusLabelOn : null]} {...textScale.dense}>
                  {option.label}
                </Text>
                <Text style={styles.statusBody} {...textScale.long}>
                  {option.body}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </OpsGroup>

      {canAssign ? (
        <OpsGroup title="5 · Görevlendirme" icon="people-outline" tone="pink" hint="İsteğe bağlı — sonra Maç öncesi adımından da yapılır" right={check(Object.values(assignments).some(Boolean), true)}>
          {staff.isError ? (
            <Note tone="warn" text="Personel listesi okunamadı; görevlendirmeyi sonra Maç öncesi adımından yapabilirsin." />
          ) : (
            duties.map((duty) => (
              <SelectField<string>
                key={duty.key}
                label={duty.label}
                value={assignments[duty.key] || null}
                options={(staff.data?.items ?? []).map((p) => ({ value: String(p.id), label: p.fullName }))}
                icon="person-outline"
                placeholder="Görevli seç (isteğe bağlı)"
                clearable
                onChange={(v) => setAssignments((a) => ({ ...a, [duty.key]: v ?? "" }))}
              />
            ))
          )}
        </OpsGroup>
      ) : null}

      {error ? <Note tone="danger" text={error} /> : null}
      <View style={styles.submit}>
        <Button
          label={ready ? "Maçı kaydet" : "Eksikleri tamamla"}
          icon={ready ? "checkmark" : "alert-circle-outline"}
          size="lg"
          onPress={submit}
          loading={saving}
          fullWidth
          haptic="success"
        />
        <Text style={styles.hint} {...textScale.long}>
          {status === "taslak"
            ? "Taslak maç sitede ve Yayın Stüdyosu'nda görünmez; canlı akış ve maç sonu, maç zamanlanana kadar kilitlidir."
            : "Zamanlanan maç fikstürde yayınlanır; kadro, canlı akış ve maç sonu adımlarının hepsi açılır."}
        </Text>
      </View>
    </AdminScreen>
  );
}

/** Önizleme sahnesinde tek takım: logo kutusu + ad (seçilmediyse soru işareti). */
function PreviewTeam({ name, logo, side }: { name?: string | null; logo?: string | null; side: string }) {
  return (
    <View style={styles.previewTeam}>
      <View style={styles.previewCrest}>
        {name ? <TeamLogo name={name} logo={logo} size={40} /> : <Ionicons name="help" size={22} color={colors.onDarkMuted} />}
      </View>
      <Text style={[styles.previewName, name ? null : styles.previewNameEmpty]} numberOfLines={2} {...textScale.dense}>
        {name || "Takım seç"}
      </Text>
      <Text style={styles.previewSide} {...textScale.badge}>
        {side}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hint: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  submit: { gap: space.sm, marginTop: space.xs },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  checkOn: { backgroundColor: colors.win },
  previewTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  previewScope: { ...type.caption, color: colors.onDarkMuted, flex: 1, textAlign: "right" },
  previewTeams: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  previewTeam: { flex: 1, alignItems: "center", gap: space.xs },
  previewCrest: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  previewName: { ...type.h4, color: colors.onDark, textAlign: "center" },
  previewNameEmpty: { color: colors.onDarkMuted },
  previewSide: { ...type.overline, color: colors.onDarkMuted },
  previewCenter: { alignItems: "center", justifyContent: "center", minHeight: 56, gap: space.xxs, minWidth: 96 },
  previewTime: { ...type.scoreLg, color: colors.onDark },
  previewDate: { ...type.labelXs, color: colors.onDarkMuted },
  previewFoot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  previewProgress: { ...type.numSmStrong, color: colors.onDark },
  vsRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  vsLine: { flex: 1, height: hairline, backgroundColor: colors.separator },
  vsText: { ...type.overline, color: colors.textTertiary },
  twoCol: { flexDirection: "row", gap: space.sm },
  statusRow: { flexDirection: "row", gap: space.sm },
  statusCard: {
    flex: 1,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  statusCardOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder, borderWidth: 1 },
  statusHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusLabel: { ...type.h4, color: colors.textSecondary },
  statusLabelOn: { color: colors.textPrimary },
  statusBody: { ...type.caption, color: colors.textTertiary },
});
