/**
 * SOHBET TASLAKLARI ve GİDEN KUTUSU — cihazda (AsyncStorage) saklanır.
 *
 * TASLAK: sohbet başına yarım kalan metin; sohbetten çıkıp dönünce yazma
 * alanında durur, sohbet listesinde "Taslak:" olarak görünür (masaüstü
 * `createDraftStore` ile aynı davranış).
 *
 * GİDEN KUTUSU: bağlantı yokken gönderilemeyen METİN mesajları. Uygulama
 * kapansa da kalır; sohbet açıldığında ya da soket yeniden bağlandığında aynı
 * `client_id` ile yeniden gönderilir (sunucu `client_id` tekrarını tek mesaj
 * sayar, çift gönderim olmaz). Fotoğraf / ses gibi dosyalı mesajlar kuyruğa
 * girmez: geçici dosya adresi yeniden açılışta geçersiz olabilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const DRAFT_PREFIX = "elitlig.chat.drafts.v2";
const OUTBOX_PREFIX = "elitlig.chat.outbox.v2";
/** Hesaba bağlanmadan önceki cihaz geneli anahtarlar: ilk sahip atamasında silinir. */
const LEGACY_KEYS = ["elitlig.chat.drafts.v1", "elitlig.chat.outbox.v1"];

/**
 * SAHİP: taslaklar ve giden kutusu OTURUMDAKİ HESABA aittir. Aynı cihazda
 * başka bir üye giriş yaparsa öncekinin taslağını göremez, kuyruğundaki mesaj
 * onun adına gönderilmez: anahtarlar kullanıcı kimliğiyle ayrılır ve bellek
 * her sahip değişiminde boşaltılır. Sahip yokken (misafir) hiçbir şey okunmaz
 * ve yazılmaz.
 */
let owner: string | null = null;
/** Şu anki sahip (kuyruk boşaltılırken hesap değişti mi diye bakılır). */
export const chatDraftOwner = () => owner;
const draftKey = () => `${DRAFT_PREFIX}.${owner}`;
const outboxKey = () => `${OUTBOX_PREFIX}.${owner}`;

export interface ChatDraft {
  text: string;
  at: number;
}

export interface OutboxItem {
  conversation_id: number;
  client_id: string;
  body: string;
  reply_to_id: number | null;
  mentions?: number[];
  admin?: boolean;
  at: string;
}

let drafts: Record<string, ChatDraft> = {};
let outbox: OutboxItem[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((fn) => fn());

/**
 * Oturumdaki hesabı bildirir (hooks/useChat.ts → useChatRealtime). Hesap
 * değişince bekleyen yazma eski hesabın anahtarına hemen yapılır, bellek
 * boşaltılır ve yeni hesabın kaydı okunur.
 */
export function setChatDraftOwner(userId: number | string | null | undefined): void {
  const next = userId == null || userId === "" ? null : String(userId);
  if (next === owner) return;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
    if (owner) void AsyncStorage.setItem(draftKey(), JSON.stringify(drafts)).catch(() => {});
  }
  owner = next;
  drafts = {};
  outbox = [];
  loaded = null;
  void AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});
  // Çizim sırasında çağrılabilir: dinleyiciler bir sonraki mikro görevde uyarılır.
  void Promise.resolve().then(() => {
    emit();
    if (owner) void loadChatDrafts();
  });
}

/** İlk kullanımda diskten okur; sonraki çağrılar aynı sözü döndürür. */
export function loadChatDrafts(): Promise<void> {
  if (!owner) return Promise.resolve();
  if (!loaded) {
    const readFor = owner;
    loaded = AsyncStorage.multiGet([draftKey(), outboxKey()])
      .then((pairs) => {
        // Okuma sürerken hesap değiştiyse bu kayıt artık başkasınındır.
        if (readFor !== owner) return;
        try {
          const d = JSON.parse(pairs[0]?.[1] ?? "{}");
          if (d && typeof d === "object") drafts = { ...d, ...drafts };
        } catch {
          // bozuk kayıt: taslaksız devam
        }
        try {
          const o = JSON.parse(pairs[1]?.[1] ?? "[]");
          if (Array.isArray(o)) outbox = [...o.filter((item) => !outbox.some((x) => x.client_id === item?.client_id)), ...outbox];
        } catch {
          // bozuk kayıt: boş kuyruk
        }
        emit();
      })
      .catch(() => {});
  }
  return loaded;
}

function persistDrafts() {
  // Her tuş vuruşunda diske yazılmaz: son hâli 600 ms sonra bir kez yazılır.
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (owner) void AsyncStorage.setItem(draftKey(), JSON.stringify(drafts)).catch(() => {});
  }, 600);
}

export function getDraft(conversationId: number): string {
  return drafts[String(conversationId)]?.text ?? "";
}

export function setDraft(conversationId: number, text: string): void {
  if (!owner) return;
  const key = String(conversationId);
  const had = Boolean(drafts[key]);
  if (!text.trim()) {
    if (!had) return;
    const next = { ...drafts };
    delete next[key];
    drafts = next;
  } else {
    if (drafts[key]?.text === text) return;
    drafts = { ...drafts, [key]: { text, at: Date.now() } };
  }
  persistDrafts();
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  void loadChatDrafts();
  return () => {
    listeners.delete(fn);
  };
};

/** Sohbet listesi satırı: bu sohbetin taslağı (yoksa boş dize). Yalnız kendi taslağı değişince yeniden çizer. */
export function useDraft(conversationId: number): string {
  return useSyncExternalStore(subscribe, () => drafts[String(conversationId)]?.text ?? "");
}

/* ---------- giden kutusu ---------- */

const persistOutbox = () => {
  if (owner) void AsyncStorage.setItem(outboxKey(), JSON.stringify(outbox)).catch(() => {});
};

export function outboxAdd(item: OutboxItem): void {
  if (!owner) return;
  if (outbox.some((x) => x.client_id === item.client_id)) return;
  outbox = [...outbox, item].slice(-200);
  persistOutbox();
}

export function outboxRemove(clientId: string | null | undefined): void {
  if (!clientId || !outbox.some((x) => x.client_id === clientId)) return;
  outbox = outbox.filter((x) => x.client_id !== clientId);
  persistOutbox();
}

export function outboxFor(conversationId: number): OutboxItem[] {
  return outbox.filter((x) => x.conversation_id === conversationId);
}

/** Bekleyen bütün mesajlar (soket yeniden bağlanınca açık olmayan sohbetler için). */
export function outboxAll(): OutboxItem[] {
  return outbox.slice();
}
