/**
 * ANALİTİK + ÇÖKME RAPORU — sitenin ziyaretçi analizine yazar.
 *
 * NEDEN AYRI SERVİS YOK: sunucuda web için kurulmuş bir toplama ucu var
 * (POST /api/analytics/collect, elitlig-server services/analytics/ingest.js).
 * Uygulama aynı gövdeyi gönderir; rapor ekranı web ve mobili tek yerde gösterir.
 *
 *   pageview  Her ekran değişiminde bir kez (expo-router yolu, ör. /mac/123).
 *   error     Yakalanmayan JS hatası ve React render hatası (CrashCatcher).
 *
 * KİMLİK: ziyaretçi kimliği cihazda bir kez üretilir (AsyncStorage); oturum
 * kimliği her açılışta ve 30 dakikadan uzun arka plandan dönüşte yenilenir.
 * Giriş yapılmışsa jeton başlıkta gider ve sunucu üye/ziyaretçi ayrımını yapar.
 *
 * USER-AGENT: Android'in varsayılan `okhttp/…` kimliği sunucuda bot sayılıp
 * atılır; bu yüzden uygulama kendi kimliğini yollar ("ElitLigApp/…").
 *
 * Gönderim toplu ve sessizdir: hiçbir hata kullanıcıya dönmez, kuyruk sınırlıdır.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Dimensions, Platform, type AppStateStatus } from "react-native";

import { API_BASE_URL } from "./config";
import { currentAuthToken } from "./http";

const VISITOR_KEY = "elitlig.analytics.visitor.v1";
const FLUSH_MS = 10_000;
const MAX_QUEUE = 60;
const SESSION_IDLE_MS = 30 * 60_000;

type AnalyticsEvent =
  | { t: "pageview"; pv: string; p: string; en?: 1 }
  | { t: "error"; p: string; m: string };

const randomId = (length = 20) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
};

const APP_VERSION = Constants.expoConfig?.version ?? "0";
const USER_AGENT =
  Platform.OS === "ios"
    ? `ElitLigApp/${APP_VERSION} (iPhone; iOS ${Platform.Version}) Mobile`
    : `ElitLigApp/${APP_VERSION} (Linux; Android ${Platform.Version}) Mobile`;

let visitorId: string | null = null;
let isNewVisitor = false;
let sessionId = randomId();
let entrySent = false;
let backgroundedAt: number | null = null;
let currentPath = "/";
let queue: AnalyticsEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

async function ensureVisitor(): Promise<string> {
  if (visitorId) return visitorId;
  try {
    const stored = await AsyncStorage.getItem(VISITOR_KEY);
    if (stored) {
      visitorId = stored;
      return stored;
    }
  } catch {
    // Depo okunamadı: bu açılış için geçici kimlik.
  }
  visitorId = randomId(24);
  isNewVisitor = true;
  AsyncStorage.setItem(VISITOR_KEY, visitorId).catch(() => {});
  return visitorId;
}

async function flush(): Promise<void> {
  if (!queue.length) return;
  const events = queue;
  queue = [];
  try {
    const v = await ensureVisitor();
    const { width, height } = Dimensions.get("screen");
    const token = currentAuthToken();
    const body = {
      v,
      s: sessionId,
      ...(isNewVisitor ? { nv: 1 } : {}),
      ctx: {
        sw: Math.round(width),
        sh: Math.round(height),
        vw: Math.round(width),
        lang: "tr-TR",
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        touch: 1,
      },
      e: events,
    };
    isNewVisitor = false;
    await fetch(`${API_BASE_URL}/api/analytics/collect`, {
      method: "POST",
      headers: {
        // text/plain: sunucu ucu bu türü okur (web'deki sendBeacon ile aynı yol).
        "Content-Type": "text/plain",
        "User-Agent": USER_AGENT,
        "X-Client-Platform": "mobile",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Analitik asla kullanıcıyı etkilemez; düşen paket atılır.
  }
}

function push(event: AnalyticsEvent) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(event);
}

function onAppState(state: AppStateStatus) {
  if (state === "active") {
    if (backgroundedAt && Date.now() - backgroundedAt > SESSION_IDLE_MS) {
      sessionId = randomId();
      entrySent = false;
      trackScreen(currentPath);
    }
    backgroundedAt = null;
  } else if (state === "background") {
    backgroundedAt = Date.now();
    void flush();
  }
}

/** Kökte bir kez çağrılır: zamanlayıcı ve uygulama durumu dinleyicisi. */
export function startAnalytics() {
  if (started) return;
  started = true;
  void ensureVisitor();
  timer = setInterval(() => void flush(), FLUSH_MS);
  AppState.addEventListener("change", onAppState);
}

/** Ekran görüntüleme. Aynı yol art arda gelirse bir kez sayılır. */
export function trackScreen(path: string) {
  if (!path) return;
  const changed = path !== currentPath || !entrySent;
  currentPath = path;
  if (!changed) return;
  push({ t: "pageview", pv: randomId(12), p: path, ...(entrySent ? {} : { en: 1 as const }) });
  entrySent = true;
}

/**
 * Hata kaydı (çökme raporu). Mesaj ve yığının ilk satırı; sunucu 200
 * karakterle sınırlar. Ölümcül hatada paket hemen gönderilir.
 */
export function trackError(error: unknown, fatal = false) {
  const err = error instanceof Error ? error : new Error(String(error));
  const where = (err.stack ?? "").split("\n").find((line) => line.trim() && !line.includes(err.message)) ?? "";
  const message = `${fatal ? "[fatal] " : ""}${err.name}: ${err.message}${where ? ` @ ${where.trim()}` : ""}`;
  push({ t: "error", p: currentPath || "/", m: message.slice(0, 200) });
  if (fatal) void flush();
}

/** Testler ve hızlı kapanış için. */
export function flushAnalytics() {
  return flush();
}

export function stopAnalytics() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
