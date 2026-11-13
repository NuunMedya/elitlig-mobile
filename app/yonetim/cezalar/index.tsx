/**
 * CEZALAR — disiplin dosyaları listesi (web /editor/cezalar, PenaltyAdmin.js).
 *
 * NE: aşama çipleri (sayılı), arama (oyuncu / takım / maç), il-lig-sezon ve
 * takım filtresi, "yalnız cezalılar" süzgeci. Karta dokunmak dosyayı açar
 * (/yonetim/cezalar/[publicId]); "Yeni ceza" sevk ekranına gider.
 *
 * VERİ: GET /api/penalties — sunucu aşama ve kapsamla süzer (il kısıtlı rol
 * yalnız kendi ilini görür); arama, takım ve aktiflik istemcide süzülür
 * (sunucu bu alanlarla filtre almaz, liste 500 kayıtla sınırlıdır).
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AdminList, AdminScreen, SelectField, ToggleField, type FilterOption } from "@/components/admin";
import { CountStrip } from "@/components/admin/team/ManageKit";
import { PenaltyCard } from "@/components/admin/penalties/PenaltyBits";
import { ScopeSelects, type ScopeValue } from "@/components/admin/penalties/ScopeSelects";
import { BottomSheet, Button, Chip, ChipGroup, FAB } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  listPenalties,
  PENALTY_STATUS_ORDER,
  PENALTY_STATUS_SHORT,
  type Penalty,
  type PenaltyStatus,
} from "@/lib/api/admin/penalties";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

const PERMS = ["penalties.view", "penalties.create"];

const fold = (text: string) => text.toLocaleLowerCase("tr-TR");

export default function PenaltiesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ durum?: string }>();
  const initialStatus = PENALTY_STATUS_ORDER.includes(params.durum as PenaltyStatus) ? (params.durum as PenaltyStatus) : "";
  const [status, setStatus] = useState<PenaltyStatus | "">(initialStatus);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<ScopeValue>({ cityId: null, leagueId: null, seasonId: null });
  const [teamId, setTeamId] = useState<number | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const canView = hasAnyPermission(auth.user, ["penalties.view"]);
  const canCreate = hasAnyPermission(auth.user, ["penalties.create"]);

  // Aşama sayıları için liste aşamasız çekilir; aşama süzgeci istemcide.
  const query = useQuery({
    queryKey: ["admin", "penalties", "list", scope],
    queryFn: () => listPenalties({ city_id: scope.cityId, league_id: scope.leagueId, season_id: scope.seasonId }),
    enabled: canView,
  });

  const all = useMemo(() => query.data ?? [], [query.data]);

  const teams = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of all) if (p.team_id) map.set(p.team_id, p.team_name || `Takım #${p.team_id}`);
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }, [all]);

  const base = useMemo(() => {
    const needle = fold(q);
    return all.filter((p) => {
      if (teamId && p.team_id !== teamId) return false;
      if (activeOnly && !p.ban_state?.active) return false;
      if (!needle) return true;
      return fold(`${p.player_name ?? ""} ${p.team_name ?? ""} ${p.match_label ?? ""}`).includes(needle);
    });
  }, [all, q, teamId, activeOnly]);

  const items = useMemo(() => (status ? base.filter((p) => p.status === status) : base), [base, status]);

  const filters: FilterOption[] = [
    { key: "", label: "Tümü", count: base.length },
    ...PENALTY_STATUS_ORDER.map((s) => ({ key: s, label: PENALTY_STATUS_SHORT[s], count: base.filter((p) => p.status === s).length })),
  ];

  const activeFilterCount = [scope.cityId, teamId, activeOnly ? 1 : null].filter(Boolean).length;

  return (
    <AdminScreen
      title="Cezalar"
      subtitle="Disiplin süreçleri ve sevkler"
      permission={PERMS}
      scroll={false}
      actions={[
        { icon: "options-outline", onPress: () => setFiltersOpen(true), badge: activeFilterCount || undefined, accessibilityLabel: "Filtreler" },
        ...(hasAnyPermission(auth.user, ["penalties.review"])
          ? [{ icon: "document-attach-outline" as const, onPress: () => router.push("/yonetim/savunmalar" as Href), accessibilityLabel: "Savunma ve itirazlar" }]
          : []),
      ]}
      overlay={
        canCreate ? (
          <FAB icon="add" label="Yeni ceza" extended onPress={() => router.push("/yonetim/ceza-yeni" as Href)} accessibilityLabel="Yeni ceza" />
        ) : null
      }
    >
      <AdminList<Penalty>
        data={canView ? items : []}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Oyuncu, takım ya da maç ara"
        extraHeader={
          <View style={styles.head}>
            <CountStrip
              items={[
                { key: "active", label: "Cezalı", value: base.filter((p) => p.ban_state?.active).length, tone: "danger", icon: "alert-circle", selected: activeOnly, onPress: () => setActiveOnly((v) => !v) },
                { key: "sevk", label: "Sevk", value: base.filter((p) => p.status === "sevk").length, tone: "warn", icon: "paper-plane", selected: status === "sevk", onPress: () => setStatus(status === "sevk" ? "" : "sevk") },
                { key: "subs", label: "Başvuru", value: base.reduce((n, p) => n + (p.submission_summary?.pending ?? 0), 0), tone: "info", icon: "document-attach" },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              {filters.map((f) => (
                <Chip key={f.key || "all"} label={f.label} count={f.count} size="sm" selected={status === f.key} onPress={() => setStatus(f.key as PenaltyStatus | "")} />
              ))}
              <Chip
                label={activeFilterCount ? `Süzgeç · ${activeFilterCount}` : "Süzgeç"}
                icon="options-outline"
                size="sm"
                selected={activeFilterCount > 0}
                onPress={() => setFiltersOpen(true)}
              />
            </ChipGroup>
          </View>
        }
        summary={query.data ? `${items.length} ceza dosyası` : null}
        keyExtractor={(p) => p.public_id}
        emptyIcon="hammer-outline"
        emptyTitle={canView ? "Ceza kaydı yok" : "Listeyi görme yetkin yok"}
        emptyBody={canView ? (q || activeFilterCount ? "Filtrelerle eşleşen dosya bulunamadı." : "Yeni sevkler burada listelenir.") : "Yeni sevk oluşturabilirsin; dosyaları görmek için penalties.view yetkisi gerekir."}
        emptyAction={canCreate && !q ? { label: "Yeni ceza", onPress: () => router.push("/yonetim/ceza-yeni" as Href) } : undefined}
        renderItem={({ item }) => (
          <PenaltyCard penalty={item} onPress={() => router.push(`/yonetim/cezalar/${encodeURIComponent(item.public_id)}` as Href)} />
        )}
      />

      <BottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtreler"
        snap="half"
        footer={
          <View style={styles.footer}>
            <Button
              label="Temizle"
              variant="secondary"
              onPress={() => {
                setScope({ cityId: null, leagueId: null, seasonId: null });
                setTeamId(null);
                setActiveOnly(false);
              }}
            />
            <Button label="Uygula" onPress={() => setFiltersOpen(false)} style={styles.grow} />
          </View>
        }
      >
        <View style={styles.sheet}>
          <ScopeSelects value={scope} onChange={(next) => { setScope(next); setTeamId(null); }} />
          <SelectField<number>
            label="Takım"
            value={teamId}
            options={teams}
            placeholder="Tüm takımlar"
            clearable
            icon="shield-half-outline"
            onChange={setTeamId}
          />
          <ToggleField label="Yalnız cezası süren dosyalar" value={activeOnly} onChange={setActiveOnly} />
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  sheet: { gap: space.md },
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
});
