/**
 * MAÇ SAYFASININ ORTAK YARDIMCILARI — saf fonksiyonlar ve türetme kancaları.
 *
 * NEDEN AYRI DOSYA: maç detayı eskiden 4.500 satırlık tek bir dosyaydı; skor
 * tablosu, beş sekme ve bütün türetmeler aynı yerdeydi. Sekmeler artık kendi
 * dosyalarında (`components/matchpage/*Tab.tsx`) ve hepsinin ortak ihtiyacı
 * — ad kısaltma, golcü listesi, H2H eşleştirme, zaman tüneli öğeleri — burada
 * TEK kopya durur. Burada görsel yoktur; yalnız veri.
 *
 * UYDURMA VERİ YOK: her türetme ya maç kaydından, ya kadro ucundan, ya da
 * olay tablosundan gelir (lib/types.ts). Sunucunun tutmadığı bir şey (topla
 * oynama, xG, ısı haritası) burada hesaplanmaz.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { haptics } from "@/theme";
import {
  eventKind,
  isGoal,
  isOwnGoal,
  isSubstitution,
  matchState,
  scoreDelta,
} from "@/lib/match";
import { positionLine } from "@/lib/api/team";
import type { ApiMatch, ApiMatchEvent, KadroPlayer, KadroResponse, LiveSnapshot } from "@/lib/types";

/* ══════════════════════════════════════════════════════════════════════════
   Tipler
   ══════════════════════════════════════════════════════════════════════════ */

/** Sayfa sekmeleri. "canli" yalnız maç canlıyken kullanılan Özet anahtarıdır (etiket yine "Özet", yanında nokta). */
export type MatchTab = "ozet" | "canli" | "kadro" | "istatistik" | "h2h" | "puan";

/** Her sekmenin listesine geçen ortak kaydırma bağlantısı (başlık daralması). */
export interface ScrollChrome {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

/** Tek gol satırı — skor tablosunun golcü sütunları bundan çizilir. */
export interface ScorerLine {
  key: string;
  name: string;
  minute: number | null;
  /** Kendi kalesine — adın yanında (k.k.) notu çıkar. */
  ownGoal: boolean;
}

/** Aynı oyuncunun golleri tek satırda toplanmış hâli. */
export interface GoalGroup {
  key: string;
  name: string;
  /** Dakikalar, artan sırada. */
  minutes: number[];
  ownGoal: boolean;
}

/** Oyuncu değişikliği bilgisi: kaçıncı dakikada girdi / çıktı. */
export interface SubInfo {
  in?: number | null;
  out?: number | null;
}

/** Oyuncu id → ad çözücüsü (kadro ucundan). */
export type NameOf = (playerId?: number | null) => string | null;

/* ══════════════════════════════════════════════════════════════════════════
   Rota parametresi
   ══════════════════════════════════════════════════════════════════════════ */

const TAB_KEYS: readonly string[] = ["ozet", "canli", "kadro", "istatistik", "h2h", "puan"];

/**
 * Bildirimden/menüden gelen farklı yazımlar da doğru sekmeye düşsün.
 * Sunucu tarafı ve web istemcisi İngilizce anahtar gönderebiliyor.
 */
const TAB_ALIASES: Record<string, MatchTab> = {
  summary: "ozet",
  ozeti: "ozet",
  live: "canli",
  canliyayin: "canli",
  lineup: "kadro",
  lineups: "kadro",
  kadrolar: "kadro",
  stats: "istatistik",
  istatistikler: "istatistik",
  headtohead: "h2h",
  gecmis: "h2h",
  standings: "puan",
  puandurumu: "puan",
};

/**
 * Rota anahtarını sekmeye çevirir.
 *
 * TUZAK: `"İSTATİSTİK".toLocaleLowerCase("tr")` noktasız ı üretir, düz
 * `toLowerCase()` ise "İ" için birleşik nokta bırakır; ikisi de ASCII rota
 * anahtarıyla eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
export function resolveTab(raw: unknown): MatchTab {
  if (typeof raw !== "string") return "ozet";
  const key = raw.trim().replace(/[İIı]/g, "i").toLowerCase();
  if (TAB_KEYS.includes(key)) return key as MatchTab;
  return TAB_ALIASES[key] ?? "ozet";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   Küçük yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Hakem adı henüz `ApiMatch` sözleşmesinde yok; bazı kurulumlarda kayıt
 * `hakem`/`referee` alanıyla geliyor. Alan varsa gösterilir, yoksa satır hiç
 * çizilmez — `any` kullanmadan, tipi genişleterek okunur.
 */
type MatchExtras = { hakem?: string | null; referee?: string | null };

export function refereeOf(match: ApiMatch): string | null {
  const extra = match as ApiMatch & MatchExtras;
  const value = (extra.hakem ?? extra.referee ?? "").toString().trim();
  return value.length > 0 ? value : null;
}

/** Maç kaydındaki tarih tam ISO da olabilir; gün kısmı ilk 10 karakterdir. */
export const dayOf = (match: Pick<ApiMatch, "date">) => String(match.date ?? "").slice(0, 10);

/** Başlama anı (ms). Okunamayan tarihlerde 0 döner. */
export function kickoffAt(match: Pick<ApiMatch, "date" | "time">): number {
  const stamp = Date.parse(`${dayOf(match)}T${match.time || "00:00:00"}`);
  return Number.isFinite(stamp) ? stamp : 0;
}

/**
 * Baş harf + soyadı: "Muhammed Enes YAZICIOĞLU" → "M. YAZICIOĞLU".
 *
 * Televizyon grafiklerinin biçimi budur ve bir gol satırında ayırt edici olan
 * da soyadıdır. Tek kelimelik adlar olduğu gibi kalır.
 */
export function compactName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return full.trim();
  return `${parts[0].slice(0, 1)}. ${parts[parts.length - 1]}`;
}

/** Türkçe küçük harf (İ/I tuzağı) — takım adı karşılaştırmaları bununla yapılır. */
export const normalizeName = (value?: string | null) =>
  String(value ?? "").trim().toLocaleLowerCase("tr-TR");

export const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * Takımın üç harfli kısaltması — daralan başlıktaki "ÖZM 13–9 VUR" satırı.
 *
 * İki takım adı tam hâliyle tek satıra sığmıyor ("ÖZMEN PETROL SPOR 13–9
 * VURKAÇ FC" kırpılıyordu); yayın grafiklerindeki üç harf hem sığar hem
 * tanınır. "FC/FK/SPOR" gibi ekler atlanır ki "FC KARTAL" → "KAR" olsun.
 */
const NOISE = new Set(["fc", "fk", "sk", "spor", "kulübü", "the"]);
export function teamCode(name: string): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !NOISE.has(normalizeName(word)));
  const base = words[0] ?? String(name ?? "").trim();
  return base.slice(0, 3).toLocaleUpperCase("tr-TR") || "—";
}

/**
 * Devre arası tespiti. Sunucu `matchStatus` alanını her kurulumda aynı yazmıyor;
 * bilinen değerler eşleşmezse "canlı ama sayaç durmuş, ilk devre tamamlanmış"
 * durumu devre arası sayılır (`match_halftime` bildirimiyle aynı an).
 */
const HALFTIME_STATUSES = [
  "devre_arasi",
  "devrearasi",
  "devre arasi",
  "devre arası",
  "halftime",
  "half_time",
  "ht",
  "ara",
];

export function isHalftime(snapshot: LiveSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const status = String(snapshot.matchStatus ?? "").trim().toLowerCase();
  if (HALFTIME_STATUSES.includes(status)) return true;
  const timer = snapshot.timer;
  if (!timer) return false;
  return Boolean(snapshot.isLive && !timer.running && (timer.baseMs ?? 0) > 0);
}

/** Canlı dakikanın parçaları: oynanan dakika + 90 sonrası uzatma. */
export function minuteParts(clockMs: number | null): { minute: number | null; added: number | null } {
  if (clockMs == null || !Number.isFinite(clockMs)) return { minute: null, added: null };
  const minute = Math.floor(clockMs / 60_000);
  return minute > 90 ? { minute: 90, added: minute - 90 } : { minute, added: null };
}

export const isGoalKind = (kind: string) => kind === "goal" || kind === "ownGoal";

/** YouTube video kimliğini adresten çıkarır. */
export function extractYouTubeId(url: string): string | null {
  const patterns = [/[?&]v=([^&#]+)/, /youtu[.]be[/]([^?&#]+)/, /youtube[.]com[/](?:embed|live)[/]([^?&#]+)/];
  for (const pattern of patterns) {
    const found = url.match(pattern);
    if (found?.[1]) return found[1];
  }
  return null;
}

/**
 * "TAKIM1 vs TAKIM2" gibi otomatik başlıklar tabelayı tekrar eder; gizlenir.
 * Gerçek bir manşet ("Son dakikada gelen galibiyet") gösterilir.
 */
export function headlineOf(match: ApiMatch): string | null {
  const raw = match.match_title?.trim();
  if (!raw) return null;
  return isTrivialTitle(raw, match) ? null : raw;
}

/**
 * İstatistik etiketinin okunur hâli. Sunucu ızgarası dar sütunlar için
 * kısaltıyor ("Fırsat Yarat."); maç sayfasında satır genişliği bol, tam ad
 * cümle düzeninde yazılır.
 */
const STAT_LABELS: Record<string, string> = {
  "Fırsat Yarat.": "Fırsat yaratma",
  "İkili Müc.": "İkili mücadele",
  "Kritik Blok": "Kritik blok",
  "Hava Topu": "Hava topu",
  "Sarı Kart": "Sarı kart",
  "Kırmızı Kart": "Kırmızı kart",
};
export const statLabel = (label: string) => STAT_LABELS[label] ?? label;

/**
 * Otomatik doldurulmuş metin mi? "TAKIM1 vs TAKIM2" biçimindeki not ve
 * başlıklar tabelayı tekrar eder; gizlenir.
 */
export function isTrivialTitle(value: string, match: Pick<ApiMatch, "first_team_name" | "second_team_name">): boolean {
  const squash = (text: string) =>
    text.toLocaleLowerCase("tr-TR").replace(/[\s·|-]+/g, " ").replace(/\bvs\.?\b/g, "vs").trim();
  return squash(value) === squash(`${match.first_team_name} vs ${match.second_team_name}`);
}

/** Kadro satırının oyuncu kimliği (iki alan adı da gelebiliyor). */
export const playerIdOf = (row: Pick<KadroPlayer, "playerId" | "oyuncu_id">) =>
  Number(row.playerId ?? row.oyuncu_id) || null;

/** Kadro satırının ekranda okunacak adı. */
export const playerNameOf = (row: Pick<KadroPlayer, "playerName" | "guestName">) =>
  row.playerName || row.guestName || "İsimsiz oyuncu";

/** Aynı index iki bölümde de geçtiği için anahtar TAKIMI da taşır. */
export const playerKey = (player: KadroPlayer, index: number) =>
  `${player.team_id ?? player.takim_id ?? "t"}-${player.playerId ?? player.oyuncu_id ?? "misafir"}-${index}`;

export const eventKey = (event: ApiMatchEvent, index: number) => `${event.id ?? "olay"}-${index}`;

/**
 * Dizilişi kadro satırlarından türetir: "3-3-1".
 *
 * Sunucu maç kadrosunda diziliş SAKLAMAZ (yalnız takımın ideal kadrosunda
 * vardır), bu yüzden ilk kadronun pozisyon kodları hatlara sayılır. Kaleci
 * dizilişte yazılmaz — futbolun yazım kuralı budur (3-3-1, 1+3-3-1 değil).
 */
export function formationOf(rows: KadroPlayer[]): string | null {
  const count: Record<"DEF" | "MID" | "FWD", number> = { DEF: 0, MID: 0, FWD: 0 };
  for (const row of rows) {
    const line = positionLine(row.position);
    if (line !== "GK") count[line] += 1;
  }
  if (count.DEF + count.MID + count.FWD === 0) return null;
  return `${count.DEF}-${count.MID}-${count.FWD}`;
}

/**
 * Golcüleri oyuncuya göre toplar.
 *
 * Sıra, oyuncunun İLK golünün dakikasına göredir — maçın akışı korunur.
 * Kendi kalesine gol ayrı bir satır olur: aynı oyuncunun normal golüyle aynı
 * satıra girerse "(k.k.)" hangi dakikaya ait olduğu okunamaz.
 */
export function groupScorers(lines: ScorerLine[]): GoalGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, GoalGroup>();

  for (const line of lines) {
    const name = compactName(line.name);
    const key = `${name}|${line.ownGoal ? "kk" : "gol"}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, name, minutes: [], ownGoal: line.ownGoal };
      byKey.set(key, group);
      order.push(key);
    }
    if (line.minute != null) group.minutes.push(line.minute);
  }

  return order.map((key) => byKey.get(key) as GoalGroup);
}

/** Bir maçta bakılan takım ev sahibi tarafta mı? */
export function sideIsHome(item: ApiMatch, teamId: number | null, teamName: string): boolean {
  if (teamId && Number(item.home_team_id)) return Number(item.home_team_id) === teamId;
  return normalizeName(item.first_team_name) === teamName;
}

/** Bir maçın bakılan takım gözünden sonucu. */
export function resultFor(item: ApiMatch, teamId: number | null, teamName: string): "G" | "B" | "M" {
  const homeSide = sideIsHome(item, teamId, teamName);
  const ours = homeSide ? item.first_team_score : item.second_team_score;
  const theirs = homeSide ? item.second_team_score : item.first_team_score;
  if (ours == null || theirs == null) return "B";
  if (ours > theirs) return "G";
  if (ours < theirs) return "M";
  return "B";
}

/* ══════════════════════════════════════════════════════════════════════════
   Türetme kancaları
   ══════════════════════════════════════════════════════════════════════════ */

/** Oyuncu id → ad. Adlar kadro yükünde zaten temizlenmiştir (bkz. ekran kabuğu). */
export function usePlayerNames(kadro: KadroResponse | undefined): NameOf {
  return useMemo(() => {
    const byId = new Map<number, string>();
    [...(kadro?.home ?? []), ...(kadro?.away ?? [])].forEach((row) => {
      const playerId = row.playerId ?? row.oyuncu_id;
      const name = row.playerName ?? row.guestName;
      if (playerId != null && name) byId.set(Number(playerId), name);
    });
    return (playerId?: number | null) =>
      playerId != null ? byId.get(Number(playerId)) ?? null : null;
  }, [kadro]);
}

/**
 * Gol atanlar — skor tablosunun altındaki iki sütun.
 *
 * KENDİ KALESİNE GOL, SKORU HANGİ TAKIMA YAZIYORSA O SÜTUNDA görünür (skor
 * tablosuyla tutarlı olması için) ama adın yanında (k.k.) notu taşır — aksi
 * hâlde oyuncu, rakip takımın golcüsü gibi okunurdu.
 */
export function useGoalScorers(
  events: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null,
  nameOf: NameOf,
): { home: ScorerLine[]; away: ScorerLine[] } {
  return useMemo(() => {
    const home: ScorerLine[] = [];
    const away: ScorerLine[] = [];

    for (const event of events) {
      const goal = isGoal(event);
      const own = isOwnGoal(event);
      if (!goal && !own) continue;

      const scoredBy = Number(event.takim_id);
      // Kendi kalesine golde sayı RAKİBE yazılır; sütun da ona göre seçilir.
      const creditedHome = own ? scoredBy !== Number(homeTeamId) : scoredBy === Number(homeTeamId);
      const creditedAway = own ? scoredBy !== Number(awayTeamId) : scoredBy === Number(awayTeamId);

      const line: ScorerLine = {
        key: String(event.id),
        name: nameOf(event.oyuncu_id) ?? "Bilinmeyen oyuncu",
        minute: event.dakika ?? null,
        ownGoal: own,
      };

      if (creditedHome) home.push(line);
      else if (creditedAway) away.push(line);
    }

    const byMinute = (a: ScorerLine, b: ScorerLine) => (a.minute ?? 0) - (b.minute ?? 0);
    return { home: home.sort(byMinute), away: away.sort(byMinute) };
  }, [events, homeTeamId, awayTeamId, nameOf]);
}

/** Oyuncu id → giriş/çıkış dakikası. Kadro satırındaki oklar buradan çizilir. */
export function useSubstitutions(events: ApiMatchEvent[]): Map<number, SubInfo> {
  return useMemo(() => {
    const map = new Map<number, SubInfo>();
    for (const event of events) {
      if (!isSubstitution(event)) continue;
      const entered = Number(event.oyuncu_giren_id) || null;
      const left = Number(event.oyuncu_cikan_id) || null;
      if (entered) map.set(entered, { ...(map.get(entered) ?? {}), in: event.dakika });
      if (left) map.set(left, { ...(map.get(left) ?? {}), out: event.dakika });
    }
    return map;
  }, [events]);
}

/**
 * Yeni gelen golü bulur (canlı akışta satır flaşı + titreşim).
 *
 * İLK YÜKLEMEDE FLAŞ YOK: ekran açıldığında geçmiş goller "yeni" sayılsaydı
 * bitmiş bir maçı açan herkes titreşim alırdı. İlk turda yalnız kayıt tutulur.
 */
export function useGoalFlash(events: ApiMatchEvent[]): number | null {
  const [flashId, setFlashId] = useState<number | null>(null);
  const seenRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const goalIds = events
      .filter((event) => isGoalKind(eventKind(event)))
      .map((event) => Number(event.id))
      .filter((id) => Number.isFinite(id));

    const known = seenRef.current;
    seenRef.current = new Set(goalIds);

    if (known == null) return; // ilk tur: yalnız kayıt
    const fresh = goalIds.find((id) => !known.has(id));
    if (fresh == null) return;

    haptics.goal();
    setFlashId(fresh);
  }, [events]);

  /*
   * Vurguyu AYRI efekt sıfırlar. Zamanlayıcı yukarıdaki tespit efektinde
   * kurulsaydı, `events` her değiştiğinde temizleyici onu iptal eder ve yeni
   * gol olmadığı için bir daha kurulmazdı — `flashId` dolu kalırdı.
   */
  useEffect(() => {
    if (flashId == null) return;
    const timer = setTimeout(() => setFlashId(null), 4_000);
    return () => clearTimeout(timer);
  }, [flashId]);

  return flashId;
}

/**
 * İki takımın aralarındaki tamamlanmış maçlar, en yeni önce (en fazla 10).
 *
 * Kimlik numarası varsa onunla, yoksa takım adlarıyla eşleştirilir — eski
 * kayıtlarda `home_team_id` boş olabiliyor (app/h2h.tsx ile aynı kural).
 */
export function useHeadToHead({
  match,
  homeTeamId,
  awayTeamId,
  homeMatches,
  awayMatches,
}: {
  match: ApiMatch | undefined;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
}): ApiMatch[] {
  return useMemo(() => {
    if (!match) return [];
    const homeName = normalizeName(match.first_team_name);
    const awayName = normalizeName(match.second_team_name);
    if (!homeName || !awayName) return [];

    const involvesBoth = (item: ApiMatch) => {
      const first = Number(item.home_team_id);
      const second = Number(item.away_team_id);
      if (homeTeamId && awayTeamId && first && second) {
        return (
          (first === homeTeamId && second === awayTeamId) ||
          (first === awayTeamId && second === homeTeamId)
        );
      }
      const a = normalizeName(item.first_team_name);
      const b = normalizeName(item.second_team_name);
      return (a === homeName && b === awayName) || (a === awayName && b === homeName);
    };

    // Ev sahibinin listesi yeterlidir; eksikse deplasmanınki tamamlar.
    const pool = [...(homeMatches ?? []), ...(awayMatches ?? [])];
    const unique = new Map<number, ApiMatch>();
    for (const item of pool) {
      const id = Number(item.id);
      if (!id || id === Number(match.id)) continue;
      if (matchState(item) !== "finished") continue;
      if (!involvesBoth(item)) continue;
      unique.set(id, item);
    }

    return Array.from(unique.values())
      .sort((a, b) => kickoffAt(b) - kickoffAt(a))
      .slice(0, 10);
  }, [awayMatches, awayTeamId, homeMatches, homeTeamId, match]);
}

/** Takımın son 5 maçının form dizisi ("GBMGG", eskiden yeniye) — FormChips okur. */
export function useFormString(
  matches: ApiMatch[] | undefined,
  currentMatchId: number,
  teamId: number | null,
  teamName: string,
): string {
  return useMemo(() => {
    const list = (matches ?? [])
      .filter((item) => matchState(item) === "finished" && Number(item.id) !== Number(currentMatchId))
      .sort((a, b) => kickoffAt(b) - kickoffAt(a))
      .slice(0, 5)
      .reverse();
    return list.map((item) => resultFor(item, teamId, teamName)).join("");
  }, [currentMatchId, matches, teamId, teamName]);
}

/**
 * Aralarındaki maçların ev sahibi gözünden dökümü: galibiyet / beraberlik /
 * mağlubiyet ve atılan goller. H2H sekmesi ve maç öncesi Özet aynı sayıyı okur.
 */
export function useHeadToHeadTally(meetings: ApiMatch[], homeTeamId: number | null, homeName: string) {
  return useMemo(() => {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    for (const item of meetings) {
      const first = item.first_team_score;
      const second = item.second_team_score;
      if (first == null || second == null) continue;
      const homeIsFirst = sideIsHome(item, homeTeamId, homeName);
      const ours = homeIsFirst ? first : second;
      const theirs = homeIsFirst ? second : first;
      homeGoals += ours;
      awayGoals += theirs;
      if (ours > theirs) homeWins += 1;
      else if (ours < theirs) awayWins += 1;
      else draws += 1;
    }
    return { homeWins, draws, awayWins, homeGoals, awayGoals };
  }, [homeName, homeTeamId, meetings]);
}

/* ══════════════════════════════════════════════════════════════════════════
   Zaman tüneli öğeleri
   ══════════════════════════════════════════════════════════════════════════ */

/** Zaman tüneli sırası: en yeni önce ya da maçın akışı. */
export type TimelineOrder = "yeni" | "akis";

/**
 * Zaman tünelinin bir öğesi: ya bir olay ya da bir devre ayracı.
 *
 * Ayraçlar veriden türetilir (olayların `devre` alanı değişince) — sunucudan
 * "devre arası" diye bir olay gelmiyor.
 */
export type TimelineItem =
  | {
      kind: "event";
      key: string;
      event: ApiMatchEvent;
      home: boolean;
      /** Golden sonraki skor ("2–1"); gol değilse null. */
      score: string | null;
    }
  | { kind: "break"; key: string; label: string; score: string | null };

/**
 * Olayları zaman tüneli öğelerine çevirir: devre ayraçlarını ekler ve her
 * golün yanına O ANKİ SKORU yazar.
 *
 * NEDEN KOŞAN SKOR: "78' Ateş" satırı golün atıldığını söyler ama maçın o an
 * kaç kaç olduğunu söylemez; okuyucu yukarı çıkıp saymak zorunda kalıyordu.
 * Ayraçlar da o anki skoru taşır ("Devre arası · 1–0").
 */
export function useTimelineItems(
  timeline: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null,
  finished: boolean,
  order: TimelineOrder,
): TimelineItem[] {
  return useMemo(() => {
    const items: TimelineItem[] = [];
    let home = 0;
    let away = 0;
    let period: number | null = null;

    timeline.forEach((event, index) => {
      const current = event.devre ?? null;
      if (period != null && current != null && current !== period) {
        items.push({ kind: "break", key: `break-${current}`, label: "Devre arası", score: `${home}–${away}` });
      }
      period = current ?? period;

      const delta = scoreDelta(event, homeTeamId, awayTeamId);
      const scored = delta.home > 0 || delta.away > 0;
      home += delta.home;
      away += delta.away;

      items.push({
        kind: "event",
        key: eventKey(event, index),
        event,
        home: Number(event.takim_id) === Number(homeTeamId),
        score: scored ? `${home}–${away}` : null,
      });
    });

    if (finished && items.length) {
      items.push({ kind: "break", key: "break-full", label: "Maç sonu", score: null });
    }

    return order === "yeni" ? items.slice().reverse() : items;
  }, [timeline, homeTeamId, awayTeamId, finished, order]);
}
