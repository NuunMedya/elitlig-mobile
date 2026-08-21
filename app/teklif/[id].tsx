/**
 * TEKLİF BELGESİ — tek transfer teklifinin detayı ve karar ekranı.
 *
 * NE: `TRANSFER_*` panel bildirimlerinin varış noktası (şartname §5, satır 11).
 * Eski akışta teklif yalnız `tekliflerim` listesindeki bir kartta özetleniyor,
 * şartların (bedel, süre, maç başı ücret, serbest kalma bedeli) hiçbiri
 * görünmüyordu; oyuncu neyi kabul ettiğini bilmeden "Kabul et"e basıyordu.
 * Burada teklif bir BELGE gibi okunur: madde madde `KeyValueRow`, sürüm
 * geçmişi ve süreç akışı.
 *
 * ROTA ANAHTARI: `id` sayısal değil `public_id`'dir (UUID). Sunucu tüm
 * transfer uçlarında bu anahtarı bekler ve panel bildirimleri de
 * `entity_public_id` olarak bunu gönderir (sunucu sözleşmesi).
 *
 * İYİMSER KİLİTLEME: her eylemin gövdesinde `expectedVersion` gider. Sunucu
 * (services/transfer/offerService.js → checkVersion) bunu kaydın `version`
 * SAYACIYLA karşılaştırır; `current_version` ise "kaçıncı şart sürümü
 * yürürlükte" demektir ve her mutasyonda artmaz (yönetici onayı, süre dolması
 * gibi işlemler yalnız `version`'ı artırır). Bu yüzden beklenen sürüm olarak
 * DAİMA `version` gönderilir. Uyuşmazlıkta sunucu 409
 * TRANSFER_OFFER_VERSION_CONFLICT döndürür; ekran belgeyi tazeler ve
 * kullanıcıya "teklif güncellendi, yenile" der — hiçbir eylem sessizce
 * eski şartlar üzerinden tamamlanmaz.
 *
 * REVİZYON: `POST /api/transfer-offers/:id/request-revision` gövdesi
 * `{ expectedVersion, message, items:[{fieldCode, proposedValue, explanation}] }`
 * ister; `fieldCode` sunucudaki REVISION_FIELDS listesinden gelmelidir
 * (constants/transfer.js). Bu uç `lib/api/panel.ts` sarmalayıcısında henüz
 * yok, o dosya başka bir çalışmanın altında olduğu için çağrı burada ortak
 * `post()` yardımcısıyla yapılır — proje bunu başka ekranlarda da yapıyor
 * (bkz. app/oyuncum/index.tsx, app/takim/[id].tsx).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Divider,
  EmptyState,
  ErrorState,
  Input,
  KeyValueRow,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Toggle,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import { acceptOffer, getOffer, rejectOffer, type TransferOffer } from "@/lib/api/panel";
import { formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { ApiError, post } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

/* ============================ SUNUCU BİÇİMLERİ ============================= */

/**
 * Detay ucu liste ucundan daha zengin döner (versions/events/revisionRequests).
 * `lib/api/panel.ts` içindeki `TransferOffer` listede kullanılan çekirdeği
 * tanımlar; belge görünümünün ihtiyaç duyduğu alanlar burada, hepsi İSTEĞE
 * BAĞLI olarak genişletilir — böylece sunucu bir alanı göndermezse ekran
 * çökmez, o satır çizilmez.
 */
interface OfferVersion {
  id: number;
  version_number: number;
  created_by_side?: string | null;
  createdAt?: string | null;
  transfer_fee?: string | number | null;
  currency?: string | null;
  guest_play_allowed?: boolean | null;
  release_clause_active?: boolean | null;
  release_clause_fee?: string | number | null;
  travel_expenses_covered?: boolean | null;
  match_participation_fee_covered?: boolean | null;
  per_match_fee_active?: boolean | null;
  per_match_fee?: string | number | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  message?: string | null;
  /** JSON metni olarak saklanır (validation.js → JSON.stringify). */
  additional_terms?: string | null;
}

interface OfferEvent {
  id: number;
  event_type: string;
  actor_side?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  description?: string | null;
  createdAt: string;
}

interface RevisionItem {
  id: number;
  field_code: string;
  old_value?: string | null;
  proposed_value?: string | null;
  explanation?: string | null;
}

interface RevisionRequest {
  id: number;
  status: string;
  general_message?: string | null;
  requested_at?: string | null;
  responded_at?: string | null;
  items?: RevisionItem[];
}

interface OfferDocument extends TransferOffer {
  player?: { id: number; player_name: string; player_img: string | null } | null;
  versions?: OfferVersion[];
  events?: OfferEvent[];
  revisionRequests?: RevisionRequest[];
}

/* ============================ SABİTLER / TİPLER ============================ */

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Taslak", tone: "neutral" },
  SENT: { label: "Cevap bekliyor", tone: "warn" },
  REVISION_REQUESTED: { label: "Revizyon istendi", tone: "info" },
  ACCEPTED: { label: "Kabul edildi", tone: "win" },
  REJECTED: { label: "Reddedildi", tone: "danger" },
  WITHDRAWN: { label: "Geri çekildi", tone: "neutral" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral" },
  CANCELLED: { label: "İptal edildi", tone: "neutral" },
};

const statusMeta = (status: string): { label: string; tone: Tone } =>
  STATUS_META[status] ?? { label: status, tone: "neutral" };

/** Süreç akışındaki olay türleri (offerService.js'te yazılan adlar). */
const EVENT_LABELS: Record<string, string> = {
  OFFER_CREATED: "Teklif oluşturuldu",
  OFFER_SENT: "Teklif gönderildi",
  OFFER_VIEWED: "Teklifi görüntüledin",
  OFFER_ACCEPTED: "Teklif kabul edildi",
  OFFER_REJECTED: "Teklif reddedildi",
  OFFER_WITHDRAWN: "Teklif geri çekildi",
  OFFER_EXPIRED: "Teklifin süresi doldu",
  OFFER_REVISED: "Takım teklifi güncelledi",
  REVISION_REQUESTED: "Düzenleme istedin",
  ADMIN_APPROVED: "Yönetim onayladı",
  ADMIN_REJECTED: "Yönetim reddetti",
};

/** Olayı kimin yaptığı — rozet metni. */
const SIDE_LABELS: Record<string, string> = {
  TEAM: "Takım",
  PLAYER: "Oyuncu",
  SYSTEM: "Sistem",
  ADMIN: "Yönetim",
};

type OfferTab = "belge" | "surumler" | "surec";

const TAB_ITEMS: SegmentedItem<OfferTab>[] = [
  { key: "belge", label: "Belge" },
  { key: "surumler", label: "Sürümler" },
  { key: "surec", label: "Süreç" },
];

const TAB_KEYS = TAB_ITEMS.map((item) => item.key);

/**
 * Revizyon istenebilen alanlar — sunucudaki REVISION_FIELDS ile BİREBİR aynı
 * sırada ve aynı kodlarla. Başka bir kod gönderilirse sunucu 400 döndürür.
 */
type RevisionFieldKind = "money" | "bool" | "date" | "text";

interface RevisionField {
  code: string;
  label: string;
  kind: RevisionFieldKind;
  hint?: string;
}

const REVISION_FIELDS: RevisionField[] = [
  { code: "transfer_fee", label: "Transfer bedeli", kind: "money", hint: "Örn. 25000" },
  { code: "guest_play_allowed", label: "Misafir oyunculuk", kind: "bool" },
  { code: "release_clause_fee", label: "Serbest kalma bedeli", kind: "money", hint: "Örn. 50000" },
  { code: "travel_expenses_covered", label: "Yol gideri", kind: "bool" },
  { code: "match_participation_fee_covered", label: "Maç katılım ücreti", kind: "bool" },
  { code: "per_match_fee", label: "Maç başı ücret", kind: "money", hint: "Örn. 750" },
  { code: "contract_start_date", label: "Başlangıç tarihi", kind: "date", hint: "YYYY-AA-GG" },
  { code: "contract_end_date", label: "Bitiş tarihi", kind: "date", hint: "YYYY-AA-GG" },
  { code: "additional_terms", label: "Ek maddeler", kind: "text" },
];

const REVISION_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  REVISION_FIELDS.map((field) => [field.code, field.label]),
);

/* ============================== SAF YARDIMCILAR ============================ */

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTab(raw: unknown): OfferTab {
  const key = String(raw ?? "").trim().toLowerCase();
  return (TAB_KEYS as string[]).includes(key) ? (key as OfferTab) : "belge";
}

/**
 * Beklenen sürüm — sunucunun iyimser kilidi kaydın `version` sayacıdır.
 * (Dosya başındaki İYİMSER KİLİTLEME notuna bakınız.)
 */
const expectedVersion = (offer: TransferOffer): number => offer.version;

/** Kalan süre — "2 gün 3 saat kaldı"; süre dolduysa null. */
function remainingText(iso?: string | null): string | null {
  if (!iso) return null;
  const left = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(left) || left <= 0) return null;
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  if (days > 0) return `${days} gün ${hours} saat kaldı`;
  if (hours > 0) return `${hours} saat ${minutes} dakika kaldı`;
  return `${Math.max(1, minutes)} dakika kaldı`;
}

const yesNo = (value?: boolean | null, yes = "Var", no = "Yok"): string =>
  value ? yes : no;

/**
 * Para metni. `formatMoney` sıfırı "—" sayar; oysa transfer bedelinin sıfır
 * olması bir eksiklik değil, "bedelsiz transfer" demektir — bu ayrım korunur.
 */
function moneyText(value: string | number | null | undefined, currency: string): string {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount === 0) return "Bedelsiz";
  return formatMoney(value, currency);
}

/** Sürüm numarasından yürürlükteki şartlar. */
function currentTerms(offer: OfferDocument | undefined): OfferVersion | null {
  const versions = offer?.versions ?? [];
  if (!versions.length) return null;
  const wanted = offer?.current_version;
  return (
    versions.find((item) => item.version_number === wanted) ??
    versions[versions.length - 1] ??
    null
  );
}

/**
 * `additional_terms` sunucuda JSON metni olarak saklanır; içeriği serbesttir.
 * Nesne ise etiket–değer çiftlerine, dizi ise maddelere, düz metinse tek
 * paragrafa dönüşür. Çözümlenemezse ham metin gösterilir (veri kaybolmasın).
 */
function parseAdditionalTerms(raw?: string | null): { label: string; value: string }[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [{ label: "Ek madde", value: text }];
  }
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => ({
      label: `${index + 1}. madde`,
      value: typeof item === "string" ? item : JSON.stringify(item),
    }));
  }
  if (typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      label: key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
  }
  return [{ label: "Ek madde", value: String(parsed) }];
}

/** Revizyon maddelerinde saklanan değer JSON'dur; okunur metne çevrilir. */
function readableValue(raw?: string | null): string {
  const text = String(raw ?? "").trim();
  if (!text) return "—";
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === true) return "Evet";
    if (parsed === false) return "Hayır";
    if (parsed == null) return "—";
    if (typeof parsed === "object") return JSON.stringify(parsed);
    return String(parsed);
  } catch {
    return text;
  }
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ================================= EKRAN ================================== */

export default function OfferDetailScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Rota anahtarı = public_id (UUID). */
  const publicId = String(firstParam(params.id) ?? "").trim();
  const tab = resolveTab(firstParam(params.tab));

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionFields, setRevisionFields] = useState<string[]>([]);
  const [revisionValues, setRevisionValues] = useState<Record<string, string>>({});
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});
  const [revisionMessage, setRevisionMessage] = useState("");

  const query = useQuery({
    queryKey: ["panel", "offer", publicId],
    queryFn: () => getOffer(publicId),
    enabled: Boolean(auth.user) && publicId.length > 0,
    staleTime: 15_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  /** Liste ucundaki çekirdek tipin belge alanlarıyla genişletilmiş hâli. */
  const offer = query.data?.offer as OfferDocument | undefined;
  const terms = useMemo(() => currentTerms(offer), [offer]);

  const changeTab = useCallback(
    (next: OfferTab) => {
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  /** Teklif değişince hem belge hem gelen kutusu hem sözleşmeler tazelenir. */
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["panel", "offer", publicId] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "offers"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "contracts"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
  }, [publicId, queryClient]);

  /**
   * Belgeyi açmak teklifi "görüldü" yapar: sunucu `viewed_at` yazar VE bu
   * teklifin TRANSFER_OFFER_RECEIVED bildirimini okundu işaretler
   * (offerService.js → detail). Uygulamadaki okunmamış rozeti bu değişikliği
   * kendiliğinden duymaz; ilk başarılı yüklemede sayaç ve bildirim listesi
   * bayat ilan edilir.
   */
  const seen = query.isSuccess;
  useEffect(() => {
    if (!seen) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
    void queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] });
  }, [queryClient, seen]);

  /**
   * 409 = teklif başka bir yerden değişti (takım revize etti, süre doldu,
   * yönetim onayladı). Kullanıcıya sebebi söylenir ve belge yenilenir;
   * eylem TEKRARLANMAZ, çünkü artık başka bir şartı onaylıyor olurdu.
   */
  const handleActionError = useCallback(
    (error: unknown) => {
      const conflict =
        error instanceof ApiError &&
        (error.status === 409 || error.code === "TRANSFER_OFFER_VERSION_CONFLICT");
      if (conflict) {
        invalidateAll();
        Alert.alert(
          "Teklif güncellendi",
          "Bu teklifte değişiklik yapılmış. Belge yenilendi; yeni şartları okuyup tekrar karar ver.",
        );
        return;
      }
      Alert.alert(
        "İşlem yapılamadı",
        error instanceof ApiError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : "Bilinmeyen hata.",
      );
    },
    [invalidateAll],
  );

  const acceptMutation = useMutation({
    mutationFn: (current: OfferDocument) =>
      acceptOffer(current.public_id, expectedVersion(current)),
    onSuccess: (result) => {
      invalidateAll();
      const contractId = result?.contract?.public_id;
      toast.show({
        message: "Teklif kabul edildi, sözleşmen oluşturuldu.",
        tone: "success",
        icon: "checkmark-circle",
        haptic: "success",
        action: contractId
          ? { label: "Sözleşmeyi aç", onPress: () => router.push(`/sozlesme/${contractId}`) }
          : undefined,
      });
    },
    onError: handleActionError,
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { offer: OfferDocument; reason: string }) =>
      rejectOffer(input.offer.public_id, expectedVersion(input.offer), input.reason),
    onSuccess: () => {
      setRejectOpen(false);
      setReason("");
      invalidateAll();
      toast.show({ message: "Teklif reddedildi, takıma iletildi.", tone: "neutral" });
    },
    onError: handleActionError,
  });

  const revisionMutation = useMutation({
    mutationFn: (input: {
      offer: OfferDocument;
      message: string;
      items: { fieldCode: string; proposedValue: string | number | boolean; explanation?: string }[];
    }) =>
      post<{ offer: unknown }>(`/api/transfer-offers/${input.offer.public_id}/request-revision`, {
        expectedVersion: expectedVersion(input.offer),
        message: input.message || undefined,
        items: input.items,
      }),
    onSuccess: () => {
      setRevisionOpen(false);
      setRevisionFields([]);
      setRevisionValues({});
      setRevisionNotes({});
      setRevisionMessage("");
      invalidateAll();
      toast.show({
        message: "Düzenleme isteğin takıma iletildi.",
        tone: "success",
        icon: "create-outline",
      });
    },
    onError: handleActionError,
  });

  /* ------------------------------ EYLEMLER ------------------------------- */

  const confirmAccept = useCallback(() => {
    if (!offer) return;
    Alert.alert(
      "Teklifi kabul et",
      `${offer.team?.team_name ?? "Takım"} teklifini kabul etmek üzeresin. Kabul ettiğinde sözleşme yürürlüğe girer ve kadroya geçersin.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kabul et", onPress: () => acceptMutation.mutate(offer) },
      ],
    );
  }, [acceptMutation, offer]);

  const toggleRevisionField = useCallback(
    (field: RevisionField) => {
      setRevisionFields((prev) => {
        if (prev.includes(field.code)) return prev.filter((code) => code !== field.code);
        return [...prev, field.code];
      });
      // Onay kutusu alanları seçilir seçilmez bir değer taşımalı: istenen şey
      // "mevcut hâlin tersi"dir, varsayılan olarak o seçilir.
      setRevisionValues((prev) => {
        if (prev[field.code] !== undefined) return prev;
        if (field.kind !== "bool") return { ...prev, [field.code]: "" };
        const currentValue = terms
          ? Boolean((terms as unknown as Record<string, unknown>)[field.code])
          : false;
        return { ...prev, [field.code]: currentValue ? "false" : "true" };
      });
    },
    [terms],
  );

  const setRevisionValue = useCallback((code: string, value: string) => {
    setRevisionValues((prev) => ({ ...prev, [code]: value }));
  }, []);

  const setRevisionNote = useCallback((code: string, value: string) => {
    setRevisionNotes((prev) => ({ ...prev, [code]: value }));
  }, []);

  const submitRevision = useCallback(() => {
    if (!offer) return;
    const items = revisionFields.map((code) => {
      const field = REVISION_FIELDS.find((item) => item.code === code);
      const raw = (revisionValues[code] ?? "").trim();
      let proposed: string | number | boolean = raw;
      if (field?.kind === "bool") proposed = raw === "true";
      else if (field?.kind === "money") {
        const numeric = Number(raw.replace(",", "."));
        proposed = Number.isFinite(numeric) ? numeric : raw;
      }
      const explanation = (revisionNotes[code] ?? "").trim();
      return { fieldCode: code, proposedValue: proposed, explanation: explanation || undefined };
    });
    revisionMutation.mutate({ offer, message: revisionMessage.trim(), items });
  }, [offer, revisionFields, revisionMessage, revisionMutation, revisionNotes, revisionValues]);

  /** Gönderilebilir mi: en az bir alan seçili ve seçili alanların değeri dolu. */
  const revisionReady = useMemo(() => {
    if (!revisionFields.length) return false;
    return revisionFields.every((code) => {
      const field = REVISION_FIELDS.find((item) => item.code === code);
      if (field?.kind === "bool") return true;
      return (revisionValues[code] ?? "").trim().length > 0;
    });
  }, [revisionFields, revisionValues]);

  const openContract = useCallback(() => {
    const contractId = offer?.contract?.public_id;
    if (contractId) router.push(`/sozlesme/${contractId}`);
  }, [offer?.contract?.public_id, router]);

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  /* -------------------------------- ÇİZİM -------------------------------- */

  const meta = offer ? statusMeta(offer.status) : null;
  const canAccept = Boolean(offer?.actions?.accept);
  const canReject = Boolean(offer?.actions?.reject);
  const canRevise = Boolean(offer?.actions?.requestRevision);
  const hasActions = canAccept || canReject || canRevise;
  const busy =
    acceptMutation.isPending || rejectMutation.isPending || revisionMutation.isPending;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Transfer Teklifi"
        subtitle={offer?.team?.team_name ?? undefined}
        back
        scrollY={scrollY}
        bottom={
          offer ? (
            <View style={styles.tabsWrap}>
              <SegmentedControl items={TAB_ITEMS} value={tab} onChange={changeTab} size="sm" />
            </View>
          ) : undefined
        }
      />

      {!publicId ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Teklif bulunamadı"
          body="Bağlantıda teklif kimliği yok. Tekliflerim listesinden açmayı dene."
          action={{ label: "Tekliflerime dön", onPress: () => router.replace("/tekliflerim") }}
        />
      ) : query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} />
        </View>
      ) : query.isError || !offer ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <ScrollView
            {...scrollProps}
            contentContainerStyle={[styles.content, hasActions && styles.contentWithBar]}
            refreshControl={refresh.control}
          >
            {tab === "belge" ? (
              <DocumentTab
                offer={offer}
                terms={terms}
                statusLabel={meta?.label ?? offer.status}
                statusTone={meta?.tone ?? "neutral"}
                onOpenContract={openContract}
              />
            ) : null}

            {tab === "surumler" ? <VersionsTab offer={offer} /> : null}

            {tab === "surec" ? <TimelineTab offer={offer} /> : null}
          </ScrollView>

          {hasActions ? (
            <View style={styles.actionBar}>
              {canReject ? (
                <Button
                  label="Reddet"
                  variant="danger"
                  onPress={() => setRejectOpen(true)}
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : null}
              {canRevise ? (
                <Button
                  label="Revizyon"
                  variant="secondary"
                  onPress={() => setRevisionOpen(true)}
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : null}
              {canAccept ? (
                <Button
                  label="Kabul et"
                  variant="primary"
                  icon="checkmark"
                  onPress={confirmAccept}
                  loading={acceptMutation.isPending}
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : null}
            </View>
          ) : null}
        </>
      )}

      {/* ------------------------- RET GEREKÇESİ ------------------------- */}
      <BottomSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Teklifi reddet"
        snap="content"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Vazgeç"
              variant="ghost"
              onPress={() => setRejectOpen(false)}
              style={styles.actionButton}
            />
            <Button
              label="Reddet"
              variant="danger"
              onPress={() => offer && rejectMutation.mutate({ offer, reason: reason.trim() })}
              disabled={reason.trim().length < 3 || rejectMutation.isPending}
              loading={rejectMutation.isPending}
              style={styles.actionButton}
            />
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText} {...textScale.long}>
            {offer?.team?.team_name ?? "Takım"} teklifini reddediyorsun. Kısa bir
            gerekçe yaz; takım bunu paneline iletilmiş olarak görür.
          </Text>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="Örn. Mevcut takımımda kalmak istiyorum"
            multiline
            hint="En az 3 karakter"
          />
        </View>
      </BottomSheet>

      {/* -------------------------- REVİZYON İSTE ------------------------- */}
      <BottomSheet
        visible={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Revizyon iste"
        snap="full"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Vazgeç"
              variant="ghost"
              onPress={() => setRevisionOpen(false)}
              style={styles.actionButton}
            />
            <Button
              label="İsteği gönder"
              variant="primary"
              onPress={submitRevision}
              disabled={!revisionReady || revisionMutation.isPending}
              loading={revisionMutation.isPending}
              style={styles.actionButton}
            />
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetText} {...textScale.long}>
            Değişmesini istediğin maddeleri seç ve yeni değeri yaz. Teklif
            "revizyon istendi" durumuna geçer; takım yeni bir sürüm gönderdiğinde
            bildirim alırsın.
          </Text>

          <ChipGroup contentPadding={0} scrollable={false} style={styles.revisionChips}>
            {REVISION_FIELDS.map((field) => (
              <RevisionChip
                key={field.code}
                field={field}
                selected={revisionFields.includes(field.code)}
                onToggle={toggleRevisionField}
              />
            ))}
          </ChipGroup>

          {revisionFields.map((code) => {
            const field = REVISION_FIELDS.find((item) => item.code === code);
            if (!field) return null;
            return (
              <RevisionFieldEditor
                key={code}
                field={field}
                value={revisionValues[code] ?? ""}
                note={revisionNotes[code] ?? ""}
                onChangeValue={setRevisionValue}
                onChangeNote={setRevisionNote}
              />
            );
          })}

          <Input
            label="Genel mesaj (isteğe bağlı)"
            value={revisionMessage}
            onChangeText={setRevisionMessage}
            placeholder="Örn. Bedel dışında her şey uygun."
            multiline
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ============================== BELGE SEKMESİ ============================= */

const DocumentTab = React.memo(function DocumentTab({
  offer,
  terms,
  statusLabel,
  statusTone,
  onOpenContract,
}: {
  offer: OfferDocument;
  terms: OfferVersion | null;
  statusLabel: string;
  statusTone: Tone;
  onOpenContract: () => void;
}) {
  const currency = terms?.currency ?? "TRY";
  const remaining = remainingText(offer.expires_at);
  const additional = useMemo(
    () => parseAdditionalTerms(terms?.additional_terms),
    [terms?.additional_terms],
  );

  /** Belgede gösterilen maddeler — sunucunun sürüm tablosuyla birebir. */
  const clauses = useMemo(() => {
    if (!terms) return [];
    const rows: { key: string; label: string; value: string; tone?: Tone }[] = [
      {
        key: "bedel",
        label: "Transfer bedeli",
        value: moneyText(terms.transfer_fee, currency),
        tone: "brand",
      },
      {
        key: "baslangic",
        label: "Sözleşme başlangıcı",
        value: terms.contract_start_date ? formatDateShort(terms.contract_start_date) : "—",
      },
      {
        key: "bitis",
        label: "Sözleşme bitişi",
        value: terms.contract_end_date
          ? formatDateShort(terms.contract_end_date)
          : "Süresiz (bitiş yok)",
      },
      {
        key: "macbasi",
        label: "Maç başı ücret",
        value: terms.per_match_fee_active ? moneyText(terms.per_match_fee, currency) : "Yok",
      },
      {
        key: "serbest",
        label: "Serbest kalma bedeli",
        value: terms.release_clause_active
          ? moneyText(terms.release_clause_fee, currency)
          : "Yok",
      },
      {
        key: "misafir",
        label: "Misafir oyunculuk",
        value: yesNo(terms.guest_play_allowed, "İzinli", "İzinsiz"),
      },
      {
        key: "yol",
        label: "Yol gideri",
        value: yesNo(terms.travel_expenses_covered, "Takım karşılıyor", "Karşılanmıyor"),
      },
      {
        key: "katilim",
        label: "Maç katılım ücreti",
        value: yesNo(terms.match_participation_fee_covered, "Takım karşılıyor", "Karşılanmıyor"),
      },
    ];
    return rows;
  }, [currency, terms]);

  return (
    <>
      {/* Künye: takım, durum ve kalan süre tek yüzeyde. */}
      <Surface level={1} radius="lg" style={styles.hero}>
        <TeamLogo
          name={offer.team?.team_name ?? "?"}
          logo={mediaUrl(offer.team?.logo ?? null)}
          size={layout.crestXl}
        />
        <View style={styles.heroBody}>
          <Text style={styles.heroTitle} numberOfLines={2} {...textScale.dense}>
            {offer.team?.team_name ?? "Takım"}
          </Text>
          <Text style={styles.heroMeta} {...textScale.dense}>
            {offer.sent_at ? `Gönderildi ${formatDateShort(offer.sent_at)}` : "Gönderim tarihi yok"}
            {terms ? ` · ${terms.version_number}. sürüm` : ""}
          </Text>
          <View style={styles.heroBadges}>
            <Badge label={statusLabel} tone={statusTone} size="sm" />
            {offer.awaiting_admin_approval ? (
              <Badge label="YÖNETİCİ ONAYI BEKLİYOR" tone="warn" size="xs" />
            ) : null}
          </View>
        </View>
      </Surface>

      {offer.status === "SENT" ? (
        <Text style={[styles.note, remaining ? styles.noteWarn : styles.noteDanger]} {...textScale.long}>
          {remaining
            ? `Son geçerlilik: ${formatDateShort(offer.expires_at)} — ${remaining}.`
            : "Teklifin geçerlilik süresi dolmak üzere; sunucu süresi geçen teklifi otomatik kapatır."}
        </Text>
      ) : null}

      {offer.awaiting_admin_approval ? (
        <Text style={[styles.note, styles.noteWarn]} {...textScale.long}>
          Bu teklif önce yönetim onayından geçer. Onaylandığında bildirim
          alırsın; o ana kadar karar düğmeleri kapalı kalabilir.
        </Text>
      ) : null}

      {/* Şartlar */}
      <SectionHeader title="Sözleşme şartları" meta={terms ? `${terms.version_number}. sürüm` : undefined} />
      {clauses.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="Şart bilgisi yok"
          body="Sunucu bu teklif için sürüm kaydı döndürmedi."
          variant="inline"
          compact
        />
      ) : (
        clauses.map((row, index) => (
          <KeyValueRow
            key={row.key}
            label={row.label}
            value={row.value}
            tone={row.tone}
            numeric={row.key === "bedel" || row.key === "macbasi" || row.key === "serbest"}
            position={rowPosition(index, clauses.length)}
          />
        ))
      )}

      {/* Ek maddeler */}
      {additional.length > 0 ? (
        <>
          <SectionHeader title="Ek maddeler" meta={String(additional.length)} />
          {/* Ek madde metinleri uzun olabilir; tek satırlık KeyValueRow yerine
              paragraf yüzeyinde tam gösterilir (kırpılan madde okunmaz madde). */}
          {additional.map((item, index) => (
            <Surface key={`${item.label}-${index}`} level={1} radius="md" style={styles.termNote}>
              <Text style={styles.termLabel} {...textScale.dense}>
                {item.label}
              </Text>
              <Text style={styles.termValue} {...textScale.long}>
                {item.value}
              </Text>
            </Surface>
          ))}
        </>
      ) : null}

      {/* Takımın mesajı */}
      {terms?.message ? (
        <>
          <SectionHeader title="Takımın notu" />
          <Surface level={1} radius="lg" style={styles.quote}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brandAccent} />
            <Text style={styles.quoteText} {...textScale.long}>
              {terms.message}
            </Text>
          </Surface>
        </>
      ) : null}

      {/* Künye satırları */}
      <SectionHeader title="Teklif künyesi" />
      <KeyValueRow
        label="Teklif no"
        value={offer.public_id}
        numeric
        copyable={false}
        position="first"
      />
      <KeyValueRow
        label="Son geçerlilik"
        value={offer.expires_at ? formatDateShort(offer.expires_at) : "—"}
        position="middle"
      />
      <KeyValueRow
        label="Görüntülendi"
        value={offer.viewed_at ? formatDateShort(offer.viewed_at) : "Henüz görüntülenmedi"}
        position="middle"
      />
      <KeyValueRow
        label="Kilit sürümü"
        value={String(offer.version)}
        numeric
        position={offer.contract ? "middle" : "last"}
        info={{
          title: "Kilit sürümü nedir?",
          body:
            "Teklifte her değişiklik bu sayacı artırır. Kabul/ret gönderirken bu " +
            "sayı sunucuya birlikte gider; arada teklif değiştiyse işlem durur ve " +
            "belge yenilenir.",
        }}
      />
      {offer.contract ? (
        <ListRow
          leading={{ icon: "document-text", tone: "win" }}
          title="Bu tekliften doğan sözleşme"
          subtitle="Sözleşme belgesini aç"
          position="last"
          onPress={onOpenContract}
        />
      ) : null}
    </>
  );
});

/* ============================= SÜRÜM SEKMESİ ============================== */

const VersionsTab = React.memo(function VersionsTab({ offer }: { offer: OfferDocument }) {
  const versions = useMemo(
    () => [...(offer.versions ?? [])].sort((a, b) => b.version_number - a.version_number),
    [offer.versions],
  );
  const revisions = useMemo(
    () =>
      [...(offer.revisionRequests ?? [])].sort((a, b) =>
        String(b.requested_at ?? "").localeCompare(String(a.requested_at ?? "")),
      ),
    [offer.revisionRequests],
  );

  if (!versions.length && !revisions.length) {
    return (
      <EmptyState
        icon="layers-outline"
        title="Sürüm geçmişi yok"
        body="Takım teklifi güncellediğinde her sürüm burada saklanır."
        variant="inline"
      />
    );
  }

  return (
    <>
      <SectionHeader title="Teklif sürümleri" meta={String(versions.length)} />
      {versions.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          current={version.version_number === offer.current_version}
        />
      ))}

      {revisions.length > 0 ? (
        <>
          <SectionHeader title="Düzenleme isteklerim" meta={String(revisions.length)} />
          {revisions.map((request) => (
            <RevisionCard key={request.id} request={request} />
          ))}
        </>
      ) : null}
    </>
  );
});

const VersionCard = React.memo(function VersionCard({
  version,
  current,
}: {
  version: OfferVersion;
  current: boolean;
}) {
  const currency = version.currency ?? "TRY";
  return (
    <Surface level={1} radius="lg" style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} {...textScale.dense}>
          {version.version_number}. sürüm
        </Text>
        {current ? <Badge label="YÜRÜRLÜKTE" tone="win" size="xs" /> : null}
        <Text style={styles.cardDate} {...textScale.badge}>
          {version.createdAt ? formatDateShort(version.createdAt) : ""}
        </Text>
      </View>
      <Divider variant="full" />
      <View style={styles.cardRows}>
        <CardLine label="Transfer bedeli" value={moneyText(version.transfer_fee, currency)} />
        <CardLine
          label="Süre"
          value={`${version.contract_start_date ? formatDateShort(version.contract_start_date) : "?"} → ${
            version.contract_end_date ? formatDateShort(version.contract_end_date) : "Süresiz"
          }`}
        />
        <CardLine
          label="Maç başı ücret"
          value={version.per_match_fee_active ? moneyText(version.per_match_fee, currency) : "Yok"}
        />
        <CardLine
          label="Serbest kalma"
          value={
            version.release_clause_active ? moneyText(version.release_clause_fee, currency) : "Yok"
          }
        />
      </View>
      {version.message ? (
        <Text style={styles.cardNote} {...textScale.long}>
          “{version.message}”
        </Text>
      ) : null}
    </Surface>
  );
});

const RevisionCard = React.memo(function RevisionCard({ request }: { request: RevisionRequest }) {
  const open = request.status === "OPEN";
  return (
    <Surface level={1} radius="lg" style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} {...textScale.dense}>
          Düzenleme isteği
        </Text>
        <Badge label={open ? "AÇIK" : "YANITLANDI"} tone={open ? "warn" : "win"} size="xs" />
        <Text style={styles.cardDate} {...textScale.badge}>
          {request.requested_at ? formatDateShort(request.requested_at) : ""}
        </Text>
      </View>
      <Divider variant="full" />
      <View style={styles.cardRows}>
        {(request.items ?? []).map((item) => (
          <View key={item.id} style={styles.revisionItem}>
            <Text style={styles.revisionField} {...textScale.dense}>
              {REVISION_FIELD_LABELS[item.field_code] ?? item.field_code}
            </Text>
            <Text style={styles.revisionValue} {...textScale.dense}>
              {readableValue(item.old_value)} → {readableValue(item.proposed_value)}
            </Text>
            {item.explanation ? (
              <Text style={styles.cardNote} {...textScale.long}>
                {item.explanation}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {request.general_message ? (
        <Text style={styles.cardNote} {...textScale.long}>
          “{request.general_message}”
        </Text>
      ) : null}
    </Surface>
  );
});

const CardLine = React.memo(function CardLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.cardLine}>
      <Text style={styles.cardLineLabel} {...textScale.dense}>
        {label}
      </Text>
      <Text style={styles.cardLineValue} numberOfLines={2} {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
});

/* ============================= SÜREÇ SEKMESİ ============================== */

const TimelineTab = React.memo(function TimelineTab({ offer }: { offer: OfferDocument }) {
  const events = useMemo(
    () =>
      [...(offer.events ?? [])].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      ),
    [offer.events],
  );

  if (!events.length) {
    return (
      <EmptyState
        icon="time-outline"
        title="Süreç kaydı yok"
        body="Teklifte bir hareket olduğunda burada zaman sırasıyla görünür."
        variant="inline"
      />
    );
  }

  return (
    <>
      <SectionHeader title="Süreç akışı" meta={String(events.length)} />
      {events.map((event, index) => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
            {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineBody}>
            <Text style={styles.timelineTitle} {...textScale.dense}>
              {EVENT_LABELS[event.event_type] ?? event.event_type}
            </Text>
            {event.description ? (
              <Text style={styles.timelineDesc} {...textScale.long}>
                {event.description}
              </Text>
            ) : null}
            <Text style={styles.timelineMeta} {...textScale.badge}>
              {formatDateShort(event.createdAt)}
              {event.actor_side ? ` · ${SIDE_LABELS[event.actor_side] ?? event.actor_side}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </>
  );
});

/* =========================== REVİZYON FORM PARÇALARI ======================= */

const RevisionChip = React.memo(function RevisionChip({
  field,
  selected,
  onToggle,
}: {
  field: RevisionField;
  selected: boolean;
  onToggle: (field: RevisionField) => void;
}) {
  const handlePress = useCallback(() => onToggle(field), [field, onToggle]);
  return <Chip label={field.label} selected={selected} onPress={handlePress} size="sm" />;
});

const RevisionFieldEditor = React.memo(function RevisionFieldEditor({
  field,
  value,
  note,
  onChangeValue,
  onChangeNote,
}: {
  field: RevisionField;
  value: string;
  note: string;
  onChangeValue: (code: string, value: string) => void;
  onChangeNote: (code: string, value: string) => void;
}) {
  const handleValue = useCallback(
    (next: string) => onChangeValue(field.code, next),
    [field.code, onChangeValue],
  );
  const handleNote = useCallback(
    (next: string) => onChangeNote(field.code, next),
    [field.code, onChangeNote],
  );
  const handleToggle = useCallback(
    (next: boolean) => onChangeValue(field.code, next ? "true" : "false"),
    [field.code, onChangeValue],
  );

  return (
    <Surface level={1} radius="md" style={styles.editor}>
      <Text style={styles.editorTitle} {...textScale.dense}>
        {field.label}
      </Text>

      {field.kind === "bool" ? (
        <View style={styles.editorToggle}>
          <Text style={styles.editorToggleText} {...textScale.dense}>
            İstediğim: {value === "true" ? "Olsun" : "Olmasın"}
          </Text>
          <Toggle value={value === "true"} onValueChange={handleToggle} />
        </View>
      ) : (
        <Input
          value={value}
          onChangeText={handleValue}
          placeholder={field.hint ?? "Yeni değer"}
          keyboardType={field.kind === "money" ? "numeric" : "default"}
          multiline={field.kind === "text"}
        />
      )}

      <Input
        value={note}
        onChangeText={handleNote}
        placeholder="Gerekçe (isteğe bağlı)"
        size="sm"
      />
    </Surface>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  termNote: {
    padding: space.md,
    marginBottom: space.xs,
    gap: space.xxs,
  },
  termLabel: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  termValue: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabsWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  contentWithBar: {
    paddingBottom: space.giant + space.giant,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    marginTop: space.md,
  },
  heroBody: {
    flex: 1,
    gap: space.xs,
  },
  heroTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  heroMeta: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xxs,
  },
  note: {
    ...type.caption,
    letterSpacing: 0,
    lineHeight: 16,
    marginTop: space.sm,
    paddingHorizontal: space.xxs,
  },
  noteWarn: {
    color: colors.warn,
  },
  noteDanger: {
    color: colors.danger,
  },
  quote: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
  },
  quoteText: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  card: {
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  cardDate: {
    ...type.micro,
    color: colors.textTertiary,
  },
  cardRows: {
    gap: space.s,
  },
  cardLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  cardLineLabel: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    flex: 1,
  },
  cardLineValue: {
    ...type.caption,
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    flex: 1,
    textAlign: "right",
  },
  cardNote: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
  revisionItem: {
    gap: space.xxs,
  },
  revisionField: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
  revisionValue: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
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
  actionBar: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface1,
  },
  actionButton: {
    flex: 1,
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
  revisionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  editor: {
    padding: space.md,
    gap: space.sm,
  },
  editorTitle: {
    ...type.label,
    color: colors.textPrimary,
  },
  editorToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  editorToggleText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
});
