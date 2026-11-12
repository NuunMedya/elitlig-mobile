/**
 * RÖPORTAJ BANDI — masaüstü stüdyodaki röportaj bandının telefon karşılığı.
 *
 * Bant üç satırdır: başlık şeridi ("MAÇ SONU RÖPORTAJI"), konuğun adı ve
 * görevi · takımı. Konuk elle yazılır ya da maç kadrosundan seçilir.
 * Altyazının aksine süreyle kalkmaz; operatör kapatana kadar ekranda kalır.
 *
 * Buradaki işlevler saftır (ekran / ağ yok).
 */

export interface InterviewGuest {
  name: string;
  /** Görev: "Teknik direktör", "Oyuncu · 10", "Kaptan"… */
  role: string;
  teamName: string;
  /** Takım arması (kadrodan seçilince). */
  logoUrl?: string | null;
  side: "home" | "away" | "other";
}

export interface Interview {
  title: string;
  guest: InterviewGuest;
}

/** Masaüstüyle aynı hazır başlıklar (+ iki kısa ek). */
export const INTERVIEW_TITLES = ["RÖPORTAJ", "MAÇ ÖNCESİ RÖPORTAJ", "DEVRE ARASI RÖPORTAJ", "MAÇ SONU RÖPORTAJI", "BASIN TOPLANTISI"] as const;

/** Elle yazarken hızlı görev seçenekleri. */
export const INTERVIEW_ROLES = ["Teknik direktör", "Yardımcı antrenör", "Kaptan", "Başkan", "Oyuncu"] as const;

export const INTERVIEW_TITLE_MAX = 40;
export const INTERVIEW_NAME_MAX = 60;
export const INTERVIEW_ROLE_MAX = 60;
/** Son konuklar listesinde tutulacak kişi sayısı. */
export const INTERVIEW_RECENT_MAX = 8;

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function makeGuest(input: { name: string; role?: string; teamName?: string; logoUrl?: string | null; side?: InterviewGuest["side"] }): InterviewGuest | null {
  const name = clean(input.name, INTERVIEW_NAME_MAX);
  if (!name) return null;
  return {
    name,
    role: clean(input.role, INTERVIEW_ROLE_MAX),
    teamName: clean(input.teamName, INTERVIEW_NAME_MAX),
    logoUrl: input.logoUrl || null,
    side: input.side ?? "other",
  };
}

export const cleanInterviewTitle = (v: string) => clean(v, INTERVIEW_TITLE_MAX).toLocaleUpperCase("tr-TR") || INTERVIEW_TITLES[0];

/** Bandın ikinci satırı: "Teknik direktör · Ev Sahibi SK". */
export const guestLine = (g: InterviewGuest) => [g.role, g.teamName].filter(Boolean).join(" · ");

const sameGuest = (a: InterviewGuest, b: InterviewGuest) => a.name === b.name && a.role === b.role && a.teamName === b.teamName;

/** Konuğu son konukların başına koy (tekrarsız, sınırlı). */
export function pushRecentGuest(list: InterviewGuest[], g: InterviewGuest): InterviewGuest[] {
  return [g, ...list.filter((x) => !sameGuest(x, g))].slice(0, INTERVIEW_RECENT_MAX);
}

/** Bandın yeniden çekilmesi için içerik imzası. */
export const interviewKey = (iv: Interview) => [iv.title, iv.guest.name, iv.guest.role, iv.guest.teamName, iv.guest.logoUrl ?? ""].join("~");
