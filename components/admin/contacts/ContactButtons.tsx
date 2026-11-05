/**
 * ContactButtons — kişinin iletişim düğmeleri şeridi.
 *
 * İki yoğunluk:
 *   · "compact": liste satırında yalnız ikon (32px daire). Satıra dokunmak
 *     kartı açar; düğmeler kendi eylemini yapar (olay satıra taşmaz).
 *   · "large"  : kartın üstünde ikon + etiket; başparmakla rahat dokunulur.
 * Telefon yoksa ara/WhatsApp/SMS, e-posta yoksa e-posta, hesap yoksa mesaj
 * düğmesi hiç çizilmez — pasif düğme göstermek yerine yok sayılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import type { ContactActions } from "./useContactActions";

export interface ContactButtonsProps {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Uygulama içi mesaj için kullanıcı kimliği (hesabı varsa). */
  userId?: number | null;
  /** Yönetim hesabı mı (ekip sohbeti açılır). */
  staff?: boolean;
  actions: ContactActions;
  size?: "compact" | "large";
  /** Kopyala düğmesi (yalnız large). */
  copyable?: boolean;
  /** Yalnız bu düğmeler (liste satırında yer dar). */
  only?: ContactButtonKey[];
}

export type ContactButtonKey = "tel" | "wa" | "sms" | "mail" | "chat" | "copy";

type Item = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: "wa" | "brand"; busy?: boolean };

export function ContactButtons({ name, phone, email, userId, staff, actions, size = "compact", copyable, only }: ContactButtonsProps) {
  let items: Item[] = [];
  if (phone) {
    items.push({ key: "tel", icon: "call", label: "Ara", onPress: () => actions.call(phone) });
    items.push({ key: "wa", icon: "logo-whatsapp", label: "WhatsApp", onPress: () => actions.whatsapp(phone), tone: "wa" });
    items.push({ key: "sms", icon: "chatbox-ellipses-outline", label: "SMS", onPress: () => actions.sms(phone) });
  }
  if (email) items.push({ key: "mail", icon: "mail-outline", label: "E-posta", onPress: () => actions.email(email) });
  if (userId) {
    items.push({
      key: "chat",
      icon: "paper-plane-outline",
      label: "Mesaj",
      onPress: () => actions.message(userId, staff),
      tone: "brand",
      busy: actions.busy === `msg-${userId}`,
    });
  }
  if (copyable && size === "large" && (phone || email)) {
    items.push({ key: "copy", icon: "copy-outline", label: "Kopyala", onPress: () => actions.copy([phone, email].filter(Boolean).join("\n"), "İletişim bilgisi kopyalandı.") });
  }
  if (only) items = items.filter((item) => only.includes(item.key as ContactButtonKey));
  if (!items.length) {
    return size === "large" ? (
      <Text style={styles.none} {...textScale.dense}>
        İletişim bilgisi girilmemiş.
      </Text>
    ) : null;
  }

  return (
    <View style={[styles.row, size === "large" ? styles.rowLarge : null]}>
      {items.map((item) => {
        const fg = item.tone === "wa" ? colors.win : item.tone === "brand" ? colors.brandAccent : colors.textSecondary;
        const bg = item.tone === "wa" ? colors.winDim : item.tone === "brand" ? colors.brandDim : colors.surface3;
        return (
          <Touchable
            key={item.key}
            onPress={item.onPress}
            disabled={item.busy}
            accessibilityRole="button"
            accessibilityLabel={`${name}: ${item.label}`}
            hitSlop={size === "compact" ? 6 : undefined}
            style={size === "large" ? styles.large : null}
          >
            <View style={[size === "large" ? styles.iconLarge : styles.icon, { backgroundColor: bg }]}>
              {item.busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={item.icon} size={size === "large" ? 20 : 16} color={fg} />}
            </View>
            {size === "large" ? (
              <Text style={styles.label} numberOfLines={1} {...textScale.badge}>
                {item.label}
              </Text>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s },
  rowLarge: { justifyContent: "center", flexWrap: "wrap", gap: space.md },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: colors.border,
  },
  large: { alignItems: "center", gap: space.xs, minWidth: 56 },
  iconLarge: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  label: { ...type.micro, color: colors.textSecondary },
  none: { ...type.bodySm, color: colors.textTertiary, textAlign: "center" },
});
