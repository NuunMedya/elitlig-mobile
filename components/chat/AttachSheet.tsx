/**
 * EK PANELİ — WhatsApp'ın "+" ızgarası: galeri, kamera, video, konum / saha,
 * anket; yönetim hesaplarında hazır içerikler (günün maçları, "Ben talibim",
 * Haftanın Enleri). Seçim odaya döner; anket ve konum kendi alt sayfasında
 * doldurulur. (Sohbetten maç teklifi oluşturma kaldırıldı; eski teklif kartları
 * yalnızca görüntülenir ve yanıtlanır.)
 *
 * BELGE: cihazdan rastgele dosya seçmek için belge seçici modülü
 * (expo-document-picker) gerekir ve kurulu değildir; bu yüzden ızgarada
 * "Belge" yoktur. Gelen belgeler balonda açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Input, ListRow, Touchable, errorMessage } from "@/components/chat/kit";
import { useToast } from "@/components/ui";
import { getVenues, type ChatConversation, type ChatLocationMeta, type ChatVenue } from "@/lib/api/chat";
import { MAX_FILE_BYTES, getCurrentLocation, type PickedFile } from "@/lib/chatMedia";
import { attachTones, colors } from "@/lib/chatPalette";
import { layout, radius, space, textScale, type } from "@/theme";

export type AttachMode = "menu" | "location" | "poll" | null;
export type AttachPick = "images" | "camera" | "video";
export type ContentKey = "matches" | "signup" | "award";

export interface AttachSheetProps {
  mode: AttachMode;
  onChangeMode: (mode: AttachMode) => void;
  conversation: ChatConversation | null;
  admin?: boolean;
  onSendLocation: (location: Partial<ChatLocationMeta>) => Promise<void>;
  /** Verilirse menüde "Anket" görünür (web/masaüstü Mesajlar ile aynı anket). */
  onSendPoll?: (poll: { question: string; multiple: boolean; options: string[] }) => Promise<void>;
  /** Fotoğraf / kamera / video seçildi. */
  onPick?: (kind: AttachPick) => void;
  /** Yönetimin hazır içerikleri; boşsa bölüm çizilmez. */
  contentKeys?: ContentKey[];
  onContent?: (key: ContentKey) => void;
}

interface Tile {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  onPress: () => void;
}

const CONTENT_TILES: Record<ContentKey, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: string }> = {
  matches: { label: "Günün maçları", icon: "football", tone: attachTones.matches },
  signup: { label: "Ben talibim", icon: "hand-left", tone: attachTones.signup },
  award: { label: "Haftanın Enleri", icon: "trophy", tone: attachTones.award },
};

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Touchable key={tile.key} feedback="chip" haptic="selection" onPress={tile.onPress} accessibilityRole="button" accessibilityLabel={tile.label} style={styles.tile}>
          <View style={[styles.tileIcon, { backgroundColor: tile.tone }]}>
            <Ionicons name={tile.icon} size={24} color={attachTones.onTone} />
          </View>
          <Text style={styles.tileLabel} numberOfLines={2} {...textScale.dense}>{tile.label}</Text>
        </Touchable>
      ))}
    </View>
  );
}

export function AttachSheet({ mode, onChangeMode, onSendLocation, onSendPoll, onPick, contentKeys, onContent }: AttachSheetProps) {
  const toast = useToast();
  const close = useCallback(() => onChangeMode(null), [onChangeMode]);
  const pick = (kind: AttachPick) => {
    close();
    onPick?.(kind);
  };
  const tiles: Tile[] = [
    ...(onPick
      ? [
          { key: "images", label: "Galeri", icon: "images" as const, tone: attachTones.photo, onPress: () => pick("images") },
          { key: "camera", label: "Kamera", icon: "camera" as const, tone: attachTones.camera, onPress: () => pick("camera") },
          { key: "video", label: "Video", icon: "videocam" as const, tone: attachTones.video, onPress: () => pick("video") },
        ]
      : []),
    { key: "location", label: "Konum", icon: "location", tone: attachTones.location, onPress: () => onChangeMode("location") },
    ...(onSendPoll ? [{ key: "poll", label: "Anket", icon: "stats-chart" as const, tone: attachTones.poll, onPress: () => onChangeMode("poll") }] : []),
  ];
  const contentTiles: Tile[] = (contentKeys ?? []).map((key) => ({
    key,
    ...CONTENT_TILES[key],
    onPress: () => {
      close();
      onContent?.(key);
    },
  }));

  return (
    <>
      <BottomSheet visible={mode === "menu"} onClose={close} snap="content">
        <TileGrid tiles={tiles} />
        {contentTiles.length ? (
          <>
            <Text style={styles.sectionTitle} {...textScale.dense}>HAZIR İÇERİKLER</Text>
            <TileGrid tiles={contentTiles} />
          </>
        ) : null}
      </BottomSheet>
      {onSendPoll ? <PollSheet visible={mode === "poll"} onClose={close} onSend={onSendPoll} toastError={(error) => toast.show({ message: errorMessage(error), tone: "danger" })} /> : null}
      <LocationSheet visible={mode === "location"} onClose={close} onSend={onSendLocation} toastError={(error) => toast.show({ message: errorMessage(error), tone: "danger" })} />
    </>
  );
}

/* ---------- gönderim önizlemesi (fotoğraf / video + açıklama) ---------- */

export function AttachPreviewSheet({ files, onClose, onSend }: { files: PickedFile[] | null; onClose: () => void; onSend: (files: PickedFile[], caption: string) => void }) {
  const [caption, setCaption] = useState("");
  const list = files ?? [];
  const tooLarge = list.filter((file) => (file.size ?? 0) > MAX_FILE_BYTES);
  const sendable = list.filter((file) => (file.size ?? 0) <= MAX_FILE_BYTES);
  const close = () => {
    setCaption("");
    onClose();
  };
  return (
    <BottomSheet
      visible={Boolean(files?.length)}
      onClose={close}
      title={list.length > 1 ? `${list.length} fotoğraf gönder` : list[0]?.isImage === false ? "Video gönder" : "Fotoğraf gönder"}
      snap="content"
      footer={
        <Button
          label={sendable.length > 1 ? `${sendable.length} öğeyi gönder` : "Gönder"}
          icon="send"
          disabled={!sendable.length}
          onPress={() => {
            onSend(sendable, caption.trim());
            setCaption("");
          }}
          fullWidth
        />
      }
    >
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {list.map((file) =>
            file.isImage ? (
              <Image key={file.uri} source={{ uri: file.uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="Seçilen fotoğraf" />
            ) : (
              <View key={file.uri} style={[styles.thumb, styles.thumbVideo]}>
                <Ionicons name="videocam" size={28} color={colors.textSecondary} />
                <Text style={styles.thumbName} numberOfLines={2} {...textScale.dense}>{file.name}</Text>
              </View>
            ),
          )}
        </ScrollView>
        {tooLarge.length ? (
          <Text style={styles.warn} {...textScale.dense}>{tooLarge.length} dosya 25 MB sınırını aşıyor ve gönderilmeyecek.</Text>
        ) : null}
        <Input value={caption} onChangeText={setCaption} placeholder="Açıklama ekle (isteğe bağlı)" maxLength={1000} multiline accessibilityLabel="Açıklama" />
      </View>
    </BottomSheet>
  );
}

/* ---------- anket ---------- */

function PollSheet({ visible, onClose, onSend, toastError }: { visible: boolean; onClose: () => void; onSend: NonNullable<AttachSheetProps["onSendPoll"]>; toastError: (error: unknown) => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= 2;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSend({ question: question.trim(), multiple, options: filled });
      // Yalnız başarıda temizlenir: gönderilemezse yazılanlar kaybolmaz.
      setQuestion("");
      setOptions(["", ""]);
      setMultiple(false);
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Anket oluştur" snap="full">
      <View style={styles.section}>
        <Input label="Soru" value={question} onChangeText={setQuestion} placeholder="Ör. Cumartesi maçı kaçta olsun?" maxLength={300} />
        {options.map((option, index) => (
          <Input
            key={index}
            label={`Seçenek ${index + 1}`}
            value={option}
            onChangeText={(text) => setOptions((list) => list.map((item, i) => (i === index ? text : item)))}
            maxLength={100}
            size="sm"
          />
        ))}
        {options.length < 12 ? <Button label="Seçenek ekle" icon="add" size="sm" variant="ghost" onPress={() => setOptions((list) => [...list, ""])} /> : null}
        <ListRow
          leading={{ icon: multiple ? "checkbox" : "square-outline", tone: "brand" }}
          title="Birden fazla seçenek işaretlenebilsin"
          onPress={() => setMultiple((value) => !value)}
          position="single"
        />
        <Button label="Anketi gönder" icon="send" onPress={() => void submit()} disabled={!ready} loading={busy} />
        {!ready ? (
          <Text style={styles.pollHint} {...textScale.dense}>
            Bir soru ve en az iki seçenek yaz.
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/* ---------- konum ---------- */

function LocationSheet({ visible, onClose, onSend, toastError }: { visible: boolean; onClose: () => void; onSend: (location: Partial<ChatLocationMeta>) => Promise<void>; toastError: (error: unknown) => void }) {
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const venues = useQuery({ queryKey: ["chat", "venues", q], queryFn: () => getVenues(q), enabled: visible, staleTime: 60_000 });

  const shareCurrent = useCallback(async () => {
    setBusy(true);
    try {
      const position = await getCurrentLocation();
      await onSend({ ...position, label: label.trim() || "Bulunduğum konum" });
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }, [label, onClose, onSend, toastError]);

  const shareVenue = useCallback(
    async (venue: ChatVenue) => {
      setBusy(true);
      try {
        await onSend({ venue_public_id: venue.public_id, venue_name: venue.name, address: [venue.address, venue.city].filter(Boolean).join(", ") || null, label: label.trim() || venue.name });
        onClose();
      } catch (error) {
        toastError(error);
      } finally {
        setBusy(false);
      }
    },
    [label, onClose, onSend, toastError],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Konum paylaş" snap="full">
      <View style={styles.section}>
        <Input label="Etiket (isteğe bağlı)" value={label} onChangeText={setLabel} placeholder="Örn. Maç öncesi buluşma" maxLength={160} />
        <Button label={busy ? "Konum alınıyor…" : "Bulunduğum konumu paylaş"} icon="locate" onPress={() => void shareCurrent()} loading={busy} fullWidth />
      </View>
      <Text style={styles.sectionTitle} {...textScale.dense}>SAHA KONUMU</Text>
      <View style={styles.section}>
        <Input value={q} onChangeText={setQ} placeholder="Saha ara" variant="search" size="sm" leadingIcon="search" />
      </View>
      {venues.isLoading ? (
        <Text style={styles.hint} {...textScale.dense}>Sahalar yükleniyor…</Text>
      ) : (venues.data?.venues ?? []).length === 0 ? (
        <Text style={styles.hint} {...textScale.dense}>Saha bulunamadı.</Text>
      ) : (
        (venues.data?.venues ?? []).map((venue, index, list) => (
          <ListRow
            key={venue.public_id}
            leading={{ icon: "football-outline", tone: "brand" }}
            title={venue.name}
            subtitle={[venue.address, venue.city].filter(Boolean).join(" · ") || "Adres girilmemiş"}
            onPress={() => void shareVenue(venue)}
            disabled={busy}
            chevron
            position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
          />
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  thumbs: { gap: space.sm, paddingVertical: space.xs },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface3 },
  thumbVideo: { alignItems: "center", justifyContent: "center", gap: space.xs, padding: space.xs },
  thumbName: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  warn: { ...type.caption, color: colors.danger },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: layout.screenPadding - space.xs, paddingBottom: space.md, rowGap: space.md },
  tile: { width: "25%", alignItems: "center", gap: space.s, paddingVertical: space.xs },
  tileIcon: { width: 54, height: 54, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tileLabel: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  pollHint: { ...type.caption, color: colors.textTertiary },
  section: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xs, letterSpacing: 1.2 },
  hint: { ...type.caption, color: colors.textSecondary, paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
});
