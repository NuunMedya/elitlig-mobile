/**
 * LİG YÖNETİMİ — lig operasyonlarının ana ekranı (/yonetim/lig).
 *
 * İçerik `LeagueOpsHome` bileşenindedir; aynı bileşen yönetim sekme çubuğunda
 * sekme kökü olarak da (`asTab`) çizilir.
 */

import { LeagueOpsHome } from "@/components/admin/league/LeagueOpsHome";

export default function LeagueOpsScreen() {
  return <LeagueOpsHome />;
}
