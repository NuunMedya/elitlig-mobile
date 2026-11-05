/**
 * PUAN DURUMU DÜZELTMELERİ (web Editor_Standings).
 *
 * Kapsam (il → lig → sezon, isteğe bağlı grup) seçilir; tablo sunucunun
 * hesapladığı puan durumudur (canlı maçlar hariç). İki görünüm:
 *   · Standart     — maçlardan gelen puan + ELLE PUAN (manual_points)
 *   · Güç dengesi  — güç dengesi puanı + manuel ± düzeltme (balance_manual_points)
 *
 * Satıra dokununca düzeltme alt sayfası açılır: puan düş / ekle (−/+) ya da
 * doğrudan değer. Kayıt satır başınadır; sunucu her kayıtta kapsamı baştan
 * hesaplar. "Yeniden hesapla" ayrı bir uç olmadığı için ilk takımın mevcut
 * düzeltmesini aynen yazar — değer değişmez, tablo yeniden kurulur.
 *
 * Grup seçiliyken tablo grubun kendi maçlarından gelir ve salt okunurdur;
 * düzeltmeler sezon tablosuna yazılır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, FieldBox, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { ScopeFields, useInitialScope, type AdminScope } from "@/components/admin/matches/ScopeFields";
import { Note } from "@/components/admin/matches/parts";
import { BottomSheet, Button, Input, SegmentedControl, Stepper } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { getAdminStandings, saveManualPoints, type AdminStandingRow } from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["standings.update"] as const;

type View_ = "standart" | "gucdengesi";

export default function StandingsAdminScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const initial = useInitialScope();
  const canEdit = hasAnyPermission(auth.user, ["standings.update"]);

  const [scopeOverride, setScopeOverride] = useState<AdminScope | null>(null);
  const scope = scopeOverride ?? initial;
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeDraft, setScopeDraft] = useState<AdminScope | null>(null);
  const [view, setView] = useState<View_ | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminStandingRow | null>(null);

  const ready = Boolean(scope?.cityId && scope?.leagueId && scope?.seasonId);
  const key = ["admin", "standings", scope?.cityId, scope?.leagueId, scope?.seasonId, scope?.groupId ?? null] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      getAdminStandings({
        cityId: scope!.cityId!,
        leagueId: scope!.leagueId!,
        seasonId: scope!.seasonId!,
        groupId: scope!.groupId,
      }),
    enabled: ready,
  });

  const activeType = query.data?.standings_type === "gucdengesi" ? "gucdengesi" : "standart";
  useEffect(() => {
    if (query.data && view == null) setView(activeType);
  }, [query.data, activeType, view]);
  const mode: View_ = view ?? activeType;
  const groupView = Boolean(scope?.groupId);

  const rows = useMemo(() => {
    const list = [...(query.data?.standings ?? [])];
    const total = (r: AdminStandingRow) =>
      mode === "gucdengesi" ? Number(r.balance_points) + Number(r.balance_manual_points) : Number(r.total_points);
    list.sort(
      (a, b) =>
        total(b) - total(a) || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for || a.team_name.localeCompare(b.team_name, "tr")
    );
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return list
      .map((r, i) => ({ row: r, rank: i + 1, total: total(r) }))
      .filter((x) => (needle ? x.row.team_name.toLocaleLowerCase("tr-TR").includes(needle) : true));
  }, [query.data, mode, q]);

  const manualSum = (query.data?.standings ?? []).reduce(
    (s, r) => s + Number(mode === "gucdengesi" ? r.balance_manual_points : r.manual_points),
    0
  );

  const recalc = useAdminMutation(
    async () => {
      const first = query.data?.standings?.[0];
      if (!first || !scope?.cityId || !scope.leagueId || !scope.seasonId) throw new Error("Tabloda takım yok; yeniden hesaplanacak kayıt bulunamadı.");
      await saveManualPoints({
        city_id: scope.cityId,
        league_id: scope.leagueId,
        season_id: scope.seasonId,
        team_id: first.team_id,
        manual_points: Number(first.manual_points) || 0,
      });
    },
    { success: "Puan durumu yeniden hesaplandı.", invalidate: [["admin", "standings"]] }
  );

  const askRecalc = async () => {
    const ok = await confirmAction({
      title: "Yeniden hesapla",
      message: "Puan durumu yayınlanmış maçlardan baştan hesaplanır; elle girilen düzeltmeler korunur.",
      confirmLabel: "Hesapla",
    });
    if (ok) recalc.mutate(undefined);
  };

  const scopeText = scope ? [scope.cityLabel, scope.leagueLabel, scope.seasonLabel, scope.groupLabel].filter(Boolean).join(" · ") : "";

  return (
    <AdminScreen
      title="Puan durumu"
      subtitle={scopeText || undefined}
      permission={PERMS}
      scroll={false}
      actions={canEdit && ready && !groupView ? [{ icon: "refresh-outline", accessibilityLabel: "Yeniden hesapla", onPress: askRecalc }] : undefined}
    >
      <AdminList
        data={ready ? (query.data ? rows : undefined) : []}
        loading={ready && query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={ready ? () => void queryClient.invalidateQueries({ queryKey: ["admin", "standings"] }) : undefined}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım ara"
        keyExtractor={(x) => String(x.row.team_id)}
        summary={
          query.data
            ? `${query.data.standings.length} takım · toplam elle düzeltme ${manualSum > 0 ? "+" : ""}${manualSum} · aktif model: ${
                activeType === "gucdengesi" ? "Güç dengesi" : "Standart"
              }`
            : null
        }
        emptyIcon="podium-outline"
        emptyTitle={ready ? "Tabloda takım yok" : "Kapsam seç"}
        emptyBody={ready ? "Bu sezonda yayınlanmış maç ya da puanı olan takım yok." : "Düzeltme yapmak için il, lig ve sezon seç."}
        emptyAction={!ready ? { label: "Kapsam seç", onPress: () => { setScopeDraft(scope); setScopeOpen(true); } } : undefined}
        extraHeader={
          <View style={styles.header}>
            <FieldBox
              value={scopeText || null}
              placeholder="İl · lig · sezon seç"
              icon="options-outline"
              onPress={() => {
                setScopeDraft(scope);
                setScopeOpen(true);
              }}
            />
            <SegmentedControl<View_>
              items={[
                { key: "standart", label: "Standart" },
                { key: "gucdengesi", label: "Güç dengesi" },
              ]}
              value={mode}
              onChange={setView}
              stretch
              size="sm"
            />
            {groupView ? <Note text="Grup tablosu grubun kendi maçlarından hesaplanır ve salt okunurdur. Düzeltme için grubu kaldır." /> : null}
            <Text style={styles.legend} {...textScale.dense}>
              O · G · B · M · AV — {mode === "gucdengesi" ? "güç dengesi + düzeltme" : "maç puanı + elle puan"} = toplam
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const r = item.row;
          const manual = Number(mode === "gucdengesi" ? r.balance_manual_points : r.manual_points) || 0;
          const base = Number(mode === "gucdengesi" ? r.balance_points : r.base_points) || 0;
          return (
            <RecordCard
              title={`${item.rank}. ${r.team_name}`}
              subtitle={`O ${r.played} · G ${r.wins} · B ${r.draws} · M ${r.losses} · AV ${r.goal_diff > 0 ? "+" : ""}${r.goal_diff}`}
              meta={`${base} ${manual >= 0 ? "+" : "−"} ${Math.abs(manual)} düzeltme`}
              avatar={{ name: r.team_name, image: r.logo || null }}
              value={`${item.total} P`}
              valueTone={manual ? "warn" : "neutral"}
              badges={[manual ? { label: `${manual > 0 ? "+" : ""}${manual} elle`, tone: manual > 0 ? "win" : "danger" } : null]}
              onPress={canEdit && !groupView ? () => setEditing(r) : undefined}
            />
          );
        }}
      />

      <AdjustSheet
        row={editing}
        mode={mode}
        scope={scope}
        onClose={() => setEditing(null)}
      />

      <BottomSheet
        visible={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title="Kapsam"
        snap="content"
        footer={
          <Button
            label="Uygula"
            onPress={() => {
              if (scopeDraft) setScopeOverride(scopeDraft);
              setView(null);
              setScopeOpen(false);
            }}
            disabled={!scopeDraft?.seasonId}
            fullWidth
          />
        }
      >
        {scopeDraft ? <ScopeFields value={scopeDraft} onChange={setScopeDraft} withGroup /> : <Text style={styles.legend}>Kapsam yükleniyor…</Text>}
      </BottomSheet>
    </AdminScreen>
  );
}

function AdjustSheet({
  row,
  mode,
  scope,
  onClose,
}: {
  row: AdminStandingRow | null;
  mode: View_;
  scope: AdminScope | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState(0);
  const [text, setText] = useState("0");

  useEffect(() => {
    if (!row) return;
    const v = Number(mode === "gucdengesi" ? row.balance_manual_points : row.manual_points) || 0;
    setValue(v);
    setText(String(v));
  }, [row, mode]);

  const save = useAdminMutation(
    () =>
      saveManualPoints({
        city_id: scope!.cityId!,
        league_id: scope!.leagueId!,
        season_id: scope!.seasonId!,
        team_id: row!.team_id,
        ...(mode === "gucdengesi" ? { balance_manual_points: value } : { manual_points: value }),
      }),
    { success: `${row?.team_name ?? "Takım"} düzeltmesi kaydedildi.`, invalidate: [["admin", "standings"]], onSuccess: onClose }
  );

  if (!row) return null;
  const base = Number(mode === "gucdengesi" ? row.balance_points : row.base_points) || 0;
  const setBoth = (v: number) => {
    setValue(v);
    setText(String(v));
  };

  return (
    <BottomSheet
      visible={row != null}
      onClose={onClose}
      title={row.team_name}
      snap="content"
      footer={<Button label="Düzeltmeyi kaydet" onPress={() => save.mutate(undefined)} loading={save.isPending} fullWidth haptic="success" />}
    >
      <View style={styles.sheet}>
        <Text style={styles.legend} {...textScale.long}>
          {mode === "gucdengesi"
            ? "Güç dengesi puanına eklenen ya da düşülen manuel düzeltme. Endeks hesabına dahil edilmez."
            : "Maçlardan gelen puana eklenen ya da düşülen elle puan (ceza, hükmen, başlangıç puanı)."}
        </Text>
        <View style={styles.adjust}>
          <Stepper value={value} onChange={setBoth} min={-999} max={999} repeatOnHold accessibilityLabel="Düzeltme" />
          <Input
            value={text}
            onChangeText={(t) => {
              const clean = t.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "").slice(0, 4);
              setText(clean);
              const n = Number(clean);
              if (clean !== "" && clean !== "-" && Number.isInteger(n)) setValue(n);
            }}
            keyboardType="numbers-and-punctuation"
            size="sm"
            containerStyle={styles.adjustInput}
            accessibilityLabel="Düzeltme değeri"
          />
        </View>
        <View style={styles.quick}>
          <Button label="−3" size="sm" variant="secondary" onPress={() => setBoth(value - 3)} />
          <Button label="−1" size="sm" variant="secondary" onPress={() => setBoth(value - 1)} />
          <Button label="Sıfırla" size="sm" variant="ghost" onPress={() => setBoth(0)} />
          <Button label="+1" size="sm" variant="secondary" onPress={() => setBoth(value + 1)} />
          <Button label="+3" size="sm" variant="secondary" onPress={() => setBoth(value + 3)} />
        </View>
        <Text style={styles.total} {...textScale.badge}>
          {base} {value >= 0 ? "+" : "−"} {Math.abs(value)} = {base + value} puan
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  legend: { ...type.caption, color: colors.textTertiary },
  sheet: { gap: space.md },
  adjust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md },
  adjustInput: { width: 84 },
  quick: { flexDirection: "row", justifyContent: "center", gap: space.xs, flexWrap: "wrap" },
  total: { ...type.h3, color: colors.textPrimary, textAlign: "center" },
});
