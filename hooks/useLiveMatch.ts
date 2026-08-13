import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { io, type Socket } from "socket.io-client";
import { getLiveSnapshot } from "@/lib/api/matches";
import { LIVE_FALLBACK_POLL_MS, LIVE_SOCKET_ENABLED, SOCKET_URL } from "@/lib/config";
import { queryKeys } from "@/lib/queryKeys";
import { RESNAPSHOT_EVENTS, SOCKET_EVENTS } from "@/lib/socketEvents";
import type { LiveSnapshot } from "@/lib/types";

/**
 * Canlı maç akışı.
 *
 * Sunucudaki gerçek zamanlı sözleşme "olay geldi → anlık görüntüyü tazele"
 * biçimindedir: soket yalnızca haber verir, doğruluk kaynağı her zaman
 * /api/live-matches/:id/snapshot uçudur. Web istemcisi de aynı modeli kullanır.
 *
 * Soket kurulamazsa (kurumsal ağ, eski cihaz, kapalı yapılandırma) yoklamaya
 * düşer. Uygulama arka plana alındığında hem soket hem yoklama durur; pil ve
 * mobil veri boşa harcanmaz.
 */
export function useLiveMatch(matchId: number | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);
  const [appActive, setAppActive] = useState(() => AppState.currentState === "active");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active")
    );
    return () => subscription.remove();
  }, []);

  const active = Boolean(enabled && matchId && appActive);

  const query = useQuery({
    queryKey: queryKeys.matchSnapshot(matchId ?? 0),
    queryFn: () => getLiveSnapshot(matchId as number),
    enabled: active,
    // Soket bağlıyken yoklamaya gerek yok; kopunca güvenlik ağı devreye girer.
    refetchInterval: active && !socketConnected ? LIVE_FALLBACK_POLL_MS : false,
    staleTime: 1_000,
  });

  useEffect(() => {
    if (!active || !LIVE_SOCKET_ENABLED || !matchId) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      // Mobil ağlar sık kopar; yeniden bağlanma agresif ama sınırlı tutulur.
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 8_000,
    });
    socketRef.current = socket;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.matchSnapshot(matchId) });
    };

    const join = () => {
      setSocketConnected(true);
      socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });
      // Bağlantı koptuğu sırada kaçan olaylar olabilir: her bağlanışta tazele.
      invalidate();
    };

    socket.on("connect", join);
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", () => setSocketConnected(false));
    RESNAPSHOT_EVENTS.forEach((eventName) => socket.on(eventName, invalidate));

    return () => {
      if (socket.connected) socket.emit(SOCKET_EVENTS.LEAVE_MATCH, { matchId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [active, matchId, queryClient]);

  return {
    snapshot: query.data as LiveSnapshot | undefined,
    isLoading: query.isLoading,
    error: query.error,
    /** Soket bağlıysa saniyeler içinde, değilse yoklama aralığında güncellenir. */
    realtime: socketConnected,
  };
}

/**
 * Canlı sayaç. Sunucu, süreyi "temel süre + temelin alındığı an" ikilisiyle
 * gönderir; dakika istemcide ilerletilir. Cihaz saati sunucudan sapmış olabilir
 * diye fark, aynı yanıttaki serverNow ile aynı koordinata taşınır.
 */
export function useLiveClock(snapshot: LiveSnapshot | undefined) {
  const [now, setNow] = useState(() => Date.now());

  const running = Boolean(snapshot?.timer?.running);
  const serverNowRaw = snapshot?.timer?.serverNow ?? null;

  /**
   * Sunucu-istemci saat sapması yalnızca yanıt geldiği anda ölçülebilir:
   * o an yerel saat ile yanıttaki serverNow arasındaki fark sabit kabul edilir.
   * Her render'da yeniden hesaplanırsa fark sürekli büyür ve dakika donar.
   */
  const driftRef = useRef(0);
  useEffect(() => {
    const serverNow = Date.parse(serverNowRaw ?? "");
    driftRef.current = Number.isFinite(serverNow) ? Date.now() - serverNow : 0;
  }, [serverNowRaw]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  if (!snapshot?.timer) return null;

  const baseMs = Number(snapshot.timer.baseMs) || 0;
  if (!running) return baseMs;

  const baseAt = Date.parse(snapshot.timer.baseAt ?? "");
  if (!Number.isFinite(baseAt)) return baseMs;

  const elapsed = Math.max(0, now - driftRef.current - baseAt);
  return baseMs + elapsed;
}
