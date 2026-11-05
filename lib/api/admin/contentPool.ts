import { WEB_BASE_URL } from "../../config";
import { del, get, patch, post } from "../../http";

/**
 * İçerik havuzu — şablon kataloğu + yöneticilerin ortak klasörleri.
 *
 * KATALOG: web'de içerik türleri sunucudan gelmez; istemcideki Template
 * Registry'de (elitlig-client src/pages/content-pool/registry/templates.js)
 * tanımlıdır ve tasarımlar tarayıcıda çizilip PNG'ye dönüştürülür. Burada o
 * listenin kullanıma açık kayıtlarının künyesi (kimlik, ad, kategori, boyut)
 * tutulur; mobil bir türü seçince web oluşturucusunu açar ya da bağlantısını
 * paylaşır. Kimlikler registry ile birebir aynıdır.
 *
 * KLASÖRLER: elitlig-server routes/adminContentPool.js
 *   GET    /api/admin/content-pool/library               klasörler + içerikleri
 *   POST   /api/admin/content-pool/folders               { name, description? }
 *   PATCH  /api/admin/content-pool/folders/:id           { name?, description? }
 *   DELETE /api/admin/content-pool/folders/:id
 *   POST   /api/admin/content-pool/folders/:id/presets   { templateId, title, settings? }
 *   GET    /api/admin/content-pool/presets/:id           ayarlarıyla
 *   PATCH  /api/admin/content-pool/presets/:id           { title?, settings?, folderId? }
 *   DELETE /api/admin/content-pool/presets/:id
 * Görme: content.library.view | content.library.manage; yazma: content.library.manage.
 * Klasörü yalnız sahibi (ya da admin) değiştirir (`canEdit`).
 */

export type TemplateCategory = "match" | "rankings" | "weekly" | "comparison" | "entity" | "announcement";
export type TemplateSize = "portrait" | "story" | "square" | "youtube" | "youtube-hd";

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  match: "Maç İçerikleri",
  rankings: "Sıralamalar ve Liderler",
  weekly: "Haftanın ve Ayın Enleri",
  comparison: "Karşılaştırmalar",
  entity: "Takım ve Oyuncu İçerikleri",
  announcement: "Duyuru ve Etkileşim",
};

export const TEMPLATE_SIZE_LABELS: Record<TemplateSize, string> = {
  portrait: "Gönderi",
  story: "Hikâye",
  square: "Kare",
  youtube: "YouTube",
  "youtube-hd": "YouTube HD",
};

export interface ContentTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  sizes: TemplateSize[];
  featured?: boolean;
  /** Özel sayfası olan şablon (Maçın Haberi). */
  route?: string;
}

const SOCIAL: TemplateSize[] = ["portrait", "story", "square"];
const VIDEO: TemplateSize[] = ["youtube", "youtube-hd"];

/** registry/templates.js — kullanıma açık (isEnabled) kayıtlar. */
export const CONTENT_TEMPLATES: ContentTemplate[] = [
  { id: "match-news", name: "Maçın Haberi", category: "match", description: "Bir maçı seç, 5 sayfalık profesyonel Instagram haber serisini hazırla.", sizes: SOCIAL, featured: true, route: "/icerik-havuzu/macin-haberi" },
  { id: "fixtures-results", name: "Sonuçlar / Fikstür", category: "match", description: "Sonuçları, fikstürü ya da ikisini birden tek gün veya tarih aralığı için hazırla. Sayfalar otomatik oluşur.", sizes: SOCIAL },
  { id: "youtube-cover", name: "YouTube Kapağı", category: "match", description: "Maçı seç; renk geçişli panel ve kapak fotoğrafıyla 16:9 YouTube kapağı.", sizes: VIDEO, featured: true },
  { id: "match-day", name: "Maç Günü", category: "match", description: "Maçı seç; Arena, Blok ve Çarpışma tasarımları. Renkler paletten veya takımların kendi renklerinden.", sizes: SOCIAL, featured: true },
  { id: "match-report", name: "Maç Raporu", category: "match", description: "Biten maçın skor bandı, istatistik şeridi ve dakika dakika olay listesi tek gönderide.", sizes: SOCIAL, featured: true },
  { id: "single-match-preview", name: "Tek Maç Ön İzleme", category: "match", description: "İki takımın karşılaşma öncesi ön izleme kartı.", sizes: SOCIAL },
  { id: "standings", name: "Puan Durumu", category: "rankings", description: "Güncel sıralama; play-off ve düşme bölgeleri işaretli.", sizes: SOCIAL },
  { id: "top-scorers", name: "Gol Krallığı", category: "rankings", description: "Ligin en golcü oyuncuları; maç başına gol dahil.", sizes: SOCIAL },
  { id: "most-valuable", name: "En Değerli Oyuncular", category: "rankings", description: "Piyasa değeri, puan veya gole göre sıralanabilir liderler.", sizes: SOCIAL },
  { id: "assist-kings-auto", name: "Asist Krallığı", category: "rankings", description: "Ligin en çok asist yapan oyuncuları.", sizes: SOCIAL },
  { id: "rating-leaders", name: "Rating Liderleri", category: "rankings", description: "En yüksek ortalama ratingli oyuncular.", sizes: SOCIAL },
  { id: "statistics-leaders", name: "İstatistik Liderleri", category: "rankings", description: "Sezonun istatistik liderleri tek tabloda.", sizes: SOCIAL },
  { id: "best-performances", name: "En İyi Performanslar", category: "rankings", description: "Ratinge göre en iyi beş performans.", sizes: SOCIAL },
  { id: "team-of-the-week", name: "Haftanın Karması", category: "weekly", description: "Diziliş bazlı en iyi XI; otomatik seç veya elle düzenle.", sizes: ["portrait", "story"] },
  { id: "weekly-awards", name: "Haftanın Enleri", category: "weekly", description: "Yönetim panelindeki setten 5 sayfalık kaydırmalı ödül serisi; 13 hazır tasarım.", sizes: SOCIAL, featured: true },
  { id: "player-of-week", name: "Haftanın Oyuncusu", category: "weekly", description: "Seçilen tarih aralığının öne çıkan oyuncusu.", sizes: SOCIAL },
  { id: "player-of-month", name: "Ayın Oyuncusu", category: "weekly", description: "Ayın oyuncusu editoryal kartı.", sizes: SOCIAL },
  { id: "team-of-week-card", name: "Haftanın Takımı", category: "weekly", description: "Seçilen tarih aralığının öne çıkan takımı.", sizes: SOCIAL },
  { id: "team-of-month", name: "Ayın Takımı", category: "weekly", description: "Ayın takımı editoryal kartı.", sizes: SOCIAL },
  { id: "player-head-to-head", name: "Oyuncu Head to Head", category: "comparison", description: "İki oyuncuyu seçili istatistiklerde lig sırası ve ortalamasıyla karşılaştır.", sizes: SOCIAL },
  { id: "team-head-to-head", name: "Takım Head to Head", category: "comparison", description: "İki takımı sezon performansında karşılaştır; form, seriler, iç saha/deplasman.", sizes: SOCIAL },
  { id: "key-matchup", name: "Kilit Eşleşme", category: "comparison", description: "İki oyuncunun kilit eşleşme kartı.", sizes: SOCIAL },
  { id: "team-statistics", name: "Takım İstatistikleri", category: "entity", description: "Tek takım; seçilebilir istatistik alanları ve son 5 form.", sizes: SOCIAL },
  { id: "player-statistics", name: "Oyuncu İstatistikleri", category: "entity", description: "Tek oyuncu kartı; foto, mevki, değer ve seçilebilir istatistikler.", sizes: SOCIAL },
  { id: "player-performance", name: "Öne Çıkan Oyuncu Performansı", category: "entity", description: "Oyuncunun son 5 veya 10 maçı: sonuç, gol, asist; form şeridi ve grafik.", sizes: SOCIAL },
  { id: "team-performance", name: "Öne Çıkan Takım Performansı", category: "entity", description: "Takımın son 5 veya 10 maçı: seri, puan, atılan-yenilen gol.", sizes: SOCIAL },
  { id: "welcome", name: "Hoş Geldiniz", category: "entity", description: "Bir takım seç; Stadyum, Prestij ve Neon karşılama tasarımları.", sizes: SOCIAL },
  { id: "record-broken", name: "Rekor Kırdı", category: "entity", description: "Oyuncunun kırdığı rekoru duyur.", sizes: SOCIAL },
  { id: "career-milestone", name: "Kariyer Dönüm Noktası", category: "entity", description: "Oyuncunun kariyerindeki dönüm noktası.", sizes: SOCIAL },
  { id: "season-so-far", name: "Sezonun Özeti", category: "entity", description: "Takımın sezon şimdiye kadar özeti.", sizes: SOCIAL },
  { id: "city-statistics", name: "Şehir İstatistikleri", category: "entity", description: "İldeki takım, oyuncu ve maç sayıları.", sizes: SOCIAL },
  { id: "transfer-announcement", name: "Transfer Duyurusu", category: "announcement", description: "Tamamlanan transferi duyur.", sizes: SOCIAL },
  { id: "official-announcement", name: "Resmî Açıklama", category: "announcement", description: "Resmî açıklama kartı.", sizes: SOCIAL },
  { id: "player-quote", name: "Oyuncu Sözü", category: "announcement", description: "Oyuncunun sözünü öne çıkar.", sizes: SOCIAL },
  { id: "birthday-anniversary", name: "Doğum Günü / Yıldönümü", category: "announcement", description: "Nice yıllara kartı.", sizes: SOCIAL },
  { id: "on-this-day", name: "Bugün Tarihte", category: "announcement", description: "Bugün tarihte ne oldu.", sizes: SOCIAL },
  { id: "guess-player", name: "Oyuncuyu Tahmin Et", category: "announcement", description: "Takipçilere “Bu oyuncu kim?” sorusu.", sizes: SOCIAL },
  { id: "fan-choice", name: "Taraftar Seçimi / A mı B mi?", category: "announcement", description: "İki oyuncu arasında taraftar oylaması.", sizes: SOCIAL },
  { id: "dream-seven", name: "Kendi İlk 7’ni Seç", category: "announcement", description: "Takipçiler kendi ilk 7'sini seçsin.", sizes: SOCIAL },
];

/** Registry TEMPLATE_ALIASES: eski kimlikle kaydedilmiş hazır içerikler. */
const TEMPLATE_ALIASES: Record<string, string> = {
  "daily-fixtures": "fixtures-results",
  "daily-results": "fixtures-results",
  "weekly-fixtures": "fixtures-results",
  "weekly-results": "fixtures-results",
};

export const templateById = (id: string): ContentTemplate | null =>
  CONTENT_TEMPLATES.find((t) => t.id === id) ?? CONTENT_TEMPLATES.find((t) => t.id === TEMPLATE_ALIASES[id]) ?? null;

/** Web oluşturucusunun adresi; hazır içerikte `?hazir=<id>` eklenir (LibrarySection.presetRoute). */
export function templateWebUrl(templateId: string, presetId?: number | null): string {
  const template = templateById(templateId);
  const path = template?.route ?? `/icerik-havuzu/${encodeURIComponent(template?.id ?? templateId)}`;
  return `${WEB_BASE_URL}${path}${presetId ? `?hazir=${encodeURIComponent(String(presetId))}` : ""}`;
}

/* ===================== klasörler ===================== */

export interface ContentPreset {
  id: number;
  folderId: number;
  templateId: string;
  title: string;
  sortOrder: number;
  createdBy: number | null;
  createdByName: string | null;
  updatedBy: number | null;
  updatedByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  settings?: Record<string, unknown>;
}

export interface ContentFolder {
  id: number;
  name: string;
  description: string;
  canEdit: boolean;
  ownerName: string | null;
  sortOrder: number;
  createdBy: number | null;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  presets: ContentPreset[];
}

const BASE = "/api/admin/content-pool";
const enc = (value: number) => encodeURIComponent(String(value));

export const getContentLibrary = () =>
  get<{ folders: ContentFolder[] }>(`${BASE}/library`, undefined, { retry: false }).then((d) =>
    (d.folders ?? []).map((folder) => ({ ...folder, presets: folder.presets ?? [] }))
  );

export const createContentFolder = (body: { name: string; description?: string }) =>
  post<{ folder: ContentFolder }>(`${BASE}/folders`, body).then((d) => d.folder);

export const updateContentFolder = (id: number, body: { name?: string; description?: string }) =>
  patch<{ folder: ContentFolder }>(`${BASE}/folders/${enc(id)}`, body).then((d) => d.folder);

export const deleteContentFolder = (id: number) => del<{ message: string }>(`${BASE}/folders/${enc(id)}`);

export const createContentPreset = (folderId: number, body: { templateId: string; title: string; settings?: Record<string, unknown> }) =>
  post<{ preset: ContentPreset }>(`${BASE}/folders/${enc(folderId)}/presets`, body).then((d) => d.preset);

export const getContentPreset = (id: number) =>
  get<{ preset: ContentPreset }>(`${BASE}/presets/${enc(id)}`).then((d) => d.preset);

export const updateContentPreset = (id: number, body: { title?: string; folderId?: number; settings?: Record<string, unknown> }) =>
  patch<{ preset: ContentPreset }>(`${BASE}/presets/${enc(id)}`, body).then((d) => d.preset);

export const deleteContentPreset = (id: number) => del<{ message: string }>(`${BASE}/presets/${enc(id)}`);

/** Hazır içeriği (ayarlarıyla) başka bir klasöre kopyalar — web copyPreset ile aynı. */
export async function copyContentPreset(preset: ContentPreset, targetFolderId: number) {
  const full = await getContentPreset(preset.id);
  const sameFolder = targetFolderId === preset.folderId;
  return createContentPreset(targetFolderId, {
    templateId: preset.templateId,
    title: sameFolder ? `${preset.title} (kopya)`.slice(0, 160) : preset.title,
    settings: full?.settings ?? {},
  });
}
