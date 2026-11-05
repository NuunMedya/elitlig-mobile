import { del, get, post, put } from "../../http";

/**
 * Haber yönetimi uçları — elitlig-server routes/news.js + services/newsService.js.
 * Web karşılığı: src/services/newsApi.js + src/editor_pages/NewsManager.js.
 *
 *   GET    /api/news/admin/list     taslaklar dahil liste (?status=&category=&search=&page=&limit=)
 *   POST   /api/news                yeni haber (news.create; yayına almak news.publish)
 *   PUT    /api/news/:publicId      güncelle (news.update; yayına almak news.publish)
 *   DELETE /api/news/:publicId      sil (news.delete)
 *   POST   /api/news/admin/images   kapak / içerik görseli yükle (FormData "image")
 *   GET    /api/news/:publicId      tek haber (herkese açık)
 *
 * Köşe yazıları ayrı bir tür değildir: web'de "Yazı ekle" de bu formu açar.
 */

export type NewsStatus = "published" | "draft";
export type NewsCategory = "genel" | "transfer" | "ceza" | "mac" | "duyuru";

/** newsService.CATEGORIES ile birebir. */
export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  genel: "Genel",
  transfer: "Transfer",
  ceza: "Disiplin",
  mac: "Maç",
  duyuru: "Duyuru",
};

export const NEWS_STATUS_LABELS: Record<NewsStatus, string> = { published: "Yayında", draft: "Taslak" };

/** newsService.serializeNews. `id` haberin public_id'sidir. */
export interface AdminNews {
  kind: "news";
  id: string;
  title: string;
  summary: string;
  content: string;
  cover_image_url: string | null;
  category: NewsCategory;
  category_label: string;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  status: NewsStatus;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsPage {
  items: AdminNews[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NewsInput {
  title: string;
  summary: string;
  content: string;
  cover_image_url: string;
  category: NewsCategory;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  status: NewsStatus;
  pinned: boolean;
}

const enc = (value: string) => encodeURIComponent(value);

export const listAdminNews = (params: { status?: string; category?: string; search?: string; page?: number; limit?: number }) =>
  get<NewsPage>("/api/news/admin/list", { limit: 30, ...params });

export const getAdminNews = (publicId: string) =>
  get<{ item: AdminNews }>(`/api/news/${enc(publicId)}`).then((d) => d.item);

export const createNews = (body: NewsInput) => post<{ message: string; item: AdminNews }>("/api/news", body);

export const updateNews = (publicId: string, body: Partial<NewsInput>) =>
  put<{ message: string; item: AdminNews }>(`/api/news/${enc(publicId)}`, body);

export const deleteNews = (publicId: string) => del<{ message: string }>(`/api/news/${enc(publicId)}`);

/** Galeriden seçilen görseli yükler; dönen adres kapak ya da gövde görseli olur. */
export function uploadNewsImage(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("image", file as unknown as Blob);
  return post<{ url: string }>("/api/news/admin/images", form, { timeout: 120_000 }).then((d) => d.url);
}

/* ===================== kapsam adları ===================== */

export interface ScopeCity { id: number; city_name: string }
export interface ScopeLeague { id: number; league_name: string; city_id: number | null }
export interface ScopeSeason { id: number; season_name: string; league_id: number | null }

const asArray = <T,>(payload: unknown): T[] =>
  Array.isArray(payload)
    ? (payload as T[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: T[] }).data)
      : [];

/** Liste satırındaki "İl · lig · sezon" etiketi için tam listeler (web ile aynı uçlar). */
export const getScopeCatalog = async () => {
  const [cities, leagues, seasons] = await Promise.all([
    get<unknown>("/sehirler").then(asArray<ScopeCity>).catch(() => [] as ScopeCity[]),
    get<unknown>("/ligler").then(asArray<ScopeLeague>).catch(() => [] as ScopeLeague[]),
    get<unknown>("/sezonlar").then(asArray<ScopeSeason>).catch(() => [] as ScopeSeason[]),
  ]);
  return { cities, leagues, seasons };
};

/* ===================== gövde metni <-> HTML ===================== */

/**
 * Mobil düzenleyici düz metinle çalışır; web zengin metin (HTML) saklar.
 * Basit HTML (paragraf, satır sonu, ara başlık, görsel, kalın/italik) iki yönlü
 * çevrilir. Bunların dışında etiket taşıyan gövde "HTML" kipinde açılır ki
 * mobilden kaydetmek web'de verilmiş biçimi bozmasın.
 *
 *   Boş satır      → yeni paragraf
 *   "## Başlık"    → <h2>
 *   "[görsel](url)" → <img>
 *   **kalın**, _italik_
 */
const SIMPLE_TAGS = /^(p|br|h2|h3|img|strong|b|em|i)$/i;

export function isSimpleHtml(html: string): boolean {
  const tags = html.match(/<\/?([a-z0-9]+)[^>]*>/gi) ?? [];
  return tags.every((tag) => SIMPLE_TAGS.test(tag.replace(/^<\/?/, "").split(/[\s>/]/)[0] ?? ""));
}

const decode = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const encode = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function htmlToText(html: string): string {
  if (!html) return "";
  return decode(
    html
      .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "\n\n[görsel]($1)\n\n")
      .replace(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi, "\n\n## $1\n\n")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "_$2_")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<\/?p[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const inline = (text: string) =>
  encode(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");

export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const image = block.match(/^\[görsel\]\((\S+)\)$/);
      if (image) return `<p><img src="${image[1]}" alt=""></p>`;
      if (block.startsWith("## ")) return `<h2>${inline(block.slice(3))}</h2>`;
      return `<p>${inline(block)}</p>`;
    })
    .join("");
}

/** Liste satırı ve gövde denetimi için düz metin. */
export const plainText = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
