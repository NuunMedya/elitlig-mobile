/**
 * GOL VİDEOSU İNDİRME — "tek tıkla indir".
 *
 * AKIŞ (telefon): klip MP4'ü önbellek klasörüne indirilir (ilerleme yüzdesi
 * canlı), ardından cihazın paylaşım sayfası açılır; kullanıcı oradan
 * "Videoyu kaydet" (iOS) / "Galeriye kaydet"/"Dosyalar" (Android) seçer.
 *
 * NEDEN DOĞRUDAN GALERİYE DEĞİL: galeriye sessiz kayıt `expo-media-library`
 * ister; paket kurulu değil ve yerel modül eklemek mağaza sürümü gerektirir.
 * expo-file-system (expo'nun kendi bağımlılığı) + expo-sharing ile kullanıcı
 * tek ek dokunuşla videoyu kaydeder.
 *
 * WEB: dosya bloba indirilip tarayıcının indirme penceresi açılır; depo CORS
 * izni vermezse video yeni sekmede açılır (oradan "Videoyu kaydet").
 *
 * Durum tek yerde tutulur (`useClipDownloads`, SummaryTab): oynatıcıdaki ve
 * ızgaradaki indir düğmeleri aynı ilerlemeyi gösterir; aynı klip iki kez
 * indirilmez.
 */

import * as Sharing from "expo-sharing";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

import { useToast } from "@/components/ui";
import type { GoalClip } from "@/lib/live/clips";

export type DownloadStatus = "idle" | "downloading" | "saving" | "done" | "error";

export interface DownloadState {
  status: DownloadStatus;
  /** 0–1; boyut bilinmiyorsa -1 (belirsiz). */
  progress: number;
}

export interface BatchState {
  running: boolean;
  done: number;
  total: number;
}

export interface ClipDownloads {
  stateOf: (clipId: number) => DownloadState;
  /** Tek klibi indir ve paylaşım sayfasını aç. */
  download: (clip: GoalClip) => Promise<void>;
  /** Klipleri sırayla indir; her biri için paylaşım sayfası sırayla açılır. */
  downloadAll: (clips: GoalClip[]) => Promise<void>;
  batch: BatchState;
}

const IDLE: DownloadState = { status: "idle", progress: 0 };

/** "elitlig-gol-11192-21dk-46.mp4" */
export function clipFileName(clip: GoalClip): string {
  const minute = clip.minute != null ? `-${clip.minute}dk` : "";
  return `elitlig-gol-${clip.match_id}${minute}-${clip.id}.mp4`;
}

/** Yüzde etiketi: "%42" · belirsizse "…". */
export function progressLabel(state: DownloadState): string {
  if (state.progress < 0) return "…";
  return `%${Math.round(Math.min(1, Math.max(0, state.progress)) * 100)}`;
}

export function useClipDownloads(): ClipDownloads {
  const toast = useToast();
  const [states, setStates] = useState<Record<number, DownloadState>>({});
  const [batch, setBatch] = useState<BatchState>({ running: false, done: 0, total: 0 });
  const busy = useRef(new Set<number>());

  const patch = useCallback((clipId: number, next: DownloadState) => {
    setStates((prev) => ({ ...prev, [clipId]: next }));
  }, []);

  /** İndirir ve paylaşır; başarıyı döndürür (toplu indirmede hata tek tek söylenmez). */
  const run = useCallback(
    async (clip: GoalClip, quiet: boolean): Promise<boolean> => {
      if (busy.current.has(clip.id)) return false;
      busy.current.add(clip.id);
      patch(clip.id, { status: "downloading", progress: 0 });
      try {
        if (Platform.OS === "web") {
          await downloadOnWeb(clip, (progress) => patch(clip.id, { status: "downloading", progress }));
        } else {
          const uri = await downloadToCache(clip, (progress) => patch(clip.id, { status: "downloading", progress }));
          patch(clip.id, { status: "saving", progress: 1 });
          if (!(await Sharing.isAvailableAsync())) throw new Error("Paylaşım bu cihazda kullanılamıyor.");
          await Sharing.shareAsync(uri, {
            mimeType: "video/mp4",
            UTI: "public.mpeg-4",
            dialogTitle: "Gol videosunu kaydet",
          });
        }
        patch(clip.id, { status: "done", progress: 1 });
        return true;
      } catch (error) {
        patch(clip.id, { status: "error", progress: 0 });
        if (!quiet) {
          toast.show({
            tone: "danger",
            icon: "cloud-offline-outline",
            message: error instanceof Error && error.message ? error.message : "Video indirilemedi.",
          });
        }
        return false;
      } finally {
        busy.current.delete(clip.id);
      }
    },
    [patch, toast],
  );

  const download = useCallback(async (clip: GoalClip) => {
    await run(clip, false);
  }, [run]);

  const downloadAll = useCallback(
    async (clips: GoalClip[]) => {
      if (!clips.length) return;
      setBatch({ running: true, done: 0, total: clips.length });
      let ok = 0;
      for (const clip of clips) {
        if (await run(clip, true)) ok += 1;
        setBatch((prev) => ({ ...prev, done: prev.done + 1 }));
      }
      setBatch({ running: false, done: clips.length, total: clips.length });
      toast.show(
        ok === clips.length
          ? { tone: "success", icon: "checkmark-circle", message: `${ok} gol videosu hazır.` }
          : { tone: "warn", icon: "alert-circle-outline", message: `${ok}/${clips.length} video indirildi. Kalanları tek tek dene.` },
      );
    },
    [run, toast],
  );

  const stateOf = useCallback((clipId: number) => states[clipId] ?? IDLE, [states]);

  return { stateOf, download, downloadAll, batch };
}

/* ───────────────────────────── Telefon ───────────────────────────── */

async function downloadToCache(clip: GoalClip, onProgress: (value: number) => void): Promise<string> {
  // Yalnız yerelde yüklenir: web paketinde legacy dosya sistemi yok.
  const FileSystem = await import("expo-file-system/legacy");
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error("Önbellek klasörü bulunamadı.");
  const target = `${dir}${clipFileName(clip)}`;

  // Daha önce indirildiyse yeniden indirme — doğrudan paylaşım.
  const info = await FileSystem.getInfoAsync(target).catch(() => null);
  if (info?.exists && "size" in info && Number(info.size) > 0) {
    onProgress(1);
    return target;
  }

  const task = FileSystem.createDownloadResumable(clip.url, target, {}, (event) => {
    const total = event.totalBytesExpectedToWrite;
    onProgress(total > 0 ? event.totalBytesWritten / total : -1);
  });
  const result = await task.downloadAsync();
  if (!result || result.status >= 400) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new Error("Video indirilemedi. Bağlantını kontrol edip yeniden dene.");
  }
  return result.uri;
}

/* ─────────────────────────────── Web ─────────────────────────────── */

async function downloadOnWeb(clip: GoalClip, onProgress: (value: number) => void): Promise<void> {
  const name = clipFileName(clip);
  try {
    const res = await fetch(clip.url);
    if (!res.ok || !res.body) throw new Error("fetch");
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const parts: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        received += value.length;
        onProgress(total > 0 ? received / total : -1);
      }
    }
    const href = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  } catch {
    // Depo çapraz kaynak okumaya izin vermiyorsa: videoyu yeni sekmede aç.
    window.open(clip.url, "_blank", "noopener");
  }
}
