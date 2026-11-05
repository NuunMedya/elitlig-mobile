/**
 * TAKIM YETKİSİ — "bu üye bir takımı yönetiyor mu, hangisini?"
 *
 * NEDEN AYRI KANCA: mobil, teklif düğmesini oturum nesnesindeki
 * `auth.user.managed_team_id` alanına bakarak gösteriyordu. O alan girişte
 * yazılır ve oturum boyunca TAZELENMEZ: takım yetkisi giriş yapıldıktan sonra
 * onaylanan başkanda alan boş kalıyor, "Teklif ver" hiç çıkmıyordu. Web paneli
 * yönetilen takımı `/api/panel/me` → `team` alanından okur (sunucu `user`
 * kaydını her istekte yeniden yükler). Burada da AYNI kaynak kullanılır;
 * önbellek anahtarı `["panel","me"]` useClubSignals ile ortaktır, ikinci istek
 * atılmaz.
 *
 * SUNUCU KURALI (services/transfer/authz.js → teamId): teklif, davet ve
 * transfer işlemleri rolün `takim_baskani | double` OLMASINI ve
 * `managed_team_id` dolu olmasını ister. `/api/panel/me` uç yetkisizse (403)
 * oturumdaki alanlara düşülür — yine aynı iki koşulla.
 */

import { useQuery } from "@tanstack/react-query";
import { getPanelMe } from "@/lib/api/panel";
import { useAuth } from "@/providers/AuthProvider";

/** config/roles.js TEAM_ROLES. */
const TEAM_ROLES = new Set(["takim_baskani", "double"]);

export interface TeamAccess {
  /** Yönetilen takımın kimliği; yönetmiyorsa null. */
  teamId: number | null;
  teamName: string | null;
  teamLogo: string | null;
  /** Teklif / davet / ilan işlemleri yapılabilir mi. */
  canManage: boolean;
  /** Karar verilemeden önce düğme çizilmesin diye. */
  loading: boolean;
}

export function useTeamAccess(): TeamAccess {
  const auth = useAuth();
  const user = auth.user;
  const me = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const roleOk = Boolean(user && (TEAM_ROLES.has(String(user.role)) || TEAM_ROLES.has(String(user.profile_type ?? ""))));
  const team = me.data?.team ?? null;
  // Panel yanıtı geldiyse SON SÖZ onundur (yetki geri alınmışsa düğme kaybolur).
  const teamId = team?.id ?? (me.isSuccess ? null : roleOk ? (user?.managed_team_id ?? null) : null);

  /* `capabilities.team` = hasTeamRole && managed_team_id (routes/panel.js
     sponsorCapabilities) — sunucunun teklif için baktığı koşulun AYNISI. Eski
     sunucu alanı göndermezse rol kontrolüne düşülür. */
  const capabilities = (me.data as { capabilities?: { team?: boolean } } | undefined)?.capabilities;
  const allowed = capabilities ? Boolean(capabilities.team) : roleOk;

  return {
    teamId: teamId ? Number(teamId) : null,
    teamName: team?.team_name ?? user?.teamName ?? null,
    teamLogo: team?.logo ?? null,
    canManage: Boolean(teamId) && allowed,
    loading: Boolean(user) && me.isLoading,
  };
}
