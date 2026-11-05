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

import { AdminList, AdminScreen, RecordCard, StatRow, type FilterOption } from "@/components/admin";
import { PenaltyFacts, SubmissionReviewSheet } from "@/components/admin/penalties/SubmissionReviewSheet";
import { BottomSheet, Button, Chip, ChipGroup, type Tone } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  listSubmissions,
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
        filters={filters}
        filter={filter}
        onFilter={(key) => setFilter(key as ReviewStatus | "")}
        extraHeader={
          <View style={styles.header}>
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
            <StatRow
              items={[
                { label: "Bekleyen", value: pendingCount, tone: pendingCount ? "warn" : undefined },
                { label: "Listelenen", value: items.length },
              ]}
            />
          </View>
        }
        keyExtractor={(s) => String(s.id)}
        emptyIcon="document-attach-outline"
        emptyTitle="Bu filtrede başvuru yok"
        emptyBody={filter === "pending" ? "Yeni savunma ve itirazlar geldiğinde burada görünür." : undefined}
        renderItem={({ item }) => {
          const status = item.review_status ?? "pending";
          return (
            <RecordCard
              title={item.penalty?.player_name || "Oyuncu"}
              subtitle={item.description}
              meta={`${SIDE_LABELS[item.submitted_by_side ?? ""] ?? "Taraf"} · ${item.penalty?.team_name || "Takım yok"} · ${timeAgo(item.createdAt)}`}
              avatar={{ name: item.penalty?.player_name, image: item.penalty?.player_img }}
              badges={[
                { label: SUBMISSION_TYPE_LABELS[item.event_type as SubmissionType] ?? item.event_type, tone: item.event_type === "objection" ? "info" : "neutral" },
                { label: REVIEW_STATUS_LABELS[status], tone: REVIEW_TONE[status] },
              ]}
              onPress={() => open(item)}
            />
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
            <Text style={styles.meta} {...textScale.dense}>
              {reading.penalty?.player_name ?? "Oyuncu"} · {formatDateTime(reading.createdAt)}
            </Text>
            <View style={styles.quote}>
              <Text style={styles.quoteText} selectable {...textScale.long}>
                {reading.description || "Metin yok."}
              </Text>
            </View>
            {reading.penalty ? <PenaltyFacts penalty={reading.penalty} /> : null}
            <Text style={styles.section} {...textScale.dense}>
              Kurul kararı · {reading.review_status_label ?? "—"} · {formatDateTime(reading.reviewed_at)}
            </Text>
            <View style={styles.note}>
              <Text style={styles.quoteText} selectable {...textScale.long}>
                {reading.review_note || "Not yazılmadı."}
              </Text>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  read: { gap: space.md },
  meta: { ...type.caption, color: colors.textTertiary },
  section: { ...type.label, color: colors.textPrimary },
  quote: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.warnDim },
  note: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  quoteText: { ...type.body, color: colors.textPrimary },
});
