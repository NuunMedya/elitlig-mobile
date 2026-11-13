/**
 * PAYLAŞIM STÜDYOSU — her sayfanın "paylaş" kapısı.
 *
 * NE: tam ekran pencere. Üstte canlı ÖNİZLEME (ekrana sığan ölçekte), altında
 * denetimler: boy (Story 1080×1920 · Post 1080×1350), görsel teması (Gece ·
 * Neon · Gündüz), tasarım seçici (yatay kaydırmalı küçük önizlemeler),
 * sayfaya özgü ayar yuvası (sıra aralığı, ölçüt, gün…) ve "Kaydet / Paylaş".
 *
 * TAM ÇÖZÜNÜRLÜK: önizleme ölçeklenmiş bir KOPYADIR; yakalanan şey ondan
 * ayrı, ekranın arkasında duran görünmez bir kaptır. O kap 1080 px ÷
 * PixelRatio genişliğinde çizilir (3x telefonda 360 dp) — yani cihazın
 * gerçek pikselleriyle tam 1080 px; `captureRef` `width/height` ile çıktıyı
 * kesin 1080 × 1920 / 1080 × 1350'ye sabitler. Şablonlar tasarım birimiyle
 * çizildiği için (bkz. lib/share/canvas.ts) iki kap birebir aynı düzendedir.
 *
 * KAYDET / PAYLAŞ: cihazın yerel paylaşım sayfası açılır — "Görüntüyü
 * Kaydet" galeriye indirir; Instagram, WhatsApp vb. doğrudan alır. Web
 * önizlemesinde PNG dosyası indirilir (bkz. lib/share/capture.ts).
 *
 * KAPSAM: stüdyo veri bilmez; sayfa ona şablon listesini (`templates`) ve
 * varsa ayar bileşenini (`setup`) verir. Sayfa girişleri
 * `components/share/*Share.tsx` dosyalarındadır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { Aurora, Button, SegmentedControl, Touchable } from "@/components/ui";
import { SHARE_FORMATS, type ShareFormat } from "@/lib/share/canvas";
import { captureAndShare, shareFileName } from "@/lib/share/capture";
import { SHARE_THEMES, shareTheme, type ShareThemeKey } from "@/lib/share/palette";
import { colors, fonts, glowStyle, hairline, layout, radius, space, textScale, type } from "@/theme";
import { makeFrame, type ShareTemplateDef } from "./canvas/types";

export interface ShareStudioProps {
  visible: boolean;
  onClose: () => void;
  /** Başlık: "Maç sonucu", "Puan durumu"… */
  title: string;
  /** Başlık altı bağlam: "Saint Diriliş – Haymana · FREELİG". */
  subtitle?: string | null;
  templates: ShareTemplateDef[];
  /** Dosya adının parçaları ("mac-sonucu", 11192). */
  fileParts: (string | number | null | undefined)[];
  /** Sayfaya özgü ayar (aralık sorusu, ölçüt, gün seçimi). */
  setup?: React.ReactNode;
  /** Veri henüz yok: önizleme yerine bekleme / boş durum. */
  status?: { kind: "loading" } | { kind: "empty"; message: string } | null;
  /** Başlangıç teması ("neon" maç sonu kutlaması gibi). */
  initialTheme?: ShareThemeKey;
}

const FORMAT_ITEMS = (Object.keys(SHARE_FORMATS) as ShareFormat[]).map((key) => ({
  key,
  label: key === "story" ? "Story 9:16" : "Post 4:5",
}));

/** Küçük resim genişliği (dp). */
const THUMB_W = 62;

export function ShareStudio({
  visible,
  onClose,
  title,
  subtitle,
  templates,
  fileParts,
  setup,
  status,
  initialTheme = "gece",
}: ShareStudioProps) {
  const insets = useSafeAreaInsets();
  const [fmt, setFmt] = useState<ShareFormat>("story");
  const [themeKey, setThemeKey] = useState<ShareThemeKey>(initialTheme);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const shotRef = useRef<View>(null);

  const theme = shareTheme(themeKey);
  const active = templates.find((item) => item.key === pickedKey) ?? templates[0] ?? null;

  // Şablon listesi değişirse (veri geldi, ayar değişti) seçim geçerli kalsın.
  useEffect(() => {
    if (pickedKey && !templates.some((item) => item.key === pickedKey)) setPickedKey(null);
  }, [pickedKey, templates]);

  useEffect(() => {
    if (!visible) setNote(null);
  }, [visible]);

  const [uw, uh] = SHARE_FORMATS[fmt].units;
  const preview = useMemo(() => {
    if (!area) return null;
    const maxW = area.w - layout.screenPadding * 2;
    const maxH = area.h - space.lg * 2;
    const width = Math.max(120, Math.min(maxW, (maxH * uw) / uh));
    return makeFrame(fmt, Math.floor(width), theme);
  }, [area, fmt, theme, uh, uw]);

  /* Yakalama kabı: cihazın gerçek pikselleriyle 1080 genişlik. */
  const captureFrame = useMemo(() => makeFrame(fmt, SHARE_FORMATS[fmt].px[0] / PixelRatio.get(), theme), [fmt, theme]);
  const thumbFrame = useMemo(() => makeFrame(fmt, THUMB_W, theme), [fmt, theme]);

  const onArea = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!area || Math.abs(area.w - width) > 1 || Math.abs(area.h - height) > 1) setArea({ w: width, h: height });
  };

  const save = async () => {
    if (!active || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const outcome = await captureAndShare(shotRef, fmt, shareFileName(...fileParts, active.key, fmt));
      if (outcome === "downloaded") setNote({ tone: "ok", text: "PNG indirildi." });
      else if (outcome === "unavailable") setNote({ tone: "err", text: "Bu cihazda paylaşım menüsü açılamadı." });
    } catch (error) {
      if (__DEV__) console.warn("Paylaşım görseli oluşturulamadı", error);
      setNote({ tone: "err", text: "Görsel oluşturulamadı. Görseller yüklendikten sonra yeniden dene." });
    } finally {
      setBusy(false);
    }
  };

  const ready = !status && active;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {/* YAKALAMA KABI — perdenin arkasında, ekranda görünmez. */}
        {visible && ready ? (
          <View style={styles.captureHost} pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <View
              ref={shotRef}
              collapsable={false}
              style={{ width: captureFrame.W, height: captureFrame.H, overflow: "hidden", backgroundColor: theme.bgBottom }}
            >
              {active.render(captureFrame)}
            </View>
          </View>
        ) : null}

        <View style={[styles.cover, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <Touchable
              feedback="icon"
              haptic="light"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={styles.closeBtn}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Touchable>
            <View style={styles.titleBox}>
              <Text style={styles.overline} {...textScale.badge}>
                PAYLAŞIM STÜDYOSU
              </Text>
              <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.sizeTag}>
              <Text style={styles.sizeTagText} {...textScale.badge}>
                {SHARE_FORMATS[fmt].px.join("×")}
              </Text>
            </View>
          </View>

          {/* ÖNİZLEME */}
          <View style={styles.previewArea} onLayout={onArea}>
            <Aurora variant="header" style={StyleSheet.absoluteFill} />
            {status?.kind === "loading" ? (
              <ActivityIndicator color={colors.brand} />
            ) : status?.kind === "empty" ? (
              <View style={styles.emptyBox}>
                <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
                <Text style={styles.emptyText} {...textScale.dense}>
                  {status.message}
                </Text>
              </View>
            ) : preview && active ? (
              <View
                style={[styles.previewFrame, { width: preview.W, height: preview.H }, glowStyle(colors.glow, 2)]}
                accessibilityRole="image"
                accessibilityLabel={`${active.label} önizlemesi`}
              >
                <View style={{ width: preview.W, height: preview.H, overflow: "hidden", borderRadius: radius.md }}>
                  {active.render(preview)}
                </View>
              </View>
            ) : null}
          </View>

          {/* DENETİMLER */}
          <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
            <View style={styles.row}>
              <SegmentedControl items={FORMAT_ITEMS} value={fmt} onChange={setFmt} size="sm" style={styles.flex} />
              <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Görsel teması">
                {SHARE_THEMES.map((item) => (
                  <Swatch
                    key={item.key}
                    colors={item.swatch}
                    label={item.label}
                    selected={item.key === themeKey}
                    onPress={() => setThemeKey(item.key)}
                  />
                ))}
              </View>
            </View>

            {templates.length > 0 && !status ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                style={styles.railScroll}
              >
                {templates.map((item) => {
                  const selected = item.key === active?.key;
                  return (
                    <Touchable
                      key={item.key}
                      feedback="chip"
                      haptic="selection"
                      onPress={() => setPickedKey(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Tasarım: ${item.label}`}
                      style={styles.thumbCell}
                    >
                      <View style={[styles.thumb, selected ? styles.thumbOn : null]}>
                        <View style={{ width: thumbFrame.W, height: thumbFrame.H, overflow: "hidden", borderRadius: radius.xs }}>
                          {item.render(thumbFrame)}
                        </View>
                      </View>
                      <Text
                        style={[styles.thumbLabel, selected ? styles.thumbLabelOn : null]}
                        numberOfLines={1}
                        {...textScale.badge}
                      >
                        {item.label}
                      </Text>
                    </Touchable>
                  );
                })}
              </ScrollView>
            ) : null}

            {setup ? <View style={styles.setup}>{setup}</View> : null}

            <Button
              label={busy ? "Hazırlanıyor…" : "Kaydet / Paylaş"}
              icon="download-outline"
              size="lg"
              fullWidth
              loading={busy}
              disabled={!ready}
              onPress={save}
              accessibilityHint="Görseli tam çözünürlükte oluşturur ve paylaşım menüsünü açar"
            />
            <Text style={[styles.hint, note?.tone === "err" ? styles.hintErr : null]} {...textScale.dense}>
              {note?.text ??
                (Platform.OS === "web"
                  ? "Görsel 1080 px PNG olarak indirilir."
                  : "Menüden “Görüntüyü kaydet” ile galeriye indir ya da Instagram’a gönder.")}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Görsel teması noktası: iki renkli degrade daire; seçiliyse mor halka. */
function Swatch({
  colors: pair,
  label,
  selected,
  onPress,
}: {
  colors: readonly [string, string];
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const id = useMemo(() => `sw${label.replace(/\W/g, "")}${Math.random().toString(36).slice(2, 7)}`, [label]);
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} teması`}
      style={[styles.swatch, selected ? styles.swatchOn : null]}
      hitSlop={6}
    >
      <Svg width={SWATCH} height={SWATCH}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={pair[0]} />
            <Stop offset="1" stopColor={pair[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={SWATCH / 2} cy={SWATCH / 2} r={SWATCH / 2} fill={`url(#${id})`} />
      </Svg>
    </Touchable>
  );
}

const SWATCH = 22;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  captureHost: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  /* Perde: yakalama kabının ÜSTÜNDE opak zemin. */
  cover: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  titleBox: {
    flex: 1,
  },
  overline: {
    ...type.overline,
    color: colors.brandAccent,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.caption,
    color: colors.textTertiary,
  },
  sizeTag: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
  },
  sizeTagText: {
    ...type.nano,
    color: colors.accentText,
  },
  previewArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewFrame: {
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface1,
  },
  emptyBox: {
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.huge,
  },
  emptyText: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  panel: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  swatches: {
    flexDirection: "row",
    gap: space.s,
  },
  swatch: {
    padding: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchOn: {
    borderColor: colors.brand,
  },
  railScroll: {
    marginHorizontal: -layout.screenPadding,
  },
  rail: {
    paddingHorizontal: layout.screenPadding,
    gap: space.md,
  },
  thumbCell: {
    alignItems: "center",
    gap: space.xs,
  },
  thumb: {
    padding: space.xxs,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  thumbOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandDim,
  },
  thumbLabel: {
    ...type.meta,
    color: colors.textTertiary,
    maxWidth: THUMB_W + 12,
  },
  thumbLabelOn: {
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
  setup: {
    gap: space.sm,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  hintErr: {
    color: colors.danger,
  },
});


