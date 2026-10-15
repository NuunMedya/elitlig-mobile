import { API_BASE_URL, API_TIMEOUTS, GET_RETRY_DELAYS } from "./config";

/**
 * Tek HTTP katmanı.
 *
 * Web istemcisindeki (src/api/api.js) davranışları taşır:
 *   - zaman aşımı
 *   - GET'lerde yalnız ağ hatası / 502 / 504'te sınırlı yeniden deneme
 *     (503/429 = sunucu "yük altındayım" diyor; tekrar denemek kotayı yakar)
 *   - eşzamanlı aynı GET'in tekilleştirilmesi (dedupe)
 *   - normalize edilmiş hata nesnesi
 *   - Authorization: Bearer <token>
 *
 * Mobilde çerez yoktur; sunucu login yanıtında gövdede de jeton döndürdüğü için
 * (routes/User.js) tüm oturum bu jetonla yürür.
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: unknown;
  /** 503/429 yanıtındaki Retry-After (saniye); yoksa undefined. */
  retryAfter?: number;

  constructor(message: string, status: number, code?: string, detail?: unknown, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }

  /**
   * Sunucu aşırı yükte (DB kotası / BUSY) veya hız sınırında: bu hatalar
   * hiçbir katmanda otomatik yeniden denenmez — her tekrar kotayı daha da yakar.
   */
  get isOverloaded(): boolean {
    return this.status === 503 || this.status === 429;
  }

  /** Ekranda gösterilecek Türkçe mesaj. */
  get userMessage(): string {
    if (this.status === 0) return "İnternet bağlantısı kurulamadı.";
    if (this.status === 401) return "Oturumunuzun süresi dolmuş. Tekrar giriş yapın.";
    if (this.status === 403) return "Bu içeriği görme yetkiniz yok.";
    if (this.status === 404) return "Kayıt bulunamadı.";
    if (this.status >= 500) return "Sunucuya şu anda ulaşılamıyor. Az sonra tekrar deneyin.";
    return this.message || "Sunucu yanıtı okunamadı. Tekrar dene.";
  }
}

type TokenReader = () => string | null;

let readToken: TokenReader = () => null;

const isFormData = (value: unknown): value is FormData =>
  typeof FormData !== "undefined" && value instanceof FormData;

/** Oturum jetonu (socket el sıkışması gibi HTTP dışı kanallar için). */
export function currentAuthToken(): string | null {
  return readToken();
}
/**
 * Oturumu GERÇEKTEN bitiren 401 kodları (routes/User.js, middleware/authenticate).
 *
 * NEDEN KOD LİSTESİ: kullanıcı kendisi çıkış yapana kadar oturum açık kalmalı.
 * Her 401'de oturumu silmek, ilgisiz bir uçtaki (ör. yanlış mevcut şifre)
 * hatada kullanıcıyı dışarı atıyordu. Yalnız jetonun geçersiz olduğunu
 * söyleyen kodlar oturumu kapatır.
 */
const SESSION_ENDING_CODES = new Set(["INVALID_TOKEN", "TOKEN_STALE", "INVALID_USER", "AUTH_REQUIRED"]);

/** Oturum kapatma geri çağrısı — hangi jetonla reddedildiği bildirilir. */
type UnauthorizedHandler = (rejectedToken: string) => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** AuthProvider açılışta jeton kaynağını buraya bağlar. */
export function configureAuth(reader: TokenReader, unauthorizedHandler?: UnauthorizedHandler) {
  readToken = reader;
  onUnauthorized = unauthorizedHandler ?? null;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** Boş/undefined parametreler sorguya girmez; sunucu bunları "filtre yok" sanmaz. */
export function buildUrl(path: string, params?: QueryParams): string {
  const base = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return base;

  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return search ? `${base}${base.includes("?") ? "&" : "?"}${search}` : base;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: QueryParams;
  body?: unknown;
  timeout?: number;
  /** GET'ler varsayılan olarak yeniden denenir; kapatmak için false. */
  retry?: boolean;
  signal?: AbortSignal;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Yalnız geçici ağ/ağ geçidi hataları yeniden denenir: bağlantı yok (0),
 * 502 ve 504. 503/429 sunucunun "yük altındayım" yanıtıdır; tekrar denemek
 * veritabanı kotasını tüketip servisi saatlerce düşürüyordu. 500 de
 * denenmez: aynı istek büyük olasılıkla aynı hatayı verir.
 */
const isRetryable = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 504);

/** Retry-After başlığı: saniye ya da HTTP tarihi olabilir. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 304) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Sunucu hata gövdeleri tek tip değil: {error}, {message}, {detail} hepsi görülüyor. */
function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 200);
  return fallback;
}

async function once<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = "GET", params, body, timeout = API_TIMEOUTS.DEFAULT, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  // Çağıranın iptali (ekran kapandı) ile zaman aşımı aynı controller'a bağlanır.
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller);

  try {
    const token = readToken();
    const response = await fetch(buildUrl(path, params), {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // FormData (dosya yükleme) gövdesinde Content-Type verilmez: fetch sınır
        // (boundary) değerini kendisi ekler; JSON türü multer'ı bozardı.
        ...(body !== undefined && !isFormData(body) ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Sunucu mobil oturuma uzun ömürlü jeton verir (routes/User.js).
        "X-Client-Platform": "mobile",
      },
      ...(body !== undefined ? { body: isFormData(body) ? body : JSON.stringify(body) } : {}),
    });

    const payload = await parseBody(response);

    if (!response.ok) {
      const code =
        payload && typeof payload === "object"
          ? ((payload as Record<string, unknown>).code as string | undefined)
          : undefined;
      const error = new ApiError(
        messageFromBody(payload, `İstek başarısız (${response.status})`),
        response.status,
        code,
        payload,
        parseRetryAfter(response.headers.get("Retry-After"))
      );
      // Jetonsuz istek (ör. yanlış şifreyle giriş) oturumu etkilemez.
      if (response.status === 401 && token && (!code || SESSION_ENDING_CODES.has(code))) {
        onUnauthorized?.(token);
      }
      throw error;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === "AbortError") {
      // Çağıran iptal ettiyse hatayı yukarı aynen taşı; React Query bunu sessizce yutar.
      if (signal?.aborted) throw error;
      throw new ApiError("İstek zaman aşımına uğradı.", 0, "TIMEOUT");
    }
    throw new ApiError("Sunucuya ulaşılamadı.", 0, "NETWORK");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

/** Uçuştaki aynı GET istekleri tek çağrıya indirilir. */
const inflight = new Map<string, Promise<unknown>>();

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const retry = options.retry ?? method === "GET";

  const run = async (): Promise<T> => {
    let lastError: unknown;
    const attempts = retry ? GET_RETRY_DELAYS.length + 1 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await once<T>(path, options);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === attempts - 1) throw error;
        await wait(GET_RETRY_DELAYS[attempt]);
      }
    }
    throw lastError;
  };

  if (method !== "GET") return run();

  const key = buildUrl(path, options.params);
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export const get = <T>(path: string, params?: QueryParams, options?: Omit<RequestOptions, "params" | "method">) =>
  request<T>(path, { ...options, params, method: "GET" });

export const post = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
  request<T>(path, { ...options, body, method: "POST" });

export const patch = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
  request<T>(path, { ...options, body, method: "PATCH" });

export const put = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
  request<T>(path, { ...options, body, method: "PUT" });

export const del = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
  request<T>(path, { ...options, body, method: "DELETE" });
