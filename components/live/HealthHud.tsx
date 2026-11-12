/**
 * Yayın sağlığı — sahne üstündeki küçük haplar (yayına GİTMEZ) ve Yayın
 * sekmesindeki ayrıntı kartı.
 *
 * Veri yerel modülden saniyede bir gelir (bit hızı, kare hızı, düşen kare);
 * ekstra zamanlayıcı kurulmaz. Pil ve ağ türü dakikada bir okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatBytes } from "@/lib/live/localRecording";
import { HEALTH_LABEL, RIG, elapsedText, encoderMessageText, healthLevel, type EncoderConfig, type HealthLevel } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";
import type { DeviceStatus, LiveState, LiveStats } from "@/modules/elitlig-live";

const LEVEL_COLOR: Record<HealthLevel, string> = { good: RIG.ok, weak: RIG.warn, bad: RIG.live, idle: RIG.textMute };

export function stateLabel(state: LiveState, elapsedMs: number): string {
  switch (state) {
    case "live":
      return `CANLI ${elapsedText(elapsedMs)}`;
    case "connecting":
      return "BAĞLANIYOR";
    case "reconnecting":
      return "YENİDEN BAĞLANIYOR";
    case "failed":
      return "BAĞLANTI KOPTU";
    default:
      return "YAYIN KAPALI";
  }
}

export const NETWORK_LABEL: Record<DeviceStatus["network"], string> = {
  wifi: "Wi-Fi",
  cellular: "Mobil veri",
  ethernet: "Kablolu",
  none: "Bağlantı yok",
  unknown: "Bilinmiyor",
};

export const batteryText = (d: DeviceStatus | null) =>
  !d || d.batteryLevel < 0 ? "Bilinmiyor" : `%${Math.round(d.batteryLevel * 100)}${d.charging ? " · şarjda" : ""}`;

/** Süren yerel kayıt (yayının tamamı → telefon hafızası). */
export interface RecordingHealth {
  bytes: number;
  /** Bilinmiyorsa -1. */
  freeBytes: number;
  /** Uygulama arka plandaydı: parça kapatıldı, yenisi açılıyor. */
  paused: boolean;
}

/** Boş alan bu değerin altına inince kayıt hapı uyarı rengine döner. */
const LOW_SPACE_BYTES = 1_000_000_000;

export const recordingText = (r: RecordingHealth) =>
  `${formatBytes(r.bytes)}${r.freeBytes >= 0 ? ` · boş ${formatBytes(r.freeBytes)}` : ""}`;

export interface HealthProps {
  state: LiveState;
  message?: string;
  stats: LiveStats | null;
  elapsedMs: number;
  encoder: EncoderConfig;
  device: DeviceStatus | null;
  muted: boolean;
  replaying: boolean;
  /** null / tanımsız → telefona kayıt yapılmıyor. */
  recording?: RecordingHealth | null;
}

/** Sahne üstü haplar. */
export function HealthHud({ state, stats, elapsedMs, encoder, device, muted, replaying, recording }: HealthProps) {
  const on = state === "live" || state === "connecting" || state === "reconnecting";
  const level = healthLevel(state, stats?.bitrateKbps, encoder.videoBitrateKbps, stats?.fps, encoder.fps);
  const lowBattery = device != null && device.batteryLevel >= 0 && device.batteryLevel <= 0.2 && !device.charging;
  const lowSpace = recording != null && recording.freeBytes >= 0 && recording.freeBytes < LOW_SPACE_BYTES;
  return (
    <View style={styles.hud} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: state === "live" ? RIG.live : on ? RIG.warn : state === "failed" ? RIG.liveDim : RIG.glass }]}>
        <View style={styles.pillDot} />
        <Text style={styles.pillText} allowFontScaling={false}>
          {stateLabel(state, elapsedMs)}
        </Text>
      </View>
      {stats && state === "live" ? (
        <View style={[styles.pill, styles.glass]}>
          <View style={[styles.pillDot, { backgroundColor: LEVEL_COLOR[level] }]} />
          <Text style={styles.pillText} allowFontScaling={false}>
            {Math.round(stats.bitrateKbps)} kbps · {Math.round(stats.fps)} fps
          </Text>
        </View>
      ) : null}
      {recording ? (
        <View style={[styles.pill, lowSpace || recording.paused ? { backgroundColor: RIG.warn } : styles.glass]}>
          <Ionicons name={recording.paused ? "pause" : "radio-button-on"} size={11} color={lowSpace || recording.paused ? RIG.ink : RIG.live} />
          <Text style={[styles.pillText, lowSpace || recording.paused ? { color: RIG.ink } : null]} allowFontScaling={false}>
            {recording.paused ? "KAYIT DURAKLADI" : `KAYIT ${recordingText(recording)}`}
          </Text>
        </View>
      ) : null}
      {muted ? (
        <View style={[styles.pill, { backgroundColor: RIG.live }]}>
          <Ionicons name="mic-off" size={11} color={RIG.text} />
          <Text style={styles.pillText} allowFontScaling={false}>
            SES KAPALI
          </Text>
        </View>
      ) : null}
      {replaying ? (
        <View style={[styles.pill, { backgroundColor: RIG.brand }]}>
          <Ionicons name="repeat" size={11} color={RIG.text} />
          <Text style={styles.pillText} allowFontScaling={false}>
            TEKRAR YAYINDA
          </Text>
        </View>
      ) : null}
      {lowBattery ? (
        <View style={[styles.pill, { backgroundColor: RIG.warn }]}>
          <Ionicons name="battery-dead" size={11} color={RIG.ink} />
          <Text style={[styles.pillText, { color: RIG.ink }]} allowFontScaling={false}>
            PİL %{Math.round((device?.batteryLevel ?? 0) * 100)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Yayın sekmesindeki ayrıntı kartı. */
export function HealthCard({ state, message, stats, elapsedMs, encoder, device, recording }: HealthProps) {
  const level = healthLevel(state, stats?.bitrateKbps, encoder.videoBitrateKbps, stats?.fps, encoder.fps);
  const detail = message ? encoderMessageText(state, message) : "";
  const live = state === "live";
  const rows: [string, string][] = [
    ["Süre", live || elapsedMs > 0 ? elapsedText(elapsedMs) : "–"],
    ["Bit hızı", live && stats ? `${Math.round(stats.bitrateKbps)} / ${encoder.videoBitrateKbps} kbps` : `hedef ${encoder.videoBitrateKbps} kbps`],
    ["Kare hızı", live && stats ? `${Math.round(stats.fps)} / ${encoder.fps} fps` : `hedef ${encoder.fps} fps`],
    ["Düşen kare", live && stats?.droppedFrames != null ? String(Math.round(stats.droppedFrames)) : "–"],
    ["Çözünürlük", `${encoder.width}×${encoder.height}`],
    ["Ağ", device ? NETWORK_LABEL[device.network] : "–"],
    ["Pil", device ? batteryText(device) : "–"],
    ["Telefon kaydı", recording ? (recording.paused ? "Duraklatıldı" : recordingText(recording)) : "Kapalı"],
  ];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardDot, { backgroundColor: LEVEL_COLOR[level] }]} />
        <Text style={styles.cardTitle} allowFontScaling={false}>
          {state === "failed" ? "Bağlantı koptu" : state === "connecting" ? "Bağlanıyor" : state === "reconnecting" ? "Yeniden bağlanıyor" : HEALTH_LABEL[level]}
        </Text>
      </View>
      {detail ? (
        <Text style={styles.detail} allowFontScaling={false}>
          {detail}
        </Text>
      ) : level === "bad" || level === "weak" ? (
        live ? (
          <Text style={styles.detail} allowFontScaling={false}>
            Yükleme hızı hedefin altında. Wi-Fi'ye yaklaş ya da yayını durdurup Ayarlar'dan daha düşük kalite seç.
          </Text>
        ) : null
      ) : null}
      <View style={styles.grid}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.cell}>
            <Text style={styles.key} allowFontScaling={false}>
              {k}
            </Text>
            <Text style={styles.value} numberOfLines={1} allowFontScaling={false}>
              {v}
            </Text>
          </View>
        ))}
      </View>
      {device?.lowPower ? (
        <Text style={styles.detail} allowFontScaling={false}>
          Pil tasarrufu kipi açık: telefon kodlayıcıyı kısabilir. Yayın boyunca kapatman önerilir.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Üst orta: skorbord (üst köşe), sponsor (karşı köşe) ve altyazının (alt) boş bıraktığı tek bölge.
  hud: { position: "absolute", top: space.xs, left: "30%", right: "22%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs },
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 22, paddingHorizontal: space.sm, borderRadius: radius.pill },
  glass: { backgroundColor: RIG.glass },
  pillDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: RIG.text },
  pillText: { ...type.micro, color: RIG.text },

  card: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardDot: { width: 10, height: 10, borderRadius: radius.pill },
  cardTitle: { ...type.label, color: RIG.text },
  detail: { ...type.caption, color: RIG.textSoft },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: space.sm },
  cell: { width: "50%", paddingRight: space.xs },
  key: { ...type.micro, color: RIG.textMute },
  value: { ...type.label, color: RIG.text },
});
