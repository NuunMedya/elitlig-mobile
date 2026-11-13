import type Ionicons from "@expo/vector-icons/Ionicons";

import { hasAnyPermission } from "./admin/access";
import type { AuthUser } from "./types";

/**
 * YÖNETİM MODÜLLERİ — web yönetim panelinin (elitlig-client
 * src/editor_pages/adminNav.js NAV_GROUPS) mobildeki birebir karşılığı.
 *
 * Her satır bir YEREL ekrandır (`route`, app/yonetim/... altında). Web
 * görünümü (WebView) kullanılmaz: listeler, formlar, onaylar ve araçlar
 * uygulamanın kendi bileşenleriyle çizilir ve aynı sunucu uçlarına gider.
 *
 * Yetki süzmesi yalnız GÖRÜNÜRLÜK içindir: asıl denetim sunucudadır. Web
 * `canSeeNavItem` kuralıyla aynıdır: `permission` dizisinden birine sahip
 * olmak yeterli; admin her şeyi görür; `roles` verilmişse yalnız o roller.
 *
 * Web'e yeni bir yönetim sayfası eklendiğinde buraya bir satır ve
 * app/yonetim altında bir ekran eklenir.
 */

export interface AdminModule {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Uygulama içi rota (ör. "/yonetim/ligler"). */
  route: string;
  /** Bunlardan birine sahip olan görür; boşsa her yönetim kullanıcısı. */
  permission?: string[];
  /** Yalnız bu rollere. */
  roles?: string[];
  /** Arama için eş anlamlılar. */
  keywords?: string;
}

export interface AdminModuleGroup {
  key: string;
  title: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  modules: AdminModule[];
}

/** Araçlarım — her yönetim kullanıcısına açık kişisel çalışma araçları. */
export const TOOL_MODULES: AdminModule[] = [
  { key: "projeler", title: "Projeler", description: "Süreç adımları, sorumlular, aranan kişiler, sorular ve portföy", icon: "git-branch-outline", route: "/yonetim/araclar/projeler", keywords: "süreç proje satış görüşme" },
  { key: "gorevler", title: "Yapılacaklar", description: "Görevler, hatırlatmalar, maç görevleri ve pano", icon: "checkbox-outline", route: "/yonetim/gorevler", keywords: "görev todo hatırlatma" },
  { key: "ajanda", title: "Ajanda ve takvim", description: "Ay, hafta ve gün görünümü; tekrar eden etkinlikler", icon: "calendar-outline", route: "/yonetim/araclar/ajanda", keywords: "takvim etkinlik randevu" },
  { key: "not-defteri", title: "Not defteri", description: "Renkli notlar, işaretlenebilir listeler, etiket ve arşiv", icon: "document-text-outline", route: "/yonetim/araclar/not-defteri", keywords: "not liste" },
  { key: "muhasebe", title: "Muhasebe", description: "Hesaplar ve virman, ön muhasebe, maç muhasebesi, Türkiye geneli", icon: "receipt-outline", route: "/yonetim/araclar/muhasebe", keywords: "gelir gider kasa virman" },
  { key: "tablolar", title: "Tablolar", description: "Formüllü hesap tabloları: TOPLA, EĞER, DÜŞEYARA, çoklu sayfa", icon: "grid-outline", route: "/yonetim/araclar/tablolar", keywords: "excel hesap tablosu" },
  { key: "mesajlar", title: "Mesajlar", description: "Yöneticiler, takım başkanları, oyuncular ve üyelerle yazışma", icon: "chatbubbles-outline", route: "/mesajlar", keywords: "sohbet chat whatsapp üye mesajları" },
  { key: "rehber", title: "Rehber", description: "Takımlar, üyeler ve kişiler: tek dokunuşla ara, yaz, mesaj gönder", icon: "call-outline", route: "/yonetim/araclar/rehber", keywords: "telefon kişi başkan iletişim" },
  { key: "hesap-araclari", title: "Hesap araçları", description: "KDV, yüzde, iskonto, aidat bölüştürme, taksit ve tarih", icon: "calculator-outline", route: "/yonetim/araclar/hesap-araclari", keywords: "kdv yüzde iskonto aidat" },
  { key: "odak-sayaci", title: "Odak sayacı", description: "Pomodoro, geri sayım ve kronometre; maç süresi için de", icon: "timer-outline", route: "/yonetim/araclar/odak-sayaci", keywords: "pomodoro kronometre geri sayım" },
];

const ROSTER_PERMS = ["roster_rules.requests"];
const LEAGUE_SETTINGS_PERMS = [
  "groups.view", "groups.create", "groups.update", "groups.delete",
  "rule_books.create", "rule_books.update", "roster_rules.view", "roster_rules.update",
  "seasons.rule_set", "leagues.update",
];

export const ADMIN_MODULE_GROUPS: AdminModuleGroup[] = [
  {
    key: "is-akisi",
    title: "İş akışı",
    icon: "file-tray-full-outline",
    modules: [
      { key: "talepler", title: "Talepler", description: "Onay bekleyen profil, transfer, kadro ve disiplin talepleri", icon: "file-tray-full-outline", route: "/yonetim/talepler", keywords: "onay bekleyen başvuru istek" },
      { key: "mesajlar", title: "Mesajlar", description: "WhatsApp gibi doğrudan yazışma; üyelerin ElitLig Yönetimi mesajları", icon: "chatbubbles-outline", route: "/mesajlar", keywords: "sohbet chat üye mesajları" },
      { key: "bildirimler", title: "Bildirimler", description: "Transfer, disiplin, maç, istek ve hesap bildirimleri", icon: "notifications-outline", route: "/bildirimler", keywords: "bildirim zil uyarı" },
      { key: "gorevler", title: "Yapılacaklar", description: "Görevlerin, hatırlatmaların ve maç görevlerin", icon: "checkbox-outline", route: "/yonetim/gorevler" },
      { key: "kayitlar", title: "Arama kayıtları", description: "Yönetimle yapılan sesli aramaların kayıtları", icon: "recording-outline", route: "/yonetim/kayitlar", permission: ["messages.calls_view"] },
    ],
  },
  {
    key: "maclar",
    title: "Maçlar",
    description: "Maç listesi, saha planlama ve maç personeli",
    icon: "football-outline",
    modules: [
      { key: "maclar", title: "Maç listesi", description: "Maç öncesi, kadro, canlı akış, maç sonu ve skor", icon: "football-outline", route: "/yonetim/maclar", permission: ["matches.view", "matches.create", "matches.update", "matches.live", "matches.lineup", "matches.stats"], keywords: "fikstür skor sonuç canlı" },
      { key: "mac-olustur", title: "Maç oluştur", description: "Yeni maç ve fikstür girişi", icon: "add-circle-outline", route: "/yonetim/mac-olustur", permission: ["matches.create"] },
      { key: "toplu-duzenle", title: "Toplu düzenleme", description: "Birden çok maçın saat, saha ve durumunu tek ekranda değiştir", icon: "layers-outline", route: "/yonetim/toplu-duzenle", permission: ["matches.bulk_edit"] },
      { key: "studyo", title: "Yayın stüdyosu", description: "Telefondan maç yayını: skorbord, tekrar, altyazı ve reji", icon: "videocam-outline", route: "/yonetim/studyo", permission: ["matches.live"], keywords: "canlı yayın youtube reji kamera" },
      { key: "sahalar", title: "Saha ve maç planlama", description: "Maç talepleri ve haftalık saha programı", icon: "location-outline", route: "/yonetim/sahalar", permission: ["venues.view", "venues.manage"] },
      { key: "musaitlik", title: "Takım müsaitliği", description: "Takımların uygun gün ve saatleri", icon: "time-outline", route: "/yonetim/musaitlik", permission: ["venues.view"] },
      { key: "personel", title: "Personel", description: "Spiker, reji, hakem, fotoğrafçı, sağlıkçı", icon: "briefcase-outline", route: "/yonetim/personel", permission: ["staff.view"] },
      { key: "toplu-atama", title: "Toplu personel atama", description: "Maçlara personeli tek ekrandan ata", icon: "people-outline", route: "/yonetim/toplu-atama", permission: ["staff.assign"] },
      { key: "degerlendirmeler", title: "Maç değerlendirmeleri", description: "Personel ve sosyal medya performans formları", icon: "clipboard-outline", route: "/yonetim/degerlendirmeler", permission: ["evaluations.view", "evaluations.submit", "evaluations.manage"] },
    ],
  },
  {
    key: "ligler",
    title: "Ligler",
    description: "Lig yapısı, sezonlar, puan durumu ve kurallar",
    icon: "trophy-outline",
    modules: [
      { key: "ligler", title: "Ligler", description: "Lig oluştur, düzenle, arşivle", icon: "trophy-outline", route: "/yonetim/ligler", permission: ["leagues.create", "leagues.update", "leagues.delete", "leagues.archive"] },
      { key: "sezonlar", title: "Sezonlar", description: "Sezon oluştur, düzenle, arşivle", icon: "calendar-outline", route: "/yonetim/sezonlar", permission: ["seasons.create", "seasons.update", "seasons.delete", "seasons.archive", "seasons.rule_set"] },
      { key: "lig-ayarlari", title: "Lig ayarları ve kurallar", description: "Gruplar, lig statüsü, kural kitapçıkları, puanlama ve kadro kuralları", icon: "book-outline", route: "/yonetim/lig-ayarlari", permission: LEAGUE_SETTINGS_PERMS },
      { key: "puan-durumu", title: "Puan durumu", description: "Puan tablosu düzeltmeleri ve yeniden hesaplama", icon: "podium-outline", route: "/yonetim/puan-durumu", permission: ["standings.update"] },
      { key: "kura", title: "Kura çekimi", description: "Torbalar, grup ve eleme kuraları", icon: "shuffle-outline", route: "/yonetim/kura", permission: ["draws.view", "draws.run"] },
      { key: "junior-cup", title: "Junior Cup", description: "Lig portalları ve turnuva sayfaları", icon: "star-outline", route: "/yonetim/junior-cup", permission: ["league_portals.view", "league_portals.manage"] },
    ],
  },
  {
    key: "takimlar",
    title: "Takımlar",
    description: "Takım kayıtları, kadrolar ve takım finansı",
    icon: "shield-half-outline",
    modules: [
      { key: "takimlar", title: "Takımlar", description: "Takım kayıtları, logo, sezonlar ve kadro", icon: "shield-half-outline", route: "/yonetim/takimlar", permission: ["teams.create", "teams.update", "teams.delete"] },
      { key: "takim-rehberi", title: "Takım rehberi", description: "Takım yetkilileri ve iletişim", icon: "call-outline", route: "/yonetim/takim-rehberi", permission: ["teams.directory"] },
      { key: "kadrolar", title: "Kadrolar", description: "Kadro listeleri ve sezon kadrosu onayları", icon: "checkmark-done-outline", route: "/yonetim/kadrolar", permission: ROSTER_PERMS },
      { key: "takim-finans", title: "Takım finansı ve FFP", description: "Takım kasaları, bütçe ve ödemeler", icon: "wallet-outline", route: "/yonetim/takim-finans", permission: ["team_finance.view", "team_finance.manage"] },
      { key: "takim-birlestirme", title: "Takım birleştirme", description: "Mükerrer takım kayıtlarını birleştir", icon: "git-merge-outline", route: "/yonetim/takim-birlestirme", permission: ["teams.merge"] },
    ],
  },
  {
    key: "oyuncular",
    title: "Oyuncular",
    description: "Oyuncu kayıtları, transferler ve piyasa değeri",
    icon: "people-outline",
    modules: [
      { key: "oyuncular", title: "Oyuncular", description: "Oyuncu kayıtları ve profilleri", icon: "people-outline", route: "/yonetim/oyuncular", permission: ["players.create", "players.update", "players.delete"] },
      { key: "transfer-onaylari", title: "Transfer onayları", description: "Yönetim onayı bekleyen transferler", icon: "swap-horizontal-outline", route: "/yonetim/transfer-onaylari", permission: ["transfers.view", "transfers.review"] },
      { key: "piyasa-degeri", title: "Piyasa değeri", description: "Değer formülü, yeniden hesaplama ve sıralama", icon: "trending-up-outline", route: "/yonetim/piyasa-degeri", permission: ["market_value.view", "market_value.recalculate", "market_value.settings"] },
      { key: "oyuncu-birlestirme", title: "Oyuncu birleştirme", description: "Mükerrer oyuncu kayıtlarını birleştir", icon: "git-merge-outline", route: "/yonetim/oyuncu-birlestirme", permission: ["players.merge"] },
    ],
  },
  {
    key: "disiplin",
    title: "Disiplin",
    description: "Cezalar, savunmalar ve itirazlar",
    icon: "hammer-outline",
    modules: [
      { key: "cezalar", title: "Cezalar", description: "Disiplin kararları ve sevkler", icon: "hammer-outline", route: "/yonetim/cezalar", permission: ["penalties.view", "penalties.create"] },
      { key: "ceza-yeni", title: "Yeni ceza", description: "Disiplin sevki oluştur", icon: "add-outline", route: "/yonetim/ceza-yeni", permission: ["penalties.create"] },
      { key: "savunmalar", title: "Savunma ve itirazlar", description: "Gelen savunma ve itirazları incele", icon: "document-attach-outline", route: "/yonetim/savunmalar", permission: ["penalties.review"] },
    ],
  },
  {
    key: "icerik",
    title: "İçerik",
    description: "Haberler, görseller, ödüller, yayın ve sponsorlar",
    icon: "newspaper-outline",
    modules: [
      { key: "haberler", title: "Haberler", description: "Haber ve yazı yaz, yayımla, sabitle", icon: "newspaper-outline", route: "/yonetim/haberler", permission: ["news.create", "news.update"] },
      { key: "icerik-havuzu", title: "İçerik havuzu", description: "Sosyal medya görselleri ve şablonlar", icon: "images-outline", route: "/yonetim/icerik-havuzu", permission: ["content.pool"] },
      { key: "haftanin-enleri", title: "Haftanın enleri", description: "Haftanın oyuncusu, kadrosu ve ödüller", icon: "ribbon-outline", route: "/yonetim/haftanin-enleri", permission: ["weekly_awards.view", "weekly_awards.update"] },
      { key: "panorama", title: "Elitlig Panorama", description: "Yayın ekranı ve sahneler", icon: "tv-outline", route: "/yonetim/panorama", permission: ["panorama.view", "panorama.broadcast"] },
      { key: "sponsorlar", title: "Sponsorlar", description: "Sponsor bantları ve yerleşimler", icon: "megaphone-outline", route: "/yonetim/sponsorlar", permission: ["sponsors.view", "sponsors.manage"] },
    ],
  },
  {
    key: "uyeler",
    title: "Üyeler",
    description: "Site üyeleri, premium üyelik ve şifre talepleri",
    icon: "people-circle-outline",
    modules: [
      { key: "uyeler", title: "Üye yönetimi", description: "Üye hesapları, onaylar ve profiller", icon: "people-circle-outline", route: "/yonetim/uyeler", permission: ["users.view"] },
      { key: "premium", title: "Premium onayları", description: "Premium üyelik talepleri", icon: "diamond-outline", route: "/yonetim/premium", permission: ["users.membership"] },
      { key: "sifre-talepleri", title: "Şifre sıfırlama talepleri", description: "Şifremi unuttum talepleri ve kodlar", icon: "lock-open-outline", route: "/yonetim/sifre-talepleri", permission: ["users.password_reset"] },
    ],
  },
  {
    key: "yonetim",
    title: "Yönetim ve ayarlar",
    description: "Yönetim hesapları, yetkiler, şehirler ve sistem kayıtları",
    icon: "key-outline",
    modules: [
      { key: "yonetim-kullanicilari", title: "Yönetim kullanıcıları", description: "Yönetim hesapları ve roller", icon: "id-card-outline", route: "/yonetim/yonetim-kullanicilari", permission: ["management_users.view"] },
      { key: "yetkilendirme", title: "Kullanıcı yetkilendirme", description: "Rol ve kişi bazlı yetkiler", icon: "key-outline", route: "/yonetim/yetkilendirme", permission: ["permissions.view", "permissions.manage"] },
      { key: "sehirler", title: "Şehirler", description: "Sisteme il ekle, il sayfaları", icon: "map-outline", route: "/yonetim/sehirler", permission: ["city_pages.manage"] },
      { key: "sehir-iletisim", title: "Şehir iletişim sayfaları", description: "İl iletişim bilgileri ve sosyal medya", icon: "mail-outline", route: "/yonetim/sehir-iletisim", permission: ["city_pages.contacts"] },
      { key: "ziyaretci-analizi", title: "Ziyaretçi analizi", description: "Site trafiği ve kaynaklar", icon: "analytics-outline", route: "/yonetim/ziyaretci-analizi", permission: ["analytics.view"] },
      { key: "uygulama-analizi", title: "Uygulama analizi", description: "Mobil uygulamada geçen süre, ekranlar ve oyunlar", icon: "phone-portrait-outline", route: "/yonetim/uygulama-analizi", permission: ["analytics.view"] },
      { key: "islem-kayitlari", title: "İşlem kayıtları", description: "Kim, ne zaman, ne yaptı", icon: "list-outline", route: "/yonetim/islem-kayitlari", permission: ["activity_logs.view"] },
      { key: "cop-kutusu", title: "Çöp kutusu", description: "Silinen kayıtları geri al", icon: "trash-outline", route: "/yonetim/cop-kutusu", permission: ["trash.view"] },
      { key: "hesabim", title: "Hesabım", description: "Yönetim profili, şifre ve yetkilerim", icon: "person-circle-outline", route: "/yonetim/hesabim" },
    ],
  },
  {
    key: "araclar",
    title: "Araçlarım",
    description: "Kişisel çalışma araçların",
    icon: "construct-outline",
    modules: [
      { key: "araclar", title: "Araçlar merkezi", description: "Tüm araçlar ve bugünün özeti", icon: "construct-outline", route: "/yonetim/araclar" },
      ...TOOL_MODULES.filter((m) => m.key !== "gorevler" && m.key !== "mesajlar"),
    ],
  },
];

/** Kullanıcı bu modülü görebilir mi? (yalnız görünürlük; denetim sunucuda) */
export function canSeeModule(user: AuthUser | null | undefined, module: AdminModule): boolean {
  if (!user) return false;
  if (module.roles?.length && !module.roles.includes(user.role)) return false;
  return hasAnyPermission(user, module.permission);
}

/** Kullanıcının görebildiği gruplar (boş gruplar atılır). */
export function visibleModuleGroups(user: AuthUser | null | undefined): AdminModuleGroup[] {
  return ADMIN_MODULE_GROUPS.map((group) => ({
    ...group,
    modules: group.modules.filter((module) => canSeeModule(user, module)),
  })).filter((group) => group.modules.length > 0);
}

const fold = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

/** Modül araması: ad, açıklama, grup adı ve eş anlamlılar. */
export function searchModules(user: AuthUser | null | undefined, query: string): AdminModule[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const out: AdminModule[] = [];
  for (const group of visibleModuleGroups(user)) {
    for (const module of group.modules) {
      if (seen.has(module.route)) continue;
      const hay = fold(`${module.title} ${module.description} ${group.title} ${module.keywords ?? ""}`);
      if (words.every((w) => hay.includes(w))) {
        seen.add(module.route);
        out.push(module);
      }
    }
  }
  return out;
}
