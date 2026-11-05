/**
 * Kadro listesi incelemesi (web editor_pages/rosters/SubmissionReview.js).
 *
 * Takımın "Tüm Oyuncularım" listesi: yönetici BU TAKIMDAKİ maç sayılarıyla
 * (misafir maçlar dahil) her çıkarma ve transfer kalemini tek tek onaylar ya
 * da reddeder.
 *   Çıkarma onayı  → oyuncu kadrodan çıkar (aktif sözleşme feshedilir)
 *   Transfer onayı → yönetim onayı bekleyen teklif onaylanır
 *   Transfer reddi → açık teklif geri çekilir
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Panel, RecordCard, SelectField, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, ErrorState, Input, SkeletonCard, TeamLogo } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { decideRosterSubmission, getRosterSubmission, type PlayerTeamStats, type SubmissionItem } from "@/lib/api/admin/rosters";
import { money } from "@/lib/api/admin/transfers";
import { colors, space, textScale, type } from "@/theme";

type Choice = { decision?: "approved" | "rejected" | null; note?: string };

const statsLine = (s?: PlayerTeamStats | null) =>
  !s
    ? "Bu takımda maçı yok"
    : `${s.matches} maç · ${s.goals} gol · ${s.guest_matches || 0} misafir${s.last_match_at ? ` · son: ${formatDate(s.last_match_at)}` : ""}`;

export function SubmissionReviewSheet({
  id,
  onClose,
  invalidate,
}: {
  id: number | null;
  onClose: () => void;
  invalidate: readonly (readonly unknown[])[];
}) {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    setChoices({});
    setNote("");
    setSeasonId(null);
  }, [id]);

  const detail = useQuery({
    queryKey: ["admin", "rosters", "submission", id, seasonId],
    queryFn: () => getRosterSubmission(id!, seasonId),
    enabled: id != null,
  });

  const items = detail.data?.items ?? [];
  const pendingItems = items.filter((i) => i.decision === "pending");
  const chosen = Object.entries(choices)
    .filter(([, v]) => v?.decision)
    .map(([index, v]) => ({ index: Number(index), decision: v.decision as "approved" | "rejected", note: v.note || "" }));

  const save = useAdminMutation(() => decideRosterSubmission(id!, chosen, note), {
    success: (r) => {
      const failed = (r.results || []).filter((x) => x.result?.error).length;
      return failed ? `${r.message} ${failed} kalem uygulanamadı.` : r.message;
    },
    invalidate: [...invalidate, ["admin", "rosters", "submission", id]],
    onSuccess: () => setChoices({}),
  });

  const setAll = (decision: "approved" | "rejected") =>
    setChoices(Object.fromEntries(pendingItems.map((i) => [i.index, { ...(choices[i.index] || {}), decision }])));

  const askSave = async () => {
    const approvals = chosen.filter((c) => c.decision === "approved");
    const removeCount = approvals.filter((c) => items.find((i) => i.index === c.index)?.type === "remove").length;
    const addCount = approvals.filter((c) => items.find((i) => i.index === c.index)?.type === "add").length;
    const ok = await confirmAction({
      title: "Kararlar kaydedilsin mi?",
      message: [
        `${chosen.length} kalem için karar kaydedilecek.`,
        `${removeCount} oyuncu kadrodan çıkarılacak (aktif sözleşme feshedilir).`,
        `${addCount} transfere izin verilecek; reddedilen açık teklifler geri çekilir.`,
        chosen.length < pendingItems.length
          ? `${pendingItems.length - chosen.length} kalem karar bekliyor olarak kalacak.`
          : "Tüm kalemler sonuçlanacak; takıma bildirim gider.",
      ].join("\n"),
      confirmLabel: "Kaydet",
      destructive: chosen.some((c) => c.decision === "rejected"),
    });
    if (ok) save.mutate(undefined);
  };

  const data = detail.data;
  const removals = items.filter((i) => i.type === "remove");
  const adds = items.filter((i) => i.type === "add");

  const renderItem = (item: SubmissionItem) => {
    const choice = choices[item.index];
    const a = item.addition;
    const sub =
      item.type === "remove"
        ? [
            statsLine(item.player?.stats),
            item.player?.has_active_contract ? "Aktif sözleşmeli (onayda feshedilir)" : "Sözleşmesiz",
            item.player?.has_linked_account ? "Üye hesabı bağlı" : "Hesapsız",
            item.player?.is_loan ? "Kiralık" : null,
            item.note ? `Takım notu: “${item.note}”` : null,
          ]
        : [
            item.player?.current_team ? `Şu anki takımı: ${item.player.current_team}` : "Serbest oyuncu",
            item.kind === "invite"
              ? "Kadro daveti"
              : `${a?.terms?.transfer_type === "loan" ? "Kiralık" : "Transfer"} · bonservis ${money(a?.terms?.transfer_fee, a?.terms?.currency || "TRY")}`,
            a?.terms?.contract_end_date ? `sözleşme bitişi ${formatDate(a.terms.contract_end_date)}` : null,
            `Bu takımdaki geçmişi: ${statsLine(item.team_stats)}`,
            a
              ? a.awaiting_admin
                ? "Teklif yönetim onayı bekliyor (onay transferi tamamlar)"
                : a.kind === "invite"
                  ? "Davet oyuncu yanıtı bekliyor"
                  : `Teklif durumu: ${a.status}`
              : "Teklif artık açık değil",
          ];
    return (
      <RecordCard
        key={item.index}
        title={item.player?.player_name ?? `Oyuncu #${item.player_id}`}
        subtitle={sub.filter(Boolean).join(" · ")}
        numberOfLines={4}
        avatar={{ name: item.player?.player_name, image: item.player?.player_img }}
        badges={
          item.decision !== "pending"
            ? [
                { label: item.decision === "approved" ? "Onaylandı" : "Reddedildi", tone: item.decision === "approved" ? "win" : "danger" },
                item.result?.error ? { label: `Uygulanamadı: ${item.result.error}`, tone: "warn" } : null,
              ]
            : []
        }
      >
        {item.decision === "pending" ? (
          <View style={styles.decision}>
            <ChipGroup>
              <Chip
                label="İzin ver"
                icon="checkmark"
                size="sm"
                selected={choice?.decision === "approved"}
                onPress={() => setChoices((c) => ({ ...c, [item.index]: { ...choice, decision: choice?.decision === "approved" ? null : "approved" } }))}
              />
              <Chip
                label="Reddet"
                icon="close"
                size="sm"
                selected={choice?.decision === "rejected"}
                onPress={() => setChoices((c) => ({ ...c, [item.index]: { ...choice, decision: choice?.decision === "rejected" ? null : "rejected" } }))}
              />
            </ChipGroup>
            {choice?.decision ? (
              <Input
                value={choice.note ?? ""}
                onChangeText={(t) => setChoices((c) => ({ ...c, [item.index]: { ...choice, note: t } }))}
                placeholder={choice.decision === "rejected" ? "Ret gerekçesi" : "Not (isteğe bağlı)"}
                accessibilityLabel="Kalem notu"
              />
            ) : null}
          </View>
        ) : item.decision_note ? (
          <Text style={styles.muted} {...textScale.dense}>
            “{item.decision_note}”
          </Text>
        ) : null}
      </RecordCard>
    );
  };

  return (
    <BottomSheet
      visible={id != null}
      onClose={onClose}
      title={data ? `Kadro listesi #${data.submission.id}` : "Kadro listesi"}
      snap="full"
      footer={
        pendingItems.length ? (
          <View style={styles.footer}>
            <Button label={`Kararları kaydet (${chosen.length}/${pendingItems.length})`} icon="save-outline" onPress={() => void askSave()} disabled={!chosen.length} loading={save.isPending} fullWidth haptic="success" />
          </View>
        ) : undefined
      }
    >
      {detail.isLoading ? (
        <SkeletonCard />
      ) : detail.error || !data ? (
        <ErrorState error={detail.error ?? new Error("Kadro listesi alınamadı.")} onRetry={detail.refetch} variant="inline" />
      ) : (
        <View style={styles.stack}>
          <View style={styles.head}>
            <TeamLogo name={data.team?.team_name} logo={data.team?.logo} size={44} />
            <View style={styles.grow}>
              <Text style={styles.title} {...textScale.dense}>
                {data.team?.team_name}
              </Text>
              <Text style={styles.muted} {...textScale.dense}>
                {[
                  data.team?.city,
                  `${data.players.length} oyuncu`,
                  `gönderim: ${formatDate(data.submission.submitted_at)}`,
                  data.submission.submitted_by
                    ? `gönderen: ${data.submission.submitted_by.fullName || data.submission.submitted_by.username}${data.submission.submitted_by.phone ? ` (${data.submission.submitted_by.phone})` : ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
          {data.submission.note ? (
            <Text style={styles.quote} {...textScale.long}>
              Takımın notu: “{data.submission.note}”
            </Text>
          ) : null}

          {pendingItems.length ? (
            <View style={styles.row}>
              <Button label="Tümüne izin ver" size="sm" variant="secondary" onPress={() => setAll("approved")} />
              <Button label="Tümünü reddet" size="sm" variant="ghost" onPress={() => setAll("rejected")} />
            </View>
          ) : null}

          <Panel title={`ÇIKARILMAK İSTENEN · ${removals.length}`}>
            {removals.length ? removals.map(renderItem) : <Text style={styles.muted}>Çıkarma talebi yok.</Text>}
          </Panel>
          <Panel title={`TRANSFER EDİLMEK İSTENEN · ${adds.length}`}>
            {adds.length ? adds.map(renderItem) : <Text style={styles.muted}>Transfer talebi yok.</Text>}
          </Panel>

          {pendingItems.length ? (
            <Input label="Takıma genel not" value={note} onChangeText={setNote} multiline placeholder="İsteğe bağlı" />
          ) : null}

          <Panel title={`TAKIMIN TÜM KADROSU · ${data.players.length}`}>
            {data.seasons?.length ? (
              <SelectField<number>
                value={seasonId}
                onChange={setSeasonId}
                options={data.seasons.map((s) => ({ value: s.id, label: `${s.label} (${s.matches} maç)` }))}
                placeholder="Maçlar: tüm sezonlar"
                clearable
                sheetTitle="Sezon"
              />
            ) : null}
            {data.players.map((p) => (
              <RecordCard
                key={p.id}
                title={`${p.jersey_number ? `#${p.jersey_number} ` : ""}${p.player_name}`}
                subtitle={`${p.stats.matches} maç · ${p.stats.goals} gol · ${p.stats.guest_matches || 0} misafir · son: ${p.stats.last_match_at ? formatDate(p.stats.last_match_at) : "—"}`}
                meta={p.stats.seasons?.length ? p.stats.seasons.map((s) => `${s.label}: ${s.matches}`).join(" · ") : null}
                avatar={{ name: p.player_name, image: p.player_img }}
                badges={[
                  { label: p.has_active_contract ? "Sözleşmeli" : "Sözleşmesiz", tone: p.has_active_contract ? "win" : "neutral" },
                  !p.has_linked_account && { label: "Hesapsız" },
                  p.is_loan && { label: "Kiralık", tone: "warn" },
                  p.marked_for_removal && { label: "Çıkarılacak", tone: "danger" },
                ]}
              />
            ))}
          </Panel>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1 },
  row: { flexDirection: "row", gap: space.sm },
  footer: { flexDirection: "row" },
  decision: { gap: space.xs, marginTop: space.xs },
  title: { ...type.h3, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  quote: { ...type.bodySm, color: colors.textSecondary, fontStyle: "italic" },
});
