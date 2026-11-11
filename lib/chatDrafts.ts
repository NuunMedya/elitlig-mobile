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

const DRAFT_KEY = "elitlig.chat.drafts.v1";
const OUTBOX_KEY = "elitlig.chat.outbox.v1";

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

/** İlk kullanımda diskten okur; sonraki çağrılar aynı sözü döndürür. */
export function loadChatDrafts(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.multiGet([DRAFT_KEY, OUTBOX_KEY])
      .then((pairs) => {
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
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)).catch(() => {});
  }, 600);
}

export function getDraft(conversationId: number): string {
  return drafts[String(conversationId)]?.text ?? "";
}

export function setDraft(conversationId: number, text: string): void {
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

const persistOutbox = () => void AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)).catch(() => {});

export function outboxAdd(item: OutboxItem): void {
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
