import { del, get, post } from "../http";
import type { Paged, TransferOffer } from "./panel";

/**
 * Takım tarafı transfer uçları — routes/transferOffers.js, routes/transferMarket.js.
 *
 * Oyuncu tarafı (gelen kutusu, kabul/ret/revizyon iste) lib/api/panel.ts'te.
 * Buradakiler takım başkanının işleri:
 *   • teklif gönder / revize et / geri çek (expectedVersion ile iyimser kilit:
 *     başka yerden değişen teklif 409 döner)
 *   • giden teklifler (outbox)
 *   • serbest kalma izni: oyuncu sezon kadrosundaysa ya da aktif sözleşmesi
 *     varsa başka takımın teklifi, MEVCUT takımın iznini bekler.
 *   • transfer borsası (satılık / kiralık ilanlar)
 *
 * Teklif şartları web'deki termsPayload ile aynı biçimde gider
 * (elitlig-client src/features/transfers/transferUtils.js).
 */

export type TransferType = "sale" | "loan";

export interface OfferTerms {
  transferType: TransferType;
  transferFee: string;
  currency: "TRY" | "EUR" | "USD";
  guestPlayAllowed: boolean;
  releaseClauseActive: boolean;
  releaseClauseFee?: string;
  travelExpensesCovered: boolean;
  matchParticipationFeeCovered: boolean;
  perMatchFeeActive: boolean;
  perMatchFee?: string;
  contractStartDate: string;
  contractEndDate: string | null;
  message: string;
  additionalTerms: Record<string, unknown>;
}

export const createOffer = (body: OfferTerms & { playerId: number; expiresAt: string }) =>
  post<{ offer: TransferOffer }>("/api/transfer-offers", body);

export const reviseOffer = (publicId: string, expectedVersion: number, terms: OfferTerms & { expiresAt?: string }) =>
  post<{ offer: TransferOffer }>(`/api/transfer-offers/${encodeURIComponent(publicId)}/revise`, { ...terms, expectedVersion });

export const withdrawOffer = (publicId: string, expectedVersion: number, reason: string) =>
  post<{ offer: TransferOffer }>(`/api/transfer-offers/${encodeURIComponent(publicId)}/withdraw`, { expectedVersion, reason });

export interface OutboxOffer extends TransferOffer {
  player?: { id: number; player_name: string; player_img: string | null } | null;
  release_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
}

export const getOfferOutbox = (page = 1) =>
  get<Paged<OutboxOffer>>("/api/transfer-offers/outbox", { page, limit: 50 });

/** Serbest kalma izni — yalnız oyuncunun mevcut takımının yöneticisi. */
export const decideRelease = (publicId: string, decision: "approve" | "reject", note = "") =>
  post<{ message?: string }>(`/api/transfer-offers/${encodeURIComponent(publicId)}/release/${decision}`, { note });

/* ───────────────────────── Transfer borsası ───────────────────────── */

export interface Listing {
  id: number;
  public_id: string;
  listing_type: TransferType;
  type_label: string;
  asking_fee: number | null;
  note: string;
  status: "open" | "closed" | string;
  created_at: string;
  closed_at: string | null;
  player: {
    id: number;
    name?: string;
    image?: string | null;
    position?: string | null;
    birth_date?: string | null;
    city?: string | null;
    market_value?: number | null;
  };
  team: { id: number; name?: string; logo?: string | null; city?: string | null };
  is_mine: boolean;
}

export const getListings = (params: { type?: TransferType; q?: string } = {}) =>
  get<{ items: Listing[] }>("/api/transfer-market/listings", params);

export const getMyListings = () => get<{ items: Listing[] }>("/api/transfer-market/mine");

export const createListing = (body: { player_id: number; listing_type: TransferType; asking_fee: number | null; note: string }) =>
  post<{ message: string; item: Listing }>("/api/transfer-market/listings", body);

export const closeListing = (publicId: string) =>
  del<{ message: string }>(`/api/transfer-market/listings/${encodeURIComponent(publicId)}`);

/* ───────────────────────── Yardımcılar ───────────────────────── */

/** "1.500,50" / "1500.5" → "1500.50"; geçersizse null (web decimalString). */
export function decimalString(value: string | number | null | undefined): string | null {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) < 0) return null;
  return normalized;
}

export function formatMoney(value: number | string | null | undefined, currency = "TRY"): string {
  if (value == null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(number);
}
