/**
 * SAVUNMA VE İTİRAZ KUTUSU — disiplin kuruluna gelen başvurular
 * (web /yonetim/admin/savunmalar, DefenseInbox.js).
 *
 * NE: değerlendirme durumu çipleri (bekleyen varsayılan), tür süzgeci
 * (savunma / CAS itirazı), arama. Bekleyen başvuruya dokununca karar formu
 * açılır (kabul / ret / dikkate al + gerekçe + isteğe bağlı dosya
 * güncellemesi); sonuçlanmış başvuruda kurul kararı okunur.
 *
 * VERİ: GET /api/penalties/admin/submissions?review_status=&type=
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, type FilterOption } from "@/components/admin";
import { CountStrip, DangerNote, RequestCard } from "@/components/admin/team/ManageKit";
import { PenaltyFacts, SubmissionReviewSheet } from "@/components/admin/penalties/SubmissionReviewSheet";
import { Avatar, Badge, BottomSheet, Button, Chip, ChipGroup, type Tone } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  durationText,
  listSubmissions,
  PENALTY_STATUS_SHORT as PENALTY_SHORT,
  REVIEW_STATUS_LABELS,
  SIDE_LABELS,
  SUBMISSION_TYPE_LABELS,
  type PenaltySubmission,
  type ReviewStatus,
  type SubmissionType,
} from "@/lib/api/admin/penalties";
import { colors, radius, space, textScale, type } from "@/theme";

const FILTERS: { key: ReviewStatus | ""; label: string }[] = [
  { key: "pending", label: "Bekleyen" },
  { key: "accepted", label: "Kabul edilen" },
  { key: "rejected", label: "Reddedilen" },
  { key: "noted", label: "Dikkate alınan" },
  { key: "", label: "Tümü" },
];

const REVIEW_TONE: Record<ReviewStatus, Tone> = { pending: "warn", accepted: "win", rejected: "danger", noted: "info" };

export default function DefenseInboxScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewStatus | "">("pending");
  const [kind, setKind] = useState<SubmissionType | "">("");
  const [q, setQ] = useState("");
  const [reviewing, setReviewing] = useState<PenaltySubmission | null>(null);
  const [reading, setReading] = useState<PenaltySubmission | null>(null);

  const query = useQuery({
    queryKey: ["admin", "penalties", "submissions", filter, kind],
    queryFn: () => listSubmissions({ review_status: filter, type: kind }),
  });
  // Bekleyen sayacı her filtrede doğru kalsın diye ayrı (hafif) sorgu.
  const pending = useQuery({
    queryKey: ["admin", "penalties", "submissions", "pending", kind],
    queryFn: () => listSubmissions({ review_status: "pending", type: kind }),
    enabled: filter !== "pending",
  });

  const items = useMemo(() => {
    const needle = q.toLocaleLowerCase("tr-TR");
    const list = query.data ?? [];
    if (!needle) return list;
    return list.filter((s) =>
      `${s.penalty?.player_name ?? ""} ${s.penalty?.team_name ?? ""} ${s.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)
    );
  }, [query.data, q]);

  const pendingCount = (filter === "pending" ? query.data : pending.data)?.length ?? 0;
  const filters: FilterOption[] = FILTERS.map((f) => ({ ...f, count: f.key === "pending" ? pendingCount : undefined }));

  const open = (item: PenaltySubmission) => ((item.review_status ?? "pending") === "pending" ? setReviewing(item) : setReading(item));

  return (
    <AdminScreen
      title="Savunma ve itirazlar"
      subtitle="Merkez Disiplin Kurulu"
      permission={["penalties.review"]}
      scroll={false}
      actions={[{ icon: "hammer-outline", onPress: () => router.push("/yonetim/cezalar" as Href), accessibilityLabel: "Ceza yönetimi" }]}
    >
      <AdminList<PenaltySubmission>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
          if (filter !== "pending") void pending.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Oyuncu, takım ya da metin ara"
        extraHeader={
          <View style={styles.header}>
            <CountStrip
              items={[
                { key: "pending", label: "Bekleyen", value: pendingCount, tone: "warn", icon: "hourglass", selected: filter === "pending", onPress: () => setFilter("pending") },
                { key: "defense", label: "Savunma", value: items.filter((x) => x.event_type === "defense").length, icon: "shield", selected: kind === "defense", onPress: () => setKind(kind === "defense" ? "" : "defense") },
                { key: "objection", label: "CAS itirazı", value: items.filter((x) => x.event_type === "objection").length, tone: "info", icon: "git-pull-request", selected: kind === "objection", onPress: () => setKind(kind === "objection" ? "" : "objection") },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              {filters.map((f) => (
                <Chip key={f.key || "all"} label={f.label} count={f.count} size="sm" selected={filter === f.key} onPress={() => setFilter(f.key as ReviewStatus | "")} />
              ))}
            </ChipGroup>
            <ChipGroup scrollable contentPadding={0}>
              {(["", "defense", "objection"] as const).map((key) => (
                <Chip
                  key={key || "all"}
                  label={key ? SUBMISSION_TYPE_LABELS[key] : "Tüm türler"}
                  selected={kind === key}
                  onPress={() => setKind(key)}
                  size="sm"
                  tone="info"
                />
              ))}
            </ChipGroup>
          </View>
        }
        keyExtractor={(s) => String(s.id)}
        emptyIcon="document-attach-outline"
        emptyTitle="Bu filtrede başvuru yok"
        emptyBody={filter === "pending" ? "Yeni savunma ve itirazlar geldiğinde burada görünür." : undefined}
        renderItem={({ item }) => {
          const status = item.review_status ?? "pending";
          const pendingItem = status === "pending";
          /* Son tarih: savunma için savunma süresi, itiraz için itiraz süresi. */
          const deadline = item.event_type === "objection" ? item.penalty?.objection_deadline_at : item.penalty?.defense_deadline_at;
          return (
            <RequestCard
              leading={<Avatar name={item.penalty?.player_name} image={item.penalty?.player_img} size={38} />}
              who={item.penalty?.player_name || "Oyuncu"}
              when={[timeAgo(item.createdAt), SIDE_LABELS[item.submitted_by_side ?? ""] ?? "Taraf", item.penalty?.team_name].filter(Boolean).join(" · ")}
              priority={pendingItem ? { label: SUBMISSION_TYPE_LABELS[item.event_type as SubmissionType] ?? item.event_type, tone: item.event_type === "objection" ? "info" : "warn", icon: item.event_type === "objection" ? "git-pull-request" : "shield" } : null}
              status={pendingItem ? null : { label: REVIEW_STATUS_LABELS[status], tone: REVIEW_TONE[status] }}
              title={item.description || "Metin yok."}
              done={!pendingItem}
              onPress={() => open(item)}
              extraActions={pendingItem ? <Button label="Değerlendir" icon="hammer-outline" onPress={() => open(item)} style={styles.grow} /> : null}
            >
              {item.penalty ? (
                <View style={styles.pills}>
                  <Badge label={PENALTY_SHORT[item.penalty.status] ?? item.penalty.status} size="xs" icon="flag-outline" />
                  <Badge label={durationText(item.penalty)} size="xs" tone={item.penalty.duration_type === "suresiz" ? "danger" : "neutral"} />
                  {deadline && pendingItem ? <Badge label={`Süre: ${formatDateTime(deadline)}`} size="xs" icon="alarm-outline" tone="warn" /> : null}
                </View>
              ) : null}
            </RequestCard>
          );
        }}
      />

      <SubmissionReviewSheet submission={reviewing} penalty={reviewing?.penalty} onClose={() => setReviewing(null)} />

      <BottomSheet
        visible={reading != null}
        onClose={() => setReading(null)}
        title={reading ? `${SUBMISSION_TYPE_LABELS[reading.event_type as SubmissionType] ?? "Başvuru"} · ${SIDE_LABELS[reading.submitted_by_side ?? ""] ?? "Taraf"}` : "Başvuru"}
        snap="full"
        footer={
          reading?.penalty ? (
            <Button
              label="Ceza dosyasını aç"
              icon="folder-open-outline"
              variant="secondary"
              fullWidth
              onPress={() => {
                const id = reading.penalty!.public_id;
                setReading(null);
                router.push(`/yonetim/cezalar/${encodeURIComponent(id)}` as Href);
              }}
            />
          ) : null
        }
      >
        {reading ? (
          <View style={styles.read}>
            <View style={styles.from}>
              <Avatar name={reading.penalty?.player_name} image={reading.penalty?.player_img} size={44} />
              <View style={styles.grow}>
                <Text style={styles.section} numberOfLines={1} {...textScale.dense}>
                  {reading.penalty?.player_name ?? "Oyuncu"}
                </Text>
                <Text style={styles.meta} {...textScale.dense}>
                  {formatDateTime(reading.createdAt)}
                </Text>
              </View>
            </View>
            <View style={styles.quote}>
              <Text style={styles.quoteText} selectable {...textScale.long}>
                {reading.description || "Metin yok."}
              </Text>
            </View>
            <DangerNote
              tone={reading.review_status === "rejected" ? "danger" : "info"}
              icon={reading.review_status === "accepted" ? "checkmark-circle" : reading.review_status === "rejected" ? "close-circle" : "information-circle"}
              title={`Kurul kararı · ${reading.review_status_label ?? "—"}`}
              body={`${reading.review_note || "Not yazılmadı."}\n${formatDateTime(reading.reviewed_at)}`}
            />
            {reading.penalty ? <PenaltyFacts penalty={reading.penalty} /> : null}
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  from: { flexDirection: "row", alignItems: "center", gap: space.md },
  read: { gap: space.md },
  meta: { ...type.caption, color: colors.textTertiary },
  section: { ...type.h3, color: colors.textPrimary },
  quote: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.warnDim },
  note: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  quoteText: { ...type.body, color: colors.textPrimary },
});
