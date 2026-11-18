/**
 * İNCELEMELER — maç ve konu incelemeleri (web: Disiplin masası ▸ Süreçler).
 *
 * Disiplin süreci üç biçimde başlatılır: oyuncu sevki (Cezalar ▸ Yeni ceza),
 * maç incelemesi ve konu incelemesi. Bu ekran son ikisini yönetir:
 *   · "İnceleme başlat": maç (il → lig → sezon → maç) ya da konu (başlık + tarih)
 *   · satıra dokununca karar yazılır ve açıklanır; inceleme arşive alınır.
 *     Kalıcı silme yalnız admin rolünde.
 * Başvuru üzerine başlatılan incelemeler Takım itirazları ekranından açılır.
 *
 * VERİ: GET/POST /api/penalties/admin/inquiries, PATCH …/:id, POST …/:id/archive
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, SelectField, useAdminMutation } from "@/components/admin";
import { ScopeSelects, type ScopeValue } from "@/components/admin/penalties/ScopeSelects";
import { DangerNote, GroupCard, RequestCard } from "@/components/admin/team/ManageKit";
import { BottomSheet, Button, Chip, ChipGroup, FAB, IconTile, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  archiveInquiry,
  createInquiry,
  deleteInquiry,
  listInquiries,
  listPenaltyMatches,
  updateInquiry,
  type Inquiry,
} from "@/lib/api/admin/penalties";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

type Filter = "open" | "decided" | "archived";

/** "GG.AA.YYYY" → "YYYY-AA-GG" (geçersizse null). */
function toIsoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export default function InquiriesScreen() {
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useQuery({ queryKey: ["admin", "penalties", "inquiries"], queryFn: () => listInquiries({ archived: "all" }) });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const items = useMemo(() => {
    const needle = q.toLocaleLowerCase("tr-TR");
    return all.filter((item) => {
      const inFilter = filter === "archived" ? item.is_archived : !item.is_archived && (filter === "open" ? !item.is_decided : item.is_decided);
      return inFilter && (!needle || `${item.title} ${item.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [all, filter, q]);
  const openCount = all.filter((item) => !item.is_archived && !item.is_decided).length;

  return (
    <AdminScreen
      title="İncelemeler"
      subtitle="Maç ve konu incelemeleri"
      permission={["penalties.view"]}
      scroll={false}
      overlay={<FAB icon="add" label="İnceleme başlat" extended onPress={() => setCreating(true)} accessibilityLabel="İnceleme başlat" />}
    >
      <AdminList<Inquiry>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Maç ya da konu ara"
        extraHeader={
          <ChipGroup scrollable contentPadding={0}>
            <Chip label="Süren" count={openCount} size="sm" selected={filter === "open"} onPress={() => setFilter("open")} />
            <Chip label="Karar açıklanan" size="sm" selected={filter === "decided"} onPress={() => setFilter("decided")} />
            <Chip label="Arşiv" icon="archive-outline" size="sm" selected={filter === "archived"} onPress={() => setFilter("archived")} />
          </ChipGroup>
        }
        keyExtractor={(item) => item.public_id}
        emptyIcon="search-outline"
        emptyTitle="Bu süzgeçte inceleme yok"
        emptyBody={filter === "open" ? "Maç ya da konu incelemesi başlatmak için alttaki düğmeyi kullan." : undefined}
        renderItem={({ item }) => (
          <RequestCard
            leading={<IconTile icon={item.kind === "match" ? "football" : "document-text"} tone={item.is_decided ? "neutral" : "gold"} size={38} glow={false} />}
            who={item.kind_label}
            when={[timeAgo(item.createdAt), item.source_appeal_public_id ? "Başvuru üzerine" : "Kurul"].join(" · ")}
            title={item.title}
            subtitle={item.description}
            priority={item.is_decided ? null : { label: "İnceleme sürüyor", tone: "warn", icon: "hourglass" }}
            status={item.is_decided ? { label: "Karar açıklandı", tone: "win" } : null}
            done={item.is_decided}
            onPress={() => setSelected(item)}
          />
        )}
      />
      <InquirySheet inquiry={selected} onClose={() => setSelected(null)} />
      <StartSheet visible={creating} onClose={() => setCreating(false)} />
    </AdminScreen>
  );
}

/** Karar yazma / açıklama, arşiv ve (yalnız admin) silme. */
function InquirySheet({ inquiry, onClose }: { inquiry: Inquiry | null; onClose: () => void }) {
  const isAdmin = useAuth().user?.role === "admin";
  const [decision, setDecision] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setDecision(inquiry?.decision_text ?? "");
    setFailure(null);
  }, [inquiry?.public_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = { invalidate: [["admin", "penalties"]] as [string, string][], onSuccess: onClose };
  const announce = useAdminMutation(() => updateInquiry(inquiry!.public_id, { status: "decided", decision_text: decision.trim() }), {
    ...options,
    success: "Karar açıklandı ve disiplin sayfasında yayımlandı.",
    silentError: true,
  });
  const reopen = useAdminMutation(() => updateInquiry(inquiry!.public_id, { status: "open" }), { ...options, success: "İnceleme yeniden açıldı." });
  const archive = useAdminMutation(() => archiveInquiry(inquiry!.public_id, !inquiry!.is_archived), {
    ...options,
    success: () => (inquiry?.is_archived ? "İnceleme arşivden çıkarıldı." : "İnceleme arşive alındı."),
  });
  const remove = useAdminMutation(() => deleteInquiry(inquiry!.public_id), { ...options, success: "İnceleme kalıcı olarak silindi." });

  const submit = async () => {
    setFailure(null);
    if (!decision.trim()) return setFailure("Karar metni yazılmalıdır; bu metin disiplin sayfasında yayımlanır.");
    try {
      await announce.mutateAsync(undefined);
    } catch (error) {
      setFailure(errorText(error));
    }
    return undefined;
  };
  const confirmRemove = async () => {
    const sure = await confirmAction({ title: "İnceleme silinsin mi?", message: "Kayıt kalıcı olarak silinir; geri getirilemez.", confirmLabel: "Kalıcı olarak sil", destructive: true });
    if (sure) remove.mutate(undefined);
  };

  return (
    <BottomSheet
      visible={inquiry != null}
      onClose={announce.isPending ? () => undefined : onClose}
      title={inquiry?.kind_label ?? "İnceleme"}
      snap="full"
      footer={<Button label={inquiry?.is_decided ? "Kararı güncelle" : "Kararı açıkla"} icon="checkmark" size="lg" onPress={submit} loading={announce.isPending} haptic="success" fullWidth />}
    >
      {inquiry ? (
        <View style={styles.body}>
          <Text style={styles.title} {...textScale.dense}>{inquiry.title}</Text>
          <Text style={styles.meta} {...textScale.dense}>
            {[inquiry.status_label, `Başlatıldı ${formatDate(inquiry.createdAt)}`, inquiry.source_appeal_public_id ? "Başvuru üzerine" : "Kurul (resen)"].join(" · ")}
          </Text>
          {inquiry.description ? <Text style={styles.text} {...textScale.long}>{inquiry.description}</Text> : null}
          <GroupCard title="Karar">
            <Input
              label="Karar metni (herkese açık yayımlanır)"
              value={decision}
              onChangeText={setDecision}
              multiline
              numberOfLines={5}
              maxLength={5000}
              placeholder="İncelemenin sonucunu yaz."
            />
          </GroupCard>
          {failure ? <DangerNote tone="danger" icon="alert-circle" title="Kaydedilemedi" body={failure} /> : null}
          <View style={styles.row}>
            {inquiry.is_decided ? <Button label="Yeniden aç" variant="secondary" size="sm" onPress={() => reopen.mutate(undefined)} loading={reopen.isPending} style={styles.grow} /> : null}
            <Button
              label={inquiry.is_archived ? "Arşivden çıkar" : "Arşive al"}
              icon={inquiry.is_archived ? "arrow-undo-outline" : "archive-outline"}
              variant="secondary"
              size="sm"
              onPress={() => archive.mutate(undefined)}
              loading={archive.isPending}
              style={styles.grow}
            />
            {isAdmin ? <Button label="Sil" icon="trash-outline" variant="danger" size="sm" onPress={confirmRemove} loading={remove.isPending} style={styles.grow} /> : null}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** İnceleme başlat: maç ya da konu. */
function StartSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<"match" | "topic">("match");
  const [scope, setScope] = useState<ScopeValue>({ cityId: null, leagueId: null, seasonId: null });
  const [matchId, setMatchId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setKind("match");
    setScope({ cityId: null, leagueId: null, seasonId: null });
    setMatchId(null);
    setSubject("");
    setDate("");
    setDescription("");
    setFailure(null);
  }, [visible]);

  const scopeReady = scope.cityId != null && scope.leagueId != null && scope.seasonId != null;
  const matches = useQuery({
    queryKey: ["admin", "penalties", "matches", scope],
    queryFn: () => listPenaltyMatches({ city_id: scope.cityId!, league_id: scope.leagueId!, season_id: scope.seasonId! }),
    enabled: visible && kind === "match" && scopeReady,
  });

  const start = useAdminMutation(
    () =>
      kind === "match"
        ? createInquiry({ kind, match_id: matchId, description: description.trim() || null })
        : createInquiry({ kind, subject: subject.trim(), subject_date: toIsoDate(date), city_id: scope.cityId, league_id: scope.leagueId, season_id: scope.seasonId, description: description.trim() || null }),
    { success: "İnceleme başlatıldı.", invalidate: [["admin", "penalties"]], silentError: true, onSuccess: onClose }
  );
  const submit = async () => {
    setFailure(null);
    if (kind === "match" && !matchId) return setFailure("İncelenecek maçı seç.");
    if (kind === "topic" && !subject.trim()) return setFailure("Konu başlığı yazılmalıdır.");
    try {
      await start.mutateAsync(undefined);
    } catch (error) {
      setFailure(errorText(error));
    }
    return undefined;
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={start.isPending ? () => undefined : onClose}
      title="İnceleme başlat"
      snap="full"
      footer={<Button label="İncelemeyi başlat" icon="checkmark" size="lg" onPress={submit} loading={start.isPending} haptic="success" fullWidth />}
    >
      <View style={styles.body}>
        <ChipGroup>
          <Chip label="Maç hakkında" icon="football" selected={kind === "match"} onPress={() => setKind("match")} />
          <Chip label="Konu hakkında" icon="document-text" selected={kind === "topic"} onPress={() => setKind("topic")} />
        </ChipGroup>
        {kind === "topic" ? (
          <GroupCard title="Konu">
            <Input label="Konu başlığı" value={subject} onChangeText={setSubject} maxLength={255} placeholder="Örn. Instagram paylaşımları" />
            <Input label="Tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
          </GroupCard>
        ) : null}
        <GroupCard title={kind === "match" ? "Maç" : "Kapsam (isteğe bağlı)"}>
          <ScopeSelects
            value={scope}
            required={kind === "match"}
            onChange={(next) => {
              setScope(next);
              setMatchId(null);
            }}
          />
          {kind === "match" ? (
            <SelectField<number>
              label="Maç"
              required
              value={matchId}
              onChange={(value) => setMatchId(value)}
              options={(matches.data ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.date ? formatDate(m.date) : null }))}
              placeholder={scopeReady ? "Maç seç" : "Önce il, lig ve sezon seç"}
              disabled={!scopeReady}
              sheetTitle="Maç seç"
              icon="football-outline"
            />
          ) : null}
        </GroupCard>
        <GroupCard title="Açıklama (isteğe bağlı)">
          <Input value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={5000} placeholder="İncelemenin kapsamı; herkese açık yayımlanır." />
        </GroupCard>
        {failure ? <DangerNote tone="danger" icon="alert-circle" title="Başlatılamadı" body={failure} /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  text: { ...type.body, color: colors.textSecondary },
});
