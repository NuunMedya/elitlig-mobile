/**
 * TRANSFER TEKLİFİ VER / REVİZE ET — takım başkanı.
 *
 *   /takimim/teklif-ver?playerId=12&playerName=Ali%20Yılmaz   yeni teklif
 *   /takimim/teklif-ver?offerId=<public_id>                     revizyon
 *
 * Yeni teklif POST /api/transfer-offers, revizyon POST …/:id/revise (oyuncu
 * revizyon istediğinde). Şartlar web'deki OfferForm ile aynı: tür, bedel,
 * para birimi, başlangıç/bitiş (boş bitiş = süresiz; kiralıkta zorunlu),
 * koşullar ve mesaj. Yeni teklifin bir cevap süresi vardır (expiresAt).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthCard, AuthNotice, AuthShell } from "@/components/account/AuthShell";
import { Button, Chip, ErrorState, Input, SkeletonCard, Toggle, useToast } from "@/components/ui";
import { getOffer } from "@/lib/api/panel";
import { toDisplayDate, toIsoDate } from "@/lib/api/profile";
import {
  createOffer,
  decimalString,
  reviseOffer,
  type OfferTerms,
  type TransferType,
} from "@/lib/api/transfers";
import { ApiError } from "@/lib/http";
import { colors, space, textScale, type } from "@/theme";

interface Form {
  transferType: TransferType;
  transferFee: string;
  currency: OfferTerms["currency"];
  start: string; // GG.AA.YYYY
  end: string; // GG.AA.YYYY, boş = süresiz
  guestPlayAllowed: boolean;
  travelExpensesCovered: boolean;
  matchParticipationFeeCovered: boolean;
  releaseClauseActive: boolean;
  releaseClauseFee: string;
  perMatchFeeActive: boolean;
  perMatchFee: string;
  message: string;
  expiryDays: number;
}

const todayDisplay = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
};

const DEFAULT_FORM: Form = {
  transferType: "sale",
  transferFee: "0",
  currency: "TRY",
  start: "",
  end: "",
  guestPlayAllowed: false,
  travelExpensesCovered: false,
  matchParticipationFeeCovered: false,
  releaseClauseActive: false,
  releaseClauseFee: "",
  perMatchFeeActive: false,
  perMatchFee: "",
  message: "",
  expiryDays: 7,
};

const CURRENCIES: { key: OfferTerms["currency"]; label: string }[] = [
  { key: "TRY", label: "₺ TL" },
  { key: "EUR", label: "€ Euro" },
  { key: "USD", label: "$ Dolar" },
];

const EXPIRY_DAYS = [3, 7, 14, 30];

const CONDITIONS: { key: "guestPlayAllowed" | "travelExpensesCovered" | "matchParticipationFeeCovered"; title: string; detail: string }[] = [
  { key: "guestPlayAllowed", title: "Misafir oyunculuk", detail: "Bilginiz dahilinde başka takımlarda misafir oynayabilir." },
  { key: "travelExpensesCovered", title: "Seyahat masrafları", detail: "Deplasman ulaşım ve konaklamasını takım karşılar." },
  { key: "matchParticipationFeeCovered", title: "Maç katılım ücreti", detail: "Maç başı aidat oyuncudan değil takımdan alınır." },
];

type Errors = Partial<Record<"transferFee" | "start" | "end" | "releaseClauseFee" | "perMatchFee" | "message", string>>;

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (decimalString(form.transferFee) === null) errors.transferFee = "Geçerli bir tutar gir (en çok 2 ondalık).";
  const start = toIsoDate(form.start);
  if (!start) errors.start = "GG.AA.YYYY biçiminde başlangıç tarihi gir.";
  const end = form.end.trim() ? toIsoDate(form.end) : null;
  if (form.end.trim() && !end) errors.end = "GG.AA.YYYY biçiminde gir.";
  else if (form.transferType === "loan" && !end) errors.end = "Kiralıkta bitiş tarihi zorunludur.";
  else if (start && end && start > end) errors.end = "Bitiş başlangıçtan önce olamaz.";
  if (form.releaseClauseActive && !(Number(decimalString(form.releaseClauseFee)) > 0)) errors.releaseClauseFee = "Pozitif bir bedel gir.";
  if (form.perMatchFeeActive && !(Number(decimalString(form.perMatchFee)) > 0)) errors.perMatchFee = "Pozitif bir ücret gir.";
  if (form.message.length > 3000) errors.message = "En fazla 3000 karakter.";
  return errors;
}

function toTerms(form: Form): OfferTerms {
  return {
    transferType: form.transferType,
    transferFee: decimalString(form.transferFee) ?? "0",
    currency: form.currency,
    guestPlayAllowed: form.guestPlayAllowed,
    releaseClauseActive: form.releaseClauseActive,
    ...(form.releaseClauseActive ? { releaseClauseFee: decimalString(form.releaseClauseFee) ?? undefined } : {}),
    travelExpensesCovered: form.travelExpensesCovered,
    matchParticipationFeeCovered: form.matchParticipationFeeCovered,
    perMatchFeeActive: form.perMatchFeeActive,
    ...(form.perMatchFeeActive ? { perMatchFee: decimalString(form.perMatchFee) ?? undefined } : {}),
    contractStartDate: toIsoDate(form.start) ?? "",
    contractEndDate: form.end.trim() ? toIsoDate(form.end) : null,
    message: form.message.trim(),
    additionalTerms: {},
  };
}

/** Teklifin güncel sürümünü forma çevirir (revizyon). */
type VersionLike = Record<string, unknown>;
function fromVersion(version: VersionLike | null): Form {
  if (!version) return { ...DEFAULT_FORM, start: todayDisplay() };
  const str = (key: string) => (version[key] == null ? "" : String(version[key]));
  return {
    ...DEFAULT_FORM,
    transferType: version.transfer_type === "loan" ? "loan" : "sale",
    transferFee: str("transfer_fee") || "0",
    currency: (["TRY", "EUR", "USD"].includes(str("currency")) ? str("currency") : "TRY") as Form["currency"],
    start: toDisplayDate(str("contract_start_date")),
    end: toDisplayDate(str("contract_end_date")),
    guestPlayAllowed: Boolean(version.guest_play_allowed),
    travelExpensesCovered: Boolean(version.travel_expenses_covered),
    matchParticipationFeeCovered: Boolean(version.match_participation_fee_covered),
    releaseClauseActive: Boolean(version.release_clause_active),
    releaseClauseFee: str("release_clause_fee"),
    perMatchFeeActive: Boolean(version.per_match_fee_active),
    perMatchFee: str("per_match_fee"),
    message: "",
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function OfferFormScreen() {
  const params = useLocalSearchParams<{ playerId?: string; playerName?: string; offerId?: string; tur?: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const offerId = first(params.offerId);
  const playerId = Number(first(params.playerId)) || null;
  const isRevision = Boolean(offerId);

  const offerQuery = useQuery({
    queryKey: ["panel", "offer", offerId],
    queryFn: () => getOffer(offerId),
    enabled: isRevision,
    retry: false,
  });
  const offer = offerQuery.data?.offer as
    | (NonNullable<typeof offerQuery.data>["offer"] & {
        versions?: VersionLike[];
        player?: { player_name?: string } | null;
      })
    | undefined;

  const [form, setForm] = useState<Form | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (form) return;
    if (!isRevision) {
      setForm({ ...DEFAULT_FORM, start: todayDisplay(), transferType: first(params.tur) === "loan" ? "loan" : "sale" });
      return;
    }
    if (!offer) return;
    const versions = offer.versions ?? [];
    const current =
      versions.find((item) => Number(item.version_number) === Number(offer.current_version)) ?? versions[versions.length - 1] ?? null;
    setForm(fromVersion(current));
  }, [form, isRevision, offer, params.tur]);

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const playerName = first(params.playerName) || offer?.player?.player_name || "Oyuncu";

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  };
  const errorFor = (key: keyof Errors) => (touched ? errors[key] : undefined);

  const submit = async () => {
    setTouched(true);
    if (!form || Object.keys(errors).length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const terms = toTerms(form);
      if (isRevision && offer) {
        await reviseOffer(offer.public_id, offer.version, terms);
        toast.show({ message: "Revize teklif oyuncuya iletildi.", tone: "success" });
        void queryClient.invalidateQueries({ queryKey: ["panel", "offer", offerId] });
      } else if (playerId) {
        const expiresAt = new Date(Date.now() + form.expiryDays * 24 * 60 * 60 * 1000).toISOString();
        const result = await createOffer({ ...terms, playerId, expiresAt });
        toast.show({ message: `${playerName} için teklif gönderildi.`, tone: "success" });
        router.replace(`/teklif/${result.offer.public_id}`);
      }
      void queryClient.invalidateQueries({ queryKey: ["takim", "outbox"] });
      if (isRevision && router.canGoBack()) router.back();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 409 && caught.code === "TRANSFER_OFFER_VERSION_CONFLICT"
            ? "Teklif bu arada değişti. Geri dönüp güncel hâlini açıp yeniden dene."
            : caught.userMessage
          : "Teklif gönderilemedi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: ReactNode) => (
    <AuthShell
      title={isRevision ? "Teklifi revize et" : "Transfer teklifi"}
      variant="form"
      overline={isRevision ? "Teklif revizyonu" : "Transfer teklifi"}
      heading={playerName}
      lede={
        isRevision
          ? "Oyuncunun revizyon isteğine göre şartları güncelle; yeni sürüm oyuncuya iletilir."
          : "Şartları belirle; teklif oyuncuya iletilir. Oyuncu kadroda bildirilmişse mevcut takımının izni de gerekir."
      }
      icon="swap-horizontal"
      back
    >
      {children}
    </AuthShell>
  );

  if (!isRevision && !playerId) {
    return shell(<AuthNotice message="Teklif verilecek oyuncu seçilmedi. Oyuncu profilinden “Teklif ver” ile aç." />);
  }
  if (isRevision && offerQuery.isError) {
    return shell(<ErrorState variant="inline" error={offerQuery.error} onRetry={offerQuery.refetch} />);
  }
  if (!form) return shell(<SkeletonCard lines={6} />);

  return shell(
    <>
      <AuthCard title="Tür ve bedel">
        <View style={styles.chips}>
          <Chip label="Kalıcı transfer" selected={form.transferType === "sale"} onPress={() => set("transferType", "sale")} />
          <Chip label="Kiralık" selected={form.transferType === "loan"} onPress={() => set("transferType", "loan")} />
        </View>
        <Input
          label="Bonservis bedeli"
          value={form.transferFee}
          onChangeText={(value) => set("transferFee", value)}
          error={errorFor("transferFee")}
          keyboardType="decimal-pad"
          hint="Bedelsiz transfer için 0 bırak."
        />
        <View style={styles.chips}>
          {CURRENCIES.map((item) => (
            <Chip key={item.key} size="sm" label={item.label} selected={form.currency === item.key} onPress={() => set("currency", item.key)} />
          ))}
        </View>
      </AuthCard>

      <AuthCard title="Sözleşme süresi">
        <Input
          label="Başlangıç"
          value={form.start}
          onChangeText={(value) => set("start", value)}
          error={errorFor("start")}
          placeholder="GG.AA.YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Input
          label={form.transferType === "loan" ? "Bitiş" : "Bitiş (boş = süresiz)"}
          value={form.end}
          onChangeText={(value) => set("end", value)}
          error={errorFor("end")}
          placeholder="GG.AA.YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      </AuthCard>

      <AuthCard title="Koşullar">
        {CONDITIONS.map((item) => (
          <ConditionRow key={item.key} title={item.title} detail={item.detail} value={form[item.key]} onChange={(value) => set(item.key, value)} />
        ))}
        <ConditionRow
          title="Serbest kalma maddesi"
          detail="Bedel ödenince oyuncu sözleşmeden tek taraflı ayrılabilir."
          value={form.releaseClauseActive}
          onChange={(value) => set("releaseClauseActive", value)}
        />
        {form.releaseClauseActive ? (
          <Input
            label="Serbest kalma bedeli"
            size="sm"
            value={form.releaseClauseFee}
            onChangeText={(value) => set("releaseClauseFee", value)}
            error={errorFor("releaseClauseFee")}
            keyboardType="decimal-pad"
          />
        ) : null}
        <ConditionRow
          title="Maç başı ücret"
          detail="Oyuncuya oynadığı her resmî maç için ödeme yapılır."
          value={form.perMatchFeeActive}
          onChange={(value) => set("perMatchFeeActive", value)}
        />
        {form.perMatchFeeActive ? (
          <Input
            label="Maç başı ücret"
            size="sm"
            value={form.perMatchFee}
            onChangeText={(value) => set("perMatchFee", value)}
            error={errorFor("perMatchFee")}
            keyboardType="decimal-pad"
          />
        ) : null}
      </AuthCard>

      <AuthCard title="Mesaj">
        <Input
          value={form.message}
          onChangeText={(value) => set("message", value)}
          error={errorFor("message")}
          multiline
          numberOfLines={4}
          maxLength={3000}
          placeholder="Oyuncuya kısa bir not yaz (isteğe bağlı)."
        />
        {!isRevision ? (
          <>
            <Text style={styles.label} {...textScale.dense}>
              Cevap süresi
            </Text>
            <View style={styles.chips}>
              {EXPIRY_DAYS.map((days) => (
                <Chip key={days} size="sm" label={`${days} gün`} selected={form.expiryDays === days} onPress={() => set("expiryDays", days)} />
              ))}
            </View>
          </>
        ) : null}
      </AuthCard>

      {error ? <AuthNotice message={error} /> : null}
      <Button
        label={isRevision ? "Revize teklifi gönder" : "Teklifi gönder"}
        icon="paper-plane-outline"
        onPress={submit}
        loading={busy}
        size="lg"
        fullWidth
      />
    </>,
  );
}

function ConditionRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.condition}>
      <View style={styles.conditionText}>
        <Text style={styles.conditionTitle} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.conditionDetail} {...textScale.long}>
          {detail}
        </Text>
      </View>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  label: { ...type.label, color: colors.textSecondary },
  condition: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  conditionText: { flex: 1, gap: space.xxs },
  conditionTitle: { ...type.label, color: colors.textPrimary },
  conditionDetail: { ...type.caption, color: colors.textTertiary },
});
