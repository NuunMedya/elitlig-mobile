/**
 * EK PANELİ — konum paylaşımı (cihaz konumu / saha listesi) ve maç teklifi formu.
 * Composer'daki "+" düğmesinden açılır; sonuç `onSend` ile odaya döner.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Chip, ChipGroup, DateStrip, Input, ListRow, errorMessage, toIsoDate, useToast } from "@/components/ui";
import { getVenues, type ChatConversation, type ChatLocationMeta, type ChatVenue, type MatchOfferInput } from "@/lib/api/chat";
import { getTeams } from "@/lib/api/teams";
import { getCurrentLocation } from "@/lib/chatMedia";
import type { ApiTeam } from "@/lib/types";
import { colors, layout, space, textScale, type } from "@/theme";

export type AttachMode = "menu" | "location" | "offer" | null;

export interface AttachSheetProps {
  mode: AttachMode;
  onChangeMode: (mode: AttachMode) => void;
  conversation: ChatConversation | null;
  admin?: boolean;
  onSendLocation: (location: Partial<ChatLocationMeta>) => Promise<void>;
  onSendOffer: (offer: MatchOfferInput) => Promise<void>;
}

const HOURS = ["10:00", "12:00", "14:00", "16:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

export function AttachSheet({ mode, onChangeMode, conversation, admin = false, onSendLocation, onSendOffer }: AttachSheetProps) {
  const toast = useToast();
  const close = useCallback(() => onChangeMode(null), [onChangeMode]);

  return (
    <>
      <BottomSheet visible={mode === "menu"} onClose={close} title="Ek gönder" snap="content">
        <ListRow leading={{ icon: "location", tone: "danger" }} title="Konum / saha paylaş" subtitle="Bulunduğun yer ya da saha listesinden" onPress={() => onChangeMode("location")} chevron position="first" />
        <ListRow leading={{ icon: "football", tone: "win" }} title="Maç teklifi" subtitle="Rakip, saha, tarih ve saat" onPress={() => onChangeMode("offer")} chevron position="last" />
      </BottomSheet>
      <LocationSheet visible={mode === "location"} onClose={close} onSend={onSendLocation} toastError={(error) => toast.show({ message: errorMessage(error), tone: "danger" })} />
      <MatchOfferSheet visible={mode === "offer"} onClose={close} onSend={onSendOffer} conversation={conversation} admin={admin} />
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

/* ---------- maç teklifi ---------- */

function MatchOfferSheet({ visible, onClose, onSend, conversation, admin }: { visible: boolean; onClose: () => void; onSend: (offer: MatchOfferInput) => Promise<void>; conversation: ChatConversation | null; admin: boolean }) {
  const toast = useToast();
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [time, setTime] = useState("20:00");
  const [homeId, setHomeId] = useState<number | null>(null);
  const [opponentId, setOpponentId] = useState<number | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const teams = useQuery({ queryKey: ["teams", "list"], queryFn: getTeams, enabled: visible, staleTime: 300_000 });
  const venues = useQuery({ queryKey: ["chat", "venues", ""], queryFn: () => getVenues(""), enabled: visible, staleTime: 60_000 });

  const teamList = useMemo(() => {
    const q = teamQuery.trim().toLocaleLowerCase("tr-TR");
    const list = (teams.data ?? []).filter((team: ApiTeam) => team.active !== false && team.active !== 0 && team.active !== "0");
    return (q ? list.filter((team) => team.team_name.toLocaleLowerCase("tr-TR").includes(q)) : list).slice(0, 40);
  }, [teamQuery, teams.data]);
  const teamName = (id: number | null) => (teams.data ?? []).find((team) => team.id === id)?.team_name ?? null;
  const venue = (venues.data?.venues ?? []).find((item) => item.public_id === venueId) ?? null;

  const submit = useCallback(async () => {
    if (!date || !time) return;
    if (!opponentId && !admin) {
      toast.show({ message: "Rakip takımı seçin.", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      await onSend({
        home_team_id: homeId,
        home_team_name: homeId ? teamName(homeId) : admin ? "ElitLig" : null,
        opponent_team_id: opponentId,
        opponent_team_name: opponentId ? teamName(opponentId) : conversation?.type === "management" ? conversation.title : "Rakip",
        venue_public_id: venue?.public_id ?? null,
        venue_name: venue?.name ?? null,
        venue_address: venue ? [venue.address, venue.city].filter(Boolean).join(", ") || null : null,
        date,
        time,
        note: note.trim() || null,
      });
      onClose();
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, conversation, date, homeId, note, onClose, onSend, opponentId, time, toast, venue]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Maç teklifi"
      snap="full"
      footer={<Button label="Teklifi gönder" icon="football" onPress={() => void submit()} loading={busy} disabled={busy} fullWidth />}
    >
      <Text style={styles.sectionTitle} {...textScale.dense}>TARİH</Text>
      <DateStrip value={date} onChange={setDate} range={{ start: toIsoDate(new Date()), end: toIsoDate(new Date(Date.now() + 60 * 86_400_000)) }} />
      <Text style={styles.sectionTitle} {...textScale.dense}>SAAT</Text>
      <ChipGroup>
        {HOURS.map((hour) => (
          <Chip key={hour} label={hour} selected={time === hour} onPress={() => setTime(hour)} size="sm" />
        ))}
      </ChipGroup>
      <View style={styles.section}>
        <Input label="Saat (elle)" value={time} onChangeText={setTime} placeholder="20:00" maxLength={5} keyboardType="numbers-and-punctuation" />
      </View>
      <Text style={styles.sectionTitle} {...textScale.dense}>TAKIMLAR</Text>
      <View style={styles.section}>
        <Input value={teamQuery} onChangeText={setTeamQuery} placeholder="Takım ara" variant="search" size="sm" leadingIcon="search" />
        <Text style={styles.hint} {...textScale.dense}>Ev sahibi: {homeId ? teamName(homeId) : admin ? "ElitLig (organizasyon)" : "Takımım"} · Rakip: {opponentId ? teamName(opponentId) : "seçilmedi"}</Text>
      </View>
      <ScrollView style={styles.teamList} nestedScrollEnabled>
        {teamList.map((team) => {
          const isHome = homeId === team.id;
          const isOpponent = opponentId === team.id;
          return (
            <ListRow
              key={team.id}
              title={team.team_name}
              subtitle={isHome ? "Ev sahibi" : isOpponent ? "Rakip" : team.city ?? undefined}
              onPress={() => {
                if (isOpponent) setOpponentId(null);
                else if (isHome) { setHomeId(null); }
                else if (!opponentId) setOpponentId(team.id);
                else setHomeId(team.id);
              }}
              highlighted={isHome || isOpponent}
              trailing={<Ionicons name={isOpponent ? "flag" : isHome ? "home" : "add-circle-outline"} size={18} color={isHome || isOpponent ? colors.brand : colors.textTertiary} />}
            />
          );
        })}
      </ScrollView>
      <Text style={styles.sectionTitle} {...textScale.dense}>SAHA</Text>
      <ChipGroup>
        <Chip label="Belirtilmedi" selected={venueId === null} onPress={() => setVenueId(null)} size="sm" />
        {(venues.data?.venues ?? []).map((item) => (
          <Chip key={item.public_id} label={item.name} selected={venueId === item.public_id} onPress={() => setVenueId(item.public_id)} size="sm" />
        ))}
      </ChipGroup>
      <View style={styles.section}>
        <Input label="Not" value={note} onChangeText={setNote} placeholder="Ücret, forma rengi, hakem…" multiline maxLength={500} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xs, letterSpacing: 1.2 },
  hint: { ...type.caption, color: colors.textSecondary, paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
  teamList: { maxHeight: 260 },
});
