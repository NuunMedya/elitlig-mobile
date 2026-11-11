/**
 * FOTOĞRAF GÖRÜNTÜLEYİCİ — tam ekran, yatay kaydırmayla sohbetteki diğer
 * fotoğraflara geçilir (masaüstü Lightbox). iOS'ta iki parmakla yakınlaştırma
 * ScrollView'ın yerleşik zoom'uyla çalışır; Android'de ScrollView zoom
 * desteklemediği için fotoğraf ekrana sığdırılmış gösterilir.
 * Altta gönderen · saat ve açıklama; üstte kapat, yanıtla, ilet ve tarayıcıda aç.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Linking, Modal, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Touchable } from "@/components/ui";
import { chatPalette } from "@/lib/chatPalette";
import { clockTime, dayLabel } from "@/lib/chatUtils";
import { space, textScale, type } from "@/theme";

export interface ViewerImage {
  key: string;
  uri: string;
  caption?: string | null;
  sender?: string | null;
  created_at?: string | null;
  /** Sohbetteki mesaj kimliği (yanıtla / ilet için). */
  messageId?: number;
}

export interface ImageViewerProps {
  images: ViewerImage[];
  /** Açılacak karenin sırası; null = kapalı. */
  index: number | null;
  onClose: () => void;
  onReply?: (image: ViewerImage) => void;
  onForward?: (image: ViewerImage) => void;
}

const Page = memo(function Page({ image, width, height }: { image: ViewerImage; width: number; height: number }) {
  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={styles.page}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bouncesZoom
    >
      <Image source={{ uri: image.uri }} style={{ width, height }} resizeMode="contain" accessibilityLabel={image.caption ? `Fotoğraf: ${image.caption}` : "Fotoğraf"} />
    </ScrollView>
  );
});

export function ImageViewer({ images, index, onClose, onReply, onForward }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ViewerImage>>(null);
  const [current, setCurrent] = useState(index ?? 0);
  const visible = index != null && images.length > 0;

  useEffect(() => {
    if (index != null) setCurrent(Math.min(index, Math.max(0, images.length - 1)));
  }, [images.length, index]);

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width))),
    [width],
  );
  const getItemLayout = useCallback((_data: unknown, i: number) => ({ length: width, offset: width * i, index: i }), [width]);
  const renderItem = useCallback(({ item }: { item: ViewerImage }) => <Page image={item} width={width} height={height} />, [height, width]);

  const image = images[Math.min(current, images.length - 1)];
  if (!visible || !image) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.screen}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          initialScrollIndex={Math.min(index ?? 0, images.length - 1)}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onScrollEnd}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
        />
        <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
          <Touchable feedback="icon" haptic="light" onPress={onClose} accessibilityRole="button" accessibilityLabel="Fotoğrafı kapat" style={styles.button}>
            <Ionicons name="arrow-back" size={24} color={chatPalette.viewerText} />
          </Touchable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>{image.sender ?? "Fotoğraf"}</Text>
            <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
              {[image.created_at ? `${dayLabel(image.created_at)} ${clockTime(image.created_at)}` : null, images.length > 1 ? `${current + 1} / ${images.length}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {onReply && image.messageId ? (
            <Touchable feedback="icon" haptic="light" onPress={() => onReply(image)} accessibilityRole="button" accessibilityLabel="Fotoğrafı yanıtla" style={styles.button}>
              <Ionicons name="arrow-undo" size={22} color={chatPalette.viewerText} />
            </Touchable>
          ) : null}
          {onForward && image.messageId ? (
            <Touchable feedback="icon" haptic="light" onPress={() => onForward(image)} accessibilityRole="button" accessibilityLabel="Fotoğrafı ilet" style={styles.button}>
              <Ionicons name="arrow-redo" size={22} color={chatPalette.viewerText} />
            </Touchable>
          ) : null}
          {/^https?:\/\//i.test(image.uri) ? (
            <Touchable feedback="icon" haptic="light" onPress={() => void Linking.openURL(image.uri).catch(() => {})} accessibilityRole="link" accessibilityLabel="Fotoğrafı tarayıcıda aç; oradan kaydedebilir ya da paylaşabilirsin" style={styles.button}>
              <Ionicons name="open-outline" size={22} color={chatPalette.viewerText} />
            </Touchable>
          ) : null}
        </View>
        {image.caption ? (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}>
            <Text style={styles.caption} {...textScale.long}>{image.caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chatPalette.viewerBg },
  page: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingBottom: space.sm, backgroundColor: chatPalette.viewerChrome },
  button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleBox: { flex: 1, minWidth: 0 },
  title: { ...type.h3, color: chatPalette.viewerText },
  sub: { ...type.caption, color: chatPalette.viewerMuted },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: chatPalette.viewerChrome },
  caption: { ...type.body, color: chatPalette.viewerText, textAlign: "center" },
});
