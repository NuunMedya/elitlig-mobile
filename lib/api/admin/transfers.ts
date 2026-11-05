import { ApiError, get, post } from "../../http";

/**
 * TRANSFER ONAYLARI — routes/transferOffers.js (controllers/transferController).
 *
 * Bağlı panel hesabı olmayan oyunculara gönderilen teklifler oyuncuya değil
 * yönetime düşer. Onayda sözleşme oluşur ve oyuncu teklifi veren takıma geçer.
 *
 *   GET  /api/transfer-offers/admin/pending?adminStatus=PENDING|APPROVED|REJECTED
 *   POST /api/transfer-offers/admin/:publicId/approve  { note, expectedVersion }
 *   POST /api/transfer-offers/admin/:publicId/reject   { note, expectedVersion }
 */

export const ADMIN_STATUS_TABS = [
  { key: "PENDING", label: "Onay bekleyen" },
  { key: "APPROVED", label: "Onaylanan" },
  { key: "REJECTED", label: "Reddedilen" },
] as const;

export type AdminStatus = (typeof ADMIN_STATUS_TABS)[number]["key"];

export const OFFER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  SENT: "Gönderildi",
  REVISION_REQUESTED: "Revizyon istendi",
  ACCEPTED: "Kabul edildi",
  REJECTED: "Reddedildi",
  WITHDRAWN: "Geri çekildi",
  EXPIRED: "Süresi doldu",
  CANCELLED: "İptal edildi",
};

/** features/transfers/transferApi.TRANSFER_ERROR_MESSAGES (yönetimle ilgili olanlar). */
const ERROR_MESSAGES: Record<string, string> = {
  TRANSFER_OFFER_VERSION_CONFLICT: "Teklif güncellendi. Son bilgiler yeniden yüklendi.",
  TRANSFER_OFFER_NOT_ADMIN_SCOPED: "Bu teklif yönetim onayına tabi değil.",
  TRANSFER_OFFER_ALREADY_REVIEWED: "Bu teklif zaten sonuçlandırılmış.",
  TRANSFER_OFFER_FORBIDDEN: "Bu işlem için yetkiniz yok.",
  TRANSFER_OFFER_NOT_FOUND: "Teklif bulunamadı.",
  PLAYER_NOT_FOUND: "Oyuncu bulunamadı.",
};

/** Kodlu hatayı Türkçe cümleye çevirip yeniden fırlatır. */
async function mapped<T>(task: Promise<T>): Promise<T> {
  try {
    return await task;
  } catch (error) {
    if (error instanceof ApiError && error.code && ERROR_MESSAGES[error.code]) {
      throw new ApiError(ERROR_MESSAGES[error.code], error.status === 409 ? 409 : 400, error.code, error.detail);
    }
    throw error;
  }
}

export interface OfferVersion {
  version_number: number;
  transfer_type?: string;
  transfer_fee?: string | number | null;
  currency?: string;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  guest_play_allowed?: boolean;
  travel_expenses_covered?: boolean;
  match_participation_fee_covered?: boolean;
  release_clause_active?: boolean;
  release_clause_fee?: string | number | null;
  per_match_fee_active?: boolean;
  per_match_fee?: string | number | null;
  message?: string | null;
}

export interface AdminOffer extends Partial<OfferVersion> {
  public_id: string;
  player_id: number;
  status: string;
  version?: number;
  current_version?: number;
  versions?: OfferVersion[];
  sent_at?: string | null;
  createdAt?: string | null;
  expires_at?: string | null;
  admin_status?: string | null;
  admin_note?: string | null;
  admin_reviewed_at?: string | null;
  player?: { player_name?: string; player_img?: string | null; player_position?: string | null; city?: string | null } | null;
  team?: { team_name?: string; logo?: string | null; city?: string | null } | null;
}

export const listAdminOffers = (adminStatus: AdminStatus) =>
  mapped(
    get<{ items?: AdminOffer[]; totalItems?: number }>("/api/transfer-offers/admin/pending", { adminStatus, limit: 100 })
  ).then((d) => ({ items: d.items ?? [], total: d.totalItems ?? d.items?.length ?? 0 }));

/** Teklifin geçerli sürümü (transferUtils.currentVersion). */
export const currentTerms = (offer: AdminOffer): OfferVersion => {
  const wanted = Number(offer.current_version ?? offer.version);
  return (
    offer.versions?.find((v) => Number(v.version_number) === wanted) ||
    offer.versions?.[offer.versions.length - 1] ||
    (offer as OfferVersion)
  );
};

export const approveOffer = (offer: AdminOffer, note: string) =>
  mapped(
    post<{ message?: string }>(`/api/transfer-offers/admin/${encodeURIComponent(offer.public_id)}/approve`, {
      note: note.trim() || undefined,
      expectedVersion: offer.version,
    })
  );

export const rejectOffer = (offer: AdminOffer, note: string) =>
  mapped(
    post<{ message?: string }>(`/api/transfer-offers/admin/${encodeURIComponent(offer.public_id)}/reject`, {
      note: note.trim() || undefined,
      expectedVersion: offer.version,
    })
  );

/** "1.250,00 ₺" — Intl para biçimi (transferUtils.money). */
export function money(value: unknown, currency = "TRY"): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toLocaleString("tr-TR")} ${currency}`;
  }
}
