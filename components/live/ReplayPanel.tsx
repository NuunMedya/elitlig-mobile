/**
 * Mobil reji — "Tekrar" sekmesi: bu yayında kaydedilen gol klipleri.
 *
 * Her klip: dakika, takım, golcü, yükleme durumu. "Yayına ver" klibi canlı
 * yayının içine oynatır (izleyici tekrarı görür, sonra kamera geri gelir).
 * Yüklenemeyen klip "Yeniden dene" ile tekrar yüklenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";

import { Btn } from "./BroadcastPanel";
import { CLIP_SECONDS, clipStatusLabel, type LocalClip } from "./useGoalClips";

export interface ReplayPanelProps {
  clips: LocalClip[];
  replayingKey: string | null;
  nativeReady: boolean;
  encoderOn: boolean;
  homeName: string;
  awayName: string;
  onPlay: (clip: LocalClip) => void;
  onStop: () => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
}

export function ReplayPanel(props: ReplayPanelProps) {
  const { clips } = props;
  return (
    <View style={styles.stack}>
      <Text style={styles.hint} allowFontScaling={false}>
        GOL'e bastığın an yayının son {CLIP_SECONDS} saniyesi kaydedilir. "Yayına ver" tekrarı canlı yayında oynatır; golcü
        seçilince klip oyuncunun profiline yüklenir.
      </Text>
      {!props.encoderOn ? (
        <View style={styles.note}>
          <Ionicons name="information-circle" size={15} color={RIG.warn} />
          <Text style={styles.noteText} allowFontScaling={false}>
            Klip yalnız yayın açıkken kaydedilir. Önce Yayın sekmesinden yayını başlat.
          </Text>
        </View>
      ) : null}
      {props.replayingKey ? <Btn label="Tekrarı bitir, canlıya dön" icon="stop" tone="live" onPress={props.onStop} /> : null}

      {clips.length === 0 ? (
        <Text style={styles.empty} allowFontScaling={false}>
          Bu yayında henüz gol klibi yok.
        </Text>
      ) : (
        clips.map((clip) => {
          const playing = props.replayingKey === clip.key;
          const playable = Boolean(clip.uri) && clip.status !== "saving" && clip.status !== "error";
          const team = clip.side === "home" ? props.homeName : props.awayName;
          const statusColor =
            clip.status === "uploaded"
              ? RIG.ok
              : clip.status === "failed" || clip.status === "error"
                ? RIG.live
                : clip.status === "local"
                  ? RIG.textMute
                  : RIG.warn;
          return (
            <View key={clip.key} style={[styles.row, playing && styles.rowOn]}>
              <View style={[styles.stripe, { backgroundColor: clip.side === "home" ? RIG.home : RIG.away }]} />
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1} allowFontScaling={false}>
                  {clip.minute}' {clip.code === "GOAL_OWN" ? "Kendi kalesine" : "Gol"} · {clip.scorer ?? team}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: statusColor }]} />
                  <Text style={styles.status} numberOfLines={1} allowFontScaling={false}>
                    {clipStatusLabel(clip)}
                    {clip.durationMs ? ` · ${Math.round(clip.durationMs / 1000)} sn` : ""}
                  </Text>
                </View>
              </View>
              {clip.status === "failed" ? (
                <Touchable style={styles.icon} onPress={() => props.onRetry(clip.key)} accessibilityLabel="Yeniden yükle">
                  <Ionicons name="cloud-upload" size={16} color={RIG.text} />
                </Touchable>
              ) : null}
              {clip.status === "error" || clip.status === "local" ? (
                <Touchable style={styles.icon} onPress={() => props.onRemove(clip.key)} accessibilityLabel="Listeden kaldır">
                  <Ionicons name="trash-outline" size={15} color={RIG.textSoft} />
                </Touchable>
              ) : null}
              <Touchable
                style={[styles.play, !playable && styles.disabled, playing && styles.playOn]}
                onPress={() => (playing ? props.onStop() : props.onPlay(clip))}
                disabled={!playable || !props.nativeReady}
                accessibilityLabel={playing ? "Tekrarı durdur" : "Tekrarı yayına ver"}
                haptic="medium"
              >
                <Ionicons name={playing ? "stop" : "play"} size={14} color={RIG.text} />
                <Text style={styles.playText} allowFontScaling={false}>
                  {playing ? "DURDUR" : "YAYINA VER"}
                </Text>
              </Touchable>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  hint: { ...type.caption, color: RIG.textMute },
  note: { flexDirection: "row", gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.warnDim },
  noteText: { ...type.caption, color: RIG.text, flex: 1 },
  empty: { ...type.caption, color: RIG.textSoft, paddingVertical: space.md, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingRight: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
    overflow: "hidden",
  },
  rowOn: { backgroundColor: RIG.brandDim },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  title: { ...type.label, color: RIG.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  status: { ...type.caption, color: RIG.textMute, flex: 1 },
  icon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelStrong },
  play: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: RIG.brand,
  },
  playOn: { backgroundColor: RIG.live },
  disabled: { opacity: 0.4 },
  playText: { ...type.micro, color: RIG.text },
});
