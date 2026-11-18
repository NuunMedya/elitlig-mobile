/**
 * TAKIM İTİRAZLARI — takımların disiplin kuruluna yaptığı itiraz başvuruları
 * (web /yonetim/admin/itirazlar, AppealInbox.js).
 *
 * NE: ceza dosyasına bağlı OLMAYAN itirazlar (maç sonucu, hakem kararı,
 * oyuncu uygunluğu, organizasyon…). Durum çipleri (bekleyen varsayılan) ve
 * arama. Başvuruya dokununca itirazın tam metni ve karar formu açılır
 * (kabul / kısmen kabul / ret / incelemeye al + karar metni). Sonuçlanmış
 * başvuruda karar okunur ve düzeltilebilir.
 *
 * Karar verilirken SONUCUN KİME DUYURULACAĞI seçilir: yalnız itiraz eden
 * takım, ilgili takımlar (rakip dahil) ya da herkese açık (disiplin sayfası +
 * haberler). Takımın gerekçe metni ve ekleri hiçbir durumda yayımlanmaz.
 *
 * SÜREÇ BAŞLAT: karar sayfasından tek başvuru üzerine üç ayrı süreç açılır —
 * başvuruda adı geçen oyuncu disiplin kuruluna sevk edilir, maç hakkında
 * inceleme başlatılır, başlık + tarihle konu incelemesi açılır. Hepsi başvuruya
 * bağlanır ve sayfada listelenir.
 *
 * BAŞVURU EKLE: kurul, panel dışından iletilen ya da kendiliğinden ele aldığı
 * bir başvuruyu takım adına elle kaydeder (takım → maç → neden → metin).
 * DOSYA AÇ: başvuru bir oyuncu hakkında işlem gerektiriyorsa karar sayfasından
 * ceza dosyası açılır; kapsam ve maç başvurudan doldurulur, dosya başvuruya bağlanır.
 *
 * ARŞİV / SİL: karar sayfasından başvuru arşive alınır (listelerden ve herkese
 * açık sayfadan kalkar, "Arşiv" çipinden geri çıkarılır). Kalıcı silme yalnız
 * admin rolüne gösterilir; sunucu da ayrıca denetler.
 *
 * VERİ: GET /api/penalties/admin/appeals?status=
 *       POST /api/penalties/admin/appeals/:publicId/review
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, SelectField, useAdminMutation, type FilterOption } from "@/components/admin";
import { RadioGroup } from "@/components/admin/penalties/RadioRow";
import { AppealAttachments } from "@/components/discipline/AppealAttachments";
import { CountStrip, DangerNote, FactRow, GroupCard, RequestCard } from "@/components/admin/team/ManageKit";
import { Badge, BottomSheet, Button, Chip, ChipGroup, IconTile, Input, type Tone } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  adminCreateAppeal,
  archiveAppeal,
  createInquiry,
  createPenalty,
  deleteAppeal,
  APPEAL_DECISIONS,
  APPEAL_STATUS_LABELS,
  APPEAL_VISIBILITY_LABELS,
  APPEAL_VISIBILITY_OPTIONS,
  listAppeals,
  listAppealTeamMatches,
  reviewAppeal,
  searchAppealTeams,
  type Appeal,
  type AppealFilter,
  type AppealStatus,
  type AppealVisibility,
} from "@/lib/api/admin/penalties";
import { APPEAL_CATEGORIES, type AppealCategory } from "@/lib/api/panel";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, textScale, type } from "@/theme";

const FILTERS: { key: AppealFilter; label: string }[] = [
  { key: "open", label: "Bekleyen" },
  { key: "accepted", label: "Kabul edilen" },
  { key: "partially_accepted", label: "Kısmen kabul" },
  { key: "rejected", label: "Reddedilen" },
  { key: "", label: "Tümü" },
  { key: "archived", label: "Arşiv" },
];

const STATUS_TONE: Record<AppealStatus, Tone> = {
  pending: "warn",
  in_review: "info",
  accepted: "win",
  partially_accepted: "warn",
  rejected: "danger",
};

type Decision = Exclude<AppealStatus, "pending">;

export default function AppealInboxScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<AppealFilter>("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Appeal | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "penalties", "appeals", filter],
    queryFn: () => listAppeals({ status: filter }),
  });
  // Bekleyen sayacı her filtrede doğru kalsın diye ayrı (hafif) sorgu.
  const open = useQuery({
    queryKey: ["admin", "penalties", "appeals", "open"],
    queryFn: () => listAppeals({ status: "open" }),
    enabled: filter !== "open",
  });

  const items = useMemo(() => {
    const needle = q.toLocaleLowerCase("tr-TR");
    const list = query.data ?? [];
    if (!needle) return list;
    return list.filter((a) =>
      `${a.team_name ?? ""} ${a.subject ?? ""} ${a.match_label ?? ""} ${a.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)
    );
  }, [query.data, q]);

  const openItems = (filter === "open" ? query.data : open.data) ?? [];
  const filters: FilterOption[] = FILTERS.map((f) => ({ ...f, count: f.key === "open" ? openItems.length : undefined }));

  return (
    <AdminScreen
      title="Takım itirazları"
      subtitle="Merkez Disiplin Kurulu"
      permission={["penalties.review"]}
      scroll={false}
      actions={[
        { icon: "add", onPress: () => setCreating(true), accessibilityLabel: "Başvuru ekle" },
        { icon: "document-attach-outline", onPress: () => router.push("/yonetim/savunmalar" as Href), accessibilityLabel: "Savunma ve itirazlar" },
      ]}
    >
      <AdminList<Appeal>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
          if (filter !== "open") void open.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım, başlık ya da maç ara"
        extraHeader={
          <View style={styles.header}>
            <CountStrip
              items={[
                { key: "open", label: "Bekleyen", value: openItems.length, tone: "warn", icon: "hourglass", selected: filter === "open", onPress: () => setFilter("open") },
                { key: "review", label: "İncelenen", value: openItems.filter((a) => a.status === "in_review").length, tone: "info", icon: "search" },
                { key: "listed", label: "Listelenen", value: items.length, icon: "list" },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              {filters.map((f) => (
                <Chip key={f.key || "all"} label={f.label} count={f.count} size="sm" selected={filter === f.key} onPress={() => setFilter(f.key as AppealFilter)} />
              ))}
            </ChipGroup>
          </View>
        }
        keyExtractor={(a) => a.public_id}
        emptyIcon="scale-outline"
        emptyTitle="Bu filtrede itiraz yok"
        emptyBody={filter === "open" ? "Takımların yeni itiraz başvuruları geldiğinde burada görünür." : undefined}
        renderItem={({ item }) => {
          const waiting = !item.is_decided;
          return (
            <RequestCard
              leading={<IconTile icon="scale" tone={waiting ? "gold" : "neutral"} size={38} glow={false} />}
              who={item.team_name || "Takım"}
              when={[timeAgo(item.createdAt), item.match_label].filter(Boolean).join(" · ")}
              priority={waiting ? { label: APPEAL_STATUS_LABELS[item.status], tone: STATUS_TONE[item.status], icon: item.status === "in_review" ? "search" : "hourglass" } : null}
              status={waiting ? null : { label: APPEAL_STATUS_LABELS[item.status], tone: STATUS_TONE[item.status] }}
              title={item.subject || item.category_label}
              subtitle={item.description}
              done={!waiting}
              onPress={() => setSelected(item)}
              extraActions={waiting ? <Button label="Değerlendir" icon="hammer-outline" onPress={() => setSelected(item)} style={styles.grow} /> : null}
            >
              <View style={styles.pills}>
                <Badge label={item.category_label} size="xs" icon="pricetag-outline" />
              </View>
            </RequestCard>
          );
        }}
      />

      <AppealReviewSheet
        appeal={selected}
        onClose={() => setSelected(null)}
        onOpenCase={(appeal) => {
          setSelected(null);
          const query = [
            `basvuru=${encodeURIComponent(appeal.public_id)}`,
            appeal.city_id ? `il=${appeal.city_id}` : null,
            appeal.league_id ? `lig=${appeal.league_id}` : null,
            appeal.season_id ? `sezon=${appeal.season_id}` : null,
            appeal.match_id ? `mac=${appeal.match_id}` : null,
          ].filter(Boolean).join("&");
          router.push(`/yonetim/ceza-yeni?${query}` as Href);
        }}
        onOpenLinked={(publicId) => {
          setSelected(null);
          router.push(`/yonetim/cezalar/${encodeURIComponent(publicId)}` as Href);
        }}
      />
      <AppealCreateSheet visible={creating} onClose={() => setCreating(false)} />
    </AdminScreen>
  );
}

/** İtirazın tam metni + karar formu. Sonuçlanmış başvuruda önce karar okunur. */
function AppealReviewSheet({
  appeal,
  onClose,
  onOpenCase,
  onOpenLinked,
}: {
  appeal: Appeal | null;
  onClose: () => void;
  onOpenCase: (appeal: Appeal) => void;
  onOpenLinked: (publicId: string) => void;
}) {
  const [decision, setDecision] = useState<Decision>("accepted");
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<AppealVisibility>("team");
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isAdmin = useAuth().user?.role === "admin";

  const archive = useAdminMutation(() => archiveAppeal(appeal!.public_id, !appeal!.is_archived), {
    success: () => (appeal?.is_archived ? "Başvuru arşivden çıkarıldı." : "Başvuru arşive alındı."),
    invalidate: [["admin", "penalties", "appeals"]],
    onSuccess: onClose,
  });
  const remove = useAdminMutation(() => deleteAppeal(appeal!.public_id), {
    success: "Başvuru kalıcı olarak silindi.",
    invalidate: [["admin", "penalties", "appeals"]],
    onSuccess: onClose,
  });
  // Süreç başlat: oyuncu sevki · maç incelemesi · konu incelemesi.
  const [topic, setTopic] = useState("");
  const [topicDate, setTopicDate] = useState("");
  useEffect(() => {
    setTopic("");
    setTopicDate("");
  }, [appeal?.public_id]);
  const started = { invalidate: [["admin", "penalties"]] as [string, string][], onSuccess: onClose };
  const refer = useAdminMutation(
    () =>
      createPenalty({
        city_id: appeal!.city_id,
        league_id: appeal!.league_id ?? null,
        season_id: appeal!.season_id ?? null,
        match_id: appeal!.match_id,
        player_id: appeal!.player_id!,
        appeal_public_id: appeal!.public_id,
      }),
    { ...started, success: () => `${appeal?.player_name ?? "Oyuncu"} disiplin kuruluna sevk edildi.` }
  );
  const startMatch = useAdminMutation(() => createInquiry({ kind: "match", appeal_public_id: appeal!.public_id }), { ...started, success: "Maç hakkında inceleme başlatıldı." });
  const startTopic = useAdminMutation(
    () => createInquiry({ kind: "topic", subject: topic.trim(), subject_date: toIsoDate(topicDate), appeal_public_id: appeal!.public_id }),
    { ...started, success: "Konu incelemesi başlatıldı." }
  );
  const confirmRefer = async () => {
    const sure = await confirmAction({
      title: "Oyuncu sevk edilsin mi?",
      message: `${appeal?.player_name ?? "Oyuncu"} disiplin kuruluna sevk edilecek; oyuncuya ve takımına bildirilecek.`,
      confirmLabel: "Sevk et",
    });
    if (sure) refer.mutate(undefined);
  };

  const confirmRemove = async () => {
    const sure = await confirmAction({
      title: "Başvuru silinsin mi?",
      message: "İtiraz metni, ekleri ve kararı kalıcı olarak silinir; geri getirilemez. Yalnızca listeden kaldırmak için arşive alabilirsin.",
      confirmLabel: "Kalıcı olarak sil",
      destructive: true,
    });
    if (sure) remove.mutate(undefined);
  };

  // Yeni başvuru açılınca form onun güncel değerleriyle dolar.
  useEffect(() => {
    if (!appeal) return;
    setDecision(appeal.is_decided ? (appeal.status as Decision) : "accepted");
    setText(appeal.decision_text ?? "");
    setVisibility(appeal.visibility ?? "team");
    setEditing(false);
    setFailure(null);
  }, [appeal?.public_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsText = decision !== "in_review";
  const review = useAdminMutation(
    () => reviewAppeal(appeal!.public_id, { status: decision, decision_text: text.trim() || null, visibility: needsText ? visibility : undefined }),
    {
    success: () =>
      !needsText
        ? "İtiraz değerlendirmeye alındı ve takıma bildirildi."
        : visibility === "public"
          ? "Karar kaydedildi; disiplin sayfasında ve haberlerde yayımlandı."
          : visibility === "teams"
            ? "Karar kaydedildi ve ilgili takımlara bildirildi."
            : "Karar kaydedildi ve itiraz eden takıma bildirildi.",
    invalidate: [["admin", "penalties", "appeals"]],
    silentError: true,
    onSuccess: onClose,
    }
  );

  const submit = async () => {
    setFailure(null);
    if (needsText && !text.trim()) {
      setFailure("Karar metni yazılmalıdır; bu metin seçtiğin kişilere duyurulur.");
      return;
    }
    try {
      await review.mutateAsync(undefined);
    } catch (error) {
      setFailure(errorText(error));
    }
  };

  const showForm = Boolean(appeal) && (!appeal!.is_decided || editing);

  return (
    <BottomSheet
      visible={appeal != null}
      onClose={review.isPending ? () => undefined : onClose}
      title={appeal ? `Takım itirazı · ${appeal.category_label}` : "Takım itirazı"}
      snap="full"
      footer={
        showForm ? (
          <Button
            label={!needsText ? "Değerlendirmeye al" : visibility === "public" ? "Kararı kaydet ve yayımla" : "Kararı kaydet ve bildir"}
            icon="checkmark"
            size="lg"
            onPress={submit}
            loading={review.isPending}
            haptic="success"
            fullWidth
          />
        ) : (
          <Button label="Kararı veya duyuru kapsamını değiştir" icon="create-outline" variant="secondary" fullWidth onPress={() => setEditing(true)} />
        )
      }
    >
      {appeal ? (
        <View style={styles.body}>
          <View style={styles.from}>
            <IconTile icon="scale" tone="gold" size={44} glow={false} />
            <View style={styles.grow}>
              <Text style={styles.section} numberOfLines={2} {...textScale.dense}>
                {appeal.subject || appeal.category_label}
              </Text>
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {[appeal.team_name, formatDateTime(appeal.createdAt)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Badge label={appeal.is_archived ? "Arşivde" : APPEAL_STATUS_LABELS[appeal.status]} tone={appeal.is_archived ? "neutral" : STATUS_TONE[appeal.status]} size="sm" />
          </View>

          <View style={styles.quote}>
            <Text style={styles.quoteText} selectable {...textScale.long}>
              {appeal.description || "Metin yok."}
            </Text>
          </View>

          <GroupCard title="Süreç başlat" icon="hammer">
            <View style={styles.startRow}>
              <View style={styles.grow}>
                <Text style={styles.startTitle} {...textScale.dense}>Oyuncuyu sevk et</Text>
                <Text style={styles.meta} {...textScale.dense}>{appeal.player_name ? `Başvuruda adı geçen: ${appeal.player_name}` : "Başvuruda oyuncu belirtilmemiş."}</Text>
              </View>
              {appeal.player_id ? (
                <Button label="Sevk et" size="sm" onPress={confirmRefer} loading={refer.isPending} />
              ) : (
                <Button label="Oyuncu seç" size="sm" variant="secondary" onPress={() => onOpenCase(appeal)} />
              )}
            </View>
            <View style={styles.startRow}>
              <View style={styles.grow}>
                <Text style={styles.startTitle} {...textScale.dense}>Maç incelemesi</Text>
                <Text style={styles.meta} {...textScale.dense}>{appeal.match_label ?? "Başvuruda maç belirtilmemiş."}</Text>
              </View>
              <Button label="Başlat" size="sm" onPress={() => startMatch.mutate(undefined)} loading={startMatch.isPending} disabled={!appeal.match_id} />
            </View>
            <View style={styles.startForm}>
              <Text style={styles.startTitle} {...textScale.dense}>Konu incelemesi</Text>
              <Input value={topic} onChangeText={setTopic} placeholder="Konu başlığı (örn. Instagram paylaşımları)" maxLength={255} />
              <Input value={topicDate} onChangeText={setTopicDate} placeholder="Tarih (GG.AA.YYYY)" keyboardType="numbers-and-punctuation" maxLength={10} />
              <Button label="Konu incelemesi başlat" size="sm" onPress={() => startTopic.mutate(undefined)} loading={startTopic.isPending} disabled={!topic.trim()} />
            </View>
            {(appeal.processes ?? []).length ? (
              <View style={styles.processes}>
                <Text style={styles.meta} {...textScale.dense}>Bu başvurudan başlatılan süreçler</Text>
                {(appeal.processes ?? []).map((item) => (
                  <View key={`${item.type}-${item.public_id}`} style={styles.startRow}>
                    <Text style={[styles.startTitle, styles.grow]} numberOfLines={2} {...textScale.dense}>{item.title}</Text>
                    <Badge label={item.status_label} tone={item.is_decided ? "win" : "warn"} size="xs" />
                    {item.type === "player" ? <Button label="Aç" size="sm" variant="ghost" onPress={() => onOpenLinked(item.public_id)} /> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </GroupCard>
          <View style={styles.caseRow}>
            <Button
              label={appeal.is_archived ? "Arşivden çıkar" : "Arşive al"}
              icon={appeal.is_archived ? "arrow-undo-outline" : "archive-outline"}
              variant="secondary"
              size="sm"
              onPress={() => archive.mutate(undefined)}
              loading={archive.isPending}
              style={styles.grow}
            />
            {isAdmin ? (
              <Button label="Sil" icon="trash-outline" variant="danger" size="sm" onPress={confirmRemove} loading={remove.isPending} style={styles.grow} />
            ) : null}
          </View>

          {appeal.attachments?.length ? (
            <GroupCard title={`Ekler (${appeal.attachments.length})`} icon="attach">
              <AppealAttachments items={appeal.attachments} />
            </GroupCard>
          ) : null}

          <GroupCard title="Başvuru bilgileri" icon="information-circle">
            <FactRow icon="pricetag-outline" label="İtiraz nedeni" value={appeal.category_label} />
            <FactRow icon="person-outline" label="İlgili oyuncu" value={appeal.player_name || "Belirtilmedi"} />
            <FactRow icon="create-outline" label="Kaynak" value={appeal.source === "admin" ? "Kurul kaydı" : "Takım başvurusu"} />
            <FactRow icon="shield-outline" label="İtiraz eden takım" value={appeal.team_name || "—"} />
            <FactRow icon="people-outline" label="Rakip takım" value={appeal.opponent_team_name || "—"} />
            <FactRow icon="football-outline" label="Maç" value={appeal.match_label || "Belirtilmedi"} />
            <FactRow icon="calendar-outline" label="Maç tarihi" value={appeal.match_date ? formatDate(appeal.match_date) : "—"} last />
          </GroupCard>

          {showForm ? (
            <>
              <GroupCard title="Kararın" step={1}>
                <RadioGroup options={APPEAL_DECISIONS.map((d) => ({ value: d.value, label: d.label, hint: d.hint }))} value={decision} onChange={setDecision} />
              </GroupCard>
              <GroupCard title={needsText ? "Karar metni" : "Kurul notu"} step={2}>
                <Input
                  label={needsText ? "Karar metni" : "Kurul notu (isteğe bağlı)"}
                  value={text}
                  onChangeText={setText}
                  multiline
                  numberOfLines={5}
                  placeholder={needsText ? "Kararı ve gerekçesini yaz. Bu metin aşağıda seçtiğin kişilere duyurulur." : "Karar verilene dek kimseye gösterilmez."}
                  maxLength={5000}
                />
              </GroupCard>
              {needsText ? (
                <GroupCard title="Sonuç kime duyurulsun?" step={3}>
                  <RadioGroup
                    options={APPEAL_VISIBILITY_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                      hint: o.value === "teams" && !appeal.opponent_team_name ? `${o.hint} Bu itiraz bir maça bağlı değil; yalnız itiraz eden takım bilgilendirilir.` : o.hint,
                    }))}
                    value={visibility}
                    onChange={setVisibility}
                  />
                </GroupCard>
              ) : null}
              {failure ? <DangerNote tone="danger" icon="alert-circle" title="Kaydedilemedi" body={failure} /> : null}
            </>
          ) : (
            <DangerNote
              tone={appeal.status === "rejected" ? "danger" : "info"}
              icon={appeal.status === "rejected" ? "close-circle" : "checkmark-circle"}
              title={`Kurul kararı · ${APPEAL_STATUS_LABELS[appeal.status]}`}
              body={`${appeal.decision_text || "Karar metni yazılmadı."}\n${formatDateTime(appeal.decided_at)} · Duyuru: ${APPEAL_VISIBILITY_LABELS[appeal.visibility ?? "team"]}`}
            />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Kurulun takım adına elle başvuru kaydettiği form. */
function AppealCreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [team, setTeam] = useState<{ id: number; name: string } | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [category, setCategory] = useState<AppealCategory>("rule_error");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTeam(null);
    setMatchId(null);
    setCategory("rule_error");
    setSubject("");
    setDescription("");
    setFailure(null);
  }, [visible]);

  const matches = useQuery({
    queryKey: ["admin", "penalties", "appeal-team-matches", team?.id],
    queryFn: () => listAppealTeamMatches(team!.id),
    enabled: Boolean(team),
  });

  const create = useAdminMutation(
    () => adminCreateAppeal({ team_id: team!.id, match_id: matchId, category, subject: subject.trim(), description: description.trim() }),
    { success: "Başvuru kaydedildi ve takım yetkililerine bildirildi.", invalidate: [["admin", "penalties", "appeals"]], silentError: true, onSuccess: onClose }
  );

  const submit = async () => {
    setFailure(null);
    if (!team) return setFailure("Başvurunun hangi takım adına kaydedileceğini seç.");
    if (!subject.trim() || !description.trim()) return setFailure("Başlık ve açıklama yazılmalıdır.");
    try {
      await create.mutateAsync(undefined);
    } catch (error) {
      setFailure(errorText(error));
    }
    return undefined;
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={create.isPending ? () => undefined : onClose}
      title="Başvuru ekle"
      snap="full"
      footer={<Button label="Başvuruyu kaydet" icon="checkmark" size="lg" onPress={submit} loading={create.isPending} haptic="success" fullWidth />}
    >
      <View style={styles.body}>
        <Text style={styles.meta} {...textScale.long}>
          Panel dışından iletilen ya da kurulun kendiliğinden ele aldığı bir başvuruyu takım adına kaydet. Herkese açık sayfada yalnızca itiraz nedeni görünür.
        </Text>
        <GroupCard title="Taraf" step={1}>
          <SelectField<number>
            label="Takım"
            required
            value={team?.id ?? null}
            valueLabel={team?.name ?? null}
            onChange={(value, option) => {
              setTeam(value != null ? { id: value, name: option?.label ?? "" } : null);
              setMatchId(null);
            }}
            loadOptions={async (q) => (q.trim().length < 2 ? [] : (await searchAppealTeams(q.trim())).map((t) => ({ value: t.id, label: t.name })))}
            queryKey={["admin", "penalties", "appeal-teams"]}
            placeholder="Takım adı yaz (en az 2 harf)"
            sheetTitle="Takım seç"
            icon="shield-outline"
          />
          <SelectField<number>
            label="İlgili maç (varsa)"
            value={matchId}
            onChange={(value) => setMatchId(value)}
            options={(matches.data ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.date ? formatDate(m.date) : null }))}
            placeholder={team ? "Belirli bir maç yok" : "Önce takım seç"}
            disabled={!team}
            clearable
            sheetTitle="Maç seç"
            icon="football-outline"
          />
        </GroupCard>
        <GroupCard title="İtiraz nedeni" step={2}>
          <ChipGroup>
            {APPEAL_CATEGORIES.map((option) => (
              <Chip key={option.key} label={option.label} size="sm" selected={category === option.key} onPress={() => setCategory(option.key)} />
            ))}
          </ChipGroup>
        </GroupCard>
        <GroupCard title="Başvuru metni" step={3}>
          <Input label="Başlık" value={subject} onChangeText={setSubject} maxLength={200} placeholder="Örn. Cezalı oyuncunun oynatılması" />
          <Input
            label="Açıklama (yalnız kurul ve ilgili takım görür)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={5000}
            placeholder="Başvurunun içeriğini ve dayanaklarını yaz."
          />
        </GroupCard>
        {failure ? <DangerNote tone="danger" icon="alert-circle" title="Kaydedilemedi" body={failure} /> : null}
      </View>
    </BottomSheet>
  );
}

/** "GG.AA.YYYY" → "YYYY-AA-GG" (geçersizse null). */
function toIsoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  startRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  startForm: { gap: space.sm },
  startTitle: { ...type.label, color: colors.textPrimary },
  processes: { gap: space.sm },
  caseRow: { flexDirection: "row", gap: space.sm },
  header: { gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  body: { gap: space.md },
  from: { flexDirection: "row", alignItems: "center", gap: space.md },
  meta: { ...type.caption, color: colors.textTertiary },
  section: { ...type.h3, color: colors.textPrimary },
  quote: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.warnDim },
  quoteText: { ...type.body, color: colors.textPrimary },
});
