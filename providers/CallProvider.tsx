/**
 * SESLİ ARAMA SAĞLAYICISI — arama durumu + WebRTC bağlantısı.
 *
 * Kökte bir kez mount edilir (app/_layout.tsx). Sohbet ekranı `startCall`
 * çağırır; gelen arama soketten (`call:incoming`) düşer ve CallScreen katmanı
 * hangi ekranda olunursa olunsun üstte açılır.
 *
 * SİNYALLEŞME: önce soket ack'i, soket kapalıysa REST (lib/api/chat.ts).
 * SDP/ICE sunucuda saklanmaz; yalnız karşı tarafa aktarılır.
 *
 * WEBRTC MODÜLÜ: `react-native-webrtc` dinamik yüklenir (lib/webrtc.ts).
 * Expo Go'da yoktur; o durumda arama düğmesi açıklayıcı bir uyarı verir,
 * gelen aramayı yalnız reddetmek mümkündür.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  acceptCall as acceptCallRest,
  endCall as endCallRest,
  getIceServers,
  rejectCall as rejectCallRest,
  sendIceCandidate,
  startCall as startCallRest,
  type ChatCall,
  type ChatConversation,
  type ChatUser,
  type IceServer,
  type SdpPayload,
} from "@/lib/api/chat";
import { CHAT_EVENTS, emitWithAck, onChatEvent, releaseChatSocket, retainChatSocket, SocketOfflineError } from "@/lib/chatSocket";
import { haptics } from "@/lib/haptics";
import { ApiError } from "@/lib/http";
import { isWebRtcAvailable, loadWebRtc, WEBRTC_UNAVAILABLE_MESSAGE } from "@/lib/webrtc";
import { useAuth } from "@/providers/AuthProvider";

export type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

export interface CallState {
  status: CallStatus;
  call: ChatCall | null;
  remote: ChatUser | null;
  error: string;
  muted: boolean;
  speaker: boolean;
  startedAt: number | null;
  endedLabel: string;
}

export interface CallApi extends CallState {
  startCall: (conversation: ChatConversation) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  available: boolean;
}

const IDLE: CallState = {
  status: "idle",
  call: null,
  remote: null,
  error: "",
  muted: false,
  speaker: false,
  startedAt: null,
  endedLabel: "",
};

const DEFAULT_ICE: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];
const RING_TIMEOUT_MS = 45_000;

const END_LABELS: Record<string, string> = {
  rejected: "Arama reddedildi",
  timeout: "Cevapsız arama",
  missed: "Cevapsız arama",
  cancelled: "Arama iptal edildi",
  hangup: "Görüşme bitti",
  taken: "Aramayı başka bir yönetici yanıtladı",
  "connection-failed": "Bağlantı koptu",
};

const MANAGEMENT_REMOTE: ChatUser = { user_id: 0, name: "ElitLig Yönetimi", avatar: null, subtitle: "Yönetim" };

const CallContext = createContext<CallApi | null>(null);

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  const code = (error as { code?: string })?.code;
  if (code === "CALLEE_BUSY") return "Aradığınız kişi şu anda başka bir görüşmede.";
  if (code === "CALL_IN_PROGRESS") return "Zaten devam eden bir aramanız var.";
  if (code === "CALL_NOT_ALLOWED") return "Sesli arama yalnızca birebir sohbetlerde yapılabilir.";
  if (code === "CALL_NOT_RINGING") return "Arama artık çalmıyor.";
  const message = (error as { message?: string })?.message;
  return message && message !== "SOCKET_OFFLINE" ? message : "Arama kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.";
}

async function signal<T extends object>(event: string, payload: unknown, rest: () => Promise<T>): Promise<T> {
  try {
    return await emitWithAck<T>(event, payload);
  } catch (error) {
    if (error instanceof SocketOfflineError) return rest();
    throw error;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function CallProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const appActive = useAppActive();
  const [state, setState] = useState<CallState>(IDLE);

  const pcRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const callRef = useRef<ChatCall | null>(null);
  const offerRef = useRef<SdpPayload | null>(null);
  const iceRef = useRef<IceServer[]>(DEFAULT_ICE);
  const localIceQueue = useRef<unknown[]>([]);
  const remoteIceQueue = useRef<unknown[]>([]);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<CallStatus>("idle");

  const patch = useCallback((next: Partial<CallState>) => {
    setState((current) => {
      const merged = { ...current, ...next };
      statusRef.current = merged.status;
      return merged;
    });
  }, []);

  const cleanup = useCallback(() => {
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    try {
      pcRef.current?.close?.();
    } catch {
      // zaten kapalı
    }
    pcRef.current = null;
    try {
      streamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
    } catch {
      // parça zaten durmuş
    }
    streamRef.current = null;
    offerRef.current = null;
    localIceQueue.current = [];
    remoteIceQueue.current = [];
  }, []);

  const finish = useCallback(
    (label: string) => {
      cleanup();
      const call = callRef.current;
      callRef.current = null;
      setState({ ...IDLE, status: "ended", call, remote: call ? (call.other_user as ChatUser) : null, endedLabel: label });
      statusRef.current = "ended";
      setTimeout(() => {
        setState((current) => {
          if (current.status !== "ended") return current;
          statusRef.current = "idle";
          return IDLE;
        });
      }, 2_500);
    },
    [cleanup],
  );

  const sendIce = useCallback((candidate: unknown) => {
    const call = callRef.current;
    if (!call?.id) {
      localIceQueue.current.push(candidate);
      return;
    }
    signal("call:ice", { call_id: call.id, candidate }, () => sendIceCandidate(call.id, candidate)).catch(() => {});
  }, []);

  const flushLocalIce = useCallback(() => {
    const queued = localIceQueue.current;
    localIceQueue.current = [];
    queued.forEach(sendIce);
  }, [sendIce]);

  const applyRemoteIce = useCallback(async () => {
    const pc = pcRef.current;
    const rtc = loadWebRtc();
    if (!pc || !rtc || !pc.remoteDescription) return;
    const queued = remoteIceQueue.current;
    remoteIceQueue.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
      } catch {
        // geçersiz aday atlanır
      }
    }
  }, []);

  const createPeer = useCallback(async () => {
    const rtc = loadWebRtc();
    if (!rtc) throw new Error(WEBRTC_UNAVAILABLE_MESSAGE);
    const pc = new rtc.RTCPeerConnection({ iceServers: iceRef.current });
    pcRef.current = pc;
    pc.addEventListener("icecandidate", (event: any) => {
      if (event?.candidate) {
        const candidate = typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate;
        sendIce(candidate);
      }
    });
    pc.addEventListener("connectionstatechange", () => {
      const connectionState = pc.connectionState;
      if (connectionState === "connected") {
        haptics.success();
        patch({ status: "active", startedAt: Date.now(), error: "" });
      } else if ((connectionState === "failed" || connectionState === "closed") && callRef.current) {
        const call = callRef.current;
        signal("call:end", { call_id: call.id, reason: "connection-failed" }, () => endCallRest(call.id, "connection-failed")).catch(() => {});
        finish(END_LABELS["connection-failed"]);
      }
    });
    const stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
    return pc;
  }, [finish, patch, sendIce]);

  const loadIce = useCallback(async () => {
    try {
      const result = await getIceServers();
      iceRef.current = result.ice_servers?.length ? result.ice_servers : DEFAULT_ICE;
    } catch {
      iceRef.current = DEFAULT_ICE;
    }
  }, []);

  /* ---------------------------- eylemler ---------------------------- */

  const startCall = useCallback(
    async (conversation: ChatConversation) => {
      if (!conversation.can_call) return;
      if (callRef.current) {
        patch({ error: "Zaten devam eden bir aramanız var." });
        return;
      }
      if (!isWebRtcAvailable()) {
        setState({ ...IDLE, status: "ended", remote: conversation.other_user ?? MANAGEMENT_REMOTE, endedLabel: WEBRTC_UNAVAILABLE_MESSAGE, error: WEBRTC_UNAVAILABLE_MESSAGE });
        setTimeout(() => setState((current) => (current.status === "ended" ? IDLE : current)), 4_000);
        return;
      }
      const rtc = loadWebRtc()!;
      // Yönetim sohbetinde üye "ElitLig Yönetimi"ni arar; yönetici üyeyi arar.
      const remote = conversation.other_user ?? (conversation.is_management ? MANAGEMENT_REMOTE : null);
      setState({ ...IDLE, status: "outgoing", remote });
      statusRef.current = "outgoing";
      try {
        await loadIce();
        const pc = await createPeer();
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(new rtc.RTCSessionDescription(offer));
        const sdp: SdpPayload = { type: offer.type, sdp: offer.sdp };
        const result = await signal<{ call: ChatCall }>(
          "call:invite",
          { conversation_id: conversation.id, sdp },
          () => startCallRest({ conversation_id: conversation.id, sdp }),
        );
        callRef.current = result.call;
        patch({ call: result.call, remote: (result.call.other_user as ChatUser) ?? remote });
        flushLocalIce();
        ringTimer.current = setTimeout(() => {
          const call = callRef.current;
          if (call && pcRef.current && !pcRef.current.remoteDescription) {
            signal("call:end", { call_id: call.id, reason: "timeout" }, () => endCallRest(call.id, "timeout")).catch(() => {});
            finish(END_LABELS.timeout);
          }
        }, RING_TIMEOUT_MS);
      } catch (error) {
        cleanup();
        callRef.current = null;
        const message = describeError(error);
        setState({ ...IDLE, status: "ended", remote, endedLabel: message, error: message });
        statusRef.current = "ended";
        setTimeout(() => setState((current) => (current.status === "ended" ? IDLE : current)), 3_500);
      }
    },
    [cleanup, createPeer, finish, flushLocalIce, loadIce, patch],
  );

  const acceptCall = useCallback(async () => {
    const call = callRef.current;
    if (!call || statusRef.current !== "incoming") return;
    if (!isWebRtcAvailable()) {
      signal("call:reject", { call_id: call.id }, () => rejectCallRest(call.id)).catch(() => {});
      finish(WEBRTC_UNAVAILABLE_MESSAGE);
      return;
    }
    const rtc = loadWebRtc()!;
    patch({ status: "connecting" });
    try {
      const offer = offerRef.current;
      if (!offer) throw new Error("Arama teklifi alınamadı; karşı tarafın yeniden aramasını isteyin.");
      await loadIce();
      const pc = await createPeer();
      await pc.setRemoteDescription(new rtc.RTCSessionDescription(offer));
      await applyRemoteIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(new rtc.RTCSessionDescription(answer));
      const sdp: SdpPayload = { type: answer.type, sdp: answer.sdp };
      await signal("call:accept", { call_id: call.id, sdp }, () => acceptCallRest(call.id, { sdp }));
      flushLocalIce();
    } catch (error) {
      signal("call:end", { call_id: call.id, reason: "accept-failed" }, () => endCallRest(call.id, "accept-failed")).catch(() => {});
      finish(describeError(error));
    }
  }, [applyRemoteIce, createPeer, finish, flushLocalIce, loadIce, patch]);

  const rejectCall = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    signal("call:reject", { call_id: call.id }, () => rejectCallRest(call.id)).catch(() => {});
    finish(END_LABELS.rejected);
  }, [finish]);

  const endCall = useCallback(async () => {
    const call = callRef.current;
    if (!call) {
      cleanup();
      setState(IDLE);
      statusRef.current = "idle";
      return;
    }
    signal("call:end", { call_id: call.id, reason: "hangup" }, () => endCallRest(call.id, "hangup")).catch(() => {});
    finish(statusRef.current === "active" ? END_LABELS.hangup : END_LABELS.cancelled);
  }, [cleanup, finish]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !state.muted;
    stream.getAudioTracks?.().forEach((track: any) => {
      track.enabled = !next;
    });
    patch({ muted: next });
  }, [patch, state.muted]);

  const toggleSpeaker = useCallback(() => {
    const rtc = loadWebRtc();
    const next = !state.speaker;
    try {
      rtc?.InCallManager?.setSpeakerphoneOn?.(next);
    } catch {
      // hoparlör denetimi yoksa yalnız durum değişir
    }
    patch({ speaker: next });
  }, [patch, state.speaker]);

  /* ---------------------------- soket olayları ---------------------------- */

  const enabled = Boolean(auth.user) && appActive;
  useEffect(() => {
    if (!enabled) return;
    retainChatSocket();

    const offIncoming = onChatEvent<{ call: ChatCall; sdp: SdpPayload | null; ice_servers?: IceServer[] }>(
      CHAT_EVENTS.CALL_INCOMING,
      ({ call, sdp, ice_servers }) => {
        if (callRef.current) return;
        callRef.current = call;
        offerRef.current = sdp ?? null;
        if (ice_servers?.length) iceRef.current = ice_servers;
        setState({ ...IDLE, status: "incoming", call, remote: call.other_user as ChatUser });
        statusRef.current = "incoming";
        haptics.warning();
        ringTimer.current = setTimeout(() => {
          if (callRef.current?.id === call.id && !pcRef.current) finish(END_LABELS.missed);
        }, RING_TIMEOUT_MS);
      },
    );

    const offAccepted = onChatEvent<{ call: ChatCall; sdp: SdpPayload | null }>(CHAT_EVENTS.CALL_ACCEPTED, async ({ call, sdp }) => {
      if (!callRef.current || callRef.current.id !== call.id) return;
      if (ringTimer.current) {
        clearTimeout(ringTimer.current);
        ringTimer.current = null;
      }
      patch({ status: "connecting", call });
      const rtc = loadWebRtc();
      try {
        if (pcRef.current && sdp && rtc) {
          await pcRef.current.setRemoteDescription(new rtc.RTCSessionDescription(sdp));
          await applyRemoteIce();
        }
      } catch {
        finish("Bağlantı kurulamadı");
      }
    });

    const offEnded = onChatEvent<{ call: ChatCall; reason?: string }>(CHAT_EVENTS.CALL_ENDED, ({ call, reason }) => {
      if (!callRef.current || callRef.current.id !== call.id) return;
      finish(END_LABELS[reason ?? ""] ?? END_LABELS[call.status] ?? END_LABELS.hangup);
    });

    const offIce = onChatEvent<{ call_id: number; candidate: unknown }>(CHAT_EVENTS.CALL_ICE, ({ call_id, candidate }) => {
      if (!callRef.current || callRef.current.id !== call_id || !candidate) return;
      remoteIceQueue.current.push(candidate);
      void applyRemoteIce();
    });

    const offSdp = onChatEvent<{ call_id: number; sdp: SdpPayload }>(CHAT_EVENTS.CALL_STATE, async ({ call_id, sdp }) => {
      const rtc = loadWebRtc();
      if (!callRef.current || callRef.current.id !== call_id || !sdp || !pcRef.current || !rtc) return;
      try {
        await pcRef.current.setRemoteDescription(new rtc.RTCSessionDescription(sdp));
        await applyRemoteIce();
      } catch {
        // yeniden müzakere başarısız; bağlantı durumu olayı devreye girer
      }
    });

    return () => {
      offIncoming();
      offAccepted();
      offEnded();
      offIce();
      offSdp();
      releaseChatSocket();
    };
  }, [applyRemoteIce, enabled, finish, patch]);

  // Oturum kapanınca açık arama da kapanır.
  useEffect(() => {
    if (!auth.user && callRef.current) void endCall();
  }, [auth.user, endCall]);

  const value = useMemo<CallApi>(
    () => ({ ...state, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleSpeaker, available: isWebRtcAvailable() }),
    [state, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleSpeaker],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallApi {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall yalnızca CallProvider içinde kullanılabilir.");
  return value;
}
