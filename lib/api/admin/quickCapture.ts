import { del, get, post } from "../../http";
import { API_BASE_URL } from "../../config";

/**
 * SESLİ HIZLI NOT — Siri Kestirmesi kişisel anahtarla Not Defteri'ne yazar.
 *
 * Sunucu: elitlig-server routes/quickCapture.js + services/quickCapture.js.
 *   GET    /api/quick-capture/key   → durum
 *   POST   /api/quick-capture/key   → yeni anahtar (düz hâli YALNIZ bu yanıtta)
 *   DELETE /api/quick-capture/key   → iptal
 *   POST   /api/quick-capture?format=text  (Authorization: Bearer elq_…, { text })
 *          → kestirmenin çağırdığı uç; not "Maç talepleri" defterine düşer.
 */

export interface QuickCaptureStatus {
  active: boolean;
  hint?: string;
  created_at?: string;
  last_used_at?: string | null;
  use_count?: number;
}

export interface QuickCaptureKey extends QuickCaptureStatus {
  key: string;
}

export const QUICK_CAPTURE_URL = `${API_BASE_URL}/api/quick-capture?format=text`;

export const getQuickCaptureStatus = () => get<QuickCaptureStatus>("/api/quick-capture/key");
export const createQuickCaptureKey = () => post<QuickCaptureKey>("/api/quick-capture/key");
export const revokeQuickCaptureKey = () => del<QuickCaptureStatus>("/api/quick-capture/key");

/** Kestirmenin yaptığı isteğin aynısı: anahtarın çalıştığını uygulamadan dener. */
export async function testQuickCapture(key: string, text: string): Promise<string> {
  const res = await fetch(QUICK_CAPTURE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ text }),
  });
  const message = await res.text();
  if (!res.ok) throw new Error(message || `Deneme başarısız (${res.status}).`);
  return message;
}
