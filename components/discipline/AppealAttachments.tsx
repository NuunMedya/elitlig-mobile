/**
 * AppealAttachments — itiraz ekleri listesi (bağlantı, fotoğraf, video, belge).
 *
 * Takımın başvuru ekranında (form + başvurularım) ve yönetimdeki karar
 * sayfasında kullanılır. Satıra dokununca ek uygulama içi tarayıcıda açılır;
 * `onRemove` verilirse (form) satırın sonunda kaldırma düğmesi çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import type { AppealAttachment } from "@/lib/api/panel";
import { openLink } from "@/lib/links";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

const META: Record<AppealAttachment["type"], { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  link: { icon: "link", label: "Bağlantı" },
  image: { icon: "image", label: "Fotoğraf" },
  video: { icon: "videocam", label: "Video" },
  document: { icon: "document-text", label: "Belge" },
};

const shortUrl = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

export function AppealAttachments({ items, onRemove }: { items: AppealAttachment[]; onRemove?: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const meta = META[item.type] ?? META.link;
        const title = item.name || shortUrl(item.url);
        return (
          <View key={`${item.url}-${index}`} style={styles.row}>
            <Touchable
              onPress={() => void openLink(item.url)}
              accessibilityRole="link"
              accessibilityLabel={`${meta.label}: ${title}`}
              style={styles.open}
            >
              <Ionicons name={meta.icon} size={18} color={colors.textSecondary} />
              <View style={styles.texts}>
                <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                  {title}
                </Text>
                <Text style={styles.kind} {...textScale.dense}>
                  {meta.label}
                </Text>
              </View>
            </Touchable>
            {onRemove ? (
              <Touchable onPress={() => onRemove(index)} hitSlop={touchSlop(18)} accessibilityRole="button" accessibilityLabel={`${title} ekini kaldır`} style={styles.remove}>
                <Ionicons name="close" size={18} color={colors.textTertiary} />
              </Touchable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs, alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  open: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md },
  texts: { flex: 1, minWidth: 0 },
  title: { ...type.label, color: colors.textPrimary },
  kind: { ...type.caption, color: colors.textTertiary },
  remove: { paddingHorizontal: space.md, paddingVertical: space.sm },
});
