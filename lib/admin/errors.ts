import { ApiError } from "../http";

/**
 * Sunucu hatasından ekrana yazılacak Türkçe cümle.
 *
 * Yönetim uçları doğrulama hatalarında gövdede `message` (ya da `error`)
 * döndürür; http katmanı bunu ApiError.message'a koyar. 401/403/5xx için
 * ApiError.userMessage'ın genel cümlesi kullanılır.
 */
export function errorText(error: unknown, fallback = "İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene."): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 409 || error.status === 422) return error.message || fallback;
    if (error.status === 403) return error.message && error.message !== "Forbidden" ? error.message : error.userMessage;
    return error.userMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
