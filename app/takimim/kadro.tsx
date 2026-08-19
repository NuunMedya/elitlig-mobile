import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  getTeamRoster,
  POSITIONS,
  positionLabel,
  releaseRosterPlayer,
  updateRosterPlayer,
  type RosterPlayer,
  type RosterPlayerPatch,
  type SquadRole,
} from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Kadro Yönetimi — takıma özgü oyuncu bilgileri.
 *
 * Kadro, sunucudaki squad_role değerine göre üç bölümde listelenir
 * (starter / substitute / reserve). Satıra dokununca açılan pencerede
 * forma numarası, takım mevkisi ve kadro rolü düzenlenip PATCH ile
 * doğrudan (yönetici onayı olmadan) kaydedilir. "İlk 8" rolü buradan
 * seçilemez; sunucu onu diziliş ekranına (PUT /lineup) ayırır.
 *
 * Kadrodan çıkarma: aktif sözleşmesi olan oyuncu için sunucu önce 409
 * PLAYER_HAS_ACTIVE_CONTRACT döndürür; ikinci onaydan sonra force=true
 * ile sözleşme feshedilerek çıkarılır.
 */

const ROLE_LABELS: Record<SquadRole, string> = {
  starter: "İlk Kadro",
  substitute: "Yedek",
  reserve: "Kadro Dışı",
};

/** Kadro tablosundan seçilebilen roller (starter yalnızca diziliş ekranından). */
const EDITABLE_ROLES: Exclude<SquadRole, "starter">[] = ["substitute", "reserve"];

export default function SquadManagementScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RosterPlayer | null>(null);

  const query = useQuery({
    queryKey: ["takim", "roster"],
    queryFn: getTeamRoster,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
  };

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const roster = query.data?.roster ?? [];
  const sections = (["starter", "substitute", "reserve"] as const)
    .map((role) => ({
      title: ROLE_LABELS[role],
      data: roster.filter((player) => player.squad_role === role),
    }))
    .filter((section) => section.data.length > 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader
        title="Kadro Yönetimi"
        subtitle={query.data?.team ? query.data.team.team_name : "Takıma özgü kadro bilgileri"}
      />

      {query.isLoading ? (
        <Loading />
      ) : noAccess ? (
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Kadro yönetimi yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Kadro boş"
          body="Kadrona oyuncu eklemek için Davet ve Başvurular ekranından davet gönderebilirsin."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>
              {section.title.toLocaleUpperCase("tr-TR")} · {section.data.length}
            </Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setEditing(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.jersey}>
                <Text style={styles.jerseyText}>
                  {item.jersey_number != null ? item.jersey_number : "—"}
                </Text>
              </View>
              <PlayerAvatar name={item.player_name} image={mediaUrl(item.player_img)} size={36} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.player_name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {positionLabel(item.team_position) ||
                    item.profile_position ||
                    "Mevki belirlenmedi"}
                  {item.has_active_contract ? " · Sözleşmeli" : ""}
                </Text>
              </View>
              <Ionicons name="create-outline" size={17} color={colors.muted} />
            </Pressable>
          )}
        />
      )}

      {editing ? (
        <PlayerEditorModal
          player={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Oyuncu düzenleme penceresi: forma no + mevki + kadro rolü + çıkarma. */
function PlayerEditorModal({
  player,
  onClose,
  onSaved,
}: {
  player: RosterPlayer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [jersey, setJersey] = useState(
    player.jersey_number != null ? String(player.jersey_number) : ""
  );
  const [position, setPosition] = useState<string | null>(player.team_position);
  const [role, setRole] = useState<SquadRole>(player.squad_role);

  const saveMutation = useMutation({
    mutationFn: (body: RosterPlayerPatch) => updateRosterPlayer(player.id, body),
    onSuccess: onSaved,
    onError: (error: unknown) => {
      Alert.alert(
        "Kaydedilemedi",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (force: boolean) => releaseRosterPlayer(player.id, force),
    onSuccess: (result) => {
      Alert.alert("Kadrodan çıkarıldı", result.message);
      onSaved();
    },
    onError: (error: unknown) => {
      // Aktif sözleşme: fesih onayı alınıp force=true ile tekrar denenir.
      if (error instanceof ApiError && error.code === "PLAYER_HAS_ACTIVE_CONTRACT") {
        Alert.alert(
          "Sözleşmesi aktif",
          `${player.player_name} ile aktif bir sözleşme var. Kadrodan çıkarmak sözleşmeyi feshedecek. Yine de çıkarılsın mı?`,
          [
            { text: "Vazgeç", style: "cancel" },
            {
              text: "Feshet ve çıkar",
              style: "destructive",
              onPress: () => releaseMutation.mutate(true),
            },
          ]
        );
        return;
      }
      Alert.alert(
        "Çıkarılamadı",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  const confirmRelease = () => {
    Alert.alert(
      "Kadrodan çıkar",
      `${player.player_name} kadrodan çıkarılacak. Emin misin?`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Çıkar", style: "destructive", onPress: () => releaseMutation.mutate(false) },
      ]
    );
  };

  const save = () => {
    const body: RosterPlayerPatch = {};
    const trimmed = jersey.trim();
    const currentJersey = player.jersey_number != null ? String(player.jersey_number) : "";
    if (trimmed !== currentJersey) {
      if (trimmed === "") body.jersey_number = null;
      else {
        const value = Number(trimmed);
        if (!Number.isInteger(value) || value < 1 || value > 99) {
          Alert.alert("Geçersiz numara", "Forma numarası 1 ile 99 arasında olmalı.");
          return;
        }
        body.jersey_number = value;
      }
    }
    if (position !== player.team_position) body.team_position = position;
    if (role !== player.squad_role) {
      if (role === "starter") {
        // Sunucu starter'ı bu uçtan kabul etmez; diziliş ekranına yönlendirilir.
        Alert.alert("İlk kadro", "İlk 8 seçimi İdeal Maç Kadrom (diziliş) ekranından yapılır.");
        return;
      }
      body.squad_role = role;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    saveMutation.mutate(body);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <PlayerAvatar name={player.player_name} image={mediaUrl(player.player_img)} size={38} />
              <View style={styles.rowBody}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {player.player_name}
                </Text>
                <Text style={styles.rowMeta}>
                  Profil mevkisi: {player.profile_position ?? "—"}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {/* Forma numarası */}
              <Text style={styles.fieldLabel}>FORMA NUMARASI (1-99)</Text>
              <TextInput
                value={jersey}
                onChangeText={setJersey}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="—"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              {/* Takım mevkisi */}
              <Text style={styles.fieldLabel}>TAKIM MEVKİSİ</Text>
              <View style={styles.chipWrap}>
                {POSITIONS.map((item) => {
                  const active = position === item.code;
                  return (
                    <Pressable
                      key={item.code}
                      onPress={() => setPosition(active ? null : item.code)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldHint}>
                {position ? positionLabel(position) : "Mevki seçilmedi"}
              </Text>

              {/* Kadro rolü */}
              <Text style={styles.fieldLabel}>KADRO ROLÜ</Text>
              <View style={styles.chipWrap}>
                {player.squad_role === "starter" ? (
                  <View style={[styles.chip, styles.chipActive]}>
                    <Text style={styles.chipTextActive}>İlk Kadro</Text>
                  </View>
                ) : null}
                {EDITABLE_ROLES.map((value) => {
                  const active = role === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setRole(value)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {ROLE_LABELS[value]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldHint}>
                İlk 8 seçimi İdeal Maç Kadrom (diziliş) ekranından yapılır.
              </Text>
            </ScrollView>

            <View style={styles.sheetActions}>
              <Pressable
                onPress={confirmRelease}
                disabled={releaseMutation.isPending}
                style={({ pressed }) => [styles.btn, styles.dangerBtn, pressed && styles.pressed]}
              >
                <Ionicons name="person-remove-outline" size={14} color={colors.live} />
                <Text style={styles.dangerText}>
                  {releaseMutation.isPending ? "Çıkarılıyor…" : "Kadrodan çıkar"}
                </Text>
              </Pressable>
              <Pressable
                onPress={save}
                disabled={saveMutation.isPending}
                style={({ pressed }) => [styles.btn, styles.saveBtn, pressed && styles.pressed]}
              >
                <Ionicons name="checkmark" size={15} color={colors.surface} />
                <Text style={styles.saveText}>
                  {saveMutation.isPending ? "Kaydediliyor…" : "Kaydet"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  jersey: {
    width: 26,
    alignItems: "center",
  },
  jerseyText: {
    ...type.small,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  rowMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  kav: {
    alignSelf: "stretch",
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...type.small,
    color: colors.line,
    width: 90,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
  },
  chipTextActive: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.surface,
  },
  fieldHint: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 3,
  },
  saveBtn: {
    backgroundColor: colors.green,
  },
  saveText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  dangerBtn: {
    backgroundColor: colors.live + "18",
  },
  dangerText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.live,
  },
  pressed: {
    opacity: 0.6,
  },
});
