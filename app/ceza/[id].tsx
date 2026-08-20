/**
 * DİSİPLİN DOSYASI — tek ceza kaydının detayı, savunma ve itiraz ekranı.
 *
 * NE: `PENALTY_*` panel bildirimlerinin varış noktası (şartname §5, satır 12).
 * Dosya bir zaman çizelgesi olarak okunur: SEVK → KURUL KARARI → CAS BAŞVURUSU
 * → CAS KARARI (constants/penalty.js → PENALTY_STATUS_ORDER). Hangi aşamada
 * olduğun ve sıradaki adımın ne olduğu tek bakışta görünür.
 *
 * VERİ KAYNAĞI: `GET /api/penalties/mine`. Tekil detay ucu
 * (`GET /api/penalties/:publicId`) YALNIZCA `penalties.view` yetkisi olan
 * yönetim hesaplarına açıktır; sıradan üye kendi dosyasını ancak /mine
 * listesinden görebilir. Bu uç zaten dosyanın tamamını (olay zinciri +
 * savunma/itiraz metinleri) döndürdüğü için ekran listeyi çekip `public_id`
 * ile kaydı bulur. Aynı önbellek anahtarı (`["panel","penalties"]`) liste
 * ekranıyla paylaşılır: bir yerde yenilenen veri diğerinde de tazedir.
 *
 * SÜRE PENCERELERİ (sunucu kuralı):
 *   • Savunma — sevkten sonra 24 saat (`defense_deadline_at`).
 *   • İtiraz  — kurul kararından sonra 1 hafta (`objection_deadline_at`) VE
 *     dosya "kurul_karari" aşamasındayken. Sunucu bu iki koşulu 409
 *     DEFENSE_WINDOW_CLOSED / OBJECTION_WINDOW_CLOSED / OBJECTION_NOT_ALLOWED
 *     ile korur; ekran düğmeyi kapatmakla yetinmez, NEDENİNİ yazar — kapalı
 *     bir düğme sebebini söylemiyorsa kullanıcı hata yaptığını sanır.
 *
 * TARAF (side): asla uydurulmaz. Sunucu `viewer_side` (varsayılan sıfat) ve
 * `available_sides` (tüm sıfatlar) döndürür; üye hem kendi oyuncu kaydının
 * hem yönettiği takımın tarafı olabilir. Varsayılan eski ekrandaki mantıkla
 * birebir aynıdır (`viewer_side ?? available_sides[0] ?? "player"`); iki sıfat
 * birden varsa artık hangisiyle yazdığını SEÇEBİLİR — sunucu
 * `resolvePenaltyParty` ile istenen sıfatı zaten kabul ediyor.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  KeyValueRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  Surface,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import {
  getMyPenalties,
  submitDefense,
  submitObjection,
  type Penalty,
  type PenaltyEvent,
} from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Dosya aşamaları — sunucudaki PENALTY_STATUS_ORDER ile aynı sırada. */
const STAGES: { key: string; label: string }[] = [
  { key: "sevk", label: "Sevk" },
  { key: "kurul_karari", label: "Kurul kararı" },
  { key: "cas_basvuru", label: "CAS başvurusu" },
  { key: "cas_karari", label: "CAS kararı" },
];

const STAGE_TONES: Record<string, Tone> = {
  sevk: "warn",
  kurul_karari: "danger",
  cas_basvuru: "info",
  cas_karari: "neutral",
};

/** Süre türü — constants/penalty.js DURATION_TYPE. */
const DURATION_LABELS: Record<string, string> = {
  suresiz: "Süresiz ihraç",
  mac: "Maç cezası",
};

/** İşlem sıfatı etiketleri (ACTOR_SIDE). */
const SIDE_LABELS: Record<string, string> = {
  player: "Oyuncu olarak",
  team: "Takım adına",
  admin: "Yönetim",
  system: "Sistem",
};

type SubmissionKind = "defense" | "objection";

/* ============================== SAF YARDIMCILAR =========================== */

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

const windowOpen = (deadline: string | null): boolean =>
  Boolean(deadline && new Date(deadline).getTime() > Date.now());

/** Kalan süre — "6 saat 12 dakika"; süre dolduysa null. */
function remainingText(iso?: string | null): string | null {
  if (!iso) return null;
  const left = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(left) || left <= 0) return null;
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  if (days > 0) return `${days} gün ${hours} saat`;
  if (hours > 0) return `${hours} saat ${minutes} dakika`;
  return `${Math.max(1, minutes)} dakika`;
}

/**
 * `ban_state` sunucuda NESNEDİR (computeBanState → { summary, active, … }) ama
 * `lib/api/panel.ts` içinde `string | null` olarak yazılıdır. Tip düzeltilene
 * kadar değer güvenle daraltılır: metin geldiyse metin, nesne geldiyse özeti.
 */
function banSummary(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const summary = (value as { summary?: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
  }
  return null;
}

/** Ceza şu an yürürlükte mi? (nesne biçimindeki ban_state'ten okunur) */
function banActive(value: unknown): boolean | null {
  if (value && typeof value === "object") {
    const active = (value as { active?: unknown }).active;
    if (typeof active === "boolean") return active;
  }
  return null;
}

/** Savunma/itiraz olayı mı? Sunucu `is_submission` bayrağını gönderir. */
const isSubmission = (event: PenaltyEvent): boolean =>
  Boolean(event.is_submission) || event.event_type === "defense" || event.event_type === "objection";

/* ================================= EKRAN ================================== */

export default function PenaltyDetailScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const publicId = String(firstParam(params.id) ?? "").trim();

  const [compose, setCompose] = useState<SubmissionKind | null>(null);
  const [text, setText] = useState("");
  /** Kullanıcının seçtiği sıfat; null ise sunucunun verdiği varsayılan kullanılır. */
  const [side, setSide] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const penalty = useMemo(
    () => (query.data?.items ?? []).find((item) => item.public_id === publicId) ?? null,
    [publicId, query.data],
  );

  /** Eski ekrandaki sıfat çözümü — kullanıcı seçim yaptıysa o kazanır. */
  const effectiveSide = useMemo(() => {
    if (!penalty) return "player";
    if (side && penalty.available_sides.includes(side)) return side;
    return penalty.viewer_side ?? penalty.available_sides[0] ?? "player";
  }, [penalty, side]);

  const mutation = useMutation({
    mutationFn: (input: { penalty: Penalty; kind: SubmissionKind; text: string; side: string }) =>
      input.kind === "defense"
        ? submitDefense(input.penalty.public_id, input.text, input.side)
        : submitObjection(input.penalty.public_id, input.text, input.side),
    onSuccess: (_result, input) => {
      setCompose(null);
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["panel", "penalties"] });
      toast.show({
        message:
          input.kind === "defense"
            ? "Savunman kurula iletildi."
            : "İtirazın iletildi; süreç CAS aşamasına taşındı.",
        tone: "success",
        icon: "checkmark-circle",
        haptic: "success",
      });
    },
    onError: (error: unknown) => {
      // Süre dolmuş ya da aşama uygun değilse sunucu 409 ile döner; dosyayı
      // tazeleyip kullanıcıya sunucunun kendi cümlesini gösteririz.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ["panel", "penalties"] });
      }
      toast.show({
        message:
          error instanceof ApiError
            ? error.userMessage
            : error instanceof Error
              ? error.message
              : "Gönderilemedi.",
        tone: "danger",
        icon: "alert-circle",
        duration: 4000,
      });
    },
  });

  const openCompose = useCallback((kind: SubmissionKind) => {
    setText("");
    setCompose(kind);
  }, []);

  const submit = useCallback(() => {
    if (!penalty || !compose) return;
    mutation.mutate({ penalty, kind: compose, text: text.trim(), side: effectiveSide });
  }, [compose, effectiveSide, mutation, penalty, text]);

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  /* -------------------------------- DURUM -------------------------------- */

  const defenseOpen = penalty ? windowOpen(penalty.defense_deadline_at) : false;
  const objectionStageOk = penalty?.status === "kurul_karari";
  const objectionOpen = Boolean(
    penalty && objectionStageOk && windowOpen(penalty.objection_deadline_at),
  );

  const submissions = useMemo(
    () => (penalty?.events ?? []).filter(isSubmission),
    [penalty?.events],
  );

  const timeline = useMemo(
    () =>
      [...(penalty?.events ?? [])].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      ),
    [penalty?.events],
  );

  const stageIndex = penalty ? STAGES.findIndex((stage) => stage.key === penalty.status) : -1;
  const banText = banSummary(penalty?.ban_state);
  const active = banActive(penalty?.ban_state);

  /** Ceza künyesi satırları. */
  const facts = useMemo(() => {
    if (!penalty) return [];
    const rows: { key: string; label: string; value: string; tone?: Tone }[] = [];
    if (penalty.player_name) rows.push({ key: "oyuncu", label: "Oyuncu", value: penalty.player_name });
    if (penalty.team_name) rows.push({ key: "takim", label: "Takım", value: penalty.team_name });
    if (penalty.match_label) rows.push({ key: "mac", label: "Maç", value: penalty.match_label });
    if (penalty.match_date) {
      rows.push({ key: "tarih", label: "Maç tarihi", value: formatDateShort(penalty.match_date) });
    }
    if (penalty.duration_type) {
      rows.push({
        key: "tur",
        label: "Ceza türü",
        value: DURATION_LABELS[penalty.duration_type] ?? penalty.duration_type,
      });
    }
    if (penalty.match_count) {
      rows.push({
        key: "macsayisi",
        label: "Ceza süresi",
        value: `${penalty.match_count} maç`,
        tone: "danger",
      });
    }
    if (penalty.ban_start_at) {
      rows.push({
        key: "basla",
        label: "Ceza başlangıcı",
        value: formatDateShort(penalty.ban_start_at),
      });
    }
    if (penalty.ban_end_at) {
      rows.push({ key: "bitis", label: "Ceza bitişi", value: formatDateShort(penalty.ban_end_at) });
    }
    return rows;
  }, [penalty]);

  /* -------------------------------- ÇİZİM -------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Disiplin Dosyası"
        subtitle={penalty?.player_name ?? penalty?.team_name ?? undefined}
        back
        scrollY={scrollY}
      />

      {!publicId ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Dosya bulunamadı"
          body="Bağlantıda dosya kimliği yok. Cezalarım listesinden açmayı dene."
          action={{ label: "Cezalarıma dön", onPress: () => router.replace("/cezalarim") }}
        />
      ) : query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !penalty ? (
        <EmptyState
          icon="document-text-outline"
          title="Bu dosya sana açık değil"
          body="Kayıt bulunamadı ya da artık taraf olduğun bir dosya değil. Disiplin dosyalarını yalnızca tarafları görebilir."
          action={{ label: "Cezalarıma dön", onPress: () => router.replace("/cezalarim") }}
        />
      ) : (
        <ScrollView
          {...scrollProps}
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
        >
          {/* Künye */}
          <Surface level={1} radius="lg" style={styles.hero}>
            <Text style={styles.heroTitle} numberOfLines={3} {...textScale.dense}>
              {penalty.match_label ?? penalty.team_name ?? "Disiplin dosyası"}
            </Text>
            <View style={styles.heroBadges}>
              <Badge
                label={penalty.status_label}
                tone={STAGE_TONES[penalty.status] ?? "neutral"}
                size="sm"
              />
              {active === true ? <Badge label="CEZA YÜRÜRLÜKTE" tone="live" size="xs" /> : null}
              {active === false ? <Badge label="CEZA BİTTİ" tone="win" size="xs" /> : null}
            </View>
            {banText ? (
              <Text style={styles.heroBan} {...textScale.long}>
                {banText}
              </Text>
            ) : null}
          </Surface>

          {/* Aşama çizelgesi */}
          <SectionHeader title="Süreç" meta={`${Math.max(stageIndex + 1, 1)}/${STAGES.length}`} />
          <Surface level={1} radius="lg" style={styles.stages}>
            {STAGES.map((stage, index) => (
              <StageStep
                key={stage.key}
                label={stage.label}
                done={stageIndex >= index}
                current={stageIndex === index}
                last={index === STAGES.length - 1}
              />
            ))}
          </Surface>

          {/* Kurul kararı metni */}
          {penalty.disiplin_karari ? (
            <>
              <SectionHeader title="Kurul kararı" />
              <Surface level={1} radius="lg" style={styles.decision}>
                <Ionicons name="shield" size={16} color={colors.danger} />
                <Text style={styles.decisionText} {...textScale.long}>
                  {penalty.disiplin_karari}
                </Text>
              </Surface>
            </>
          ) : null}

          {/* Dosya künyesi */}
          {facts.length > 0 ? (
            <>
              <SectionHeader title="Dosya bilgileri" />
              {facts.map((row, index) => (
                <KeyValueRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  tone={row.tone}
                  position={rowPosition(index, facts.length)}
                />
              ))}
            </>
          ) : null}

          {/* Savunma / itiraz kapıları */}
          <SectionHeader title="Savunma ve itiraz" />

          {penalty.available_sides.length > 1 ? (
            <View style={styles.sideBlock}>
              <Text style={styles.sideLabel} {...textScale.dense}>
                Hangi sıfatla yazıyorsun?
              </Text>
              <ChipGroup contentPadding={0} scrollable={false} style={styles.sideChips}>
                {penalty.available_sides.map((option) => (
                  <SideChip
                    key={option}
                    value={option}
                    selected={option === effectiveSide}
                    onSelect={setSide}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          <WindowCard
            title="Savunma"
            icon="create-outline"
            open={defenseOpen}
            deadline={penalty.defense_deadline_at}
            /* Sunucu savunmayı yalnız süreye bakarak kabul eder. */
            closedReason={
              penalty.defense_deadline_at
                ? `Savunma süresi (sevkten sonra 24 saat) ${formatDateShort(
                    penalty.defense_deadline_at,
                  )} tarihinde doldu. Bu dosyaya artık savunma gönderilemez; sunucu geç gelen metni kabul etmiyor.`
                : "Bu dosyada savunma penceresi açılmamış. Pencere, dosya disiplin kuruluna sevk edildiğinde 24 saatliğine açılır."
            }
            openHint="Metnin doğrudan Merkez Disiplin Kurulu'na iletilir; gönderdikten sonra bu ekrandan takip edebilirsin."
            onPress={() => openCompose("defense")}
          />

          <WindowCard
            title="İtiraz (CAS)"
            icon="megaphone-outline"
            open={objectionOpen}
            deadline={penalty.objection_deadline_at}
            closedReason={
              !objectionStageOk
                ? `İtiraz yalnızca "Merkez Disiplin Kurulu Kararı" aşamasında yapılabilir. Dosya şu an "${penalty.status_label}" aşamasında.`
                : penalty.objection_deadline_at
                  ? `İtiraz süresi (karardan sonra 1 hafta) ${formatDateShort(
                      penalty.objection_deadline_at,
                    )} tarihinde doldu.`
                  : "İtiraz penceresi henüz açılmadı; kurul kararı yazıldığında 1 hafta boyunca açık kalır."
            }
            openHint="İtiraz kabul edilirse dosya Elitlig CAS aşamasına taşınır."
            onPress={() => openCompose("objection")}
          />

          {/* Gönderdiğim metinler */}
          {submissions.length > 0 ? (
            <>
              <SectionHeader title="Gönderdiklerim" meta={String(submissions.length)} />
              {submissions.map((event) => (
                <Surface key={event.id} level={1} radius="lg" style={styles.submission}>
                  <View style={styles.submissionHead}>
                    <Text style={styles.submissionTitle} {...textScale.dense}>
                      {event.title ?? (event.event_type === "objection" ? "İtiraz" : "Savunma")}
                    </Text>
                    {event.review_status_label ? (
                      <Badge label={event.review_status_label} tone="info" size="xs" />
                    ) : null}
                  </View>
                  {event.description ? (
                    <Text style={styles.submissionBody} {...textScale.long}>
                      {event.description}
                    </Text>
                  ) : null}
                  <Text style={styles.submissionDate} {...textScale.badge}>
                    {formatDateShort(event.createdAt)}
                  </Text>
                </Surface>
              ))}
            </>
          ) : null}

          {/* Olay zinciri */}
          <SectionHeader title="Olay zinciri" meta={String(timeline.length)} />
          {timeline.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="Kayıt yok"
              body="Dosyada bir hareket olduğunda burada zaman sırasıyla görünür."
              variant="inline"
              compact
            />
          ) : (
            timeline.map((event, index) => (
              <View key={event.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                  {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineTitle} {...textScale.dense}>
                    {event.title ?? event.status_label ?? event.event_type}
                    {event.review_status_label ? ` · ${event.review_status_label}` : ""}
                  </Text>
                  {event.description ? (
                    <Text style={styles.timelineDesc} {...textScale.long}>
                      {event.description}
                    </Text>
                  ) : null}
                  <Text style={styles.timelineMeta} {...textScale.badge}>
                    {formatDateShort(event.createdAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* --------------------- SAVUNMA / İTİRAZ YAZMA -------------------- */}
      <BottomSheet
        visible={compose !== null}
        onClose={() => setCompose(null)}
        title={compose === "objection" ? "İtiraz yaz" : "Savunma yaz"}
        snap="half"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Vazgeç"
              variant="ghost"
              onPress={() => setCompose(null)}
              style={styles.sheetButton}
            />
            <Button
              label="Gönder"
              variant="primary"
              icon="send"
              onPress={submit}
              disabled={text.trim().length < 10 || mutation.isPending}
              loading={mutation.isPending}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText} {...textScale.long}>
            {compose === "objection"
              ? "İtirazın disiplin kuruluna iletilir ve dosya CAS değerlendirmesine taşınır."
              : "Savunman doğrudan Merkez Disiplin Kurulu'na iletilir."}
            {penalty ? ` ${SIDE_LABELS[effectiveSide] ?? effectiveSide} gönderiliyor.` : ""}
          </Text>
          <Input
            value={text}
            onChangeText={setText}
            placeholder="Olayı kendi tarafından anlat…"
            multiline
            hint="En az 10 karakter"
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/** Aşama çizelgesinin tek adımı. */
const StageStep = React.memo(function StageStep({
  label,
  done,
  current,
  last,
}: {
  label: string;
  done: boolean;
  current: boolean;
  last: boolean;
}) {
  return (
    <View style={styles.stageStep}>
      <View style={styles.stageMarkRow}>
        <View
          style={[
            styles.stageDot,
            done && styles.stageDotDone,
            current && styles.stageDotCurrent,
          ]}
        />
        {!last ? <View style={[styles.stageBar, done && styles.stageBarDone]} /> : null}
      </View>
      <Text
        style={[styles.stageLabel, current && styles.stageLabelCurrent]}
        numberOfLines={2}
        {...textScale.badge}
      >
        {label}
      </Text>
    </View>
  );
});

/** İşlem sıfatı çipi. */
const SideChip = React.memo(function SideChip({
  value,
  selected,
  onSelect,
}: {
  value: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <Chip
      label={SIDE_LABELS[value] ?? value}
      selected={selected}
      onPress={handlePress}
      size="sm"
    />
  );
});

/**
 * Savunma/itiraz kapısı.
 *
 * Açıkken kalan süreyi ve düğmeyi gösterir; kapalıyken NEDENİNİ yazar. Kapalı
 * bir kapıyı sessizce gizlemek, kullanıcının hakkını kaybettiğini fark
 * etmemesine yol açardı.
 */
const WindowCard = React.memo(function WindowCard({
  title,
  icon,
  open,
  deadline,
  closedReason,
  openHint,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  open: boolean;
  deadline: string | null;
  closedReason: string;
  openHint: string;
  onPress: () => void;
}) {
  const left = remainingText(deadline);
  return (
    <Surface level={1} radius="lg" style={styles.window}>
      <View style={styles.windowHead}>
        <Ionicons
          name={icon}
          size={16}
          color={open ? colors.brandAccent : colors.textTertiary}
        />
        <Text style={styles.windowTitle} {...textScale.dense}>
          {title}
        </Text>
        <Badge
          label={open ? "AÇIK" : "KAPALI"}
          tone={open ? "win" : "neutral"}
          size="xs"
        />
      </View>

      <Text style={[styles.windowBody, !open && styles.windowBodyMuted]} {...textScale.long}>
        {open ? openHint : closedReason}
      </Text>

      {open ? (
        <>
          {left ? (
            <Text style={styles.windowDeadline} {...textScale.dense}>
              ⏰ Son tarih {formatDateShort(deadline)} — {left} kaldı.
            </Text>
          ) : null}
          <Button label={`${title} gönder`} variant="primary" size="sm" onPress={onPress} />
        </>
      ) : null}
    </Surface>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  hero: {
    padding: space.md,
    marginTop: space.md,
    gap: space.sm,
  },
  heroTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  heroBan: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  stages: {
    flexDirection: "row",
    padding: space.md,
    gap: space.xs,
  },
  stageStep: {
    flex: 1,
    gap: space.xs,
  },
  stageMarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  stageDotDone: {
    backgroundColor: colors.brandAccent,
  },
  stageDotCurrent: {
    backgroundColor: colors.live,
  },
  stageBar: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
  },
  stageBarDone: {
    backgroundColor: colors.brandAccent,
  },
  stageLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  stageLabelCurrent: {
    color: colors.textPrimary,
  },
  decision: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
  },
  decisionText: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  sideBlock: {
    gap: space.xs,
    paddingVertical: space.xs,
  },
  sideLabel: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  sideChips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  window: {
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  windowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  windowTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  windowBody: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  windowBodyMuted: {
    color: colors.textTertiary,
  },
  windowDeadline: {
    ...type.caption,
    color: colors.warn,
    fontWeight: "800",
    letterSpacing: 0,
  },
  submission: {
    padding: space.md,
    marginBottom: space.sm,
    gap: space.xs,
  },
  submissionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  submissionTitle: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontWeight: "700",
    flex: 1,
  },
  submissionBody: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  submissionDate: {
    ...type.micro,
    color: colors.textTertiary,
  },
  timelineRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  timelineRail: {
    width: 12,
    alignItems: "center",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: space.s,
  },
  timelineDotActive: {
    backgroundColor: colors.brandAccent,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.separator,
    marginVertical: space.xxs,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: space.md,
    gap: space.xxs,
  },
  timelineTitle: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  timelineDesc: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  timelineMeta: {
    ...type.micro,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },
  sheetBody: {
    gap: space.md,
    paddingBottom: space.md,
  },
  sheetText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: space.sm,
  },
  sheetButton: {
    flex: 1,
  },
});
