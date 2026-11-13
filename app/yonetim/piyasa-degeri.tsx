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

import Ionicons from "@expo/vector-icons/Ionicons";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  ToggleField,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { CountStrip, DangerNote, GroupCard, ListLine, PositionAvatar } from "@/components/admin/team/ManageKit";
import { Button, Chip, ChipGroup, EmptyState, ErrorState, GradientBar, IconTile, Input, RankBadge, SegmentedControl, SkeletonCard, Touchable } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
        extraHeader={
          <View style={styles.stack}>
            {rows.length ? (
              <CountStrip
                items={[
                  { key: "total", label: "Oyuncu", value: total, icon: "people" },
                  { key: "top", label: "Zirve", value: compactEtl(rows[0]?.currentValue), tone: "accent", icon: "trophy", hint: rows[0]?.playerName },
                  { key: "up", label: "Yükselen", value: rows.filter((r) => r.previousValue != null && r.currentValue > r.previousValue).length, tone: "win", icon: "trending-up", hint: "bu sayfada" },
                ]}
              />
            ) : null}
            <ChipGroup scrollable contentPadding={0}>
              {[{ key: "", label: "Tüm mevkiler" }, ...Object.entries(POSITION_GROUP_LABELS).map(([k, label]) => ({ key: k, label }))].map((f) => (
                <Chip key={f.key || "all"} label={f.label} size="sm" selected={position === f.key} onPress={() => setPosition(f.key)} />
              ))}
            </ChipGroup>
            <ChipGroup scrollable contentPadding={0}>
              {canRecalc ? <Chip label="Tümünü hesapla" icon="refresh" size="sm" tone="warn" selected onPress={() => void askAll()} /> : null}
              {RANKING_SORTS.map((s) => (
                <Chip key={s.key} label={s.label} size="sm" icon={sort === s.key ? "arrow-down" : undefined} selected={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
            </ChipGroup>
          </View>
        }
        summary={query.data ? `${total.toLocaleString("tr-TR")} oyuncu${canRecalc ? " · tekil hesap için oyuncuya basılı tut" : ""}` : null}
        keyExtractor={(r) => String(r.playerId)}
        emptyIcon="trending-up-outline"
        emptyTitle="Piyasa değeri kaydı yok"
        renderItem={({ item, index }) => {
          const change = item.previousValue != null ? item.currentValue - item.previousValue : 0;
          const rank = item.globalRank ?? index + 1;
          return (
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => router.push(`/yonetim/oyuncular/${item.playerId}`)}
              onLongPress={canRecalc ? () => setMenu(item) : undefined}
              style={[styles.rank, rank <= 3 ? styles.rankTop : null]}
              accessibilityRole="button"
              accessibilityLabel={`${rank}. ${item.playerName}, ${formatEtl(item.currentValue)}`}
            >
              {rank <= 3 ? (
                <RankBadge rank={rank} size={28} />
              ) : (
                <Text style={styles.rankNo} {...textScale.badge}>
                  {rank}
                </Text>
              )}
              <PositionAvatar name={item.playerName} image={item.playerImg} position={item.position} size={38} />
              <View style={styles.rankMain}>
                <Text style={styles.rankName} numberOfLines={1} {...textScale.dense}>
                  {item.playerName}
                </Text>
                <Text style={styles.rankMeta} numberOfLines={1} {...textScale.dense}>
                  {[positionLabel(item.position) || POSITION_GROUP_LABELS[item.positionGroup ?? ""] || null, `${item.totalMatches ?? 0} maç`, `${item.totalGoals ?? 0} gol`].filter(Boolean).join(" · ")}
                </Text>
                {item.marketScore != null ? (
                  <View style={styles.scoreRow}>
                    <GradientBar value={Number(item.marketScore) / 100} height={4} style={styles.flex} />
                    <Text style={styles.scoreText} {...textScale.badge}>
                      {Number(item.marketScore).toFixed(0)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rankValue}>
                <Text style={styles.value} numberOfLines={1} {...textScale.badge}>
                  {compactEtl(item.currentValue)}
                </Text>
                {change ? (
                  <Text style={[styles.delta, { color: change > 0 ? colors.win : colors.loss }]} numberOfLines={1} {...textScale.badge}>
                    {change > 0 ? "▲" : "▼"} {compactEtl(Math.abs(change))}
                  </Text>
                ) : (
                  <Text style={styles.deltaFlat} {...textScale.badge}>
                    ETL
                  </Text>
                )}
              </View>
            </Touchable>
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
      <CountStrip
        items={[
          { key: "min", label: "Alt değer", value: compactEtl(s?.launch?.minValue), icon: "arrow-down" },
          { key: "max", label: "Üst değer", value: compactEtl(s?.launch?.maxValue), tone: "accent", icon: "arrow-up" },
          { key: "step", label: "Olay başı", value: `±%${str(s?.smoothing?.perEventMaxPct) || "—"}`, icon: "pulse" },
        ]}
      />

      <GroupCard title="Bileşen ağırlıkları" step={1}>
        {/* TOPLAM ÇUBUĞU — %100'e ne kadar uzak; bileşen payları renkli şerit. */}
        <View style={styles.sumBox}>
          <View style={styles.sumHead}>
            <Text style={styles.note} {...textScale.dense}>
              Toplam %100 olmalı
            </Text>
            <Text style={[styles.sumValue, { color: Math.round(sum) === 100 ? colors.win : colors.danger }]} {...textScale.badge}>
              %{Math.round(sum * 100) / 100}
            </Text>
          </View>
          <GradientBar value={sum / 100} height={8} gradient={Math.round(sum) === 100 ? colors.tileTones.mint : sum > 100 ? colors.tileTones.red : undefined} />
        </View>
        {COMPONENT_KEYS.map((k) => (
          <View key={k} style={styles.weight}>
            <NumberInput label={BREAKDOWN_LABELS[k]} hint={COMPONENT_HINTS[k]} suffix="%" value={weights[k] ?? ""} onChange={(v) => setWeights((w) => ({ ...w, [k]: v }))} />
            <GradientBar value={parseNumber(weights[k]) / 100} height={3} />
          </View>
        ))}
        <Button
          label="Ağırlıkları kaydet"
          icon="save-outline"
          onPress={() => saveWeights.mutate(undefined)}
          loading={saveWeights.isPending}
          disabled={Math.round(sum) !== 100}
          fullWidth
        />
        {Math.round(sum) !== 100 ? (
          <Text style={styles.warn} {...textScale.dense}>
            Kaydetmek için toplamı %100 yap.
          </Text>
        ) : null}
      </GroupCard>

      <GroupCard title="Ödül puanları" step={2}>
        <Text style={styles.note} {...textScale.long}>
          "Ödüller" bileşenini besler.
        </Text>
        {Object.entries(AWARD_POINT_LABELS).map(([k, label]) => (
          <NumberInput key={k} label={label} value={awards[k] ?? ""} onChange={(v) => setAwards((a) => ({ ...a, [k]: v }))} />
        ))}
      </GroupCard>
      <GroupCard title="Gelişim puanları" step={3}>
        <Text style={styles.note} {...textScale.long}>
          Oyuncunun değer hedefini kademeli olarak yukarı / aşağı çeker.
        </Text>
        {Object.entries(GROWTH_POINT_LABELS).map(([k, label]) => (
          <NumberInput key={k} label={label} value={growth[k] ?? ""} onChange={(v) => setGrowth((g) => ({ ...g, [k]: v }))} />
        ))}
        <Button label="Puanları kaydet" icon="save-outline" onPress={() => savePoints.mutate(undefined)} loading={savePoints.isPending} fullWidth />
      </GroupCard>

      <GroupCard title="İnce ayarlar" step={4}>
        {FINE_FIELDS.map((f) => (
          <NumberInput key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={fine[f.key] ?? ""} onChange={(v) => setFine((x) => ({ ...x, [f.key]: v }))} />
        ))}
        <Button label="İnce ayarları kaydet" icon="save-outline" onPress={() => saveFine.mutate(undefined)} loading={saveFine.isPending} fullWidth />
      </GroupCard>
      <DangerNote
        tone="info"
        title="Değerler otomatik güncellenir"
        body="Maç yayınlandığında, haftanın enleri yayınlandığında ve gece toplu hesabında. Tekil oyuncu işlemleri (yeniden hesap, manuel düzeltme) oyuncu profilindedir."
      />
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
      <DangerNote
        tone="info"
        title="Pozisyona özel bileşen"
        body="Her pozisyon grubunda hangi istatistiğin ne kadar sayılacağı. Pasif satırlar hesaba katılmaz; aktif satırların toplamı %100 olmalı."
      />
      {positions.map((pos) => {
        const sum = rows.filter((r) => r.position === pos && r.is_active).reduce((n, r) => n + parseNumber(r.weight), 0);
        return (
          <GroupCard key={pos} title={POSITION_GROUP_LABELS[pos] ?? pos} icon="body" tone={Math.round(sum) === 100 ? "mint" : "red"}>
            <View style={styles.sumBox}>
              <View style={styles.sumHead}>
                <Text style={styles.note} {...textScale.dense}>
                  Aktif toplam
                </Text>
                <Text style={[styles.sumValue, { color: Math.round(sum) === 100 ? colors.win : colors.danger }]} {...textScale.badge}>
                  %{Math.round(sum * 100) / 100}
                </Text>
              </View>
              <GradientBar value={sum / 100} height={6} gradient={Math.round(sum) === 100 ? colors.tileTones.mint : sum > 100 ? colors.tileTones.red : undefined} />
            </View>
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
          </GroupCard>
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
      <GroupCard title="Formül versiyonları" icon="git-branch" tone="violet" padded={false}>
        {versions.isLoading ? (
          <SkeletonCard />
        ) : versions.data?.length ? (
          versions.data.map((v, i) => (
            <ListLine
              key={v.id}
              last={i === versions.data!.length - 1}
              leading={<IconTile icon={v.is_active ? "checkmark-circle" : "git-commit-outline"} tone={v.is_active ? "mint" : "neutral"} size={34} glow={false} />}
              title={v.version}
              subtitle={v.name}
              selected={Boolean(v.is_active)}
              pills={[v.is_active && { label: "Aktif", tone: "win" }]}
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
          <Text style={[styles.note, styles.inset]}>Kayıtlı formül versiyonu yok.</Text>
        )}
      </GroupCard>
      <GroupCard title={`Denetim kaydı${audit.data ? ` · son ${audit.data.items?.length ?? 0} / ${audit.data.total ?? 0}` : ""}`} icon="document-text" tone="neutral">
        {audit.isLoading ? (
          <SkeletonCard />
        ) : audit.error ? (
          <ErrorState error={audit.error} onRetry={audit.refetch} variant="inline" />
        ) : audit.data?.items?.length ? (
          audit.data.items.map((a) => (
            <View key={a.id} style={styles.audit}>
              <Touchable onPress={() => setOpen(open === a.id ? null : a.id)} style={styles.auditHead} accessibilityRole="button" accessibilityState={{ expanded: open === a.id }}>
                <View style={styles.auditDot} />
                <View style={styles.flex}>
                  <Text style={styles.auditTitle} numberOfLines={1} {...textScale.dense}>
                    {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                  </Text>
                  <Text style={styles.rankMeta} numberOfLines={1} {...textScale.dense}>
                    {[a.user_name || (a.user_id ? `Kullanıcı #${a.user_id}` : "Sistem"), formatDateTime(a.createdAt)].join(" · ")}
                  </Text>
                </View>
                <Ionicons name={open === a.id ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} />
              </Touchable>
              {open === a.id ? (
                <Text style={styles.code} selectable {...textScale.long}>
                  {auditJson(a.new_data)}
                </Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.note}>Henüz kayıt yok.</Text>
        )}
      </GroupCard>
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

/** Kısa değer: 18.450 → "18,5B". */
function compactEtl(value: unknown): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}B`;
  return String(Math.round(n));
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  inset: { paddingHorizontal: space.lg, paddingBottom: space.md },
  statRow: { gap: space.xs, paddingVertical: space.xs },
  note: { ...type.bodySm, color: colors.textSecondary },
  warn: { ...type.caption, color: colors.danger, textAlign: "center" },
  code: { ...type.caption, color: colors.textSecondary, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  sumBox: { gap: space.s, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  sumHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sumValue: { ...type.scoreSm },
  weight: { gap: space.xs },
  rank: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 68,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rankTop: { borderColor: colors.brandBorder },
  rankNo: { ...type.tableNumStrong, color: colors.textTertiary, width: 28, textAlign: "center" },
  rankMain: { flex: 1, minWidth: 0, gap: 2 },
  rankName: { ...type.h4, color: colors.textPrimary },
  rankMeta: { ...type.caption, color: colors.textTertiary },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  scoreText: { ...type.numSm, color: colors.textSecondary, width: 20, textAlign: "right" },
  rankValue: { alignItems: "flex-end", minWidth: 64 },
  value: { ...type.scoreSm, color: colors.textPrimary },
  delta: { ...type.numSmStrong },
  deltaFlat: { ...type.micro, color: colors.textTertiary },
  audit: { gap: space.xs, paddingVertical: space.xs },
  auditHead: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44 },
  auditDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.brandAccent },
  auditTitle: { ...type.label, color: colors.textPrimary },
});
