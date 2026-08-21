/**
 * SÖZLEŞME BELGESİ — tek sözleşmenin detayı.
 *
 * NE: `CONTRACT_CREATED / CONTRACT_EXPIRING / CONTRACT_EXPIRED` panel
 * bildirimlerinin varış noktası (şartname §5, satır 13) ve kabul edilen
 * teklifin devamı. Sözleşme, kabul anında teklifin YÜRÜRLÜKTEKİ SÜRÜMÜNDEN
 * kopyalanır (services/transfer/offerService.js → createContract); bu yüzden
 * belge ile teklifin maddeleri birebir aynı dille yazılır — oyuncu iki ekran
 * arasında "acaba şart değişti mi" diye karşılaştırma yapmak zorunda kalmaz.
 *
 * ROTA ANAHTARI: `id` = `public_id` (UUID). Bildirimdeki `entity_public_id`
 * doğrudan buraya verilir.
 *
 * KAPSAM (scope) KARARI: liste ekranı `scope=player` kullanır, çünkü "double"
 * rolündeki üyenin kendi sözleşmeleri takımınkilerle karışmasın. DETAYDA
 * kapsam GÖNDERİLMEZ: sunucu kapsam yokken oyuncu ve takım taraflarını OR ile
 * birleştirir (contractService.js → scope), böylece aynı ekran hem oyuncuya
 * gelen `CONTRACT_*` bildirimini hem başkana gelen takım sözleşmesi
 * bildirimini açabilir. Belirli bir `public_id` istendiği için bu geniş kapsam
 * bir yetki açığı değildir; kayıt zaten üyenin taraf olduğu kayıtlarla
 * sınırlanır.
 *
 * UÇ SARMALAYICISI: `lib/api/panel.ts` yalnız liste ucunu (getMyContracts)
 * dışa açıyor; detay ucu için ortak `get()` yardımcısı kullanılır (projede
 * app/takim/[id].tsx ve app/oyuncum/index.tsx da böyle yapıyor).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  KeyValueRow,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  Surface,
  TeamLogo,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { type Contract } from "@/lib/api/panel";
import { formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { get } from "@/lib/http";
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

/** Kaynak teklifin süreç kaydı (offer events) — belgede kısa akış olarak çizilir. */
interface OfferEvent {
  id: number;
  event_type: string;
  actor_side?: string | null;
  description?: string | null;
  createdAt: string;
}

/**
 * Detay ucu `models/Contract.js` satırının tamamını döndürür; liste tipindeki
 * çekirdek alanlar üstüne madde alanları burada tanımlanır. Hepsi isteğe
 * bağlıdır: sunucu bir alanı boş bırakırsa o satır çizilmez.
 */
interface ContractDocument extends Contract {
  transfer_fee?: string | number | null;
  currency?: string | null;
  guest_play_allowed?: boolean | null;
  release_clause_active?: boolean | null;
  release_clause_fee?: string | number | null;
  travel_expenses_covered?: boolean | null;
  match_participation_fee_covered?: boolean | null;
  per_match_fee_active?: boolean | null;
  per_match_fee?: string | number | null;
  additional_terms?: string | null;
  player_accepted_at?: string | null;
  team_sent_at?: string | null;
  activated_at?: string | null;
  terminated_at?: string | null;
  sourceOffer?: { public_id: string; status: string; events?: OfferEvent[] } | null;
}

const getContract = (publicId: string) =>
  get<{ contract: ContractDocument }>(`/api/contracts/${publicId}`);

/* ============================ SABİTLER / TİPLER ============================ */

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Yürürlükte", tone: "win" },
  PENDING_ACTIVATION: { label: "Aktivasyon bekliyor", tone: "warn" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral" },
  TERMINATED: { label: "Feshedildi", tone: "danger" },
};

const statusMeta = (status: string): { label: string; tone: Tone } =>
  STATUS_META[status] ?? { label: status, tone: "neutral" };

const EVENT_LABELS: Record<string, string> = {
  OFFER_CREATED: "Teklif oluşturuldu",
  OFFER_SENT: "Teklif gönderildi",
  OFFER_VIEWED: "Teklif görüntülendi",
  OFFER_ACCEPTED: "Teklif kabul edildi",
  OFFER_REVISED: "Teklif güncellendi",
  REVISION_REQUESTED: "Düzenleme istendi",
  ADMIN_APPROVED: "Yönetim onayladı",
};

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

const yesNo = (value?: boolean | null, yes = "Var", no = "Yok"): string => (value ? yes : no);

/**
 * Para metni. `formatMoney` sıfırı "—" sayar; oysa transfer bedelinin sıfır
 * olması bir eksiklik değil, "bedelsiz transfer" demektir — bu ayrım korunur.
 */
function moneyText(value: string | number | null | undefined, currency: string): string {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount === 0) return "Bedelsiz";
  return formatMoney(value, currency);
}

/** Bitişe kalan gün; süresiz ya da geçmiş sözleşmede null. */
function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return Math.ceil(diff / 86_400_000);
}

/** Ek maddeler JSON metnidir; okunur satırlara çevrilir (teklif belgesiyle aynı kural). */
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

/* ================================= EKRAN ================================== */

export default function ContractDetailScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const publicId = String(firstParam(params.id) ?? "").trim();

  const query = useQuery({
    queryKey: ["panel", "contract", publicId],
    queryFn: () => getContract(publicId),
    enabled: Boolean(auth.user) && publicId.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const contract = query.data?.contract;
  const currency = contract?.currency ?? "TRY";
  const meta = contract ? statusMeta(contract.status) : null;
  const left = daysLeft(contract?.contract_end_date);

  const additional = useMemo(
    () => parseAdditionalTerms(contract?.additional_terms),
    [contract?.additional_terms],
  );

  /** Maddeler — teklif belgesindeki sırayla, aynı etiketlerle. */
  const clauses = useMemo(() => {
    if (!contract) return [];
    return [
      {
        key: "bedel",
        label: "Transfer bedeli",
        value: moneyText(contract.transfer_fee, currency),
        numeric: true,
        tone: "brand" as Tone,
      },
      {
        key: "macbasi",
        label: "Maç başı ücret",
        value: contract.per_match_fee_active
          ? moneyText(contract.per_match_fee, currency)
          : "Yok",
        numeric: true,
      },
      {
        key: "serbest",
        label: "Serbest kalma bedeli",
        value: contract.release_clause_active
          ? moneyText(contract.release_clause_fee, currency)
          : "Yok",
        numeric: true,
      },
      {
        key: "misafir",
        label: "Misafir oyunculuk",
        value: yesNo(contract.guest_play_allowed, "İzinli", "İzinsiz"),
      },
      {
        key: "yol",
        label: "Yol gideri",
        value: yesNo(contract.travel_expenses_covered, "Takım karşılıyor", "Karşılanmıyor"),
      },
      {
        key: "katilim",
        label: "Maç katılım ücreti",
        value: yesNo(contract.match_participation_fee_covered, "Takım karşılıyor", "Karşılanmıyor"),
      },
    ];
  }, [contract, currency]);

  /** Belgenin zaman çizgisi — tarih alanları dolu olanlar. */
  const dates = useMemo(() => {
    if (!contract) return [];
    const rows: { key: string; label: string; value: string }[] = [
      {
        key: "baslangic",
        label: "Başlangıç",
        value: contract.contract_start_date
          ? formatDateShort(contract.contract_start_date)
          : "—",
      },
      {
        key: "bitis",
        label: "Bitiş",
        value: contract.contract_end_date
          ? formatDateShort(contract.contract_end_date)
          : "Süresiz (bitiş yok)",
      },
    ];
    if (contract.team_sent_at) {
      rows.push({
        key: "gonderim",
        label: "Takım gönderdi",
        value: formatDateShort(contract.team_sent_at),
      });
    }
    if (contract.player_accepted_at) {
      rows.push({
        key: "kabul",
        label: "Oyuncu kabul etti",
        value: formatDateShort(contract.player_accepted_at),
      });
    }
    if (contract.activated_at) {
      rows.push({
        key: "aktivasyon",
        label: "Yürürlüğe girdi",
        value: formatDateShort(contract.activated_at),
      });
    }
    if (contract.terminated_at) {
      rows.push({
        key: "fesih",
        label: "Fesih",
        value: formatDateShort(contract.terminated_at),
      });
    }
    return rows;
  }, [contract]);

  const events = useMemo(
    () =>
      [...(contract?.sourceOffer?.events ?? [])].sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      ),
    [contract?.sourceOffer?.events],
  );

  const openTeam = useCallback(() => {
    if (contract?.team?.id) router.push(`/takim/${contract.team.id}`);
  }, [contract?.team?.id, router]);

  const openPlayer = useCallback(() => {
    if (contract?.player?.id) router.push(`/oyuncu/${contract.player.id}`);
  }, [contract?.player?.id, router]);

  const openOffer = useCallback(() => {
    const offerId = contract?.sourceOffer?.public_id;
    if (offerId) router.push(`/teklif/${offerId}`);
  }, [contract?.sourceOffer?.public_id, router]);

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Sözleşme"
        subtitle={contract?.team?.team_name ?? undefined}
        back
        scrollY={scrollY}
      />

      {!publicId ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Sözleşme bulunamadı"
          body="Bağlantıda sözleşme kimliği yok. Sözleşmelerim listesinden açmayı dene."
          action={{
            label: "Sözleşmelerime dön",
            onPress: () => router.replace("/sozlesmelerim"),
          }}
        />
      ) : query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} />
        </View>
      ) : query.isError || !contract ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView
          {...scrollProps}
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
        >
          {/* Künye */}
          <Surface level={1} radius="lg" style={styles.hero}>
            <TeamLogo
              name={contract.team?.team_name ?? "?"}
              logo={mediaUrl(contract.team?.logo ?? null)}
              size={layout.crestXl}
            />
            <View style={styles.heroBody}>
              <Text style={styles.heroTitle} numberOfLines={2} {...textScale.dense}>
                {contract.team?.team_name ?? "Takım"}
              </Text>
              <Text style={styles.heroMeta} {...textScale.dense}>
                {contract.contract_start_date
                  ? formatDateShort(contract.contract_start_date)
                  : "?"}
                {"  →  "}
                {contract.contract_end_date
                  ? formatDateShort(contract.contract_end_date)
                  : "Süresiz"}
              </Text>
              <View style={styles.heroBadges}>
                <Badge label={meta?.label ?? contract.status} tone={meta?.tone ?? "neutral"} size="sm" />
                {left !== null && left <= 30 && contract.status === "ACTIVE" ? (
                  <Badge label={`${left} GÜN KALDI`} tone="warn" size="xs" />
                ) : null}
              </View>
            </View>
          </Surface>

          {contract.status === "PENDING_ACTIVATION" ? (
            <Text style={[styles.note, styles.noteWarn]} {...textScale.long}>
              Sözleşme oluşturuldu ama henüz yürürlüğe girmedi. Yönetim onayı
              tamamlandığında kadro geçişin yapılır ve bildirim alırsın.
            </Text>
          ) : null}

          {/* Taraflar */}
          <SectionHeader title="Taraflar" />
          <ListRow
            leading={
              <TeamLogo
                name={contract.team?.team_name ?? "?"}
                logo={mediaUrl(contract.team?.logo ?? null)}
                size={layout.crestMd}
              />
            }
            title={contract.team?.team_name ?? "Takım"}
            subtitle="Kulüp"
            position="first"
            onPress={contract.team?.id ? openTeam : undefined}
          />
          <ListRow
            leading={
              <Avatar
                name={contract.player?.player_name ?? "?"}
                image={mediaUrl(contract.player?.player_img ?? null)}
                size={layout.crestMd}
              />
            }
            title={contract.player?.player_name ?? "Oyuncu"}
            subtitle="Oyuncu"
            position="last"
            onPress={contract.player?.id ? openPlayer : undefined}
          />

          {/* Süre */}
          <SectionHeader title="Süre ve tarihler" />
          {dates.map((row, index) => (
            <KeyValueRow
              key={row.key}
              label={row.label}
              value={row.value}
              numeric
              position={rowPosition(index, dates.length)}
            />
          ))}

          {/* Maddeler */}
          <SectionHeader title="Sözleşme maddeleri" />
          {clauses.map((row, index) => (
            <KeyValueRow
              key={row.key}
              label={row.label}
              value={row.value}
              tone={row.tone}
              numeric={row.numeric}
              position={rowPosition(index, clauses.length)}
            />
          ))}

          {additional.length > 0 ? (
            <>
              <SectionHeader title="Ek maddeler" meta={String(additional.length)} />
              {/* Uzun madde metinleri kırpılmasın diye paragraf yüzeyi. */}
              {additional.map((item, index) => (
                <Surface
                  key={`${item.label}-${index}`}
                  level={1}
                  radius="md"
                  style={styles.termNote}
                >
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

          {/* Kaynak teklif ve künye */}
          <SectionHeader title="Belge künyesi" />
          <KeyValueRow label="Sözleşme no" value={contract.public_id} numeric position="first" />
          <KeyValueRow
            label="Durum"
            value={meta?.label ?? contract.status}
            tone={meta?.tone}
            position={contract.sourceOffer ? "middle" : "last"}
          />
          {contract.sourceOffer ? (
            <ListRow
              leading={{ icon: "swap-horizontal", tone: "brand" }}
              title="Kaynak transfer teklifi"
              subtitle="Teklif belgesini ve sürüm geçmişini aç"
              position="last"
              onPress={openOffer}
            />
          ) : null}

          {/* Kısa süreç akışı */}
          {events.length > 0 ? (
            <>
              <SectionHeader title="Nasıl buraya geldi" meta={String(events.length)} />
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
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.footerNote}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textTertiary} />
            <Text style={styles.footerText} {...textScale.long}>
              Sözleşme maddeleri kabul edilen teklif sürümünden kopyalanır;
              değişiklik ancak yeni bir transfer süreciyle olur.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

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
    fontVariant: ["tabular-nums"],
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
  footerNote: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
    paddingHorizontal: space.xxs,
  },
  footerText: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    lineHeight: 16,
    flex: 1,
  },
});
