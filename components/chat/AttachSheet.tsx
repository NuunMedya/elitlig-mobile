/**
 * EK PANELİ — konum paylaşımı (cihaz konumu / saha listesi).
 * Composer'daki "+" düğmesinden açılır; sonuç `onSend` ile odaya döner.
 * (Sohbetten maç teklifi oluşturma kaldırıldı; eski teklif kartları yalnızca
 * görüntülenir ve yanıtlanır.)
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Input, ListRow, errorMessage, useToast } from "@/components/ui";
import { getVenues, type ChatConversation, type ChatLocationMeta, type ChatVenue } from "@/lib/api/chat";
import { getCurrentLocation } from "@/lib/chatMedia";
import { colors, layout, space, textScale, type } from "@/theme";

export type AttachMode = "menu" | "location" | null;

export interface AttachSheetProps {
  mode: AttachMode;
  onChangeMode: (mode: AttachMode) => void;
  conversation: ChatConversation | null;
  admin?: boolean;
  onSendLocation: (location: Partial<ChatLocationMeta>) => Promise<void>;
}


export function AttachSheet({ mode, onChangeMode, onSendLocation }: AttachSheetProps) {
  const toast = useToast();
  const close = useCallback(() => onChangeMode(null), [onChangeMode]);

  return (
    <>
      <BottomSheet visible={mode === "menu"} onClose={close} title="Ek gönder" snap="content">
        <ListRow leading={{ icon: "location", tone: "danger" }} title="Konum / saha paylaş" subtitle="Bulunduğun yer ya da saha listesinden" onPress={() => onChangeMode("location")} chevron position="single" />
      </BottomSheet>
      <LocationSheet visible={mode === "location"} onClose={close} onSend={onSendLocation} toastError={(error) => toast.show({ message: errorMessage(error), tone: "danger" })} />
    </>
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
  section: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xs, letterSpacing: 1.2 },
  hint: { ...type.caption, color: colors.textSecondary, paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
});
