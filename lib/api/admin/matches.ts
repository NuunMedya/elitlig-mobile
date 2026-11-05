import { del, get, patch, post, put } from "../../http";
import type { ApiMatch, ApiTeam, MacDurumu } from "../../types";

/**
 * MAÇ YÖNETİMİ UÇLARI — web yönetim panelinin maç iş akışı (Maç Bilgileri,
 * Kadro, Reji Paneli, Maç Sonu, Maç Oluştur, Toplu Düzenle, Puan Durumu,
 * Takım Müsaitliği) ile birebir aynı sunucu uçları.
 *
 *   routes/Matches.js       → /maclar (oluştur, güncelle, sil, sonuç, toplu içerik)
 *   routes/MatchFlow.js     → /api/maclar/:id (kadro, olaylar, puanlar, yayın modu)
 *   routes/timers.js        → /api/maclar/:id/timer (maç saati ve devre)
 *   routes/PlayerStatistics → /oyuncu-istatistikleri (maç istatistiği girişi)
 *   routes/staff.js         → /api/staff (görevlendirme: spiker, reji, hakem…)
 *   routes/Standings.js     → /api/standings (puan durumu düzeltmeleri)
 *   routes/teamAvailability → /api/team-availability/admin
 *
 * Alan adları sunucu modellerinden alınmıştır. Maç kaydında olmayan alanlar
 * (live_stream_url, live_events gibi) PATCH /maclar/:id tarafından zaten yok
 * sayıldığı için burada hiç gönderilmez.
 */

/* ═══════════════════════════ DURUMLAR ═══════════════════════════ */

/** Yazarken kullanılan dört durum; "zamanlandi" yazımı okunurken eşlenir. */
export const MATCH_STATUS_OPTIONS: { value: MacDurumu; label: string; hint: string }[] = [
  { value: "taslak", label: "Taslak", hint: "Sitede görünmez" },
  { value: "zamanlanmis", label: "Zamanlandı", hint: "Fikstürde yayınlanır" },
  { value: "canli", label: "Canlı", hint: "Maç oynanıyor" },
  { value: "yayinlanmis", label: "Tamamlandı", hint: "Skor tescil, puan durumu hesaplanır" },
];

/**
 * Sunucu "zamanlandı"yı iki yazımla saklar (constants/matchStatus.js):
 * elle oluşturulan maçlar "zamanlanmis", fikstür maçları "zamanlandi".
 */
export function normalizeMatchStatus(raw: unknown): MacDurumu | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "taslak" || s === "draft") return "taslak";
  if (s.startsWith("zamanlan") || s === "planlandi" || s === "scheduled") return "zamanlanmis";
  if (s.startsWith("canl") || s === "live") return "canli";
  if (s.startsWith("yay") || s === "bitti" || s === "published") return "yayinlanmis";
  return null;
}

export const statusLabelOf = (raw: unknown) =>
  MATCH_STATUS_OPTIONS.find((o) => o.value === normalizeMatchStatus(raw))?.label ?? "Durum yok";

/* ═══════════════════════════ MAÇ KAYDI ═══════════════════════════ */

/** GET /api/maclar/:id — önbelleksiz, modelin tüm alanları. */
export interface AdminMatch extends ApiMatch {
  group_id?: number | null;
  score_source?: "events" | "manual" | "forfeit" | null;
  forfeit_side?: "home" | "away" | null;
  result_note?: string | null;
  overlay_status?: string | null;
  led_overlay_status?: string | null;
  post_roportaj?: string | null;
  post_macin_enleri?: string | null;
  post_enler?: string | null;
  match_interview?: string | null;
  match_images?: string | null;
  first_team_percentage?: number | null;
  second_team_percentage?: number | null;
}

/** Skor elle ya da hükmen tescil edildiyse olaylar skoru değiştirmez. */
export const isManualResult = (match: Pick<AdminMatch, "score_source"> | null | undefined) =>
  Boolean(match?.score_source) && match?.score_source !== "events";

export function resultSourceLabel(match: AdminMatch | null | undefined): string {
  if (match?.score_source === "forfeit") {
    const loser =
      match.forfeit_side === "home" ? match.first_team_name : match.forfeit_side === "away" ? match.second_team_name : "";
    return loser ? `Hükmen · ${loser} hükmen mağlup` : "Hükmen";
  }
  if (match?.score_source === "manual") return "Elle tescil";
  return "";
}

/** Eski kayıtlarda boş metin alanları "none" ile dolu gelir. */
export const cleanText = (value: unknown) => {
  const text = value == null ? "" : String(value).trim();
  return text.toLocaleLowerCase("tr-TR") === "none" ? "" : text;
};

/** GET /api/maclar/:id — /maclar/:id 15 sn önbelleklidir; yönetim taze kaydı okur. */
export const getAdminMatch = (id: number) => get<AdminMatch>(`/api/maclar/${id}`);

/** PATCH /maclar/:id — yalnızca modeldeki alanlar yazılır (matches.update). */
export const updateMatch = (id: number, body: Record<string, unknown>) =>
  patch<{ message: string }>(`/maclar/${id}`, body);

/** DELETE /maclar/:id — maç, kadro ve istatistikler çöp kutusuna (matches.delete). */
export const deleteMatch = (id: number) => del<{ message: string }>(`/maclar/${id}`);

/** PATCH /maclar/:id/status — durum değişimi (matches.publish). */
export const setMatchStatus = (id: number, status: MacDurumu) =>
  patch<{ message: string; match: AdminMatch }>(`/maclar/${id}/status`, { mac_durumu: status });

export interface CreateFixtureInput {
  first_team_name: string;
  second_team_name: string;
  date: string;
  time: string;
  match_field: string;
  league_name: string;
  match_season: string;
  match_title: string;
  city: string;
  is_it_fixture: boolean;
  home_team_id: number;
  away_team_id: number;
  league_id: number | null;
  season_id: number | null;
  group_id: number | null;
}

/**
 * POST /maclar/add-fikstur — maç her zaman TASLAK açılır; başka başlangıç
 * durumu istenirse ardından PATCH ile yazılır (web Maç Oluştur ile aynı).
 */
export const createFixture = (input: CreateFixtureInput) => post<AdminMatch>("/maclar/add-fikstur", input);

/** GET /maclar/lineup-status?ids= — iki takımın da kadrosu girilmiş mi. */
export const getLineupStatus = (ids: number[]) =>
  get<{ statuses: Record<string, boolean> }>("/maclar/lineup-status", { ids: ids.slice(0, 300).join(",") });

/* ═══════════════════════════ SONUÇ TESCİLİ ═══════════════════════════ */

export type ResultBody =
  | { mode: "manual"; home: number; away: number; note: string; publish: boolean }
  | { mode: "forfeit"; forfeitSide: "home" | "away"; forfeitScore: number; note: string; publish: boolean }
  | { mode: "events" };

/** POST /maclar/:id/result — elle / hükmen tescil ya da olaylardan skora dönüş. */
export const registerResult = (id: number, body: ResultBody) =>
  post<{ message: string; match: AdminMatch }>(`/maclar/${id}/result`, body);

/* ═══════════════════════════ KADRO ═══════════════════════════ */

export type LineupRole = "starter" | "bench";

/** GET /api/maclar/:id/kadro satırı (routes/MatchFlow.js mapToFront). */
export interface LineupRow {
  id: number;
  playerId: number;
  oyuncu_id: number;
  playerName: string | null;
  playerImg: string | null;
  isGuest: boolean;
  guestName: string | null;
  source: string;
  team_id: number;
  number: number | string;
  position: string;
  puan: number | null;
  role: "starter" | "bench" | "reserve";
  captain: boolean;
}

export interface LineupResponse {
  home: LineupRow[];
  away: LineupRow[];
}

export const getLineup = (id: number) => get<LineupResponse>(`/api/maclar/${id}/kadro`);

/** POST /api/maclar/:id/kadro gövdesindeki oyuncu (normalizeKadroPayload). */
export interface LineupPayloadRow {
  playerId: number;
  oyuncu_id: number;
  role: LineupRole;
  position: string;
  number: number | string;
  captain: boolean;
  isGuest: boolean;
  guestName?: string;
}

/** POST /api/maclar/:id/kadro — iki takımın kadrosu birlikte yazılır (matches.lineup). */
export const saveLineup = (id: number, body: { home: LineupPayloadRow[]; away: LineupPayloadRow[] }) =>
  post<{ message: string; count: number }>(`/api/maclar/${id}/kadro`, body);

/** POST /maclar/:id/guest-players — oyuncu oluşturup takımın kadrosuna bağlar. */
export const createRosterPlayer = (
  id: number,
  input: { playerName: string; teamId: number; side: "home" | "away"; position?: string }
) =>
  post<{ message: string; player: RosterPlayer & { isGuest?: boolean } }>(`/maclar/${id}/guest-players`, input);

/** /oyuncu-takimlari/:teamId satırı (PlayerTeams) ya da /oyuncular satırı. */
export interface RosterPlayer {
  id?: number;
  player_id?: number;
  player_name?: string;
  player_img?: string | null;
  team_id?: number | null;
  team_name?: string | null;
  jersey_number?: number | string | null;
  player_number?: number | string | null;
  team_position?: string | null;
  player_position?: string | null;
}

/** Join tablosunda `id` satır kimliğidir; gerçek oyuncu kimliği önce okunur. */
export const rosterPlayerId = (p: RosterPlayer) => Number(p.player_id ?? p.id ?? 0) || null;

/** GET /oyuncu-takimlari/:teamId — takımın kalıcı kadrosu. */
export const getTeamRoster = (teamId: number) => get<RosterPlayer[]>(`/oyuncu-takimlari/${teamId}`);

/** GET /oyuncular?search=&limit= — ad araması (sunucu en çok 100 satır). */
export const searchPlayers = (q: string, limit = 40) =>
  get<RosterPlayer[]>("/oyuncular/", { search: q, limit });

/* ═══════════════════════════ CANLI AKIŞ ═══════════════════════════ */

/** mac_olaylari satırı. */
export interface MatchEvent {
  id: number;
  mac_id: number;
  takim_id: number | null;
  oyuncu_id: number | null;
  oyuncu_cikan_id: number | null;
  oyuncu_giren_id: number | null;
  dakika: number | null;
  devre: number | null;
  olay_kodu: string;
  aciklama?: string | null;
  createdAt?: string;
}

export interface EventBody {
  takim_id: number | null;
  olay_kodu: string;
  dakika: number | null;
  devre: number | null;
  oyuncu_id: number | null;
  oyuncu_cikan_id: number | null;
  oyuncu_giren_id: number | null;
  aciklama: string | null;
  olusturan_kullanici_id?: number | null;
  client_event_id?: string;
}

export const getEvents = (id: number) => get<MatchEvent[]>(`/api/maclar/${id}/olaylar`);

/** POST /api/maclar/:id/olaylar — client_event_id ile tekrar gönderim güvenli. */
export const createEvent = (id: number, body: EventBody) =>
  post<MatchEvent & { success: boolean }>(`/api/maclar/${id}/olaylar`, body);

export const updateEvent = (id: number, eventId: number, body: Partial<EventBody>) =>
  put<MatchEvent & { success: boolean }>(`/api/maclar/${id}/olaylar/${eventId}`, body);

export const deleteEvent = (id: number, eventId: number) =>
  del<{ message: string }>(`/api/maclar/${id}/olaylar/${eventId}`);

/** Reji panelindeki olay düğmeleri (MatchLiveStep EVENT_GROUPS) — kodlar birebir. */
export const EVENT_GROUPS: { key: string; title: string; items: { code: string; label: string }[] }[] = [
  {
    key: "goals",
    title: "Gol ve asist",
    items: [
      { code: "GOAL_RIGHT_FOOT", label: "Sağ ayak gol" },
      { code: "GOAL_LEFT_FOOT", label: "Sol ayak gol" },
      { code: "GOAL_LONG_RIGHT", label: "Uzaktan sağ ayak gol" },
      { code: "GOAL_LONG_LEFT", label: "Uzaktan sol ayak gol" },
      { code: "GOAL_PENALTY", label: "Penaltı golü" },
      { code: "GOAL_FREEKICK", label: "Frikik golü" },
      { code: "GOAL_HEADER", label: "Kafa golü" },
      { code: "GOAL_OWN", label: "Kendi kalesine" },
      { code: "ASSIST", label: "Asist" },
    ],
  },
  {
    key: "discipline",
    title: "Kart, faul, sakatlık",
    items: [
      { code: "YELLOW_CARD", label: "Sarı kart" },
      { code: "RED_CARD", label: "Kırmızı kart" },
      { code: "FOUL", label: "Faul" },
      { code: "INJURY", label: "Sakatlık" },
    ],
  },
  {
    key: "other",
    title: "Diğer olaylar",
    items: [
      { code: "SUBSTITUTION", label: "Değişiklik" },
      { code: "SAVE", label: "Kurtarış" },
      { code: "CHANCE_CREATED", label: "Tehlike" },
      { code: "DUEL_WON", label: "İkili mücadele" },
      { code: "AERIAL_WON", label: "Hava topu" },
      { code: "CRITICAL_BLOCK", label: "Kritik müdahale" },
    ],
  },
];

const CODE_LABEL = new Map(EVENT_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label] as const)));

export const eventLabel = (code: string) => CODE_LABEL.get(String(code).toUpperCase()) ?? code;

/** Zaman çizelgesinde gösterilen olaylar (istatistik olayları akışı boğmasın). */
export const TIMELINE_CODES = new Set([
  "GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_LONG_RIGHT", "GOAL_LONG_LEFT", "GOAL_PENALTY",
  "GOAL_FREEKICK", "GOAL_HEADER", "GOAL_OWN", "YELLOW_CARD", "RED_CARD", "SUBSTITUTION", "INJURY",
]);

export const isGoalCode = (code: string) => String(code).toUpperCase().startsWith("GOAL_");

/** Olaylardan skor: kendi kalesine gol rakibin hanesine yazılır. */
export function scoreFromEvents(events: MatchEvent[], homeTeamId?: number | null, awayTeamId?: number | null) {
  let home = 0;
  let away = 0;
  for (const ev of events) {
    const code = String(ev.olay_kodu).toUpperCase();
    if (!code.startsWith("GOAL_")) continue;
    const own = code === "GOAL_OWN";
    const tid = Number(ev.takim_id);
    if (tid && tid === Number(homeTeamId)) own ? (away += 1) : (home += 1);
    else if (tid && tid === Number(awayTeamId)) own ? (home += 1) : (away += 1);
  }
  return { home, away };
}

export const sortEvents = (a: MatchEvent, b: MatchEvent) =>
  (Number(a.devre) || 1) - (Number(b.devre) || 1) ||
  (Number(a.dakika) || 0) - (Number(b.dakika) || 0) ||
  Number(a.id) - Number(b.id);

/** Sayaç satırı (services/liveMatch/matchTimerService.serialize). */
export interface MatchTimer {
  match_id: number;
  running: boolean;
  base_ms: number;
  base_at: string | null;
  seq: number;
  period: number | null;
}

export const getTimer = (id: number) => get<MatchTimer>(`/api/maclar/${id}/timer`, undefined, { retry: false });

/** PUT /api/maclar/:id/timer — çalışıyor mu + taban süre (matches.live). */
export const putTimer = (id: number, running: boolean, baseMs: number) =>
  put<MatchTimer>(`/api/maclar/${id}/timer`, { running, base_ms: Math.max(0, Math.floor(baseMs)) });

export const setTimerPeriod = (id: number, period: number) =>
  post<MatchTimer>(`/api/maclar/${id}/timer/period`, { period });

export const resetTimer = (id: number) => post<MatchTimer>(`/api/maclar/${id}/timer/reset`, { resetPeriod: true });

/** Sayaçtaki anlık süre (ms). */
export function timerNowMs(timer: MatchTimer | null | undefined, now = Date.now()): number {
  if (!timer) return 0;
  const base = Number(timer.base_ms) || 0;
  if (!timer.running || !timer.base_at) return base;
  const at = new Date(timer.base_at).getTime();
  return Number.isFinite(at) ? base + Math.max(0, now - at) : base;
}

/** Yayın grafik modları (constants/overlayModes) — reji paneliyle aynı anahtarlar. */
export const OVERLAY_MODES = [
  { key: "scoreboard", label: "Skorboard" },
  { key: "scoreboardv2", label: "Skorboard V2" },
  { key: "bottomboard", label: "Orta-alt skorboard" },
  { key: "pre_match", label: "Maç öncesi" },
  { key: "prematchv2", label: "Maç öncesi V2" },
  { key: "lineups", label: "Kadrolar" },
  { key: "lineupsv2", label: "Kadrolar V2" },
  { key: "lineupsv3", label: "Kadrolar V3" },
  { key: "halftime", label: "Devre arası" },
  { key: "post_match", label: "Maç sonu" },
  { key: "interview", label: "Röportaj" },
];

export const LED_MODES = [
  { key: "scoreboard", label: "LED skorboard" },
  { key: "scoreboardv2", label: "LED skorboard V2" },
  { key: "pre_match", label: "Maç öncesi" },
  { key: "players", label: "Oyuncu tanıtımı" },
  { key: "lineup_home", label: "Diziliş · ev" },
  { key: "lineup_away", label: "Diziliş · deplasman" },
  { key: "highlights", label: "Maçın enleri" },
  { key: "mvp", label: "Maçın oyuncusu" },
  { key: "kare_as", label: "Maçın kare ası" },
  { key: "interview", label: "Röportaj arka planı" },
  { key: "var", label: "VAR görseli" },
  { key: "var_check", label: "VAR kontrolü" },
  { key: "halftime", label: "Devre arası" },
  { key: "post_match", label: "Maç sonucu" },
  { key: "sponsor", label: "Marka / sponsor" },
];

export const setOverlayStatus = (id: number, mode: string) =>
  put<{ message?: string }>(`/api/maclar/${id}/overlay-status`, { status: mode });

export const setLedStatus = (id: number, mode: string) =>
  put<{ message?: string }>(`/api/maclar/${id}/led-status`, { status: mode });

/* ═══════════════════════════ MAÇ SONU ═══════════════════════════ */

/** Maçın Enleri (matchContentModel.HIGHLIGHT_FIELDS). */
export const HIGHLIGHT_FIELDS = [
  { key: "best_player", label: "Maçın Oyuncusu" },
  { key: "best_goalkeeper", label: "Maçın Kalecisi" },
  { key: "best_defender", label: "Maçın Defansı" },
  { key: "best_midfielder", label: "Maçın Orta Sahası" },
  { key: "best_forward", label: "Maçın Forveti" },
  { key: "best_goal", label: "Maçın Golü" },
  { key: "best_save", label: "Maçın Kurtarışı" },
] as const;

export type HighlightKey = (typeof HIGHLIGHT_FIELDS)[number]["key"];

export interface PostContent {
  title: string;
  report: string;
  coverImage: string;
  liveLink: string;
  interview: string;
  photos: string;
}

export function readPostContent(match: AdminMatch | null | undefined): PostContent {
  return {
    title: cleanText(match?.match_title ?? match?.post_manset),
    report: cleanText(match?.match_comment ?? match?.post_rapor),
    coverImage: cleanText(match?.match_picture),
    liveLink: cleanText(match?.match_video),
    interview: cleanText(match?.match_interview ?? match?.post_roportaj),
    photos: cleanText(match?.match_images),
  };
}

const parseJson = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/** Kayıtlı ödüller: { best_player: "12" } — eski kayıtlarda ad kadrodan çözülür. */
export function readHighlights(
  match: AdminMatch | null | undefined,
  players: { id: string; name: string }[]
): Record<HighlightKey, string> {
  const raw = parseJson(match?.post_macin_enleri ?? match?.post_enler);
  const out = {} as Record<HighlightKey, string>;
  for (const { key } of HIGHLIGHT_FIELDS) {
    let id = raw[`${key}_id`] == null ? "" : String(raw[`${key}_id`]);
    if (!id) {
      const name = String(raw[`${key}_name`] ?? raw[key] ?? "").trim();
      const found = name ? players.find((p) => p.name.trim() === name) : null;
      if (found) id = found.id;
    }
    out[key] = id;
  }
  return out;
}

/** Maç Sonu içerik gövdesi (buildContentPayload) — yalnız modeldeki sütunlar. */
export function buildPostPayload(
  content: PostContent,
  highlights: Record<string, string>,
  nameOf: (id: string) => string
) {
  const award: Record<string, string> = {};
  for (const { key } of HIGHLIGHT_FIELDS) {
    const id = highlights[key] || "";
    const name = id ? nameOf(id) : "";
    award[`${key}_id`] = id;
    award[`${key}_name`] = name;
    award[key] = name;
  }
  const json = JSON.stringify(award);
  const mvp = Number(highlights.best_player);
  return {
    match_title: content.title,
    post_manset: content.title,
    match_comment: content.report,
    post_rapor: content.report,
    match_picture: content.coverImage,
    match_video: content.liveLink,
    match_interview: content.interview,
    post_roportaj: content.interview,
    match_images: content.photos,
    post_macin_enleri: json,
    post_enler: json,
    match_mvp: Number.isFinite(mvp) && mvp > 0 ? mvp : null,
  };
}

/** 0–10, tek ondalık; boş = puan verilmemiş. */
export function normalizeRating(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Number(n.toFixed(1))));
}

export const isRatingInvalid = (value: unknown) => {
  if (value === "" || value == null) return false;
  const n = Number(String(value).replace(",", "."));
  return !Number.isFinite(n) || n < 0 || n > 10;
};

/** PATCH /api/maclar/:id/kadro/puan — { ratings: [{ oyuncu_id, puan }] } (matches.stats). */
export const saveRatings = (id: number, ratings: { playerId: number; oyuncu_id: number; puan: number | null }[]) =>
  patch<{ message: string; updated: number }>(`/api/maclar/${id}/kadro/puan`, { ratings });

/** PATCH /maclar/:id/upload-picture — kapak görseli (multipart, match_picture). */
export function uploadMatchCover(id: number, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append("match_picture", file as unknown as Blob);
  return patch<{ url: string; match_picture: string }>(`/maclar/${id}/upload-picture`, form, { timeout: 120_000 });
}

/* ═══════════════════ İSTATİSTİK GİRİŞİ (Enter_Stats) ═══════════════════ */

/** PlayerStatistics satırı. */
export interface PlayerStatRow {
  id: number;
  player_id: number;
  match_id: number;
  team_id: number;
  opponent_team_id: number | null;
  number_of_goals: number;
  goals_minutes: string | null;
  yellow_card: number;
  red_card: number;
  points: number;
  goal_to_himself: number;
  goal_to_himself_minutes: string | null;
  player_position: string | null;
}

export type PlayerStatInput = Omit<PlayerStatRow, "id">;

/** GET /oyuncu-istatistikleri/mac/:id — kayıt yoksa sunucu 404 döner; boş liste sayılır. */
export async function getMatchStats(id: number): Promise<PlayerStatRow[]> {
  try {
    const rows = await get<PlayerStatRow[]>(`/oyuncu-istatistikleri/mac/${id}`, { _t: Date.now() }, { retry: false });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if ((error as { status?: number })?.status === 404) return [];
    throw error;
  }
}

export const createPlayerStat = (input: PlayerStatInput) => post<PlayerStatRow>("/oyuncu-istatistikleri/", input);

export const updatePlayerStat = (statId: number, input: Partial<PlayerStatInput>) =>
  patch<{ message: string }>(`/oyuncu-istatistikleri/playerStat/${statId}`, input);

export const deletePlayerStat = (statId: number) => del<{ message: string }>(`/oyuncu-istatistikleri/${statId}`);

/* ═══════════════════════════ GÖREVLENDİRME ═══════════════════════════ */

export interface StaffPerson {
  id: number;
  fullName: string;
  duty?: string | null;
  duties?: string[];
  city?: string | null;
}

export interface StaffDuty {
  key: string;
  label: string;
}

/** Sunucu erişilemezse kullanılan katalog (services/staffService.js DUTIES). */
export const FALLBACK_DUTIES: StaffDuty[] = [
  { key: "spiker", label: "Spiker" },
  { key: "reji", label: "Reji" },
  { key: "hakem", label: "Hakem" },
  { key: "fotografci", label: "Fotoğrafçı" },
  { key: "saglikci", label: "Sağlıkçı" },
];

/** GET /api/staff?status=active&matchId|city — görevlendirilebilecek personel (staff.view). */
export const getStaffOptions = (params: { matchId?: number; city?: string }) =>
  get<{ items: StaffPerson[]; duties: StaffDuty[] }>("/api/staff", { status: "active", ...params });

/** GET /api/staff/matches/:id — { assignments: { hakem: { staffId, name } } }. */
export const getMatchAssignments = (id: number) =>
  get<{ assignments: Record<string, { staffId: number; name?: string } | null>; duties?: StaffDuty[] }>(
    `/api/staff/matches/${id}`
  );

/** PUT /api/staff/matches/:id — boş görev kaldırılsın diye tüm görevler birlikte gider (staff.assign). */
export const saveMatchAssignments = (id: number, assignments: Record<string, string>) =>
  put<{ message?: string }>(`/api/staff/matches/${id}`, assignments);

/* ═══════════════════════════ SAHA / GRUP / TAKIM ═══════════════════════════ */

export interface ActiveVenue {
  id: number;
  public_id: string;
  name: string;
  location?: string;
  city?: string;
}

/** GET /api/match-requests/venues — aktif sahalar (saha adı match_field'a yazılır). */
export const getActiveVenues = async () => {
  const data = await get<{ items?: ActiveVenue[] } | ActiveVenue[]>("/api/match-requests/venues");
  return Array.isArray(data) ? data : data.items ?? [];
};

export interface SeasonGroup {
  id: number;
  group_name: string;
}

/** GET /api/season-groups/season/:id — grubu olmayan sezonda boş dizi. */
export const getSeasonGroups = async (seasonId: number) => {
  const data = await get<{ groups?: SeasonGroup[] }>(`/api/season-groups/season/${seasonId}`);
  return data.groups ?? [];
};

/** /takimlar ya da /takimlar/by-city/:il. */
export const getTeamsForCity = (city?: string | null) =>
  city ? get<ApiTeam[]>(`/takimlar/by-city/${encodeURIComponent(city)}`) : get<ApiTeam[]>("/takimlar");

/* ═══════════════════════════ TOPLU DÜZENLEME ═══════════════════════════ */

/** Toplu içerik alanları (matchBulk/bulkEditModel.BULK_FIELDS). */
export const BULK_CONTENT_FIELDS = [
  { key: "match_title", label: "Manşet", kind: "text", placeholder: "Maçın manşeti" },
  { key: "match_picture", label: "Kapak fotoğrafı", kind: "url", placeholder: "https://… görsel adresi" },
  { key: "match_video", label: "Canlı yayın linki", kind: "url", placeholder: "https://youtube.com/live/…" },
  { key: "match_interview", label: "Röportaj linki", kind: "url", placeholder: "https://youtu.be/…" },
  { key: "match_images", label: "Fotoğraflar linki", kind: "url", placeholder: "https://disk.yandex.com/d/…" },
] as const;

export type BulkContentKey = (typeof BULK_CONTENT_FIELDS)[number]["key"];

/** Kayıtlı değer: manşet ve röportaj iki sütunda tutulur. */
export function readBulkValue(match: AdminMatch | ApiMatch, key: BulkContentKey): string {
  const m = match as AdminMatch;
  if (key === "match_title") return cleanText(m.match_title) || cleanText(m.post_manset);
  if (key === "match_interview") return cleanText(m.match_interview) || cleanText(m.post_roportaj);
  return cleanText((m as unknown as Record<string, unknown>)[key]);
}

export const validateBulkValue = (key: BulkContentKey, value: string) => {
  const text = value.trim();
  if (!text) return "";
  if (text.length > 255) return "En fazla 255 karakter olabilir.";
  if (key !== "match_title" && !/^https?:\/\/\S+$/i.test(text)) return "Adres http:// ya da https:// ile başlamalı.";
  return "";
};

/** PUT /maclar/toplu-icerik — { items: [{ id, match_title?, … }] } (matches.bulk_edit). */
export const saveBulkContent = (items: ({ id: number } & Partial<Record<BulkContentKey, string>>)[]) =>
  put<{ message: string; updated: number[]; errors: { id: number; error: string }[] }>("/maclar/toplu-icerik", {
    items,
  });

/* ═══════════════════════════ PUAN DURUMU ═══════════════════════════ */

export interface AdminStandingRow {
  team_id: number;
  team_name: string;
  logo?: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  base_points: number;
  manual_points: number;
  total_points: number;
  balance_points: number;
  balance_manual_points: number;
  balance_total_points: number;
  display_points?: number;
}

export interface AdminStandingsResponse {
  standings: AdminStandingRow[];
  standings_type?: string;
  group_id?: number;
}

/** GET /api/standings — canlı maçlar hariç (includeLive=0); groupId verilirse grup tablosu. */
export const getAdminStandings = (q: { cityId: number; leagueId: number; seasonId: number; groupId?: number | null }) =>
  get<AdminStandingsResponse>("/api/standings", {
    cityId: q.cityId,
    leagueId: q.leagueId,
    seasonId: q.seasonId,
    groupId: q.groupId ?? undefined,
    includeLive: 0,
    _t: Date.now(),
  });

/**
 * PATCH /api/standings/manual-points — elle puan (standart) ya da güç dengesi
 * düzeltmesi; her kayıtta sunucu kapsamı baştan hesaplar (standings.update).
 */
export const saveManualPoints = (body: {
  city_id: number;
  league_id: number;
  season_id: number;
  team_id: number;
  manual_points?: number;
  balance_manual_points?: number;
}) => patch<{ standing: AdminStandingRow | null; standings_type: string }>("/api/standings/manual-points", body);

/* ═══════════════════════════ TAKIM MÜSAİTLİĞİ ═══════════════════════════ */

export type AvailabilityPref = "yes" | "maybe" | "no";

export const PREFERENCE_LABELS: Record<AvailabilityPref, string> = {
  yes: "Bu sahada oynarız",
  maybe: "Zorda kalırsak oynarız",
  no: "Bize uymaz",
};

export const SLOT_LABELS: Record<string, string> = { yes: "Uygun", maybe: "Zorda kalırsak", no: "Uygun değil" };

export interface AvailabilityAdminVenue {
  id: number;
  name: string;
  location?: string;
  city?: string;
  open_label: string;
  close_label: string;
  slot_minutes: number;
  weekly: {
    days: { weekday: number; label: string }[];
    times: { hour: number; minute: number; label: string; key: string }[];
  };
}

export interface AvailabilityTeam {
  id: number;
  name: string;
  logo?: string | null;
  city?: string | null;
}

export interface AvailabilityAdminResponse {
  venues: AvailabilityAdminVenue[];
  teams: {
    team: AvailabilityTeam;
    submitted_at: string | null;
    venues: { venue_id: number; preference: AvailabilityPref | null; slots: Record<string, "yes" | "maybe">; updated_at: string }[];
  }[];
  trash: {
    team: AvailabilityTeam;
    submitted_at: string | null;
    hidden_at: string | null;
    hidden_by: { id: number; username: string | null } | null;
    counts: Record<AvailabilityPref, number>;
  }[];
  /** heat[venueId]["<gün>:<SS>:<DD>"] = { yes, maybe } */
  heat: Record<string, Record<string, { yes: number; maybe: number }>>;
  can_manage: boolean;
  generated_at: string;
}

export const getAvailabilityAdmin = () => get<AvailabilityAdminResponse>("/api/team-availability/admin");

export const trashAvailabilityTeam = (teamId: number) =>
  del<{ message: string }>(`/api/team-availability/admin/teams/${teamId}`);

export const restoreAvailabilityTeam = (teamId: number) =>
  post<{ message: string }>(`/api/team-availability/admin/teams/${teamId}/restore`);
