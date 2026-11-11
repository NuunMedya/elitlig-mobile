/**
 * Stüdyo rayının ortak küçük parçaları (hep koyu RIG paleti, büyük dokunma
 * hedefleri). Yazılar `allowFontScaling={false}`: ray dar ve sabit ölçülüdür,
 * sistem yazı büyütmesi düğmeleri taşırır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";

export { Btn } from "./BroadcastPanel";

export type IconName = keyof typeof Ionicons.glyphMap;

export function GroupTitle({ children }: { children: string }) {
  return (
    <Text style={styles.groupTitle} numberOfLines={1} allowFontScaling={false}>
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.hint} allowFontScaling={false}>
      {children}
    </Text>
  );
}

export function Note({ text, icon = "information-circle", tone = "info" }: { text: string; icon?: IconName; tone?: "info" | "warn" | "ok" | "danger" }) {
  const fg = tone === "warn" ? RIG.warn : tone === "ok" ? RIG.ok : tone === "danger" ? RIG.live : RIG.brand;
  const bg = tone === "warn" ? RIG.warnDim : tone === "ok" ? RIG.okDim : tone === "danger" ? RIG.liveDim : RIG.brandDim;
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={15} color={fg} />
      <Text style={styles.noteText} allowFontScaling={false}>
        {text}
      </Text>
    </View>
  );
}

/** Tek seçimli satır (radyo). */
export function OptionRow({
  title,
  hint,
  selected,
  onPress,
  disabled,
}: {
  title: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Touchable
      style={[styles.option, selected && styles.optionOn, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={title}
      accessibilityState={{ selected, disabled }}
      haptic="selection"
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={16} color={selected ? RIG.brand : RIG.textMute} />
      <View style={styles.flex}>
        <Text style={styles.optionTitle} allowFontScaling={false}>
          {title}
        </Text>
        {hint ? (
          <Text style={styles.hint} allowFontScaling={false}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

/** Aç / kapa satırı. */
export function ToggleRow({
  title,
  hint,
  icon,
  value,
  onChange,
  disabled,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Touchable
      style={[styles.option, disabled && styles.disabled]}
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityLabel={title}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      haptic="selection"
    >
      {icon ? <Ionicons name={icon} size={16} color={value ? RIG.text : RIG.textMute} /> : null}
      <View style={styles.flex}>
        <Text style={styles.optionTitle} allowFontScaling={false}>
          {title}
        </Text>
        {hint ? (
          <Text style={styles.hint} allowFontScaling={false}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Touchable>
  );
}

/** Yan yana eşit çipler (2–6 seçenek). */
export function SegRow<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Ekran okuyucu için grup adı. */
  label: string;
}) {
  return (
    <View style={styles.segRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={String(o.value)}
            style={[styles.seg, on && styles.segOn, disabled && styles.disabled]}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: on, disabled }}
            haptic="selection"
          >
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1} allowFontScaling={false}>
              {o.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** Yuvarlak ikon düğmesi (44 px dokunma hedefi). */
export function RoundIcon({
  icon,
  label,
  onPress,
  color,
  small,
  disabled,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  small?: boolean;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Touchable
      style={[styles.round, small && styles.roundSmall, active && styles.roundOn, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      haptic="selection"
      hitSlop={small ? 6 : 0}
    >
      <Ionicons name={icon} size={small ? 16 : 20} color={color ?? RIG.text} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.4 },
  groupTitle: { ...type.micro, color: RIG.textMute, marginTop: space.xs },
  hint: { ...type.caption, color: RIG.textMute },
  note: { flexDirection: "row", gap: space.sm, padding: space.sm, borderRadius: radius.md },
  noteText: { ...type.caption, color: RIG.text, flex: 1 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  optionOn: { backgroundColor: RIG.brandDim },
  optionTitle: { ...type.label, color: RIG.text },
  switch: { width: 38, height: 22, borderRadius: radius.pill, padding: space.xxs, backgroundColor: RIG.panelStrong, justifyContent: "center" },
  switchOn: { backgroundColor: RIG.brand },
  knob: { width: 18, height: 18, borderRadius: radius.pill, backgroundColor: RIG.textSoft },
  knobOn: { alignSelf: "flex-end", backgroundColor: RIG.text },
  segRow: { flexDirection: "row", gap: space.xs },
  seg: { flex: 1, minHeight: 36, paddingHorizontal: space.xs, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
  segOn: { backgroundColor: RIG.brand },
  segText: { ...type.caption, color: RIG.textSoft },
  segTextOn: { color: RIG.text },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
  roundSmall: { width: 34, height: 34 },
  roundOn: { backgroundColor: RIG.brand },
});
