/**
 * TAKIM FİNANS AYRINTISI — web TeamFinanceAdmin.js detay paneli
 * (+ editor_pages/TeamFinanceSection.js özeti).
 *
 *   Finansal özet  : kadro toplam değeri, satış geliri, alım gideri, net harcama
 *   FFP            : sınır kullanımı (değer / sınır, yüzde, durum)
 *   Kadro          : oyuncular ve piyasa değerleri
 *   Kasa hareketleri: transfer ve düzeltme kayıtları; team_finance.manage ile
 *                    düzeltme eklenir ve yalnız düzeltme kayıtları silinir (onaylı).
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AdminScreen, Panel, RecordCard, StatRow, confirmAction, useAdminMutation } from "@/components/admin";
import { TeamEntrySheet } from "@/components/admin/accounting/TeamFinanceSheets";
import { BarRow, Muted } from "@/components/admin/accounting/parts";
import { LineRow, StageChip, ToolStage } from "@/components/admin/tools/ToolKit";
import { Button, EmptyState, Reveal, SkeletonCard } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  ENTRY_TYPE_LABELS,
  FFP_CHECK_LABELS,
  FFP_STATUS_LABELS,
  FFP_TONE,
  INCOME_TYPES,
  MANUAL_TYPES,
  TEAM_FINANCE_PERMISSIONS,
  addTeamFinanceEntry,
  removeTeamFinanceEntry,
  teamFinanceDetail,
  teamMoney,
  type TeamFinanceEntry,
} from "@/lib/api/admin/teamFinance";
import { formatEtl } from "@/lib/api/marketValue";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

export default function TeamFinanceDetailScreen() {
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const canManage = hasAnyPermission(auth.user, ["team_finance.manage"]);
  const [adding, setAdding] = useState(false);
  const query = useQuery({ queryKey: ["admin", "team-finance", "team", teamId], queryFn: () => teamFinanceDetail(teamId), enabled: Number.isFinite(teamId) });
  const d = query.data;
  const invalidate = [["admin", "team-finance"]];
  const add = useAdminMutation((body: Parameters<typeof addTeamFinanceEntry>[1]) => addTeamFinanceEntry(teamId, body), { success: "Kasa kaydı eklendi.", invalidate, silentError: true });
  const remove = useAdminMutation((e: TeamFinanceEntry) => removeTeamFinanceEntry(e.id), { success: "Kayıt silindi.", invalidate });

  const askRemove = async (e: TeamFinanceEntry) => {
    if (await confirmAction({ title: "Kayıt silinsin mi?", message: `${ENTRY_TYPE_LABELS[e.entryType]} · ${teamMoney(e.amount, e.currency || "TRY")} silinecek.`, confirmLabel: "Sil", destructive: true })) remove.mutate(e);
  };

  return (
    <AdminScreen
      title={d?.team.teamName || "Takım finansı"}
      subtitle={d ? [d.team.city, d.team.league, d.team.season].filter(Boolean).join(" · ") || undefined : undefined}
      permission={TEAM_FINANCE_PERMISSIONS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
    >
      {query.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : !d ? (
        <EmptyState icon="wallet-outline" title="Takım detayı yüklenemedi" body={query.error ? errorText(query.error) : undefined} action={{ label: "Tekrar dene", onPress: () => void query.refetch() }} variant="inline" />
      ) : (
        <>
          <Reveal index={0}>
            <ToolStage
              icon="shield-half"
              tone="gold"
              overline="Kadro toplam değeri"
              value={formatEtl(d.squadValue)}
              caption={[d.team.league, d.team.season].filter(Boolean).join(" · ") || null}
              chips={
                <>
                  <StageChip icon="shield-checkmark-outline" tone={d.ffp.status === "BREACH" ? "danger" : d.ffp.status === "WARNING" ? "warn" : d.ffp.status === "COMPLIANT" ? "win" : "plain"} label={FFP_STATUS_LABELS[d.ffp.status] || d.ffp.status} />
                  <StageChip icon="people-outline" label={`${d.playerCount} aktif oyuncu`} />
                </>
              }
              stats={[
                { label: "Satış geliri", value: teamMoney(d.totals.income, "").trim(), tone: "win" },
                { label: "Alım gideri", value: teamMoney(d.totals.expense, "").trim(), tone: "danger" },
                { label: "Net harcama", value: teamMoney(d.totals.netSpend, "").trim(), tone: d.totals.netSpend > 0 ? "warn" : "win" },
              ]}
            />
          </Reveal>

          {d.ffp.enabled && d.ffp.checks.length ? (
            <Panel title="FFP sınır kullanımı">
              {d.ffp.checks.map((c) => {
                const infinite = c.usagePct === Infinity || c.usagePct == null;
                const pct = infinite ? 100 : Math.max(0, Math.min(100, c.usagePct));
                const st = String(c.status || "").toUpperCase() as keyof typeof FFP_TONE;
                return (
                  <BarRow
                    key={c.key}
                    label={FFP_CHECK_LABELS[c.key] || c.key}
                    value={`%${infinite ? "∞" : c.usagePct}`}
                    ratio={pct / 100}
                    tone={FFP_TONE[st] || "brand"}
                    sub={`${Math.round(Number(c.value)).toLocaleString("tr-TR")} / ${Math.round(Number(c.limit)).toLocaleString("tr-TR")}`}
                  />
                );
              })}
            </Panel>
          ) : null}

          <Panel title={`Kadro (${d.playerCount} oyuncu)`}>
            {d.squad.length ? (
              <View>
                {d.squad.map((p) => (
                  <LineRow
                    key={p.id}
                    avatar={{ name: p.playerName, image: p.image }}
                    title={p.playerName}
                    sub={p.position || "—"}
                    meta={p.globalRank ? `Genel sıra #${p.globalRank}` : null}
                    value={p.marketValue != null ? formatEtl(p.marketValue) : "—"}
                    valueTone="accent"
                  />
                ))}
              </View>
            ) : (
              <Muted>Aktif oyuncu yok.</Muted>
            )}
          </Panel>

          <Panel title="Kasa hareketleri">
            {canManage ? <Button label="Düzeltme kaydı ekle" icon="add" variant="secondary" onPress={() => setAdding(true)} /> : null}
            {d.entries.length ? (
              d.entries.map((e) => {
                const income = INCOME_TYPES.includes(e.entryType);
                const manual = MANUAL_TYPES.includes(e.entryType);
                return (
                  <RecordCard
                    key={e.id}
                    title={ENTRY_TYPE_LABELS[e.entryType] || e.entryType}
                    subtitle={[e.playerName, e.counterpartyTeamName, e.description].filter(Boolean).join(" · ") || "—"}
                    meta={e.createdAt ? formatDate(e.createdAt) : null}
                    icon={income ? "arrow-down" : "arrow-up"}
                    iconTone={income ? "win" : "danger"}
                    value={`${income ? "+" : "−"}${teamMoney(e.amount, e.currency || "TRY")}`}
                    valueTone={income ? "win" : "danger"}
                    badges={[manual ? { label: "Elle düzeltme", tone: "neutral" } : { label: "Transfer", tone: "info" }]}
                  >
                    {canManage && manual ? (
                      <View style={styles.inline}>
                        <Button label="Sil" icon="trash-outline" size="sm" variant="danger" onPress={() => void askRemove(e)} />
                      </View>
                    ) : null}
                  </RecordCard>
                );
              })
            ) : (
              <Muted>Henüz kasa hareketi yok. Transfer bonservisleri sözleşme yürürlüğe girince otomatik işlenir.</Muted>
            )}
          </Panel>
          <TeamEntrySheet visible={adding} onClose={() => setAdding(false)} teamName={d.team.teamName} onSubmit={(body) => add.mutateAsync(body)} />
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  inline: { flexDirection: "row", marginTop: space.xs },
});
