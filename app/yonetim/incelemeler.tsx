/**
 * İNCELEMELER — maç ve konu incelemeleri (web: Disiplin masası ▸ Süreçler).
 *
 * Disiplin süreci üç biçimde başlatılır: oyuncu sevki (Cezalar ▸ Yeni ceza),
 * maç incelemesi ve konu incelemesi. Bu ekran son ikisini yönetir:
 *   · "İnceleme başlat": maç (il → lig → sezon → maç) ya da konu (başlık + tarih)
 *   · satıra dokununca karar yazılır ve açıklanır; inceleme arşive alınır.
 *     Kalıcı silme yalnız admin rolünde.
 *   · tarafların (maçın takımları, belirtilen takım / oyuncu) inceleme sürerken
 *     yazdığı savunmalar aynı sayfada okunur ve değerlendirilir.
 *   · aşamalar oyuncu dosyalarındaki kurul kararı → CAS sırasının karşılığıdır:
 *     inceleme → Disiplin Kurulu kararı → karara itiraz (CAS başvurusu) → CAS kararı.
 *   · süreç herkese açık ya da kapalı (yalnız ilgili taraflar / yalnız başvuran
 *     takım) yürütülebilir; kurul taraf adına savunma ve itiraz girebilir.
 * Başvuru üzerine başlatılan incelemeler Takım itirazları ekranından açılır.
 *
 * VERİ: GET/POST /api/penalties/admin/inquiries, PATCH …/:id, POST …/:id/archive
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, SelectField, useAdminMutation } from "@/components/admin";
import { ScopeSelects, type ScopeValue } from "@/components/admin/penalties/ScopeSelects";
import { PartyEntryCard, VisibilityCard } from "@/components/admin/penalties/ProcessTools";
import { DangerNote, GroupCard, RequestCard } from "@/components/admin/team/ManageKit";
import { Badge, BottomSheet, Button, Chip, ChipGroup, FAB, IconTile, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  adminInquiryDefense,
  archiveInquiry,
  createInquiry,
  deleteInquiry,
  listInquiries,
  listPenaltyMatches,
  reviewInquiryDefense,
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
            <Chip label="CAS kararı" size="sm" selected={filter === "decided"} onPress={() => setFilter("decided")} />
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
            priority={item.is_decided ? null : { label: item.pending_defense_count ? `${item.pending_defense_count} kayıt bekliyor` : item.status_label, tone: "warn", icon: "hourglass" }}
            status={item.is_decided ? { label: "CAS kararı", tone: "win" } : item.visibility && item.visibility !== "public" ? { label: "Kapalı süreç", tone: "neutral" } : null}
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
  const [interim, setInterim] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setDecision(inquiry?.decision_text ?? "");
    setInterim(inquiry?.interim_text ?? "");
    setFailure(null);
  }, [inquiry?.public_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = { invalidate: [["admin", "penalties"]] as [string, string][], onSuccess: onClose };
  const closed = Boolean(inquiry?.visibility && inquiry.visibility !== "public");
  const interimAnnounced = Boolean(inquiry) && inquiry!.status !== "open";
  const canObject = inquiry?.status === "interim" || inquiry?.status === "objected";
  const announce = useAdminMutation((text: string) => updateInquiry(inquiry!.public_id, { status: "decided", decision_text: text }), {
    ...options,
    success: closed ? "CAS kararı açıklandı ve ilgili taraflara bildirildi." : "CAS kararı açıklandı ve disiplin sayfasında yayımlandı.",
    silentError: true,
  });
  const announceInterim = useAdminMutation(
    () => updateInquiry(inquiry!.public_id, { status: inquiry!.status === "objected" ? undefined : "interim", interim_text: interim.trim() }),
    { ...options, success: () => (interimAnnounced ? "Disiplin Kurulu kararı güncellendi." : "Disiplin Kurulu kararı açıklandı; taraflar itiraz edebilir."), silentError: true }
  );
  const visibility = useAdminMutation((next: "public" | "teams" | "team") => updateInquiry(inquiry!.public_id, { visibility: next }), {
    ...options,
    success: "Görünürlük güncellendi.",
  });
  const entry = useAdminMutation(
    (vars: { kind: "defense" | "objection"; party: string; text: string }) => {
      const party = (inquiry!.parties ?? [])[Number(vars.party)];
      return adminInquiryDefense(inquiry!.public_id, { kind: vars.kind, side: party.side, team_id: party.team_id, text: vars.text });
    },
    { invalidate: [["admin", "penalties"]], success: "Kayıt taraf adına eklendi." }
  );
  const reopen = useAdminMutation(() => updateInquiry(inquiry!.public_id, { status: "open" }), { ...options, success: "İnceleme yeniden açıldı." });
  const archive = useAdminMutation(() => archiveInquiry(inquiry!.public_id, !inquiry!.is_archived), {
    ...options,
    success: () => (inquiry?.is_archived ? "İnceleme arşivden çıkarıldı." : "İnceleme arşive alındı."),
  });
  const remove = useAdminMutation(() => deleteInquiry(inquiry!.public_id), { ...options, success: "İnceleme kalıcı olarak silindi." });
  // Savunma değerlendirme: savunma id → not.
  const [notes, setNotes] = useState<Record<number, string>>({});
  const review = useAdminMutation(
    (vars: { id: number; status: "accepted" | "rejected" | "noted" }) => reviewInquiryDefense(vars.id, { review_status: vars.status, review_note: (notes[vars.id] ?? "").trim() || null }),
    { ...options, success: "Kayıt değerlendirildi ve ilgili tarafa bildirildi." }
  );

  const submit = async (text = decision) => {
    setFailure(null);
    if (!text.trim()) return setFailure("CAS kararı metni yazılmalıdır.");
    try {
      await announce.mutateAsync(text.trim());
    } catch (error) {
      setFailure(errorText(error));
    }
    return undefined;
  };
  const submitInterim = async () => {
    setFailure(null);
    if (!interim.trim()) return setFailure("Disiplin Kurulu kararı metni yazılmalıdır.");
    try {
      await announceInterim.mutateAsync(undefined);
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
      footer={
        // İlk karar her zaman Disiplin Kurulu kararıdır; CAS kararı ondan sonra verilir.
        interimAnnounced ? (
          <Button label={inquiry?.is_decided ? "CAS kararını güncelle" : "CAS kararını açıkla"} icon="checkmark" size="lg" onPress={() => submit()} loading={announce.isPending} haptic="success" fullWidth />
        ) : (
          <Button label="Disiplin Kurulu kararını açıkla" icon="checkmark" size="lg" onPress={submitInterim} loading={announceInterim.isPending} haptic="success" fullWidth />
        )
      }
    >
      {inquiry ? (
        <View style={styles.body}>
          <Text style={styles.title} {...textScale.dense}>{inquiry.title}</Text>
          <Text style={styles.meta} {...textScale.dense}>
            {[inquiry.status_label, `Başlatıldı ${formatDate(inquiry.createdAt)}`, inquiry.source_appeal_public_id ? "Başvuru üzerine" : "Kurul (resen)"].join(" · ")}
          </Text>
          {inquiry.description ? <Text style={styles.text} {...textScale.long}>{inquiry.description}</Text> : null}
          <VisibilityCard
            value={inquiry.visibility ?? "public"}
            allowed={inquiry.has_source_team ? ["public", "teams", "team"] : ["public", "teams"]}
            onChange={(next) => visibility.mutate(next)}
            pending={visibility.isPending}
          />
          <GroupCard title={`Savunmalar ve itirazlar (${inquiry.defenses?.length ?? 0})`}>
            <Text style={styles.meta} {...textScale.dense}>
              Taraflar: {[...(inquiry.party_team_names ?? []), inquiry.party_player_name].filter(Boolean).join(", ") || "belirtilmedi"}
            </Text>
            {(inquiry.defenses ?? []).map((defense) => (
              <View key={defense.id} style={styles.defense}>
                <View style={styles.row}>
                  <Text style={[styles.defenseWho, styles.grow]} numberOfLines={1} {...textScale.dense}>
                    {defense.side === "player" ? defense.player_name ?? "Oyuncu" : defense.team_name ?? "Takım"}
                  </Text>
                  <Badge label={defense.kind === "objection" ? "İtiraz" : "Savunma"} tone={defense.kind === "objection" ? "danger" : "info"} size="xs" />
                  {defense.entered_by_admin ? <Badge label="Kurul kaydı" tone="neutral" size="xs" /> : null}
                  <Badge label={defense.review_status_label} tone={defense.review_status === "pending" ? "warn" : "neutral"} size="xs" />
                </View>
                <Text style={styles.text} selectable {...textScale.long}>{defense.text}</Text>
                {defense.review_status === "pending" ? (
                  <>
                    <Input value={notes[defense.id] ?? ""} onChangeText={(value) => setNotes((previous) => ({ ...previous, [defense.id]: value }))} placeholder="Değerlendirme notu (yazana iletilir)" />
                    <View style={styles.row}>
                      <Button label="Kabul" size="sm" variant="secondary" onPress={() => review.mutate({ id: defense.id, status: "accepted" })} disabled={review.isPending} style={styles.grow} />
                      <Button label="Ret" size="sm" variant="secondary" onPress={() => review.mutate({ id: defense.id, status: "rejected" })} disabled={review.isPending} style={styles.grow} />
                      <Button label="Dikkate al" size="sm" variant="secondary" onPress={() => review.mutate({ id: defense.id, status: "noted" })} disabled={review.isPending} style={styles.grow} />
                    </View>
                  </>
                ) : (
                  <Text style={styles.meta} {...textScale.dense}>{defense.review_note || "Not yazılmadı."}</Text>
                )}
              </View>
            ))}
          </GroupCard>
          {!inquiry.is_decided ? (
            <PartyEntryCard
              key={`${inquiry.public_id}-${inquiry.defenses?.length ?? 0}`}
              parties={(inquiry.parties ?? []).map((party, index) => ({
                key: String(index),
                label: `${party.name}${party.side === "player" ? " (oyuncu)" : party.is_source ? " (başvuran takım)" : ""}`,
              }))}
              canObject={canObject}
              objectionLabel="CAS başvurusu (itiraz)"
              objectionHint="İtiraz, Disiplin Kurulu kararı açıklandıktan sonra girilebilir."
              onSubmit={(vars) => entry.mutateAsync(vars)}
              pending={entry.isPending}
            />
          ) : null}
          <GroupCard title="Disiplin Kurulu kararı">
            <Input
              label="Disiplin Kurulu kararı metni"
              value={interim}
              onChangeText={setInterim}
              multiline
              numberOfLines={4}
              maxLength={5000}
              placeholder="Disiplin Kurulu kararını yaz. Açıklandığında taraflar bu karara itiraz edebilir."
            />
            <Text style={styles.meta} {...textScale.dense}>
              {inquiry.status === "objected"
                ? "Taraflardan itiraz geldi; itirazı değerlendirip CAS kararını ver."
                : inquiry.status === "interim"
                  ? "Disiplin Kurulu kararı açıklandı; henüz itiraz gelmedi."
                  : inquiry.is_decided
                    ? "CAS kararı açıklandı."
                    : "Taraflar savunma yazmasa da karar verebilirsin. Karara itiraz edilirse dosya CAS'a taşınır."}
            </Text>
            {!inquiry.is_decided ? (
              <View style={styles.row}>
                <Button label={interimAnnounced ? "Disiplin Kurulu kararını güncelle" : "Disiplin Kurulu kararını açıkla"} variant="secondary" size="sm" onPress={submitInterim} loading={announceInterim.isPending} style={styles.grow} />
              </View>
            ) : null}
          </GroupCard>
          <GroupCard title="CAS kararı">
            <Input
              label="CAS kararı metni"
              value={decision}
              onChangeText={setDecision}
              multiline
              numberOfLines={5}
              maxLength={5000}
              placeholder={inquiry.status === "objected" ? "İtirazı değerlendir ve CAS kararını yaz." : "CAS kararını yaz."}
            />
          </GroupCard>
          {failure ? <DangerNote tone="danger" icon="alert-circle" title="Kaydedilemedi" body={failure} /> : null}
          <View style={styles.row}>
            {inquiry.status !== "open" ? <Button label="Yeniden aç" variant="secondary" size="sm" onPress={() => reopen.mutate(undefined)} loading={reopen.isPending} style={styles.grow} /> : null}
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

  const [startVisibility, setStartVisibility] = useState<"public" | "teams">("public");
  const start = useAdminMutation(
    () =>
      kind === "match"
        ? createInquiry({ kind, match_id: matchId, description: description.trim() || null, visibility: startVisibility })
        : createInquiry({ kind, subject: subject.trim(), subject_date: toIsoDate(date), city_id: scope.cityId, league_id: scope.leagueId, season_id: scope.seasonId, description: description.trim() || null, visibility: startVisibility }),
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
          <Input value={description} onChangeText={setDescription} multiline numberOfLines={3} maxLength={5000} placeholder="İncelemenin kapsamı." />
        </GroupCard>
        <VisibilityCard value={startVisibility} allowed={["public", "teams"]} onChange={(next) => setStartVisibility(next === "public" ? "public" : "teams")} />
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
  defense: { gap: space.sm },
  defenseWho: { ...type.label, color: colors.textPrimary },
});
