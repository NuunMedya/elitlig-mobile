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
 * VERİ: GET /api/penalties/admin/appeals?status=
 *       POST /api/penalties/admin/appeals/:publicId/review
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, useAdminMutation, type FilterOption } from "@/components/admin";
import { RadioGroup } from "@/components/admin/penalties/RadioRow";
import { AppealAttachments } from "@/components/discipline/AppealAttachments";
import { CountStrip, DangerNote, FactRow, GroupCard, RequestCard } from "@/components/admin/team/ManageKit";
import { Badge, BottomSheet, Button, Chip, ChipGroup, IconTile, Input, type Tone } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  APPEAL_DECISIONS,
  APPEAL_STATUS_LABELS,
  APPEAL_VISIBILITY_LABELS,
  APPEAL_VISIBILITY_OPTIONS,
  listAppeals,
  reviewAppeal,
  type Appeal,
  type AppealFilter,
  type AppealStatus,
  type AppealVisibility,
} from "@/lib/api/admin/penalties";
import { colors, radius, space, textScale, type } from "@/theme";

const FILTERS: { key: AppealFilter; label: string }[] = [
  { key: "open", label: "Bekleyen" },
  { key: "accepted", label: "Kabul edilen" },
  { key: "partially_accepted", label: "Kısmen kabul" },
  { key: "rejected", label: "Reddedilen" },
  { key: "", label: "Tümü" },
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
      actions={[{ icon: "document-attach-outline", onPress: () => router.push("/yonetim/savunmalar" as Href), accessibilityLabel: "Savunma ve itirazlar" }]}
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

      <AppealReviewSheet appeal={selected} onClose={() => setSelected(null)} />
    </AdminScreen>
  );
}

/** İtirazın tam metni + karar formu. Sonuçlanmış başvuruda önce karar okunur. */
function AppealReviewSheet({ appeal, onClose }: { appeal: Appeal | null; onClose: () => void }) {
  const [decision, setDecision] = useState<Decision>("accepted");
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<AppealVisibility>("team");
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
            <Badge label={APPEAL_STATUS_LABELS[appeal.status]} tone={STATUS_TONE[appeal.status]} size="sm" />
          </View>

          <View style={styles.quote}>
            <Text style={styles.quoteText} selectable {...textScale.long}>
              {appeal.description || "Metin yok."}
            </Text>
          </View>

          {appeal.attachments?.length ? (
            <GroupCard title={`Ekler (${appeal.attachments.length})`} icon="attach">
              <AppealAttachments items={appeal.attachments} />
            </GroupCard>
          ) : null}

          <GroupCard title="Başvuru bilgileri" icon="information-circle">
            <FactRow icon="shield-outline" label="İtiraz eden takım" value={appeal.team_name || "—"} />
            <FactRow icon="people-outline" label="Rakip takım" value={appeal.opponent_team_name || "—"} />
            <FactRow icon="pricetag-outline" label="Konu" value={appeal.category_label} />
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

const styles = StyleSheet.create({
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
