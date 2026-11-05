import { get } from "../../http";
import type { Paged } from "../panel";

/**
 * TAKIM SÖZLEŞMELERİ — GET /api/contracts?scope=team (contractService.list).
 *
 * `scope=team` ŞARTTIR: double rolündeki üyede kapsam verilmezse sunucu
 * oyuncunun kendi sözleşmeleriyle takımınkileri birleştirir. Belge ekranı
 * (`/sozlesme/[id]`) kapsamsız okur; sunucu iki tarafı OR'la tarar, takımın
 * sözleşmesi yine açılır.
 */

export interface TeamContract {
  public_id: string;
  status: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  transfer_fee?: string | number | null;
  currency?: string | null;
  player?: { id: number; player_name: string; player_img: string | null } | null;
  team?: { id: number; team_name: string; logo: string | null } | null;
}

/** constants/transfer.js CONTRACT_STATUSES (web features/transfers/constants.js). */
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  PENDING_ACTIVATION: "Aktivasyon bekliyor",
  ACTIVE: "Aktif",
  COMPLETED: "Tamamlandı",
  TERMINATED: "Feshedildi",
  CANCELLED: "İptal edildi",
};

export const getTeamContracts = (params: { status?: string | null; page?: number } = {}) =>
  get<Paged<TeamContract>>("/api/contracts", {
    scope: "team",
    status: params.status ?? undefined,
    page: params.page ?? 1,
    limit: 50,
  });
