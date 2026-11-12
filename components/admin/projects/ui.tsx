/**
 * Projeler aracının küçük ortak parçaları: ilerleme çubuğu, renk noktası,
 * renkli hap, iletişim düğmeleri (tek dokunuş ara / WhatsApp / e-posta),
 * liste düzenleyici, odak kaybında kaydeden alan ve CSV paylaşımı.
 *
 * Renkler veri olarak gelir (aşama / durum rengi, lib/admin/projectUtils);
 * zemin tonları withAlpha ile o renkten türetilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { Linking, Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Chip, ChipGroup, GradientBar, Input, Touchable, withAlpha, type InputProps } from "@/components/ui";
import { mailHref, prettyPhone, telHref, waHref } from "@/lib/admin/projectUtils";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

/* ------------------------------- bağlantı aç ------------------------------- */

/** tel:, mailto:, https://wa.me/ … — açılamazsa sessizce false döner. */
export async function openUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** CSV metnini paylaşım sayfasıyla gönderir (Dosyalar'a kaydet, e-posta, WhatsApp…). */
export async function shareCsv(title: string, csv: string) {
  try {
    await Share.share({ title, message: csv });
  } catch {
    /* kullanıcı vazgeçti */
  }
}

/* --------------------------------- görsel --------------------------------- */

export function ProgressBar({ value, color, thin, style }: { value: number; color?: string | null; thin?: boolean; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const c = color || colors.brand;
  return (
    <View style={style} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      {/* Gece teması: proje renginde degrade, yaylı dolum (GradientBar). */}
      <GradientBar value={pct / 100} height={thin ? 5 : 8} gradient={[withAlpha(c, 0.55), c]} />
    </View>
  );
}

export function Dot({ color, size = 10 }: { color?: string | null; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: color || colors.textTertiary }} />;
}

/** Renkli hap (aşama, durum): zemin rengin %14'ü, metin rengin kendisi. */
export function Pill({ label, color, icon }: { label: string; color?: string | null; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = color || colors.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(c, 0.14), borderColor: withAlpha(c, 0.35) }]}>
      {icon ? <Ionicons name={icon} size={12} color={c} /> : null}
      <Text style={[styles.pillText, { color: c }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/** Küçük gri bilgi satırı. */
export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.muted} {...textScale.long}>
        {children}
      </Text>
    </View>
  );
}

/** Bölüm başlığı (alt sayfa içinde). */
export function SubHead({ icon, title, count, right }: { icon?: keyof typeof Ionicons.glyphMap; title: string; count?: number; right?: React.ReactNode }) {
  return (
    <View style={styles.subhead}>
      <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.subheadRail} />
      {icon ? <Ionicons name={icon} size={14} color={colors.textSecondary} /> : null}
      <Text style={styles.subheadText} accessibilityRole="header" {...textScale.dense}>
        {upperTR(title)}
      </Text>
      {count != null ? (
        <View style={styles.subheadCountBox}>
          <Text style={styles.subheadCount} {...textScale.badge}>
            {count}
          </Text>
        </View>
      ) : null}
      <View style={styles.flex} />
      {right}
    </View>
  );
}

/* ------------------------------- iletişim ------------------------------- */

function IconAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "win" | "brand" | "neutral";
}) {
  const fg = tone === "win" ? colors.win : tone === "brand" ? colors.brandAccent : colors.textSecondary;
  const bg = tone === "win" ? colors.winDim : tone === "brand" ? colors.brandDim : colors.surface3;
  return (
    <Touchable
      feedback="icon"
      haptic="light"
      onPress={onPress}
      style={[styles.iconAct, { backgroundColor: bg }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={icon} size={18} color={fg} />
    </Touchable>
  );
}

/** Satır içi küçük düğmeler: Ara · WhatsApp · E-posta (olanlar). */
export function ContactActions({ phone, email, name }: { phone?: string | null; email?: string | null; name?: string }) {
  const tel = telHref(phone);
  const wa = waHref(phone);
  const mail = mailHref(email);
  if (!tel && !mail) return null;
  return (
    <View style={styles.actRow}>
      {tel ? <IconAction icon="call" label={`Ara: ${name || prettyPhone(phone)}`} tone="brand" onPress={() => void openUrl(tel)} /> : null}
      {wa ? <IconAction icon="logo-whatsapp" label={`WhatsApp: ${name || prettyPhone(phone)}`} tone="win" onPress={() => void openUrl(wa)} /> : null}
      {mail ? <IconAction icon="mail-outline" label={`E-posta: ${email}`} onPress={() => void openUrl(mail)} /> : null}
    </View>
  );
}

/** Kişi kartının üstündeki büyük üç düğme. */
export function ContactBar({ phone, email }: { phone?: string | null; email?: string | null }) {
  const items: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; url: string | null; tone: "brand" | "win" | "neutral" }[] = [
    { key: "tel", icon: "call", label: "Ara", sub: phone ? prettyPhone(phone) : "telefon yok", url: telHref(phone), tone: "brand" },
    { key: "wa", icon: "logo-whatsapp", label: "WhatsApp", sub: phone ? "mesaj yaz" : "telefon yok", url: waHref(phone), tone: "win" },
    { key: "mail", icon: "mail-outline", label: "E-posta", sub: email || "adres yok", url: mailHref(email), tone: "neutral" },
  ];
  return (
    <View style={styles.bigRow}>
      {items.map((it) => {
        const fg = !it.url ? colors.textDisabled : it.tone === "win" ? colors.win : it.tone === "brand" ? colors.brandAccent : colors.textSecondary;
        const bg = !it.url ? colors.surface2 : it.tone === "win" ? colors.winDim : it.tone === "brand" ? colors.brandDim : colors.surface3;
        return (
          <Touchable
            key={it.key}
            feedback="card"
            haptic="light"
            disabled={!it.url}
            onPress={() => void openUrl(it.url)}
            style={[styles.bigAct, { backgroundColor: bg }]}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}: ${it.sub}`}
          >
            <Ionicons name={it.icon} size={22} color={fg} />
            <Text style={[styles.bigLabel, { color: fg }]} {...textScale.dense}>
              {it.label}
            </Text>
            <Text style={styles.bigSub} numberOfLines={1} {...textScale.badge}>
              {it.sub}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/* -------------------------------- alanlar -------------------------------- */

/**
 * Odak kaybında kaydeden metin alanı (web SaveOnBlur): değer değişmediyse
 * sunucuya gitmez; dışarıdan gelen değer değişince taslak tazelenir.
 */
export function SaveOnBlurInput({
  value,
  onSave,
  ...rest
}: Omit<InputProps, "value" | "onChangeText" | "onBlur"> & { value: string | null | undefined; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <Input
      {...rest}
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        if ((draft ?? "") !== (value ?? "")) onSave(draft);
      }}
    />
  );
}

/** Metin listesi düzenleyici: çipler (dokun = kaldır) + ekleme alanı. */
export function ListEditor({
  items,
  onChange,
  disabled,
  placeholder = "Ekle…",
  upper,
  max = 30,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  upper?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    let v = draft.trim();
    if (upper) v = v.toLocaleUpperCase("tr-TR");
    if (!v || items.includes(v) || items.length >= max) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <View style={styles.listEd}>
      {items.length ? (
        <ChipGroup scrollable={false} contentPadding={0}>
          {items.map((it) => (
            <Chip
              key={it}
              label={it}
              size="sm"
              onDismiss={disabled ? undefined : () => onChange(items.filter((x) => x !== it))}
            />
          ))}
        </ChipGroup>
      ) : (
        <Text style={styles.muted} {...textScale.dense}>
          Liste boş.
        </Text>
      )}
      {!disabled ? (
        <Input
          size="sm"
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          returnKeyType="done"
          onSubmitEditing={add}
          blurOnSubmit={false}
          trailing={
            draft.trim() ? (
              <Touchable feedback="icon" onPress={add} accessibilityRole="button" accessibilityLabel="Ekle" hitSlop={8}>
                <Ionicons name="add-circle" size={22} color={colors.brandAccent} />
              </Touchable>
            ) : null
          }
        />
      ) : null}
    </View>
  );
}

/** "Daha fazla göster" — uzun listeleri parça parça çizer. */
export function useChunk<T>(items: T[], size = 40) {
  const [limit, setLimit] = useState(size);
  useEffect(() => setLimit(size), [items.length, size]);
  return { shown: items.slice(0, limit), more: items.length > limit ? items.length - limit : 0, showMore: () => setLimit((l) => l + size) };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
  },
  pillText: { ...type.labelXs },
  muted: { ...type.bodySm, color: colors.textTertiary },
  subhead: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.lg, marginBottom: space.xs },
  subheadRail: { width: 3, height: 14, borderRadius: radius.pill },
  subheadText: { ...type.overline, color: colors.textSecondary },
  subheadCountBox: { minWidth: 20, height: 18, paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  subheadCount: { ...type.numSmStrong, color: colors.textSecondary },
  actRow: { flexDirection: "row", gap: space.s },
  iconAct: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  bigRow: { flexDirection: "row", gap: space.sm },
  bigAct: { flex: 1, alignItems: "center", gap: space.xxs, paddingVertical: space.md, borderRadius: radius.lg },
  bigLabel: { ...type.label },
  bigSub: { ...type.meta, color: colors.textTertiary },
  listEd: { gap: space.sm },
});
