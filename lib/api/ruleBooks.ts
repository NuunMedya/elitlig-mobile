import { get } from "../http";

/**
 * Kural kitapçıkları — routes/ruleBooks.js (herkese açık uçlar).
 *
 *   GET /api/rule-books?seasonId=     → sezonun seçtiği yayındaki kitapçık
 *   GET /api/rule-books?cityId=&leagueId= → kapsama uyan yayındaki kitapçıklar
 *                                          (en dar kapsamlı önce)
 *
 * İçerik (`content`) sunucuda temizlenmiş HTML'dir; her iki kitapçık biçimi
 * (rich / structured) için de okunacak metin bu alandadır.
 */
export interface PublicRuleBook {
  id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  kind?: string;
  published_at?: string | null;
  updated_at?: string | null;
}

type ListResponse = { items?: PublicRuleBook[] };

const hasContent = (book: PublicRuleBook | undefined | null): book is PublicRuleBook =>
  Boolean(book && String(book.content ?? "").replace(/<[^>]*>/g, "").trim());

/**
 * Kapsamın kitapçığı: önce sezonun seçtiği, yoksa şehir+lig kapsamına uyan en
 * dar kitapçık. Hiçbiri yoksa null (ekran resmî sabit metne döner).
 */
export async function getScopeRuleBook(scope: {
  cityId?: number | null;
  leagueId?: number | null;
  seasonId?: number | null;
}): Promise<PublicRuleBook | null> {
  if (scope.seasonId) {
    const bySeason = await get<ListResponse>("/api/rule-books", { seasonId: scope.seasonId });
    const book = (bySeason.items ?? []).find(hasContent);
    if (book) return book;
  }
  const byScope = await get<ListResponse>("/api/rule-books", {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
  });
  return (byScope.items ?? []).find(hasContent) ?? null;
}

const decode = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const plain = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();

/** "3. Takım Kadroları" gibi tek düzeyli numaralı kısa satır bölüm başlığıdır. */
const looksLikeSectionTitle = (line: string) => /^\d+\.\s+\S/.test(line) && !/^\d+\.\d/.test(line) && line.length <= 120;

/**
 * Kitapçık HTML'ini ekranın bölüm/madde yapısına çevirir.
 *   - <h1>…<h6> ve "3. Başlık" biçimli kısa satırlar yeni bölüm açar,
 *   - <li> madde işaretli satır ("• …"), diğer bloklar ve <br> satırları madde olur.
 * Başlıksız metin kitapçık adıyla tek bölüm olur.
 */
export function ruleBookSections(html: string, fallbackTitle: string): { title: string; items: string[] }[] {
  const tokens: { heading: boolean; text: string }[] = [];
  const source = String(html ?? "")
    .replace(/\r/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const blockRe = /<(h[1-6]|p|li|div|blockquote|pre|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let consumed = false;
  while ((match = blockRe.exec(source))) {
    consumed = true;
    const tag = match[1].toLowerCase();
    // İç içe blokların (div > p) dış kabuğu atlanır; iç bloklar ayrıca eşleşir.
    if (tag === "div" && /<(p|li|h[1-6]|div)\b/i.test(match[2])) continue;
    const lines = match[2]
      .split(/<br\s*\/?>/i)
      .map(plain)
      .filter(Boolean);
    if (tag.startsWith("h")) {
      const text = lines.join(" ");
      if (text) tokens.push({ heading: true, text });
      continue;
    }
    for (const line of lines) tokens.push({ heading: false, text: tag === "li" ? `• ${line}` : line });
  }
  if (!consumed) {
    for (const line of plain(source.replace(/<br\s*\/?>/gi, "\n")).split(/\n+/)) {
      const text = line.trim();
      if (text) tokens.push({ heading: false, text });
    }
  }

  const sections: { title: string; items: string[] }[] = [];
  for (const token of tokens) {
    if (token.heading || looksLikeSectionTitle(token.text)) {
      sections.push({ title: token.text, items: [] });
      continue;
    }
    if (!sections.length) sections.push({ title: fallbackTitle, items: [] });
    sections[sections.length - 1].items.push(token.text);
  }
  return sections.filter((section) => section.items.length > 0);
}
