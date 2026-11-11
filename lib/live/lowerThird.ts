/**
 * ALTYAZI (lower third) — yayına gömülen alt bant metni ve hazır şablonlar.
 *
 * Masaüstü stüdyodaki altyazı kayan bir şerittir; telefonda tek satırlık
 * "etiket + başlık + alt satır" bandına indirildi: operatör tek dokunuşla
 * yayına verir, süre dolunca kendiliğinden kalkar. Bant, skorbordla aynı
 * katmanda PNG'ye çekilip videoya gömülür.
 *
 * Buradaki işlevler saftır (ekran / ağ yok): şablon = veriden Caption üretir.
 */

export type CaptionTone = "brand" | "goal" | "yellow" | "red" | "info" | "sponsor";

export interface Caption {
  /** Aynı içerik yeniden yayına verilirse süre baştan başlasın diye benzersiz. */
  id: string;
  /** Sol blok: "GOL", "SARI KART", "OYUNCU"… (büyük harf, kısa). */
  tag: string;
  title: string;
  subtitle?: string | null;
  tone: CaptionTone;
  /** Etiket bloğunda gösterilecek görsel (sponsor logosu / takım arması). */
  imageUrl?: string | null;
}

/** Otomatik kalkma süreleri (sn). 0 = elle kaldırılana kadar. */
export const CAPTION_SECONDS = [6, 10, 20, 0] as const;
export type CaptionSeconds = (typeof CAPTION_SECONDS)[number];

export const captionSecondsLabel = (s: number) => (s > 0 ? `${s} sn` : "Elle");

export const TAG_MAX = 14;
export const TITLE_MAX = 60;
export const SUBTITLE_MAX = 80;

const upper = (v: string) => v.toLocaleUpperCase("tr-TR");
const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

let seq = 0;
const nextId = () => `cap-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function makeCaption(input: { tag?: string; title: string; subtitle?: string | null; tone?: CaptionTone; imageUrl?: string | null }): Caption | null {
  const title = clean(input.title, TITLE_MAX);
  if (!title) return null;
  return {
    id: nextId(),
    tag: upper(clean(input.tag, TAG_MAX)),
    title,
    subtitle: clean(input.subtitle, SUBTITLE_MAX) || null,
    tone: input.tone ?? "brand",
    imageUrl: input.imageUrl ?? null,
  };
}

/* ───────── hazır şablonlar ───────── */

export const playerCaption = (player: string, team: string, number?: string | null, logo?: string | null) =>
  makeCaption({ tag: number ? `OYUNCU · ${number}` : "OYUNCU", title: player, subtitle: team, tone: "brand", imageUrl: logo });

export const goalCaption = (scorer: string | null, team: string, minute: number, score: string, own = false, logo?: string | null) =>
  makeCaption({
    tag: own ? "KENDİ KALESİNE" : "GOL",
    title: scorer || team,
    subtitle: `${minute}' · ${scorer ? `${team} · ` : ""}${score}`,
    tone: "goal",
    imageUrl: logo,
  });

export const cardCaption = (kind: "yellow" | "red", player: string | null, team: string, minute: number, logo?: string | null) =>
  makeCaption({
    tag: kind === "red" ? "KIRMIZI KART" : "SARI KART",
    title: player || team,
    subtitle: player ? `${minute}' · ${team}` : `${minute}'`,
    tone: kind,
    imageUrl: logo,
  });

export const substitutionCaption = (playerIn: string | null, playerOut: string | null, team: string, minute: number, logo?: string | null) =>
  makeCaption({
    tag: "DEĞİŞİKLİK",
    title: playerIn ? `Giren: ${playerIn}` : team,
    subtitle: [playerOut ? `Çıkan: ${playerOut}` : null, `${minute}'`, playerIn ? team : null].filter(Boolean).join(" · "),
    tone: "info",
    imageUrl: logo,
  });

export const matchInfoCaption = (home: string, away: string, parts: (string | null | undefined)[]) =>
  makeCaption({ tag: "MAÇ", title: `${home} – ${away}`, subtitle: parts.map((p) => clean(p, 40)).filter(Boolean).join(" · "), tone: "brand" });

export const scoreCaption = (tag: string, home: string, away: string, homeScore: number, awayScore: number, extra?: string | null) =>
  makeCaption({ tag, title: `${home} ${homeScore} – ${awayScore} ${away}`, subtitle: extra ?? null, tone: "brand" });

export const sponsorCaption = (name: string, tagline?: string | null, logo?: string | null) =>
  makeCaption({ tag: "SPONSOR", title: name, subtitle: tagline || "Bu yayın katkılarıyla gerçekleşiyor", tone: "sponsor", imageUrl: logo });
