import type Ionicons from "@expo/vector-icons/Ionicons";

import type { AuthUser } from "./types";

/**
 * WEB YÖNETİM PANELİ MODÜLLERİ — mobil yönetim panelindeki "Tüm araçlar".
 *
 * Web sürümündeki (elitlig-client src/App.js) her yönetim sayfası burada bir
 * satırdır: yol, gereken yetki ve Türkçe açıklama. Mobil uygulama bu
 * sayfaları uygulama içi tarayıcıda (app/yonetim/web.tsx) kullanıcının kendi
 * oturumuyla açar; böylece web'deki TÜM yönetim özellikleri mobilde de
 * kullanılabilir. Sık kullanılan işler (maçlar, gelen kutusu, sahalar,
 * görevler) ayrıca yerel ekran olarak vardır.
 *
 * Yetki süzmesi yalnız GÖRÜNÜRLÜK içindir: asıl denetim sunucudadır, web
 * sayfası da yetkisiz kullanıcıyı geri çevirir. `permission` dizisinden
 * birine sahip olmak yeterlidir (web ProtectedRoute ile aynı kural).
 *
 * Web'e yeni bir yönetim sayfası eklendiğinde buraya bir satır eklemek yeter.
 */

export interface AdminModule {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Web sitesindeki yol (ör. "/editor/maclar"). */
  path: string;
  /** Bunlardan birine sahip olan görür; boşsa her yönetim kullanıcısı. */
  permission?: string[];
  /** Yalnız bu rollere (ör. admin ana paneli). */
  roles?: string[];
}

export interface AdminModuleGroup {
  key: string;
  title: string;
  modules: AdminModule[];
}

export const ADMIN_MODULE_GROUPS: AdminModuleGroup[] = [
  {
    key: "genel",
    title: "Genel",
    modules: [
      { key: "panel", title: "Yönetim ana paneli", description: "Rolüne göre web yönetim paneli girişi", icon: "grid-outline", path: "/yonetim" },
      { key: "yapilacaklar", title: "Yapılacaklar panosu", description: "Görev panosu, ekip takibi, haftanın enleri koordinasyonu", icon: "checkbox-outline", path: "/yonetim/yapilacaklar" },
      { key: "hesabim", title: "Hesabım", description: "Yönetim profili, şifre ve yetkiler", icon: "person-circle-outline", path: "/yonetim/hesabim" },
      { key: "admin", title: "Admin paneli", description: "Sistem geneli yönetim", icon: "shield-outline", path: "/yonetim/admin", roles: ["admin"] },
    ],
  },
  {
    key: "maclar",
    title: "Maçlar ve Canlı Yayın",
    modules: [
      { key: "editor-maclar", title: "Maçlar", description: "Maç listesi, öncesi, canlı ve sonrası", icon: "football-outline", path: "/editor/maclar", permission: ["matches.view", "matches.create", "matches.update"] },
      { key: "mac-olustur", title: "Maç oluştur", description: "Yeni maç ve fikstür girişi", icon: "add-circle-outline", path: "/editor/mac-olustur", permission: ["matches.create"] },
      { key: "toplu-duzenle", title: "Toplu maç düzenleme", description: "Birden çok maçı tek ekranda güncelle", icon: "layers-outline", path: "/editor/maclar/toplu-duzenle", permission: ["matches.bulk_edit"] },
      { key: "canli-mac", title: "Canlı maç", description: "Canlı skor ve olay girişi", icon: "radio-outline", path: "/editor/canli-mac", permission: ["matches.live"] },
      { key: "puan-durumu", title: "Puan durumu", description: "Puan tablosu düzeltmeleri", icon: "podium-outline", path: "/editor/puan-durumu", permission: ["standings.update"] },
      { key: "kura", title: "Kura çekimi", description: "Grup ve eleme ağacı kuraları", icon: "shuffle-outline", path: "/yonetim/kura", permission: ["draws.view", "draws.run"] },
      { key: "panorama", title: "Panorama yayını", description: "Yayın ekranı ve sahneler", icon: "tv-outline", path: "/yonetim/panorama", permission: ["panorama.view", "panorama.broadcast"] },
      { key: "sponsorlar", title: "Yayın sponsorları", description: "Sponsor bantları ve yerleşimler", icon: "megaphone-outline", path: "/yonetim/sponsorlar", permission: ["sponsors.view", "sponsors.manage"] },
      { key: "haftanin-enleri", title: "Haftanın enleri", description: "Haftanın oyuncusu, kadrosu ve ödüller", icon: "star-outline", path: "/yonetim/haftanin-enleri", permission: ["weekly_awards.view", "weekly_awards.update"] },
      { key: "degerlendirme", title: "Maç değerlendirmeleri", description: "Personel ve sosyal medya performans formları", icon: "clipboard-outline", path: "/yonetim/mac-degerlendirmeleri", permission: ["evaluations.view", "evaluations.submit", "evaluations.manage"] },
    ],
  },
  {
    key: "lig",
    title: "Lig, Takım ve Oyuncular",
    modules: [
      { key: "ligler", title: "Ligler", description: "Lig oluştur, düzenle, arşivle", icon: "trophy-outline", path: "/editor/ligler", permission: ["leagues.create", "leagues.update", "leagues.delete", "leagues.archive"] },
      { key: "sezonlar", title: "Sezonlar", description: "Sezon oluştur, düzenle, arşivle", icon: "calendar-outline", path: "/editor/sezonlar", permission: ["seasons.create", "seasons.update", "seasons.delete", "seasons.archive"] },
      { key: "gruplar", title: "Gruplar", description: "Sezon grupları ve eleme ağacı", icon: "git-network-outline", path: "/editor/gruplar", permission: ["groups.view", "groups.create", "groups.update", "groups.delete"] },
      { key: "takimlar", title: "Takımlar", description: "Takım kayıtları ve kadrolar", icon: "shield-half-outline", path: "/editor/takimlar", permission: ["teams.create", "teams.update", "teams.delete"] },
      { key: "takim-rehberi", title: "Takım rehberi", description: "Takım yetkilileri ve iletişim", icon: "call-outline", path: "/editor/takim-rehberi", permission: ["teams.directory"] },
      { key: "oyuncular", title: "Oyuncular", description: "Oyuncu kayıtları", icon: "people-outline", path: "/editor/oyuncular", permission: ["players.create", "players.update", "players.delete"] },
      { key: "kadro-kural", title: "Kadro kural setleri", description: "Lisans ve kadro kuralları", icon: "document-text-outline", path: "/editor/kadro-kural-setleri", permission: ["roster_rules.view", "roster_rules.update"] },
      { key: "kadro-onay", title: "Kadro onayları", description: "Bekleyen kadro talepleri", icon: "checkmark-done-outline", path: "/editor/kadro-onaylari", permission: ["roster_rules.requests"] },
      { key: "transfer-onay", title: "Transfer onayları", description: "Yönetim onayı bekleyen transferler", icon: "swap-horizontal-outline", path: "/yonetim/admin/transfer-onaylari", permission: ["transfers.view", "transfers.review"] },
      { key: "piyasa-degeri", title: "Piyasa değeri", description: "Değer formülü ve yeniden hesaplama", icon: "trending-up-outline", path: "/yonetim/piyasa-degeri", permission: ["market_value.view", "market_value.recalculate", "market_value.settings"] },
    ],
  },
  {
    key: "disiplin",
    title: "Disiplin",
    modules: [
      { key: "cezalar", title: "Cezalar", description: "Disiplin kararları ve sevkler", icon: "hammer-outline", path: "/editor/cezalar", permission: ["penalties.view", "penalties.create"] },
      { key: "ceza-yeni", title: "Yeni ceza", description: "Disiplin sevki oluştur", icon: "add-outline", path: "/editor/cezalar/yeni", permission: ["penalties.create"] },
      { key: "savunmalar", title: "Savunmalar", description: "Gelen savunma ve itirazlar", icon: "document-attach-outline", path: "/yonetim/admin/savunmalar", permission: ["penalties.review"] },
    ],
  },
  {
    key: "saha",
    title: "Saha ve Program",
    modules: [
      { key: "sahalar", title: "Sahalar", description: "Saha kayıtları ve haftalık program", icon: "location-outline", path: "/editor/sahalar", permission: ["venues.view", "venues.manage"] },
      { key: "musaitlik", title: "Takım müsaitlikleri", description: "Takımların saha ve saat tercihleri", icon: "time-outline", path: "/editor/musaitlik", permission: ["venues.view"] },
    ],
  },
  {
    key: "icerik",
    title: "İçerik",
    modules: [
      { key: "haberler", title: "Haberler", description: "Haber yaz, yayımla, sabitle", icon: "newspaper-outline", path: "/editor/haberler", permission: ["news.create", "news.update"] },
      { key: "yazilar", title: "Yazılar", description: "Köşe yazıları", icon: "create-outline", path: "/editor/yazi-ekle", permission: ["news.writings"] },
      { key: "kurallar", title: "Kural kitapçıkları", description: "Lig kuralları", icon: "book-outline", path: "/editor/kurallar", permission: ["rule_books.create", "rule_books.update"] },
      { key: "sehirler", title: "Şehirler", description: "Sisteme il ekle, il sayfaları", icon: "map-outline", path: "/yonetim/admin/sehirler", permission: ["city_pages.manage"] },
      { key: "iletisim", title: "İl iletişim sayfaları", description: "İl iletişim bilgileri ve talepler", icon: "mail-outline", path: "/yonetim/admin/iletisim", permission: ["city_pages.contacts"] },
    ],
  },
  {
    key: "uyeler",
    title: "Üyeler ve İletişim",
    modules: [
      { key: "mesaj-merkezi", title: "Mesaj yönetimi", description: "Yönetim sohbeti, kayıtlar ve başvuru arşivi", icon: "chatbubbles-outline", path: "/yonetim/admin/mesajlar", permission: ["messages.view"] },
      { key: "basvurular", title: "Başvurular", description: "Eski başvuru kutusu", icon: "file-tray-full-outline", path: "/yonetim/admin/basvurular", permission: ["messages.view"] },
      { key: "kullanicilar", title: "Site üyeleri", description: "Üye hesapları ve onaylar", icon: "people-circle-outline", path: "/yonetim/admin/kullanicilar", permission: ["users.view"] },
      { key: "uye-yonetimi", title: "Üye yönetimi", description: "Üyelik işlemleri", icon: "person-add-outline", path: "/editor/uye-yonetimi" },
      { key: "premium", title: "Premium onayları", description: "Premium üyelik talepleri", icon: "diamond-outline", path: "/editor/premium-onaylari", permission: ["users.membership"] },
    ],
  },
  {
    key: "ekip",
    title: "Ekip ve Yetki",
    modules: [
      { key: "yonetim-kullanicilari", title: "Yönetim kullanıcıları", description: "Yönetim hesapları ve roller", icon: "id-card-outline", path: "/yonetim/admin/yonetim-kullanicilari", permission: ["management_users.view"] },
      { key: "yetkilendirme", title: "Yetkilendirme", description: "Rol ve kişi bazlı yetkiler", icon: "key-outline", path: "/yonetim/admin/yetkilendirme", permission: ["permissions.view", "permissions.manage"] },
      { key: "personel", title: "Personel", description: "Spiker, reji, hakem, fotoğrafçı, sağlıkçı", icon: "briefcase-outline", path: "/yonetim/admin/personel", permission: ["staff.view"] },
      { key: "toplu-atama", title: "Toplu personel atama", description: "Maçlara personeli tek ekrandan ata", icon: "people-outline", path: "/yonetim/admin/personel/toplu-atama", permission: ["staff.assign"] },
    ],
  },
  {
    key: "finans",
    title: "Finans",
    modules: [
      { key: "muhasebe", title: "Muhasebe", description: "Maç gelir/gider defteri ve raporlar", icon: "cash-outline", path: "/yonetim/muhasebe", permission: ["accounting.view", "accounting.manage"] },
      { key: "takim-finans", title: "Takım finansı", description: "Takım kasaları ve ödemeler", icon: "wallet-outline", path: "/yonetim/takim-finans", permission: ["team_finance.view", "team_finance.manage"] },
    ],
  },
  {
    key: "sistem",
    title: "Sistem",
    modules: [
      { key: "analiz", title: "Ziyaretçi analizi", description: "Site trafiği ve kaynaklar", icon: "analytics-outline", path: "/yonetim/admin/ziyaretci-analizi", permission: ["analytics.view"] },
      { key: "islem-kayitlari", title: "İşlem kayıtları", description: "Kim, ne zaman, ne yaptı", icon: "list-outline", path: "/yonetim/admin/islem-kayitlari", permission: ["activity_logs.view"] },
      { key: "cop-kutusu", title: "Çöp kutusu", description: "Silinen kayıtları geri al", icon: "trash-outline", path: "/yonetim/admin/cop-kutusu", permission: ["trash.view"] },
    ],
  },
];

/** Kullanıcı bu modülü görebilir mi? (yalnız görünürlük; denetim sunucuda) */
export function canSeeModule(user: AuthUser | null | undefined, module: AdminModule): boolean {
  if (!user) return false;
  if (module.roles?.length) return module.roles.includes(user.role);
  if (user.role === "admin") return true;
  if (!module.permission?.length) return true;
  const granted = new Set(user.permissions ?? []);
  return module.permission.some((key) => granted.has(key));
}

/** Kullanıcının görebildiği gruplar (boş gruplar atılır). */
export function visibleModuleGroups(user: AuthUser | null | undefined): AdminModuleGroup[] {
  return ADMIN_MODULE_GROUPS.map((group) => ({
    ...group,
    modules: group.modules.filter((module) => canSeeModule(user, module)),
  })).filter((group) => group.modules.length > 0);
}
