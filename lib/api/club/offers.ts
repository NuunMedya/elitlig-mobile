import { get } from "../../http";
import { collectPages, type Paged } from "../panel";
import type { OutboxOffer } from "../transfers";

/**
 * KULÜBÜN TEKLİF KUTUSU — GET /api/transfer-offers/outbox (offerService.list).
 *
 * Transfer Yönetimi ekranı web'deki gibi DURUMA göre süzer (sunucu `status`
 * parametresini doğrular); sayfa verilmezse tüm sayfalar toplanır.
 */

/** constants/transfer.js OFFER_STATUSES (takım tarafında anlamlı olanlar). */
export const OUTBOX_STATUSES = ["SENT", "REVISION_REQUESTED", "ACCEPTED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** Sonuçlanmamış teklif — oyuncuya ikinci teklif verilemez (409 ALREADY_EXISTS). */
export const ACTIVE_OFFER_STATUSES = new Set(["DRAFT", "SENT", "REVISION_REQUESTED"]);

export const OFFER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  SENT: "Cevap bekliyor",
  REVISION_REQUESTED: "Revizyon istendi",
  ACCEPTED: "Kabul edildi",
  REJECTED: "Reddedildi",
  WITHDRAWN: "Geri çekildi",
  EXPIRED: "Süresi doldu",
  CANCELLED: "İptal edildi",
};

type OutboxRow = OutboxOffer & { player_id?: number; created_at?: string; createdAt?: string };

/** Giden teklifler; `page` verilmezse tüm sayfalar toplanır (sayaçlar ve liste eksiksiz). */
export const getOutboxPage = (params: { status?: OutboxStatus | null; page?: number; search?: string } = {}) => {
  const fetchPage = (page: number, limit: number) =>
    get<Paged<OutboxRow>>("/api/transfer-offers/outbox", {
      status: params.status ?? undefined,
      page,
      search: params.search?.trim() || undefined,
      limit,
    });
  return params.page ? fetchPage(params.page, 50) : collectPages(fetchPage);
};

/**
 * Bir oyuncuya kulübün AÇIK teklifi var mı? Oyuncu profili ve arama
 * ekranındaki "Teklif ver / Aktif teklif" düğmesi bunu sorar. Önbellek anahtarı
 * `["takim","outbox"]` ile aynı listeyi paylaşmamak için ayrı tutulur (bu sorgu
 * yalnız açık teklifleri çeker).
 */
export async function getOpenOfferIndex(): Promise<Record<number, string>> {
  const [sent, revision] = await Promise.all([
    getOutboxPage({ status: "SENT" }),
    getOutboxPage({ status: "REVISION_REQUESTED" }),
  ]);
  const index: Record<number, string> = {};
  for (const offer of [...sent.items, ...revision.items]) {
    const id = Number(offer.player?.id ?? offer.player_id);
    if (id) index[id] = offer.public_id;
  }
  return index;
}

/** Önbellek anahtarları — teklif gönderen/geri çeken ekran bunları tazeler. */
export const OFFER_QUERY_KEYS = [
  ["takim", "outbox"],
  ["takim", "offers-outbox"],
  ["club", "outbox"],
  ["club", "open-offers"],
  ["club", "overview"],
  ["club", "player-database"],
] as const;
