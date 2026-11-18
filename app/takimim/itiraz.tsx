/**
 * İTİRAZ BAŞVURUSU — takımın disiplin kuruluna yaptığı itirazlar.
 * `/takimim/itiraz` (Disiplin süreçleri ekranından açılır)
 *
 * Web: pages/panel/TeamAppeals.js. Ceza dosyasına bağlı OLMAYAN itirazlar
 * içindir: maç sonucu, hakem kararı, rakip oyuncunun uygunluğu, organizasyon…
 * Liste GET /api/penalties/appeals/mine'dan gelir; `can_submit` üyenin takım
 * yetkilisi olup olmadığını söyler. Yeni başvuru alt sayfada yazılır
 * (POST /api/penalties/appeals): konu türü, isteğe bağlı maç, başlık, gerekçe.
 *
 * Başlık ve gerekçe yalnız takım ve kurulca görülür; kurulun kararı herkese
 * açık disiplin sayfasında duyurulur.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  Reveal,
  ScreenHeader,
  Skeleton,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import {
  APPEAL_CATEGORIES,
  APPEAL_STATUS_LABELS,
  createAppeal,
  getAppealMatches,
  getMyAppeals,
  type Appeal,
  type AppealCategory,
  type AppealStatus,
} from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const STATUS_TONE: Record<AppealStatus, Tone> = {
  pending: "warn",
  in_review: "info",
  accepted: "win",
  partially_accepted: "warn",
  rejected: "danger",
};

const MIN_TEXT = 10;

export default function TeamAppealScreen() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<AppealCategory>("match_result");
  const [matchId, setMatchId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const query = useQuery({
    queryKey: ["panel", "appeals"],
    queryFn: getMyAppeals,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  // Maç listesi yalnız form açıldığında istenir.
  const matches = useQuery({
    queryKey: ["panel", "appeals", "matches"],
    queryFn: getAppealMatches,
    enabled: composing,
    staleTime: 5 * 60_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const mutation = useMutation({
    mutationFn: () => createAppeal({ category, match_id: matchId, subject: subject.trim(), description: description.trim() }),
    onSuccess: () => {
      setComposing(false);
      setCategory("match_result");
      setMatchId(null);
      setSubject("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["panel", "appeals"] });
      toast.show({ message: "İtiraz başvurun disiplin kuruluna iletildi.", tone: "success", icon: "checkmark-circle", haptic: "success" });
    },
    onError: (error: unknown) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : error instanceof Error ? error.message : "Gönderilemedi.",
        tone: "danger",
        icon: "alert-circle",
        duration: 4000,
      });
    },
  });

  if (!auth.user) return <Redirect href="/giris" />;

  const items = query.data?.items ?? [];
  const canSubmit = Boolean(query.data?.can_submit);
  const valid = subject.trim().length >= 3 && description.trim().length >= MIN_TEXT;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="İtiraz Başvurusu" subtitle="Merkez Disiplin Kurulu" back scrollY={scrollY} />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.intro}>
              <Text style={styles.introText} {...textScale.long}>
                Maç sonucu, hakem kararı, rakip oyuncunun uygunluğu ya da organizasyonla ilgili itirazını buradan kurula
                iletebilirsin. Kurulun kararı burada ve disiplin sayfasındaki duyurularda yayımlanır.
              </Text>
              <View style={styles.privacy}>
                <Ionicons name="lock-closed" size={13} color={colors.textTertiary} />
                <Text style={styles.privacyText} {...textScale.dense}>
                  İtiraz gerekçen herkese açık sayfada gösterilmez.
                </Text>
              </View>
            </View>
            {canSubmit ? (
              <Button label="Yeni itiraz başvurusu" icon="add" variant="primary" fullWidth onPress={() => setComposing(true)} />
            ) : null}
            {items.length ? (
              <Text style={styles.sectionLabel} {...textScale.badge}>
                BAŞVURULARIN
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={styles.skeleton}>
              <Skeleton height={120} radius="xl" />
              <Skeleton height={120} radius="xl" />
            </View>
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="scale-outline"
              title="İtiraz başvurun yok"
              body={
                canSubmit
                  ? "Gönderdiğin itirazlar ve kurulun kararları burada listelenir."
                  : "İtiraz başvurusunu yalnızca takım yetkilisi yapabilir."
              }
            />
          )
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item, index }) => (
          <Reveal index={index} limit={6} distance={8}>
            <AppealCard appeal={item} />
          </Reveal>
        )}
      />

      {/* ------------------------- YENİ İTİRAZ ------------------------- */}
      <BottomSheet
        visible={composing}
        onClose={mutation.isPending ? () => undefined : () => setComposing(false)}
        title="İtiraz başvurusu"
        snap="full"
        footer={
          <View style={styles.sheetFooter}>
            <Button label="Vazgeç" variant="ghost" onPress={() => setComposing(false)} disabled={mutation.isPending} style={styles.sheetButton} />
            <Button
              label="Gönder"
              variant="primary"
              icon="send"
              onPress={() => mutation.mutate()}
              disabled={!valid || mutation.isPending}
              loading={mutation.isPending}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel} {...textScale.dense}>
              İtiraz konusu
            </Text>
            <ChipGroup>
              {APPEAL_CATEGORIES.map((option) => (
                <Chip key={option.key} label={option.label} size="sm" selected={category === option.key} onPress={() => setCategory(option.key)} />
              ))}
            </ChipGroup>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel} {...textScale.dense}>
              İlgili maç (varsa)
            </Text>
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Belirli bir maç yok" size="sm" selected={matchId === null} onPress={() => setMatchId(null)} />
              {(matches.data ?? []).map((match) => (
                <Chip
                  key={match.id}
                  label={[match.label, match.date ? formatDateShort(match.date) : null].filter(Boolean).join(" · ")}
                  size="sm"
                  selected={matchId === match.id}
                  onPress={() => setMatchId(match.id)}
                />
              ))}
            </ChipGroup>
            {matches.isLoading ? (
              <Text style={styles.privacyText} {...textScale.dense}>
                Maçlar yükleniyor…
              </Text>
            ) : null}
          </View>

          <Input label="Başlık" value={subject} onChangeText={setSubject} placeholder="Örn. 2. yarıdaki gol kararına itiraz" maxLength={200} />
          <Input
            label="İtiraz gerekçesi"
            value={description}
            onChangeText={setDescription}
            placeholder="Neye, neden itiraz ettiğini ve dayanaklarını yaz…"
            multiline
            numberOfLines={6}
            maxLength={5000}
            hint={`En az ${MIN_TEXT} karakter. Gönderildikten sonra düzenlenemez.`}
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const AppealCard = React.memo(function AppealCard({ appeal }: { appeal: Appeal }) {
  const tone = STATUS_TONE[appeal.status] ?? "neutral";
  const meta = [appeal.category_label, appeal.match_label, formatDateShort(appeal.createdAt)].filter(Boolean).join(" · ");
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[appeal.subject, APPEAL_STATUS_LABELS[appeal.status] ?? appeal.status_label, meta].filter(Boolean).join(", ")}
    >
      <View style={styles.top}>
        <IconTile
          icon={appeal.is_decided ? "hammer" : "hourglass"}
          tone={appeal.status === "accepted" ? "mint" : appeal.status === "rejected" ? "red" : "gold"}
          size={40}
          glow={false}
        />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
            {appeal.subject ?? appeal.category_label}
          </Text>
          <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
            {meta}
          </Text>
        </View>
      </View>
      <Badge label={APPEAL_STATUS_LABELS[appeal.status] ?? appeal.status_label} tone={tone} size="sm" />
      {appeal.description ? (
        <Text style={styles.body} numberOfLines={4} {...textScale.long}>
          {appeal.description}
        </Text>
      ) : null}
      {appeal.is_decided ? (
        <View style={styles.verdict}>
          <Text style={styles.verdictLabel} {...textScale.badge}>
            KURUL KARARI{appeal.decided_at ? ` · ${formatDateShort(appeal.decided_at)}` : ""}
          </Text>
          <Text style={styles.verdictText} {...textScale.long}>
            {appeal.decision_text || "Karar metni yazılmadı."}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md, gap: space.md },
  intro: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  introText: { ...type.body, color: colors.textSecondary },
  privacy: { flexDirection: "row", alignItems: "center", gap: space.xs },
  privacyText: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  sectionLabel: { ...type.nano, color: colors.textTertiary },
  skeleton: { gap: space.md },
  gap: { height: space.sm },
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: "flex-start",
  },
  top: { flexDirection: "row", alignItems: "center", gap: space.md, alignSelf: "stretch" },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  body: { ...type.body, color: colors.textSecondary },
  verdict: { alignSelf: "stretch", gap: space.xs, padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  verdictLabel: { ...type.nano, color: colors.textTertiary },
  verdictText: { ...type.label, color: colors.textPrimary },
  sheetBody: { gap: space.lg },
  field: { gap: space.sm },
  fieldLabel: { ...type.labelSm, color: colors.textSecondary },
  sheetFooter: { flexDirection: "row", gap: space.md },
  sheetButton: { flex: 1 },
});
