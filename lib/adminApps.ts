import type Ionicons from "@expo/vector-icons/Ionicons";

import { isDark } from "../theme";
import { hasAnyPermission } from "./admin/access";
import { TOOL_APPS, type ToolApp } from "./admin/toolApps";
import type { AuthUser } from "./types";

/**
 * YÖNETİM UYGULAMALARI — yönetim modunun "uygulama çekmecesi".
 *
 * NE: yönetim modunda her araç telefonda ayrı bir uygulama gibi açılır.
 * Bu dosya çekmecede (alt menünün ortasındaki düğme) ve yönetim ana ekranının
 * başlatıcısında görünen uygulamaların sırasını ve kimliğini verir.
 *
 * Çalışma araçlarının kimliği lib/admin/toolApps.ts içindedir; burada onlara
 * iki "operasyon uygulaması" eklenir: LİG YÖNETİMİ (app/yonetim/lig) ve YAYIN
 * STÜDYOSU (app/yonetim/studyo). Renkler tema rengi değil uygulama KİMLİĞİ
 * verisidir, bu yüzden lib/ altında durur (app/ ve components/ altında çıplak
 * hex yasaktır).
 */

export interface AdminApp {
  key: string;
  title: string;
  shortTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  tagline: string;
  /** Bunlardan birine sahip olan görür; boşsa her yönetim kullanıcısı. */
  permission?: string[];
}

const on = isDark ? "#14091F" : "#FFFFFF";

const LEAGUE_APP: AdminApp = {
  key: "lig",
  title: "Lig yönetimi",
  shortTitle: "Lig",
  icon: "trophy-outline",
  route: "/yonetim/lig",
  tagline: "Maçlar, ligler, sezonlar, takımlar, oyuncular ve disiplin",
  accent: isDark ? "#C4B5FD" : "#6D28D9",
  accentSoft: isDark ? "#2E1F5E" : "#EDE9FE",
  onAccent: on,
};

const STUDIO_APP: AdminApp = {
  key: "studyo",
  title: "Yayın stüdyosu",
  shortTitle: "Stüdyo",
  icon: "videocam-outline",
  route: "/yonetim/studyo",
  tagline: "Telefondan maç yayını: skorbord, tekrar, altyazı ve reji",
  accent: isDark ? "#FCA5A5" : "#DC2626",
  accentSoft: isDark ? "#4C1616" : "#FEE2E2",
  onAccent: on,
  permission: ["matches.live"],
};

const MATCHES_APP: AdminApp = {
  key: "maclar",
  title: "Maç yönetimi",
  shortTitle: "Maçlar",
  icon: "football-outline",
  route: "/yonetim/maclar",
  tagline: "Maç öncesi, kadro, canlı olay girişi ve maç sonu",
  accent: isDark ? "#86EFAC" : "#15803D",
  accentSoft: isDark ? "#123B22" : "#DCFCE7",
  onAccent: on,
  permission: ["matches.view", "matches.create", "matches.update"],
};

const VENUES_APP: AdminApp = {
  key: "sahalar",
  title: "Saha ve maç planlama",
  shortTitle: "Sahalar",
  icon: "location-outline",
  route: "/yonetim/sahalar",
  tagline: "Maç talepleri ve haftalık saha programı",
  accent: isDark ? "#5EEAD4" : "#0F766E",
  accentSoft: isDark ? "#0D3B37" : "#CCFBF1",
  onAccent: on,
  permission: ["venues.view", "venues.manage"],
};

const fromTool = (tool: ToolApp): AdminApp => ({ ...tool });

/**
 * ÖNE ÇIKAN ALTI — sahibin "çok pratik ulaşmak istiyorum" dediği uygulamalar:
 * muhasebe, yapılacaklar, projeler, mesajlar, lig yönetimi, yayın stüdyosu.
 * Yönetim ana ekranının en üstünde büyük karolar olarak durur.
 */
export const FEATURED_ADMIN_APPS: AdminApp[] = [
  fromTool(TOOL_APPS.muhasebe),
  fromTool(TOOL_APPS.gorevler),
  fromTool(TOOL_APPS.projeler),
  fromTool(TOOL_APPS.mesajlar),
  LEAGUE_APP,
  STUDIO_APP,
];

/** Çekmecenin ikinci bölümü: operasyon ve diğer araçlar. */
export const MORE_ADMIN_APPS: AdminApp[] = [
  fromTool(TOOL_APPS.talepler),
  MATCHES_APP,
  VENUES_APP,
  fromTool(TOOL_APPS.ajanda),
  fromTool(TOOL_APPS["not-defteri"]),
  fromTool(TOOL_APPS.tablolar),
  fromTool(TOOL_APPS.rehber),
  fromTool(TOOL_APPS["hesap-araclari"]),
  fromTool(TOOL_APPS["odak-sayaci"]),
];

export const ADMIN_APP_KEYS = { league: LEAGUE_APP.key, studio: STUDIO_APP.key } as const;

/** Yetkiye göre süz (yalnız görünürlük; asıl denetim sunucuda). */
export function visibleAdminApps(user: AuthUser | null | undefined, apps: AdminApp[]): AdminApp[] {
  if (!user) return [];
  return apps.filter((app) => hasAnyPermission(user, app.permission));
}
