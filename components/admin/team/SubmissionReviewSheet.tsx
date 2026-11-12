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

import Ionicons from "@expo/vector-icons/Ionicons";

import { SelectField, confirmAction, useAdminMutation } from "@/components/admin";
import { Badge, BottomSheet, Button, ErrorState, GradientBar, Input, SkeletonCard, TeamLogo, Touchable } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { decideRosterSubmission, getRosterSubmission, type PlayerTeamStats, type SubmissionItem } from "@/lib/api/admin/rosters";
import { money } from "@/lib/api/admin/transfers";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { DangerNote, GroupCard, ListLine, PositionAvatar } from "./ManageKit";

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
    const facts = sub.filter(Boolean) as string[];
    const set = (decision: "approved" | "rejected") =>
      setChoices((c) => ({ ...c, [item.index]: { ...choice, decision: choice?.decision === decision ? null : decision } }));
    return (
      <View key={item.index} style={[styles.item, choice?.decision === "approved" ? styles.itemOk : choice?.decision === "rejected" ? styles.itemNo : null]}>
        <View style={styles.itemHead}>
          <PositionAvatar name={item.player?.player_name} image={item.player?.player_img} position={item.player?.player_position} size={38} />
          <View style={styles.grow}>
            <Text style={styles.itemTitle} numberOfLines={1} {...textScale.dense}>
              {item.player?.player_name ?? `Oyuncu #${item.player_id}`}
            </Text>
            <Text style={styles.itemFirst} numberOfLines={2} {...textScale.dense}>
              {facts[0]}
            </Text>
          </View>
          {item.decision !== "pending" ? (
            <Badge label={item.decision === "approved" ? "Onaylandı" : "Reddedildi"} tone={item.decision === "approved" ? "win" : "danger"} size="xs" />
          ) : null}
        </View>
        {facts.slice(1).map((f) => (
          <View key={f} style={styles.fact}>
            <View style={styles.factDot} />
            <Text style={styles.factText} {...textScale.dense}>
              {f}
            </Text>
          </View>
        ))}
        {item.result?.error ? <Badge label={`Uygulanamadı: ${item.result.error}`} tone="warn" size="xs" /> : null}
        {item.decision === "pending" ? (
          <>
            <View style={styles.toggle}>
              <Touchable
                feedback="card"
                haptic="selection"
                onPress={() => set("rejected")}
                style={[styles.toggleHalf, choice?.decision === "rejected" ? styles.toggleNo : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: choice?.decision === "rejected" }}
              >
                <Ionicons name="close" size={16} color={choice?.decision === "rejected" ? colors.danger : colors.textSecondary} />
                <Text style={[styles.toggleText, choice?.decision === "rejected" ? { color: colors.danger } : null]} {...textScale.dense}>
                  Reddet
                </Text>
              </Touchable>
              <Touchable
                feedback="card"
                haptic="selection"
                onPress={() => set("approved")}
                style={[styles.toggleHalf, choice?.decision === "approved" ? styles.toggleOk : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: choice?.decision === "approved" }}
              >
                <Ionicons name="checkmark" size={16} color={choice?.decision === "approved" ? colors.win : colors.textSecondary} />
                <Text style={[styles.toggleText, choice?.decision === "approved" ? { color: colors.win } : null]} {...textScale.dense}>
                  İzin ver
                </Text>
              </Touchable>
            </View>
            {choice?.decision ? (
              <Input
                value={choice.note ?? ""}
                onChangeText={(t) => setChoices((c) => ({ ...c, [item.index]: { ...choice, note: t } }))}
                placeholder={choice.decision === "rejected" ? "Ret gerekçesi" : "Not (isteğe bağlı)"}
                accessibilityLabel="Kalem notu"
              />
            ) : null}
          </>
        ) : item.decision_note ? (
          <Text style={styles.quote} {...textScale.dense}>
            “{item.decision_note}”
          </Text>
        ) : null}
      </View>
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
            <Button label={`Kararları kaydet · ${chosen.length}/${pendingItems.length}`} icon="save-outline" size="lg" onPress={() => void askSave()} disabled={!chosen.length} loading={save.isPending} fullWidth haptic="success" />
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
            <TeamLogo name={data.team?.team_name} logo={data.team?.logo} size={52} />
            <View style={styles.grow}>
              <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                {data.team?.team_name}
              </Text>
              <Text style={styles.muted} numberOfLines={2} {...textScale.dense}>
                {[data.team?.city, `${data.players.length} oyuncu`, `gönderim ${formatDate(data.submission.submitted_at)}`].filter(Boolean).join(" · ")}
              </Text>
              {data.submission.submitted_by ? (
                <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                  Gönderen: {data.submission.submitted_by.fullName || data.submission.submitted_by.username}
                  {data.submission.submitted_by.phone ? ` · ${data.submission.submitted_by.phone}` : ""}
                </Text>
              ) : null}
            </View>
          </View>

          {pendingItems.length ? (
            <View style={styles.progress}>
              <View style={styles.progressHead}>
                <Text style={styles.progressLabel} {...textScale.dense}>
                  Karar verilen kalem
                </Text>
                <Text style={styles.progressValue} {...textScale.badge}>
                  {chosen.length}
                  <Text style={styles.progressOf}> / {pendingItems.length}</Text>
                </Text>
              </View>
              <GradientBar value={pendingItems.length ? chosen.length / pendingItems.length : 0} />
              <View style={styles.row}>
                <Button label="Tümüne izin ver" icon="checkmark-done" size="sm" variant="secondary" onPress={() => setAll("approved")} style={styles.grow} />
                <Button label="Tümünü reddet" icon="close" size="sm" variant="ghost" onPress={() => setAll("rejected")} style={styles.grow} />
              </View>
            </View>
          ) : null}

          {data.submission.note ? <DangerNote tone="info" icon="chatbox-ellipses" title="Takımın notu" body={`“${data.submission.note}”`} /> : null}

          <GroupCard title={`Çıkarılmak istenen · ${removals.length}`} icon="person-remove" tone="red">
            {removals.length ? removals.map(renderItem) : <Text style={styles.muted}>Çıkarma talebi yok.</Text>}
          </GroupCard>
          <GroupCard title={`Transfer edilmek istenen · ${adds.length}`} icon="person-add" tone="mint">
            {adds.length ? adds.map(renderItem) : <Text style={styles.muted}>Transfer talebi yok.</Text>}
          </GroupCard>

          {pendingItems.length ? <Input label="Takıma genel not" value={note} onChangeText={setNote} multiline placeholder="İsteğe bağlı" /> : null}

          <GroupCard title={`Takımın tüm kadrosu · ${data.players.length}`} icon="people" tone="violet" padded={false}>
            {data.seasons?.length ? (
              <View style={styles.inset}>
                <SelectField<number>
                  value={seasonId}
                  onChange={setSeasonId}
                  options={data.seasons.map((x) => ({ value: x.id, label: `${x.label} (${x.matches} maç)` }))}
                  placeholder="Maçlar: tüm sezonlar"
                  clearable
                  sheetTitle="Sezon"
                />
              </View>
            ) : null}
            <View style={styles.listFoot}>
              {data.players.map((p, i) => (
                <ListLine
                  key={p.id}
                  leading={<PositionAvatar name={p.player_name} image={p.player_img} position={p.profile_position} jersey={p.jersey_number} size={34} />}
                  title={p.player_name}
                  subtitle={`${p.stats.matches} maç · ${p.stats.goals} gol · ${p.stats.guest_matches || 0} misafir · son ${p.stats.last_match_at ? formatDate(p.stats.last_match_at, false) : "—"}`}
                  pills={[
                    { label: p.has_active_contract ? "Sözleşmeli" : "Sözleşmesiz", tone: p.has_active_contract ? "win" : "neutral" },
                    !p.has_linked_account && { label: "Hesapsız" },
                    p.is_loan && { label: "Kiralık", tone: "warn" },
                    p.marked_for_removal && { label: "Çıkarılacak", tone: "danger" },
                  ]}
                  muted={p.marked_for_removal}
                  last={i === data.players.length - 1}
                />
              ))}
            </View>
          </GroupCard>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: space.sm },
  footer: { flexDirection: "row" },
  title: { ...type.h2, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  quote: { ...type.bodySm, color: colors.textSecondary },
  inset: { paddingHorizontal: space.lg },
  listFoot: { paddingBottom: space.xs },
  progress: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface2 },
  progressHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  progressLabel: { ...type.labelSm, color: colors.textSecondary },
  progressValue: { ...type.scoreSm, color: colors.textPrimary },
  progressOf: { ...type.numSm, color: colors.textTertiary },
  item: { gap: space.s, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  itemOk: { borderColor: colors.win },
  itemNo: { borderColor: colors.danger },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  itemTitle: { ...type.h4, color: colors.textPrimary },
  itemFirst: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
  fact: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", paddingLeft: space.xs },
  factDot: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: colors.textTertiary, marginTop: 7 },
  factText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  toggle: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  toggleHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  toggleOk: { backgroundColor: colors.winDim, borderColor: colors.win },
  toggleNo: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  toggleText: { ...type.label, color: colors.textSecondary },
});
