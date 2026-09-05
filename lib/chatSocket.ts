/**
 * SOHBET SOKETİ — mesaj ve arama sinyalleşmesi için tek bağlantı.
 *
 * Canlı maç soketinden (hooks/useLiveMatch.ts) ayrıdır: o soket anonim
 * bağlanır ve yalnız maç odalarını dinler; bu bağlantı oturum jetonuyla açılır
 * (`auth.token`) ve sunucu soketi `user:<id>` odasına alır. Her mesaj, her
 * arama olayı bu odaya düşer.
 *
 * NEDEN SAYAÇLI: sohbet listesi, açık sohbet ve arama sağlayıcısı aynı
 * bağlantıyı paylaşır. Son abone ayrılınca bağlantı kapanır; uygulama arka
 * plana gidince (AppState) abonelik zaten kalkar.
 *
 * SOKET GERÇEK DEĞİL, İPUCUDUR: `chat:message` geldiğinde önbellek güncellenir
 * ama liste yine de aralıklı yoklamayla (30 sn) doğrulanır — sunucu sözleşmesi
 * canlı maçtakiyle aynıdır.
 */

import { io, type Socket } from "socket.io-client";
import { LIVE_SOCKET_ENABLED, SOCKET_URL } from "./config";
import { currentAuthToken } from "./http";

export const CHAT_EVENTS = {
  READY: "chat:ready",
  MESSAGE: "chat:message",
  CONVERSATION: "chat:conversation",
  READ: "chat:read",
  TYPING: "chat:typing",
  DELETED: "chat:deleted",
  UPDATED: "chat:updated",
  ADMIN_INBOX: "chat:admin-inbox",
  CALL_INCOMING: "call:incoming",
  CALL_ACCEPTED: "call:accepted",
  CALL_ENDED: "call:ended",
  CALL_ICE: "call:ice",
  CALL_STATE: "call:state",
} as const;

// socket.io dinleyici imzası `(...args: any[]) => void`; tipli yükü çağıran belirler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => void;

let socket: Socket | null = null;
let refs = 0;
let lastToken: string | null = null;
const statusListeners = new Set<(connected: boolean) => void>();

function notify(connected: boolean) {
  statusListeners.forEach((fn) => fn(connected));
}

function connect(): Socket | null {
  if (!LIVE_SOCKET_ENABLED) return null;
  const token = currentAuthToken();
  if (socket && token !== lastToken) {
    // Kullanıcı değişti: eski kimlikle açılmış bağlantı kapatılır.
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  if (socket) return socket;
  lastToken = token;
  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    auth: (cb) => cb({ token: currentAuthToken() ?? undefined }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    timeout: 8_000,
  });
  socket.on("connect", () => notify(true));
  socket.on("disconnect", () => notify(false));
  return socket;
}

export function retainChatSocket(): Socket | null {
  refs += 1;
  return connect();
}

export function releaseChatSocket(): void {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function isChatSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

export function onChatStatus(fn: (connected: boolean) => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

/** Olaya abone olur; kaldırma fonksiyonu döner. Soket kapalıysa no-op. */
export function onChatEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const current = connect();
  if (!current) return () => {};
  current.on(event, handler as Handler);
  return () => {
    socket?.off(event, handler as Handler);
  };
}

export class SocketOfflineError extends Error {
  constructor() {
    super("SOCKET_OFFLINE");
  }
}

export interface AckError {
  ok: false;
  code?: string;
  message?: string;
}

/**
 * Ack bekleyen istek. Soket bağlı değilse SocketOfflineError fırlatır; çağıran
 * REST yedeğine düşer. Sunucu `{ ok: false, code, message }` döndürürse hata
 * olarak yükseltilir (ApiError biçimine benzer: `code` alanı taşır).
 */
export function emitWithAck<T extends object>(event: string, payload: unknown, timeoutMs = 8_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const current = socket;
    if (!current || !current.connected) {
      reject(new SocketOfflineError());
      return;
    }
    const timer = setTimeout(() => reject(new SocketOfflineError()), timeoutMs);
    current.emit(event, payload, (response: (T & { ok?: boolean }) | AckError) => {
      clearTimeout(timer);
      if (response && (response as AckError).ok === false) {
        const failure = response as AckError;
        const error = new Error(failure.message ?? "İşlem başarısız.") as Error & { code?: string };
        error.code = failure.code;
        reject(error);
        return;
      }
      resolve((response ?? {}) as T);
    });
  });
}

export function emitTyping(conversationId: number, typing = true): void {
  if (socket?.connected) socket.emit("chat:typing", { conversation_id: conversationId, typing });
}
