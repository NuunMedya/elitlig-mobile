/**
 * ARAMA KATMANI — gelen/giden/aktif sesli arama ekranı (Gece dili, ikinci tur).
 *
 * Kökte (app/_layout.tsx) Stack'in dışında bir kez mount edilir; arama
 * durumu `idle` değilken tam ekran bir Modal olarak her ekranın üstüne çıkar.
 * Böylece kullanıcı hangi sayfada olursa olsun gelen aramayı görür.
 *
 * GÖRÜNÜM:
 *   · Zemin: gece mürekkebi degrade + sahne aurorası.
 *   · Avatar: imza degradesi halka; çalarken (gelen / giden / bağlanıyor)
 *     avatarın çevresinden 1,6 sn'de bir "ses dalgası" halkası büyüyüp söner.
 *     (Sürekli döngü yerine zamanlayıcıyla tetiklenen TEK seferlik
 *     animasyon; "hareketi azalt" açıkken hiç oynamaz.)
 *   · Durum: cam kapsül; görüşmede nane nokta + Archivo sayaç.
 *   · Denetimler: cam dok içinde yuvarlak cam düğmeler (sessiz, hoparlör);
 *     altında kırmızı degrade "bitir" ve nane degrade "kabul et" — ikisi de
 *     kendi renginde parıltılı.
 *
 * `CallView` yalnız sunumdur (prop'larla çizilir); `CallScreen` onu arama
 * sağlayıcısının durumuyla besler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Aurora, Avatar, Touchable, useReduceMotion, withAlpha } from "@/components/ui";
import { useCall, type CallStatus } from "@/providers/CallProvider";
import { colors, duration, easing, glowStyle, hairline, radius, space, textScale, type } from "@/theme";

const pad = (value: number) => String(value).padStart(2, "0");
const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

const STATUS_TEXT: Record<Exclude<CallStatus, "idle">, string> = {
  outgoing: "Aranıyor…",
  incoming: "Gelen sesli arama",
  connecting: "Bağlanıyor…",
  active: "Görüşme sürüyor",
  ended: "Görüşme bitti",
};

const GRADIENT_START = { x: 1, y: 0.5 };
const GRADIENT_END = { x: 0, y: 0.5 };
const AVATAR = 112;
const WAVE_EVERY_MS = 1_600;

export function CallScreen() {
  const call = useCall();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (call.status !== "active") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [call.status]);

  if (call.status === "idle") return null;

  const statusText =
    call.status === "active" && call.startedAt
      ? formatDuration(now - call.startedAt)
      : call.status === "ended"
        ? call.endedLabel || STATUS_TEXT.ended
        : STATUS_TEXT[call.status];

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <CallView
        status={call.status}
        name={call.remote?.name ?? "Üye"}
        subtitle={call.remote?.subtitle ?? "Üye"}
        avatar={call.remote?.avatar ?? null}
        statusText={statusText}
        error={call.error && call.status !== "ended" ? call.error : ""}
        muted={call.muted}
        speaker={call.speaker}
        onToggleMute={call.toggleMute}
        onToggleSpeaker={call.toggleSpeaker}
        onAccept={call.acceptCall}
        onReject={call.rejectCall}
        onEnd={call.endCall}
      />
    </Modal>
  );
}

export interface CallViewProps {
  status: Exclude<CallStatus, "idle">;
  name: string;
  subtitle: string;
  avatar: string | null;
  statusText: string;
  error?: string;
  muted: boolean;
  speaker: boolean;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
}

/** Arama ekranının sunumu (sağlayıcıdan bağımsız). */
export function CallView({ status, name, subtitle, avatar, statusText, error, muted, speaker, onToggleMute, onToggleSpeaker, onAccept, onReject, onEnd }: CallViewProps) {
  const insets = useSafeAreaInsets();
  const showAccept = status === "incoming";
  const showHangup = status !== "ended";
  const showControls = status === "active" || status === "connecting";
  const ringing = status === "incoming" || status === "outgoing" || status === "connecting";

  return (
    <View style={styles.fill}>
      <LinearGradient colors={colors.gradientInk} start={GRADIENT_START} end={GRADIENT_END} style={StyleSheet.absoluteFill} />
      <Aurora variant="stage" />
      <View style={[styles.screen, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.hero}>
          <View style={styles.kickerPill}>
            <Ionicons name={status === "incoming" ? "call" : "shield-checkmark"} size={11} color={colors.onDark} />
            <Text style={styles.kicker} {...textScale.badge}>
              {status === "incoming" ? "ELİTLİG SESLİ ARAMA" : "SESLİ ARAMA"}
            </Text>
          </View>

          <View style={styles.avatarStage}>
            <SoundWaves active={ringing} />
            <View style={[styles.ringOuter, glowStyle(colors.glow, 3)]}>
              <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.ringFill]} />
              <View style={styles.ringGap}>
                <Avatar name={name} image={avatar} size={AVATAR} onPitch />
              </View>
            </View>
          </View>

          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
          <View style={[styles.statusPill, status === "active" ? styles.statusPillActive : null]}>
            {status === "active" ? <View style={styles.liveDot} /> : <Ionicons name={status === "ended" ? "call-outline" : "radio-outline"} size={13} color={colors.onDarkMuted} />}
            <Text style={[styles.status, status === "active" ? styles.statusActive : null]} {...textScale.dense}>
              {statusText}
            </Text>
          </View>
          {error ? (
            <Text style={styles.error} {...textScale.long}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.controls}>
          {showControls ? (
            <View style={styles.dock}>
              <RoundButton icon={muted ? "mic-off" : "mic"} label={muted ? "Sesi aç" : "Sessiz"} active={muted} onPress={onToggleMute} />
              <RoundButton icon={speaker ? "volume-high" : "volume-medium"} label="Hoparlör" active={speaker} onPress={onToggleSpeaker} />
            </View>
          ) : null}
          <View style={styles.row}>
            {showHangup ? (
              <RoundButton
                icon="call"
                label={status === "incoming" ? "Reddet" : status === "active" ? "Bitir" : "İptal"}
                tone="danger"
                rotate
                onPress={status === "incoming" ? onReject : onEnd}
              />
            ) : null}
            {showAccept ? <RoundButton icon="call" label="Kabul et" tone="accept" onPress={onAccept} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Çalarken avatarın çevresinden büyüyüp sönen iki halka (zamanlayıcıyla, tek seferlik). */
function SoundWaves({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) return undefined;
    const wave = (value: Animated.Value, delay: number) => {
      value.setValue(0);
      Animated.timing(value, { toValue: 1, duration: WAVE_EVERY_MS, delay, easing: easing.decelerate, useNativeDriver: true }).start();
    };
    const fire = () => {
      wave(a, 0);
      wave(b, WAVE_EVERY_MS / 2.5);
    };
    fire();
    const timer = setInterval(fire, WAVE_EVERY_MS + duration.slow);
    return () => clearInterval(timer);
  }, [a, active, b, reduceMotion]);

  if (!active || reduceMotion) return null;
  const ring = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.wave, ring(a)]} />
      <Animated.View pointerEvents="none" style={[styles.wave, styles.waveCyan, ring(b)]} />
    </>
  );
}

interface RoundButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "neutral" | "danger" | "accept";
  active?: boolean;
  rotate?: boolean;
}

function RoundButton({ icon, label, onPress, tone = "neutral", active = false, rotate = false }: RoundButtonProps) {
  const fill = tone === "danger" ? colors.gradientLive : tone === "accept" ? colors.tileTones.mint : null;
  const iconColor = tone === "neutral" && active ? colors.inkBlock : colors.onDark;
  const big = tone !== "neutral";
  return (
    <View style={styles.roundWrap}>
      <Touchable
        feedback="button"
        haptic={tone === "neutral" ? "selection" : "medium"}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.round,
          big ? styles.roundBig : null,
          fill ? glowStyle(fill[1], 2) : active ? styles.roundActive : styles.roundGlass,
        ]}
      >
        {fill ? <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.roundFill]} /> : null}
        <Ionicons name={icon} size={big ? 30 : 24} color={iconColor} style={rotate ? styles.rotated : undefined} />
      </Touchable>
      <Text style={styles.roundLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const ROUND = 60;
const ROUND_BIG = 74;
const RING = AVATAR + 12;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.inkBlock },
  screen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: space.xxl,
  },
  hero: {
    alignItems: "center",
    gap: space.sm,
  },
  kickerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 26,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    marginBottom: space.xxl,
  },
  kicker: {
    ...type.overline,
    color: colors.onDark,
  },
  avatarStage: {
    width: RING + 80,
    height: RING + 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  wave: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gradientSignature[0],
  },
  waveCyan: { borderColor: colors.gradientSignature[1] },
  ringOuter: {
    width: RING,
    height: RING,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  ringFill: { borderRadius: radius.pill },
  ringGap: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkBlock,
  },
  name: {
    ...type.display,
    color: colors.onDark,
    textAlign: "center",
  },
  subtitle: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginTop: space.md,
    height: 34,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  statusPillActive: { borderColor: withAlpha(colors.liveOnDark, 0.5) },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.liveOnDark },
  status: {
    ...type.h3,
    color: colors.brandOnDark,
    textAlign: "center",
  },
  statusActive: {
    ...type.scoreSm,
    color: colors.liveOnDark,
  },
  error: {
    ...type.bodySm,
    color: colors.onDark,
    textAlign: "center",
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.danger, 0.35),
  },
  controls: {
    gap: space.xl,
    alignItems: "center",
  },
  dock: {
    flexDirection: "row",
    gap: space.xxxl,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: radius.xxl,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.huge + space.lg,
  },
  roundWrap: {
    alignItems: "center",
    gap: space.sm,
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  roundBig: { width: ROUND_BIG, height: ROUND_BIG },
  roundFill: { borderRadius: radius.pill },
  roundGlass: { backgroundColor: withAlpha(colors.onDark, 0.12), borderWidth: hairline, borderColor: colors.inkPillBorder },
  roundActive: { backgroundColor: colors.onDark },
  rotated: {
    transform: [{ rotate: "135deg" }],
  },
  roundLabel: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
});
