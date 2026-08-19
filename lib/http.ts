import { API_BASE_URL, API_TIMEOUTS, GET_RETRY_DELAYS } from "./config";

/**
 * Tek HTTP katmanı.
 *
 * Web istemcisindeki (src/api/api.js) davranışları taşır:
 *   - zaman aşımı
 *   - GET'lerde ağ/5xx hatalarında sınırlı yeniden deneme
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

  constructor(message: string, status: number, code?: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  /** Ekranda gösterilecek Türkçe mesaj. */
  get userMessage(): string {
    if (this.status === 0) return "İnternet bağlantısı kurulamadı.";
    if (this.status === 401) return "Oturumunuzun süresi dolmuş. Tekrar giriş yapın.";
    if (this.status === 403) return "Bu içeriği görme yetkiniz yok.";
    if (this.status === 404) return "Kayıt bulunamadı.";
    if (this.status >= 500) return "Sunucuya şu anda ulaşılamıyor. Az sonra tekrar deneyin.";
    return this.message || "Beklenmeyen bir hata oluştu.";
  }
}

type TokenReader = () => string | null;

let readToken: TokenReader = () => null;
let onUnauthorized: (() => void) | null = null;

/** AuthProvider açılışta jeton kaynağını buraya bağlar. */
export function configureAuth(reader: TokenReader, unauthorizedHandler?: () => void) {
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

const isRetryable = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);

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
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
        payload
      );
      if (response.status === 401) onUnauthorized?.();
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
