import { del, get } from "../http";

/**
 * Hesap silme uçları — routes/User.js (sunucuda docs/account-deletion.md).
 *
 * NEDEN İKİ UÇ: silme geri alınamaz. Önce özet okunur (üye neyi kaybedecek,
 * ligde ne kalacak), sonra şifre + onay cümlesiyle silme gönderilir. Onay
 * cümlesini sunucu bildirir; ekran kendi metnini uydurmaz, ikisi ayrışmasın.
 */

export interface DeletionConsequence {
  key: string;
  title: string;
  description: string;
}

export interface DeletionSummary {
  canDelete: boolean;
  /** canDelete false ise gösterilecek metin (yönetim hesapları). */
  blockedReason: string | null;
  requiresPassword: boolean;
  confirmationPhrase: string;
  player: { id: number; name: string } | null;
  team: { id: number; name: string } | null;
  consequences: DeletionConsequence[];
}

export interface DeletionResult {
  message: string;
  code: string;
  id: number;
  username: string;
  unlinkedPlayerId: number | null;
  unlinkedTeamId: number | null;
}

/** Onay ekranının içeriği. Tekrar denemeye değmez: hata anında ekran hatayı gösterir. */
export const getDeletionSummary = () =>
  get<DeletionSummary>("/api/users/me/deletion-summary", undefined, { retry: false });

export const deleteAccount = (body: { password: string; confirmation: string; reason?: string }) =>
  del<DeletionResult>("/api/users/me", body);
