/**
 * MOBİL REJİ — GOL KLİPLERİ KUYRUĞU
 *
 * AKIŞ:
 *   1. GOL'e basıldığı AN `capture()` çağrılır: yerel modül yayının son 10
 *      saniyesini (kamera + gömülü skorbord + ses) MP4 olarak yazar. Oyuncu
 *      seçimi beklenmez — "o an" dokunuş anıdır.
 *   2. Olay sunucuya yazılınca `attach(key, eventId, scorer)` klibi olaya bağlar.
 *   3. Dosya ve olay hazır olunca klip arka planda yüklenir; başarısız olursa
 *      "yeniden dene" ile tekrar denenir. Yüklenen klip oyuncunun profilinde
 *      ve maç sayfasında "gol videosu" olarak görünür.
 *   4. Olay hiç kaydedilmezse (seçim iptal) klip yalnız bu telefonda kalır;
 *      tekrar (replay) için yine kullanılabilir.
 *
 * Klip yayından alındığı için, yayın kapalıyken klip yakalanmaz.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { uploadGoalClip } from "@/lib/live/clips";
import { saveClip } from "@/modules/elitlig-live";

export type ClipStatus = "saving" | "ready" | "uploading" | "uploaded" | "failed" | "local" | "error";

export interface LocalClip {
  key: string;
  /** "goal": GOL dokunuşunda alınır, olaya bağlanıp yüklenir. "instant": anlık tekrar, yalnız bu telefonda. */
  kind: "goal" | "instant";
  createdAt: number;
  side: "home" | "away";
  code: string;
  minute: number;
  uri: string | null;
  durationMs: number;
  width: number;
  height: number;
  eventId: number | null;
  scorer: string | null;
  /** Olay kaydı bitti mi (iptal edildiyse true + eventId null → yalnız yerel). */
  settled: boolean;
  status: ClipStatus;
  error?: string | null;
  serverId?: number | null;
}

export const CLIP_SECONDS = 10;
/** Listede tutulan en çok klip (eskiler listeden düşer; dosyaları modül 24 saatte siler). */
const MAX_CLIPS = 14;

/** Yerel modülün klip hata kodlarının Türkçesi. */
export function clipErrorText(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  if (code === "NOT_STREAMING") return "Klip yalnız yayın sürerken alınabilir.";
  if (code === "NO_BUFFER") return "Henüz yeterli görüntü birikmedi; birkaç saniye sonra yeniden dene.";
  if (code === "CLIP_WRITE_FAILED") return "Klip yazılamadı. Telefonda boş yer kalmamış olabilir.";
  return error instanceof Error && error.message ? error.message : "Klip kaydedilemedi.";
}

export function useGoalClips(matchId: number) {
  const queryClient = useQueryClient();
  const [clips, setClips] = useState<LocalClip[]>([]);
  const uploading = useRef(new Set<string>());

  const patchClip = useCallback((key: string, patch: Partial<LocalClip>) => {
    setClips((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }, []);

  /** GOL dokunuşu: yayının son 10 saniyesini kaydetmeye başla. */
  const capture = useCallback(
    (input: { side: "home" | "away"; code: string; minute: number }): string => {
      const key = `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setClips((list) => [
        {
          key,
          kind: "goal" as const,
          createdAt: Date.now(),
          side: input.side,
          code: input.code,
          minute: input.minute,
          uri: null,
          durationMs: 0,
          width: 0,
          height: 0,
          eventId: null,
          scorer: null,
          settled: false,
          status: "saving" as const,
        },
        ...list,
      ].slice(0, MAX_CLIPS));
      saveClip({ seconds: CLIP_SECONDS, afterSeconds: 0 })
        .then((res) =>
          patchClip(key, { uri: res.uri, durationMs: res.durationMs, width: res.width, height: res.height, status: "ready" })
        )
        .catch((error: unknown) =>
          patchClip(key, { status: "error", error: clipErrorText(error) })
        );
      return key;
    },
    [patchClip]
  );

  /**
   * ANLIK TEKRAR: yayının son `seconds` saniyesini kaydeder ve klibi döndürür
   * (çağıran hemen yayına verir). Olaya bağlanmaz, sunucuya yüklenmez.
   */
  const captureInstant = useCallback(
    async (input: { seconds: number; minute: number }): Promise<LocalClip> => {
      const key = `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const base: LocalClip = {
        key,
        kind: "instant",
        createdAt: Date.now(),
        side: "home",
        code: "REPLAY",
        minute: input.minute,
        uri: null,
        durationMs: 0,
        width: 0,
        height: 0,
        eventId: null,
        scorer: null,
        settled: true,
        status: "saving",
      };
      setClips((list) => [base, ...list].slice(0, MAX_CLIPS));
      try {
        const res = await saveClip({ seconds: input.seconds, afterSeconds: 0 });
        const done: LocalClip = { ...base, uri: res.uri, durationMs: res.durationMs, width: res.width, height: res.height, status: "local" };
        patchClip(key, done);
        return done;
      } catch (error) {
        patchClip(key, { status: "error", error: clipErrorText(error) });
        throw new Error(clipErrorText(error));
      }
    },
    [patchClip]
  );

  /** Olay kaydedildi: klibi olaya bağla (null → olay kaydedilmedi, klip yerel kalır). */
  const attach = useCallback(
    (key: string, eventId: number | null, scorer: string | null, side?: "home" | "away", code?: string) => {
      patchClip(key, { eventId, scorer, settled: true, ...(side ? { side } : {}), ...(code ? { code } : {}) });
    },
    [patchClip]
  );

  const upload = useCallback(
    async (clip: LocalClip) => {
      if (!clip.uri || !clip.eventId || uploading.current.has(clip.key)) return;
      uploading.current.add(clip.key);
      patchClip(clip.key, { status: "uploading", error: null });
      try {
        const saved = await uploadGoalClip(matchId, clip.eventId, {
          uri: clip.uri,
          durationMs: clip.durationMs,
          width: clip.width,
          height: clip.height,
        });
        patchClip(clip.key, { status: "uploaded", serverId: saved?.id ?? null });
        void queryClient.invalidateQueries({ queryKey: ["goal-clips"] });
      } catch (error) {
        patchClip(clip.key, { status: "failed", error: error instanceof Error ? error.message : "Yüklenemedi." });
      } finally {
        uploading.current.delete(clip.key);
      }
    },
    [matchId, patchClip, queryClient]
  );

  // Dosya + olay hazır olan klipleri sırayla yükle.
  useEffect(() => {
    for (const clip of clips) {
      if (clip.status === "ready" && clip.settled) {
        if (clip.eventId) void upload(clip);
        else patchClip(clip.key, { status: "local" });
      }
    }
  }, [clips, patchClip, upload]);

  const retry = useCallback(
    (key: string) => {
      const clip = clips.find((c) => c.key === key);
      if (clip) void upload({ ...clip, status: "ready" });
    },
    [clips, upload]
  );

  const remove = useCallback((key: string) => setClips((list) => list.filter((c) => c.key !== key)), []);

  /** Tekrar için en yeni oynatılabilir klip. */
  const latest = clips.find((c) => c.uri && c.status !== "saving" && c.status !== "error") ?? null;

  /** En yeni oynatılabilir GOL klibi. */
  const latestGoal = clips.find((c) => c.kind === "goal" && c.uri && c.status !== "saving" && c.status !== "error") ?? null;

  return { clips, capture, captureInstant, attach, retry, remove, latest, latestGoal };
}

export function clipStatusLabel(clip: LocalClip): string {
  switch (clip.status) {
    case "saving":
      return "Kaydediliyor…";
    case "ready":
      return clip.settled ? "Yüklemeye hazır" : "Golcü seçimi bekleniyor";
    case "uploading":
      return "Yükleniyor…";
    case "uploaded":
      return "Profilde yayında";
    case "failed":
      return "Yüklenemedi";
    case "local":
      return "Yalnız bu telefonda";
    case "error":
      return clip.error ?? "Klip kaydedilemedi";
  }
}
