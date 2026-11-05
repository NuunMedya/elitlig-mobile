/**
 * BodyEditor — haber gövdesi düzenleyicisi.
 *
 * NE: web'deki zengin metin düzenleyicisinin (RichTextEditor) mobil karşılığı.
 * İki kip:
 *   METİN  düz yazım; boş satır paragraf, "## " ara başlık, **kalın**,
 *          _italik_, [görsel](adres). Kayıtta HTML'e çevrilir (lib/api/admin/news).
 *   HTML   ham HTML; web'de tablo, bağlantı, liste gibi biçim verilmiş
 *          haberler bu kipte açılır ki mobilden kaydetmek biçimi bozmasın.
 * Araç şeridi imlecin bulunduğu yere ara başlık, kalın ve görsel ekler; görsel
 * galeriden seçilip /api/news/admin/images'a yüklenir.
 */

import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { FieldLabel } from "@/components/admin";
import { Button, SegmentedControl, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { pickAndUpload } from "./NewsParts";

export type BodyMode = "text" | "html";

export function BodyEditor({
  mode,
  onModeChange,
  value,
  onChange,
  modeLocked,
}: {
  mode: BodyMode;
  onModeChange: (mode: BodyMode) => void;
  value: string;
  onChange: (value: string) => void;
  /** Gövde basit HTML değilse metin kipine geçilemez. */
  modeLocked?: boolean;
}) {
  const toast = useToast();
  const selection = useRef({ start: value.length, end: value.length });
  const [uploading, setUploading] = useState(false);

  const insert = (before: string, after = "") => {
    const { start, end } = selection.current;
    const s = Math.min(start, value.length);
    const e = Math.min(end, value.length);
    const picked = value.slice(s, e);
    onChange(`${value.slice(0, s)}${before}${picked}${after}${value.slice(e)}`);
  };

  const addImage = async () => {
    setUploading(true);
    try {
      const url = await pickAndUpload();
      if (!url) return;
      insert(mode === "html" ? `<p><img src="${url}" alt=""></p>` : `\n\n[görsel](${url})\n\n`);
    } catch (e) {
      toast.show({ message: errorText(e, "Görsel yüklenemedi."), tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <FieldLabel label="İçerik" required />
        <SegmentedControl<BodyMode>
          items={[
            { key: "text", label: "Metin" },
            { key: "html", label: "HTML" },
          ]}
          value={mode}
          onChange={(next) => {
            if (next === "text" && modeLocked) {
              toast.show({ message: "Bu haberde web'de verilmiş biçimler var; biçim kaybolmasın diye HTML kipinde düzenlenir.", tone: "neutral" });
              return;
            }
            onModeChange(next);
          }}
          stretch={false}
          size="sm"
        />
      </View>
      <View style={styles.toolbar}>
        <Button label="Başlık" icon="text-outline" size="sm" variant="ghost" onPress={() => insert(mode === "html" ? "<h2>" : "\n\n## ", mode === "html" ? "</h2>" : "\n\n")} />
        <Button label="Kalın" size="sm" variant="ghost" onPress={() => insert(mode === "html" ? "<strong>" : "**", mode === "html" ? "</strong>" : "**")} />
        <Button label="Görsel" icon="image-outline" size="sm" variant="ghost" loading={uploading} onPress={addImage} />
      </View>
      <TextInput
        style={[styles.input, mode === "html" ? styles.mono : null]}
        value={value}
        onChangeText={onChange}
        onSelectionChange={(event) => {
          selection.current = event.nativeEvent.selection;
        }}
        multiline
        textAlignVertical="top"
        placeholder={mode === "html" ? "<p>Haber metni…</p>" : "Haber metnini yaz. Paragrafları boş satırla ayır."}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize={mode === "html" ? "none" : "sentences"}
        autoCorrect={mode === "text"}
        scrollEnabled={false}
        accessibilityLabel="Haber içeriği"
      />
      <Text style={styles.hint} {...textScale.dense}>
        {mode === "text"
          ? "Boş satır yeni paragraf açar. ## ara başlık, **kalın**, _italik_ yazar."
          : "Ham HTML kaydedilir; sunucu güvenli olmayan etiketleri temizler."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  toolbar: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  input: {
    ...type.body,
    color: colors.textPrimary,
    minHeight: 220,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  mono: { ...type.bodySm },
  hint: { ...type.caption, color: colors.textTertiary },
});
