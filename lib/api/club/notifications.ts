import type { PanelNotification } from "../panel";

/**
 * TAKIM BİLDİRİMLERİ — tek uç (GET /api/panel-notifications), üç sekme.
 * Web NotificationList.js KINDS/ROUTES karşılığı: tür öneki sekmeyi, tür
 * öneki + `entity_public_id` varış ekranını belirler. Mobil varış noktaları
 * aynı işi gören yerel ekranlardır.
 */

export type NotificationKind = "transfer" | "discipline" | "match";

export const NOTIFICATION_KINDS: Record<NotificationKind, { label: string; prefixes: string[]; hint: string }> = {
  transfer: {
    label: "Transfer",
    prefixes: ["TRANSFER_", "OFFER_", "CONTRACT_", "TEAM_INVITE", "TEAM_APPLICATION"],
    hint: "Teklif, sözleşme, transfer izni, davet ve başvuru bildirimleri.",
  },
  discipline: {
    label: "Disiplin",
    prefixes: ["PENALTY_", "DISCIPLINE_"],
    hint: "Disiplin dosyası, ceza kararı, savunma ve itiraz bildirimleri.",
  },
  match: {
    label: "Maç",
    prefixes: ["MATCH_", "ROSTER_RULES_", "TEAM_AVAILABILITY_"],
    hint: "Maç, kadro girişi, yoklama, maç talebi ve kadro kuralı bildirimleri.",
  },
};

const typeOf = (item: PanelNotification) => String(item.type || "").toUpperCase();

export function notificationKind(item: PanelNotification): NotificationKind | null {
  const type = typeOf(item);
  for (const kind of Object.keys(NOTIFICATION_KINDS) as NotificationKind[]) {
    if (NOTIFICATION_KINDS[kind].prefixes.some((prefix) => type.startsWith(prefix))) return kind;
  }
  return null;
}

/** Web ROUTES sırasıyla aynı: ilk eşleşen önek kazanır. */
export function notificationHref(item: PanelNotification): string | null {
  const type = typeOf(item);
  const id = item.entity_public_id;
  if (type.startsWith("TRANSFER_RELEASE")) return id ? `/transfer-izni/${id}` : "/takimim/transfer";
  if (type.startsWith("TRANSFER_LISTING")) return "/takimim/borsa";
  if (type.startsWith("TRANSFER_OFFER")) return id ? `/teklif/${id}` : "/takimim/transfer";
  if (type.startsWith("TRANSFER_")) return "/takimim/transfer";
  if (type.startsWith("CONTRACT_")) return id ? `/sozlesme/${id}` : "/takimim/sozlesmeler";
  if (type.startsWith("TEAM_INVITE") || type.startsWith("TEAM_APPLICATION")) return "/takimim/ilanlar";
  if (type.startsWith("PENALTY_")) return id ? `/ceza/${id}` : "/takimim/disiplin";
  if (type.startsWith("MATCH_CREATED") || type.startsWith("MATCH_LINEUP")) return id && /^\d+$/.test(id) ? `/takimim/mac/${id}` : "/takimim/mac-merkezi";
  if (type.startsWith("MATCH_REQUEST")) return "/takimim/mac-al";
  if (type.startsWith("ROSTER_RULES_")) return "/takimim/kadro?gorunum=sezon";
  if (type.startsWith("TEAM_AVAILABILITY")) return "/takimim/musaitlik";
  return null;
}

/** Serbest kalma izni isteyen bildirimler — "kulübe gelen" transfer işi. */
export const isReleaseRequest = (item: PanelNotification) => typeOf(item).startsWith("TRANSFER_RELEASE_REQUESTED");
