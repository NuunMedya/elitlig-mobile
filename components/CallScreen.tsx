/**
 * ARAMA KATMANI — gelen/giden/aktif sesli arama ekranı.
 *
 * Kökte (app/_layout.tsx) Stack'in dışında bir kez mount edilir; arama
 * durumu `idle` değilken tam ekran bir Modal olarak her ekranın üstüne çıkar.
 * Böylece kullanıcı hangi sayfada olursa olsun gelen aramayı görür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Touchable, withAlpha } from "@/components/ui";
import { useCall, type CallStatus } from "@/providers/CallProvider";
import { colors, radius, space, textScale, type } from "@/theme";

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

export function CallScreen() {
  const call = useCall();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (call.status !== "active") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [call.status]);

  if (call.status === "idle") return null;

  const name = call.remote?.name ?? "Üye";
  const subtitle = call.remote?.subtitle ?? "Üye";
  const statusText =
    call.status === "active" && call.startedAt
      ? formatDuration(now - call.startedAt)
      : call.status === "ended"
        ? call.endedLabel || STATUS_TEXT.ended
        : STATUS_TEXT[call.status];

  const showAccept = call.status === "incoming";
  const showHangup = call.status !== "ended";
  const showControls = call.status === "active" || call.status === "connecting";

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <LinearGradient colors={colors.gradientInk} start={GRADIENT_START} end={GRADIENT_END} style={styles.fill}>
        <View style={[styles.screen, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }]}>
          <View style={styles.hero}>
            <Text style={styles.kicker} {...textScale.dense}>
              {call.status === "incoming" ? "ELİTLİG SESLİ ARAMA" : "SESLİ ARAMA"}
            </Text>
            <View style={styles.avatarWrap}>
              <Avatar name={name} image={call.remote?.avatar ?? null} size={112} ring={call.status === "active" ? "live" : "brand"} onPitch />
            </View>
            <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
              {name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
              {subtitle}
            </Text>
            <Text style={[styles.status, call.status === "active" ? styles.statusActive : null]} {...textScale.dense}>
              {statusText}
            </Text>
            {call.error && call.status !== "ended" ? (
              <Text style={styles.error} {...textScale.long}>
                {call.error}
              </Text>
            ) : null}
          </View>

          <View style={styles.controls}>
            {showControls ? (
              <View style={styles.row}>
                <RoundButton
                  icon={call.muted ? "mic-off" : "mic"}
                  label={call.muted ? "Sesi aç" : "Sessiz"}
                  active={call.muted}
                  onPress={call.toggleMute}
                />
                <RoundButton
                  icon={call.speaker ? "volume-high" : "volume-medium"}
                  label="Hoparlör"
                  active={call.speaker}
                  onPress={call.toggleSpeaker}
                />
              </View>
            ) : null}
            <View style={styles.row}>
              {showHangup ? (
                <RoundButton
                  icon="call"
                  label={call.status === "incoming" ? "Reddet" : call.status === "active" ? "Bitir" : "İptal"}
                  tone="danger"
                  rotate
                  onPress={call.status === "incoming" ? call.rejectCall : call.endCall}
                />
              ) : null}
              {showAccept ? <RoundButton icon="call" label="Kabul et" tone="accept" onPress={call.acceptCall} /> : null}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Modal>
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
  const background =
    tone === "danger" ? colors.danger : tone === "accept" ? colors.win : active ? colors.onDark : withAlpha(colors.onDark, 0.16);
  const iconColor = tone === "neutral" && active ? colors.inkBlock : colors.onDark;
  return (
    <View style={styles.roundWrap}>
      <Touchable
        feedback="button"
        haptic={tone === "neutral" ? "selection" : "medium"}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.round, { backgroundColor: background }]}
      >
        <Ionicons name={icon} size={28} color={iconColor} style={rotate ? styles.rotated : undefined} />
      </Touchable>
      <Text style={styles.roundLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const ROUND = 68;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: space.xxl,
  },
  hero: {
    alignItems: "center",
    gap: space.sm,
  },
  kicker: {
    ...type.overline,
    color: colors.onDarkMuted,
    letterSpacing: 1.5,
    marginBottom: space.lg,
  },
  avatarWrap: {
    marginBottom: space.md,
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
  status: {
    ...type.h3,
    color: colors.brandOnDark,
    marginTop: space.md,
    textAlign: "center",
  },
  statusActive: {
    color: colors.liveOnDark,
    fontVariant: ["tabular-nums"],
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
    gap: space.xxl,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.huge,
  },
  roundWrap: {
    alignItems: "center",
    gap: space.sm,
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rotated: {
    transform: [{ rotate: "135deg" }],
  },
  roundLabel: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
});
