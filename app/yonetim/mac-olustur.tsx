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
 * HAFTA: maç kaydında hafta / tur alanı yok (models/matches.js); bu yüzden
 * sorulmaz.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { AdminScreen, DateField, Panel, SegmentField, SelectField, type Option } from "@/components/admin";
import { ScopeFields, useInitialScope, type AdminScope } from "@/components/admin/matches/ScopeFields";
import { Note, TimeField } from "@/components/admin/matches/parts";
import { Button, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { isoDay } from "@/lib/admin/format";
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
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["matches.create"] as const;

export default function MatchCreateScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = useInitialScope();
  const canAssign = hasAnyPermission(auth.user, ["staff.assign"]);

  const [scope, setScope] = useState<AdminScope | null>(null);
  const [hasGroups, setHasGroups] = useState(false);
  const [home, setHome] = useState<{ id: number; name: string } | null>(null);
  const [away, setAway] = useState<{ id: number; name: string } | null>(null);
  const [date, setDate] = useState<string>(isoDay());
  const [time, setTime] = useState<string>("20:00");
  const [venue, setVenue] = useState<string>("");
  const [status, setStatus] = useState<"taslak" | "zamanlanmis">("taslak");
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
      toast.show({
        message: warnings.length
          ? `Maç oluşturuldu; ${warnings.join(" ve ")} kaydedilemedi. Maç öncesi adımından tamamla.`
          : "Maç oluşturuldu.",
        tone: warnings.length ? "warn" : "success",
      });
      router.replace({ pathname: "/yonetim/mac/[id]", params: { id: String(newId), adim: "bilgiler" } });
    } catch (e) {
      setError(errorText(e));
      Alert.alert("Maç oluşturulamadı", errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminScreen title="Maç oluştur" subtitle="Eşleşme, zaman ve saha" permission={PERMS}>
      <Note text="Kadro, canlı akış ve maç sonu adımları maç kaydedildikten sonra açılır." />

      <Panel title="KAPSAM">
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
      </Panel>

      <Panel title="EŞLEŞME">
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
      </Panel>

      <Panel title="ZAMAN VE SAHA">
        <DateField label="Tarih" required value={date} onChange={(v) => setDate(v ?? "")} />
        <TimeField label="Saat" required value={time} onChange={(v) => setTime(v ?? "")} />
        <SelectField<string>
          label="Saha"
          value={venue || null}
          options={venueOptions}
          icon="location-outline"
          placeholder="Saha ve Maç Planlama'daki sahalardan seç"
          onChange={(v) => setVenue(v ?? "")}
        />
      </Panel>

      <Panel title="BAŞLANGIÇ DURUMU">
        <SegmentField<"taslak" | "zamanlanmis">
          value={status}
          onChange={setStatus}
          options={[
            { key: "taslak", label: "Taslak" },
            { key: "zamanlanmis", label: "Zamanlandı" },
          ]}
        />
        <Text style={styles.hint} {...textScale.long}>
          {status === "taslak" ? "Taslak maç sitede görünmez." : "Zamanlanan maç fikstürde yayınlanır ve kadro girişi açılır."}
        </Text>
      </Panel>

      {canAssign ? (
        <Panel title="GÖREVLENDİRME">
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
        </Panel>
      ) : null}

      {error ? (
        <Text style={styles.error} {...textScale.long}>
          {error}
        </Text>
      ) : null}
      <View>
        <Button label="Maçı kaydet" icon="checkmark" onPress={submit} loading={saving} fullWidth haptic="success" />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.caption, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger, marginTop: space.xs },
});
