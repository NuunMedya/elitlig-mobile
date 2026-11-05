/**
 * PİYASA DEĞERİ — web pages/management/marketValue/MarketValueAdmin.js.
 *
 * Sekmeler (yetkiye göre):
 *   Sıralama   değer sıralaması (arama, mevki, sıralama ölçütü); oyuncuya
 *              dokununca profil, uzun basınca tekil yeniden hesap.
 *              "Tümünü yeniden hesapla" kapsamdaki oyuncuları formüle oturtur
 *              (market_value.recalculate).
 *   Formül     bileşen ağırlıkları (toplam %100), ödül ve gelişim puanları,
 *              ince ayarlar (market_value.settings)
 *   Pozisyon   pozisyona özel istatistik ağırlıkları
 *   Kayıtlar   formül versiyonları (aktifleştir) ve denetim kaydı
 *
 * Değerler olay bazlı otomatik güncellenir (maç yayını, haftanın enleri,
 * gece hesabı); ayar değişiklikleri sonraki hesaplamalarda uygulanır.
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  InfoLine,
  Panel,
  RecordCard,
  ToggleField,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, EmptyState, ErrorState, Input, SegmentedControl, SkeletonCard } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/format";
import {
  AUDIT_ACTION_LABELS,
  AWARD_POINT_LABELS,
  BREAKDOWN_LABELS,
  COMPONENT_HINTS,
  FINE_FIELDS,
  GROWTH_POINT_LABELS,
  POSITION_GROUP_LABELS,
  RANKING_SORTS,
  STAT_KEY_LABELS,
  activateFormulaVersion,
  formatEtl,
  getAuditLog,
  getFormulaVersions,
  getMarketSettings,
  getRankings,
  parseNumber,
  recalculateAll,
  recalculatePlayer,
  updateMarketSettings,
  updateStatWeights,
  type RankingRow,
  type SettingsResponse,
  type StatWeightRow,
} from "@/lib/api/admin/marketValue";
import { positionLabel } from "@/lib/api/admin/players";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["market_value.view", "market_value.recalculate", "market_value.settings"];
const KEY = ["admin", "market-value"] as const;
type Tab = "ranking" | "formula" | "positions" | "audit";

const COMPONENT_KEYS = Object.keys(BREAKDOWN_LABELS);
const str = (v: unknown) => (v == null ? "" : String(v));

export default function MarketValueScreen() {
  const auth = useAuth();
  const user = auth.user;
  const canRecalc = hasPermission(user, "market_value.recalculate");
  const canSettings = hasPermission(user, "market_value.settings");
  const [tab, setTab] = useState<Tab>("ranking");

  const tabs = [
    { key: "ranking" as Tab, label: "Sıralama" },
    ...(canSettings
      ? [
          { key: "formula" as Tab, label: "Formül" },
          { key: "positions" as Tab, label: "Pozisyon" },
          { key: "audit" as Tab, label: "Kayıtlar" },
        ]
      : []),
  ];

  return (
    <AdminScreen
      title="Piyasa değeri"
      permission={PERMS}
      scroll={tab !== "ranking"}
      bottom={tabs.length > 1 ? <SegmentedControl<Tab> items={tabs} value={tab} onChange={setTab} stretch size="sm" /> : undefined}
    >
      {tab === "ranking" ? (
        <RankingTab canRecalc={canRecalc} />
      ) : tab === "formula" ? (
        <FormulaTab />
      ) : tab === "positions" ? (
        <PositionsTab />
      ) : (
        <AuditTab />
      )}
    </AdminScreen>
  );
}

/* ───────────────────────── Sıralama ───────────────────────── */

function RankingTab({ canRecalc }: { canRecalc: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("marketValue");
  const [position, setPosition] = useState("");
  const [menu, setMenu] = useState<RankingRow | null>(null);

  const query = useInfiniteQuery({
    queryKey: [...KEY, "rankings", { q, sort, position }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getRankings({ offset: pageParam, sort, position, search: q }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + (p.items?.length ?? 0), 0);
      return loaded < (last.total ?? 0) && (last.items?.length ?? 0) > 0 ? loaded : undefined;
    },
  });
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items ?? []), [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const recalcOne = useAdminMutation((r: RankingRow) => recalculatePlayer(r.playerId), {
    success: (res, r) => (res?.newValue != null ? `${r.playerName}: ${formatEtl(res.newValue)}` : res?.message || "Hesaplanacak veri bulunamadı."),
    invalidate: [KEY],
  });
  const recalcAll = useAdminMutation(() => recalculateAll(), {
    success: (r) => `${r.processed.toLocaleString("tr-TR")} oyuncunun değeri yeniden hesaplandı.`,
    invalidate: [KEY],
  });

  const askAll = async () => {
    const ok = await confirmAction({
      title: "Tümü yeniden hesaplansın mı?",
      message:
        "Yetki alanındaki tüm oyuncuların değeri formülün bugünkü girdilerine oturtulur. Veri değişmediyse değer değişmez; işlem birkaç dakika sürebilir.",
      confirmLabel: "Hesapla",
    });
    if (ok) recalcAll.mutate(undefined);
  };

  return (
    <>
      <AdminList
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={query.refetch}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Oyuncu ara"
        filters={[{ key: "", label: "Tüm mevkiler" }, ...Object.entries(POSITION_GROUP_LABELS).map(([k, label]) => ({ key: k, label }))]}
        filter={position}
        onFilter={setPosition}
        extraHeader={
          <View style={styles.stack}>
            <ChipGroup scrollable contentPadding={0}>
              {RANKING_SORTS.map((s) => (
                <Chip key={s.key} label={s.label} size="sm" icon={sort === s.key ? "arrow-down" : undefined} selected={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
            </ChipGroup>
            {canRecalc ? (
              <Button label="Tümünü yeniden hesapla" icon="refresh" variant="secondary" size="sm" loading={recalcAll.isPending} onPress={() => void askAll()} />
            ) : null}
          </View>
        }
        summary={query.data ? `${total.toLocaleString("tr-TR")} oyuncu${canRecalc ? " · tekil hesap için oyuncuya basılı tut" : ""}` : null}
        keyExtractor={(r) => String(r.playerId)}
        emptyIcon="trending-up-outline"
        emptyTitle="Piyasa değeri kaydı yok"
        renderItem={({ item, index }) => {
          const change = item.previousValue != null ? item.currentValue - item.previousValue : 0;
          return (
            <RecordCard
              title={`${item.globalRank ?? index + 1}. ${item.playerName}`}
              subtitle={[positionLabel(item.position) || POSITION_GROUP_LABELS[item.positionGroup ?? ""] || null, `${item.totalMatches ?? 0} maç`, `${item.totalGoals ?? 0} gol`]
                .filter(Boolean)
                .join(" · ")}
              meta={[
                item.cityRank != null ? `İl sırası ${item.cityRank}` : null,
                item.positionRank != null ? `Mevki sırası ${item.positionRank}` : null,
                item.marketScore != null ? `Skor ${Number(item.marketScore).toFixed(1)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              avatar={{ name: item.playerName, image: item.playerImg }}
              value={formatEtl(item.currentValue)}
              valueTone="brand"
              badges={[change ? { label: `${change > 0 ? "+" : "-"}${formatEtl(Math.abs(change))}`, tone: change > 0 ? "win" : "danger" } : null]}
              onPress={() => router.push(`/yonetim/oyuncular/${item.playerId}`)}
              onLongPress={canRecalc ? () => setMenu(item) : undefined}
            />
          );
        }}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.playerName}
        actions={
          menu
            ? [
                { label: "Yeniden hesapla", icon: "refresh", onPress: () => recalcOne.mutate(menu) },
                { label: "Oyuncu profili", hint: "Değer kırılımı ve düzeltme", icon: "person-outline", onPress: () => router.push(`/yonetim/oyuncular/${menu.playerId}`) },
              ]
            : []
        }
      />
    </>
  );
}

/* ───────────────────────── Formül ───────────────────────── */

function NumberInput({ label, value, onChange, suffix, hint }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string }) {
  return (
    <Input
      label={suffix ? `${label} (${suffix})` : label}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^\d.,-]/g, ""))}
      keyboardType="numbers-and-punctuation"
      hint={hint}
    />
  );
}

function useSettings() {
  return useQuery({ queryKey: [...KEY, "settings"], queryFn: getMarketSettings });
}

function FormulaTab() {
  const settings = useSettings();
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [growth, setGrowth] = useState<Record<string, string>>({});
  const [awards, setAwards] = useState<Record<string, string>>({});
  const [fine, setFine] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = settings.data?.settings;
    if (!s) return;
    setWeights(Object.fromEntries(COMPONENT_KEYS.map((k) => [k, str(s.componentWeights?.[k])])));
    setGrowth(Object.fromEntries(Object.keys(GROWTH_POINT_LABELS).map((k) => [k, str(s.growth?.points?.[k])])));
    setAwards(Object.fromEntries(Object.keys(AWARD_POINT_LABELS).map((k) => [k, str(s.awardPoints?.[k])])));
    setFine(Object.fromEntries(FINE_FIELDS.map((f) => [f.key, str((s[f.path[0]] as Record<string, unknown> | undefined)?.[f.path[1]])])));
  }, [settings.data]);

  const sum = COMPONENT_KEYS.reduce((n, k) => n + parseNumber(weights[k]), 0);
  const invalidate = [[...KEY, "settings"]];

  const saveWeights = useAdminMutation(
    () => updateMarketSettings({ componentWeights: Object.fromEntries(COMPONENT_KEYS.map((k) => [k, parseNumber(weights[k])])) }),
    { success: "Bileşen ağırlıkları kaydedildi. Yeni ağırlıklar sonraki hesaplamalarda uygulanır.", invalidate }
  );
  const savePoints = useAdminMutation(
    () =>
      updateMarketSettings({
        growth: { ...(settings.data?.settings.growth ?? {}), points: Object.fromEntries(Object.keys(GROWTH_POINT_LABELS).map((k) => [k, parseNumber(growth[k])])) },
        awardPoints: Object.fromEntries(Object.keys(AWARD_POINT_LABELS).map((k) => [k, parseNumber(awards[k])])),
      }),
    { success: "Puan kazanımları kaydedildi.", invalidate }
  );
  const saveFine = useAdminMutation(
    () => {
      const s = settings.data?.settings ?? {};
      const next: Record<string, Record<string, unknown>> = {};
      for (const f of FINE_FIELDS) {
        const [group, key] = f.path;
        next[group] = { ...(s[group] as Record<string, unknown> | undefined), ...(next[group] ?? {}), [key]: parseNumber(fine[f.key]) };
      }
      return updateMarketSettings(next);
    },
    { success: "İnce ayarlar kaydedildi.", invalidate }
  );

  if (settings.isLoading) return <SkeletonCard />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.refetch} variant="inline" />;
  const s = settings.data?.settings;

  return (
    <>
      <Panel title="DEĞER ARALIĞI">
        <InfoLine label="Alt değer" value={formatEtl(s?.launch?.minValue)} />
        <InfoLine label="Üst değer" value={formatEtl(s?.launch?.maxValue)} />
        <InfoLine label="Olay başı değişim" value={`±%${str(s?.smoothing?.perEventMaxPct) || "—"}`} />
      </Panel>

      <Panel title="BİLEŞEN AĞIRLIKLARI">
        <View style={styles.sumRow}>
          <Text style={styles.note} {...textScale.long}>
            Piyasa skorunun hangi kriterden ne kadar etkileneceği. Toplam %100 olmalı.
          </Text>
          <Badge label={`Toplam %${Math.round(sum * 100) / 100}`} tone={Math.round(sum) === 100 ? "win" : "danger"} />
        </View>
        {COMPONENT_KEYS.map((k) => (
          <NumberInput key={k} label={BREAKDOWN_LABELS[k]} hint={COMPONENT_HINTS[k]} suffix="%" value={weights[k] ?? ""} onChange={(v) => setWeights((w) => ({ ...w, [k]: v }))} />
        ))}
        <Button
          label="Ağırlıkları kaydet"
          icon="save-outline"
          onPress={() => saveWeights.mutate(undefined)}
          loading={saveWeights.isPending}
          disabled={Math.round(sum) !== 100}
        />
        {Math.round(sum) !== 100 ? (
          <Text style={styles.warn} {...textScale.dense}>
            Kaydetmek için toplamı %100 yap.
          </Text>
        ) : null}
      </Panel>

      <Panel title="ÖDÜL PUANLARI">
        <Text style={styles.note} {...textScale.long}>
          "Ödüller" bileşenini besler.
        </Text>
        {Object.entries(AWARD_POINT_LABELS).map(([k, label]) => (
          <NumberInput key={k} label={label} value={awards[k] ?? ""} onChange={(v) => setAwards((a) => ({ ...a, [k]: v }))} />
        ))}
      </Panel>
      <Panel title="GELİŞİM PUANLARI">
        <Text style={styles.note} {...textScale.long}>
          Oyuncunun değer hedefini kademeli olarak yukarı / aşağı çeker.
        </Text>
        {Object.entries(GROWTH_POINT_LABELS).map(([k, label]) => (
          <NumberInput key={k} label={label} value={growth[k] ?? ""} onChange={(v) => setGrowth((g) => ({ ...g, [k]: v }))} />
        ))}
        <Button label="Puanları kaydet" icon="save-outline" onPress={() => savePoints.mutate(undefined)} loading={savePoints.isPending} />
      </Panel>

      <Panel title="İNCE AYARLAR">
        {FINE_FIELDS.map((f) => (
          <NumberInput key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={fine[f.key] ?? ""} onChange={(v) => setFine((x) => ({ ...x, [f.key]: v }))} />
        ))}
        <Button label="İnce ayarları kaydet" icon="save-outline" onPress={() => saveFine.mutate(undefined)} loading={saveFine.isPending} />
      </Panel>
      <Text style={styles.note} {...textScale.long}>
        Değerler otomatik güncellenir: maç yayınlandığında, haftanın enleri yayınlandığında ve gece toplu hesabında. Tekil oyuncu işlemleri (yeniden hesap, manuel düzeltme) oyuncu profilindedir.
      </Text>
    </>
  );
}

/* ───────────────────────── Pozisyon ağırlıkları ───────────────────────── */

function PositionsTab() {
  const settings = useSettings();
  const [rows, setRows] = useState<StatWeightRow[]>([]);
  useEffect(() => {
    const flat: StatWeightRow[] = [];
    Object.values((settings.data as SettingsResponse | undefined)?.statWeights ?? {}).forEach((list) => list.forEach((r) => flat.push({ ...r })));
    setRows(flat);
  }, [settings.data]);

  const save = useAdminMutation(
    () => updateStatWeights(rows.map((r) => ({ position: r.position, stat_key: r.stat_key, weight: parseNumber(r.weight), is_active: Boolean(r.is_active) }))),
    { success: "Pozisyon ağırlıkları kaydedildi.", invalidate: [[...KEY, "settings"]] }
  );

  if (settings.isLoading) return <SkeletonCard />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.refetch} variant="inline" />;

  const positions = [...new Set(rows.map((r) => r.position))];
  const patch = (index: number, p: Partial<StatWeightRow>) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...p } : r)));

  return (
    <>
      <Text style={styles.note} {...textScale.long}>
        "Pozisyona Özel" bileşeninin içeriği: her pozisyon grubunda hangi istatistiğin ne kadar sayılacağı. Pasif satırlar hesaba katılmaz; aktif satırların toplamı %100 olmalı.
      </Text>
      {positions.map((pos) => {
        const sum = rows.filter((r) => r.position === pos && r.is_active).reduce((n, r) => n + parseNumber(r.weight), 0);
        return (
          <Panel key={pos} title={(POSITION_GROUP_LABELS[pos] ?? pos).toLocaleUpperCase("tr-TR")}>
            <Badge label={`Aktif toplam %${Math.round(sum * 100) / 100}`} tone={Math.round(sum) === 100 ? "win" : "danger"} />
            {rows.map((r, index) =>
              r.position !== pos ? null : (
                <View key={`${r.position}-${r.stat_key}`} style={styles.statRow}>
                  <ToggleField
                    label={STAT_KEY_LABELS[r.stat_key] ?? r.stat_key}
                    hint={`${r.normalization_type === "passthrough" ? "0-100 skor" : `Referans ${r.reference_value ?? "—"}`} · ${r.is_negative ? "ters (düşük iyi)" : "düz"}`}
                    value={Boolean(r.is_active)}
                    onChange={(v) => patch(index, { is_active: v ? 1 : 0 })}
                  />
                  {r.is_active ? (
                    <NumberInput label="Ağırlık" suffix="%" value={str(r.weight)} onChange={(v) => patch(index, { weight: v })} />
                  ) : null}
                </View>
              )
            )}
          </Panel>
        );
      })}
      {rows.length ? (
        <Button label="Pozisyon ağırlıklarını kaydet" icon="save-outline" onPress={() => save.mutate(undefined)} loading={save.isPending} fullWidth />
      ) : (
        <EmptyState icon="options-outline" variant="inline" title="Ağırlık tanımı yok" />
      )}
    </>
  );
}

/* ───────────────────────── Kayıtlar ───────────────────────── */

function AuditTab() {
  const versions = useQuery({ queryKey: [...KEY, "versions"], queryFn: getFormulaVersions });
  const audit = useQuery({ queryKey: [...KEY, "audit"], queryFn: getAuditLog });
  const [open, setOpen] = useState<number | null>(null);

  const activate = useAdminMutation((id: number) => activateFormulaVersion(id), {
    success: "Formül versiyonu aktifleştirildi.",
    invalidate: [[...KEY, "versions"], [...KEY, "settings"]],
  });

  return (
    <>
      <Panel title="FORMÜL VERSİYONLARI">
        {versions.isLoading ? (
          <SkeletonCard />
        ) : versions.data?.length ? (
          versions.data.map((v) => (
            <RecordCard
              key={v.id}
              title={v.version}
              subtitle={v.name}
              icon="git-commit-outline"
              badges={[v.is_active ? { label: "Aktif", tone: "win" } : null]}
              trailing={
                v.is_active ? undefined : (
                  <Button
                    label="Aktifleştir"
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      void confirmAction({
                        title: "Versiyon aktifleştirilsin mi?",
                        message: `${v.version} formülü sonraki hesaplamalarda kullanılacak.`,
                        confirmLabel: "Aktifleştir",
                      }).then((ok) => ok && activate.mutate(v.id))
                    }
                  />
                )
              }
            />
          ))
        ) : (
          <Text style={styles.note}>Kayıtlı formül versiyonu yok.</Text>
        )}
      </Panel>
      <Panel title={`DENETİM KAYDI${audit.data ? ` · SON ${audit.data.items?.length ?? 0} / ${audit.data.total ?? 0}` : ""}`}>
        {audit.isLoading ? (
          <SkeletonCard />
        ) : audit.error ? (
          <ErrorState error={audit.error} onRetry={audit.refetch} variant="inline" />
        ) : audit.data?.items?.length ? (
          audit.data.items.map((a) => (
            <RecordCard
              key={a.id}
              title={AUDIT_ACTION_LABELS[a.action] ?? a.action}
              subtitle={[a.user_name || (a.user_id ? `Kullanıcı #${a.user_id}` : "Sistem"), formatDateTime(a.createdAt)].join(" · ")}
              icon="document-text-outline"
              onPress={() => setOpen(open === a.id ? null : a.id)}
            >
              {open === a.id ? (
                <Text style={styles.code} selectable {...textScale.long}>
                  {auditJson(a.new_data)}
                </Text>
              ) : null}
            </RecordCard>
          ))
        ) : (
          <Text style={styles.note}>Henüz kayıt yok.</Text>
        )}
      </Panel>
    </>
  );
}

/** Denetim kaydının yeni verisi — metin JSON ise çözülüp girintili yazılır. */
function auditJson(value: unknown): string {
  let data = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return data as string;
    }
  }
  return JSON.stringify(data, null, 2) ?? "—";
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  sumRow: { gap: space.xs },
  statRow: { gap: space.xs, paddingVertical: space.xs },
  note: { ...type.bodySm, color: colors.textSecondary },
  warn: { ...type.caption, color: colors.danger },
  code: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },
});
