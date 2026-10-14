/**
 * PROFİL BAĞLA — oyuncu profili ya da takım için "ara ya da yeni ekle".
 *
 *   /oyuncum/bagla            → oyuncu profili
 *   /oyuncum/bagla?tur=takim  → takım yönetimi
 *
 * TEK KUTU: üye adını (takımın adını) yazar; yazdıkça benzer kayıtlar
 * listelenir. Ya listeden seçer ("Bu benim" / "Yönetiyorum") ya da listenin
 * altındaki "listede yok, yeni olarak ekle" satırıyla yazdığı adla yeni kayıt
 * açar. Arama ile oluşturma aynı yerde olduğu için üye mevcut kaydını
 * görmeden yeni kayıt açamaz; mükerrer profil oluşmaz.
 *
 * AYNI İSİMLİ FARKLI KAYITLAR: adaylar takım, mevki, doğum yılı, il ve maç
 * (takımda il ve kadro) bilgisiyle gelir; başkasına bağlı kayıt görünür ama
 * seçilemez. Seçim her zaman üyenindir.
 *
 * Sunucu: routes/User.js (player-candidates, team-candidates, request-*),
 * services/playerMatchService.js.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  Input,
  ScreenHeader,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Touchable,
  useToast,
} from "@/components/ui";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { POSITIONS } from "@/lib/api/team";
import {
  candidateFacts,
  getAccountRequests,
  getPlayerCandidates,
  getTeamCandidates,
  requestPlayerClaim,
  requestPlayerCreate,
  requestTeamCreate,
  requestTeamManagement,
  teamFacts,
  type AccountRequest,
  type PlayerCandidate,
  type TeamCandidate,
} from "@/lib/api/playerProfile";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, type } from "@/theme";

type Kind = "player" | "team";

const COPY = {
  player: {
    title: "Oyuncu Profilini Bağla",
    intro: "Adını soyadını yaz. Listede kendini görürsen “Bu benim” de; maç ve istatistik geçmişin profiline gelir. Listede yoksan aynı yerden yeni oyuncu olarak ekle.",
    placeholder: "Adını soyadını yaz (ör. Civan Ünver)",
    pick: "Bu benim",
    taken: "Başka üyeye bağlı",
    create: "Yeni oyuncu olarak ekle",
    sameName: "Aynı isimde birden fazla oyuncu var. Takım, doğum yılı ve maç bilgisine bakarak kendini seç.",
    pending: "Oyuncu profili talebin yönetici onayı bekliyor.",
    pendingTypes: ["player_claim", "player_create"],
  },
  team: {
    title: "Takımını Bağla",
    intro: "Takımının adını yaz. Listede görürsen seç ve yönetim yetkisi iste. Listede yoksa aynı yerden yeni takım olarak ekle; yönetici onayladığında yönetimi sana tanımlanır.",
    placeholder: "Takımının adını yaz",
    pick: "Yönetiyorum",
    taken: "Yönetimi başka üyede",
    create: "Yeni takım olarak ekle",
    sameName: "Aynı isimde birden fazla takım var. İl ve kadro bilgisine bakarak takımını seç.",
    pending: "Takım talebin yönetici onayı bekliyor.",
    pendingTypes: ["team_management", "team_create"],
  },
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase("tr-TR").trim();
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message || error.userMessage : "Bir hata oluştu.";

function requestList(data: Awaited<ReturnType<typeof getAccountRequests>> | undefined): AccountRequest[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.accountRequests ?? data.requests ?? [];
}

/** Yazarken her harfte istek atmamak için kısa gecikme. */
function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/* ============================== ADAY SATIRI =============================== */

interface ResultRowProps {
  title: string;
  facts: string;
  id: number;
  media: string | null;
  isTeam: boolean;
  taken: boolean;
  pickLabel: string;
  takenLabel: string;
  onPick: () => void;
  disabled: boolean;
}

function ResultRow({ title, facts, id, media, isTeam, taken, pickLabel, takenLabel, onPick, disabled }: ResultRowProps) {
  return (
    <Surface style={styles.row}>
      {isTeam ? <TeamLogo logo={media} name={title} size={42} /> : <Avatar name={title} image={media} size={46} />}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowFacts}>{facts}</Text>
        <Text style={styles.rowId}>Kayıt #{id}</Text>
      </View>
      <Button
        label={taken ? takenLabel : pickLabel}
        size="sm"
        variant={taken ? "ghost" : "primary"}
        onPress={onPick}
        disabled={disabled || taken}
      />
    </Surface>
  );
}

/* ================================= EKRAN ================================== */

export default function ProfileLinkScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tur?: string }>();
  const kind: Kind = params.tur === "takim" ? "team" : "player";
  const copy = COPY[kind];
  const toast = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState(kind === "player" ? user?.fullName ?? "" : "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ player_position: "", birth_date: "", founded_at: "", colors: "", note: "" });
  const [busy, setBusy] = useState(false);

  const name = query.trim().replace(/\s+/g, " ");
  const debounced = useDebounced(name);
  const ready = debounced.length >= 2;

  const requestsQuery = useQuery({ queryKey: ["account-requests"], queryFn: getAccountRequests, enabled: Boolean(user) });
  const pending = requestList(requestsQuery.data).some(
    (item) => item.status === "pending" && (copy.pendingTypes as readonly string[]).includes(item.type)
  );

  const resultsQuery = useQuery({
    queryKey: ["link-candidates", kind, debounced],
    queryFn: async (): Promise<(PlayerCandidate | TeamCandidate)[]> =>
      kind === "team" ? (await getTeamCandidates(debounced)).candidates : (await getPlayerCandidates(debounced)).candidates,
    enabled: Boolean(user) && ready && !pending,
  });
  const results = useMemo(() => resultsQuery.data ?? [], [resultsQuery.data]);
  const searching = name !== debounced || resultsQuery.isFetching;

  const sameName = useMemo(() => {
    const counts = new Map<string, number>();
    results.forEach((item) => {
      const key = lower("team_name" in item ? item.team_name : item.player_name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.values()].some((n) => n > 1);
  }, [results]);

  if (!user) return <Redirect href="/giris" />;

  const send = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      setCreateOpen(false);
      toast.show({ message, tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["account-requests"] });
    } catch (error) {
      Alert.alert("Talep gönderilemedi", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const pick = (item: PlayerCandidate | TeamCandidate) => {
    if ("team_name" in item) {
      Alert.alert(
        "Takım yönetimi talebi",
        `“${item.team_name}” · ${teamFacts(item)}\n\nAynı isimde başka takımlar olabilir; il ve kadronun doğru olduğundan emin ol. ` +
          "Yönetici onayladığında takımın yönetimi hesabına tanımlanır.",
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Talebi gönder", onPress: () => void send(() => requestTeamManagement(item.id), "Takım yönetimi talebin onaya gönderildi.") },
        ]
      );
      return;
    }
    Alert.alert(
      "Bu oyuncu sen misin?",
      `“${item.player_name}” · ${candidateFacts(item)}\n\nAynı isimde başka oyuncular olabilir; takım ve doğum yılının sana ait olduğundan emin ol. ` +
        "Yönetici onayladığında bu kaydın maç ve istatistik geçmişi hesabına bağlanır.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Evet, bu benim", onPress: () => void send(() => requestPlayerClaim(item.id), "Sahiplenme talebin onaya gönderildi.") },
      ]
    );
  };

  const submitCreate = () => {
    const date = kind === "player" ? form.birth_date : form.founded_at;
    if (date && !DATE_RE.test(date)) {
      Alert.alert("Tarih", "Tarihi YYYY-AA-GG biçiminde yaz (ör. 1998-04-21).");
      return;
    }
    const common = { ...(user.city ? { city: user.city } : {}), ...(form.note ? { note: form.note } : {}) };
    if (kind === "player") {
      // Üye bu adı aradı ve adayları gördü; yeni kayıt bilinçli bir karar.
      void send(
        () => requestPlayerCreate({
          player_name: name,
          ...(form.player_position ? { player_position: form.player_position } : {}),
          ...(form.birth_date ? { birth_date: form.birth_date } : {}),
          ...common,
          confirmedNew: true,
        }),
        "Yeni oyuncu profili talebin onaya gönderildi."
      );
    } else {
      void send(
        () => requestTeamCreate({
          team_name: name,
          ...(form.founded_at ? { founded_at: form.founded_at } : {}),
          ...(form.colors ? { colors: form.colors } : {}),
          ...common,
        }),
        "Yeni takım talebin onaya gönderildi."
      );
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title={copy.title} back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>{copy.intro}</Text>

        {pending ? (
          <View style={styles.notice}><Text style={styles.noticeText}>⏳ {copy.pending}</Text></View>
        ) : (
          <>
            <Input value={query} onChangeText={setQuery} placeholder={copy.placeholder} autoCorrect={false} autoFocus={kind === "team"} />

            {name.length >= 2 && (
              <View style={styles.block}>
                {sameName && <View style={styles.notice}><Text style={styles.noticeText}>{copy.sameName}</Text></View>}
                {searching && !results.length ? (
                  <SkeletonListRow count={3} />
                ) : resultsQuery.isError ? (
                  <Text style={styles.hint}>{errorText(resultsQuery.error)}</Text>
                ) : results.length ? (
                  results.map((item) => "team_name" in item ? (
                    <ResultRow key={item.id} id={item.id} title={item.team_name} facts={teamFacts(item)} media={mediaUrl(item.logo)}
                      isTeam taken={item.managed} pickLabel={copy.pick} takenLabel={copy.taken} onPick={() => pick(item)} disabled={busy} />
                  ) : (
                    <ResultRow key={item.id} id={item.id} title={item.player_name} facts={candidateFacts(item)} media={mediaUrl(item.player_img)}
                      isTeam={false} taken={item.owned} pickLabel={copy.pick} takenLabel={copy.taken} onPick={() => pick(item)} disabled={busy} />
                  ))
                ) : (
                  <Text style={styles.hint}>“{name}” adında kayıt bulunamadı.</Text>
                )}

                {!searching && (
                  <Touchable onPress={() => setCreateOpen(true)} disabled={busy} style={styles.create} accessibilityRole="button">
                    <View style={styles.createIcon}><Ionicons name="add" size={24} color={colors.textOnBrand} /></View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{results.length ? "Bunlardan biri değil" : "Listede yok"}</Text>
                      <Text style={styles.rowFacts}>“{name}” — {copy.create}</Text>
                    </View>
                  </Touchable>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {createOpen && (
        <BottomSheet
          visible
          onClose={() => setCreateOpen(false)}
          title={`${copy.create}: “${name}”`}
          snap="full"
          footer={<Button label="Talebi onaya gönder" onPress={submitCreate} loading={busy} fullWidth />}
        >
          <View style={styles.block}>
            <Text style={styles.hint}>
              Adı değiştirmek için arama kutusunu düzenle. İl bilgisi üyelik kaydından alınır{user.city ? `: ${user.city}` : ""}.
            </Text>
            {kind === "player" ? (
              <>
                <Text style={styles.fieldLabel}>Mevki</Text>
                <ChipGroup>
                  {POSITIONS.map((item) => (
                    <Chip
                      key={item.code}
                      label={item.label}
                      selected={form.player_position === item.label}
                      onPress={() => setForm((old) => ({ ...old, player_position: old.player_position === item.label ? "" : item.label }))}
                    />
                  ))}
                </ChipGroup>
                <Input label="Doğum tarihi" value={form.birth_date} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation"
                  onChangeText={(value) => setForm((old) => ({ ...old, birth_date: value }))} />
              </>
            ) : (
              <>
                <Input label="Kuruluş tarihi" value={form.founded_at} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation"
                  onChangeText={(value) => setForm((old) => ({ ...old, founded_at: value }))} />
                <Input label="Renkler" value={form.colors} placeholder="ör. Sarı-Lacivert"
                  onChangeText={(value) => setForm((old) => ({ ...old, colors: value }))} />
              </>
            )}
            <Input label="Talep notu" value={form.note} onChangeText={(value) => setForm((old) => ({ ...old, note: value }))} />
          </View>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.giant * 2, gap: space.md },
  body: { ...type.body, color: colors.textSecondary },
  hint: { ...type.bodySm, color: colors.textSecondary },
  notice: { backgroundColor: colors.warnDim, borderRadius: radius.md, padding: space.md },
  noticeText: { ...type.bodySm, color: colors.warn },
  block: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.h3, color: colors.textPrimary },
  rowFacts: { ...type.bodySm, color: colors.textSecondary },
  rowId: { ...type.caption, color: colors.textTertiary },
  create: {
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg,
    borderWidth: 1, borderStyle: "dashed", borderColor: colors.brandBorder, backgroundColor: colors.brandDim,
  },
  createIcon: {
    width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brand,
  },
  fieldLabel: { ...type.label, color: colors.textSecondary },
});
