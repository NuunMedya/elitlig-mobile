import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { instagramUrl } from "@/lib/socials";
import { useScope } from "@/providers/ScopeProvider";
import type { TopPlayer } from "@/lib/matchStats";
import type { ApiMatch } from "@/lib/types";

/**
 * Skor kartı paylaşımı — maç sonucunu Instagram story boyutunda bir görsele
 * çevirip sistem paylaşım menüsünü açar.
 *
 * Akış: "Sonucu Paylaş" düğmesi → önizleme penceresi (9:16 kart) → Paylaş →
 * kart PNG olarak yakalanır (react-native-view-shot) ve paylaşım menüsü
 * açılır (expo-sharing). Kartta lig/sezon, takımlar ve amblemler, altın skor,
 * varsa MVP ve şehrin Instagram etiketi yer alır.
 */

const LOGO = require("@/assets/images/splash-icon.png");

export function ShareScoreCard({
  match,
  homeScore,
  awayScore,
  mvp,
  homeLogo,
  awayLogo,
}: {
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  mvp: TopPlayer | null;
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const scope = useScope();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const igHandle = (() => {
    const url = instagramUrl(match.city ?? scope.cityLabel);
    if (!url) return null;
    const handle = url.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : null;
  })();

  const dateLabel = (() => {
    try {
      return new Date(String(match.date).slice(0, 10)).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
      });
    } catch {
      return "";
    }
  })();

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        Alert.alert("Paylaşım kullanılamıyor", "Bu cihazda paylaşım menüsü açılamadı.");
      }
    } catch {
      Alert.alert("Bir sorun oldu", "Görsel oluşturulamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Ionicons name="share-social" size={15} color={colors.surface} />
        <Text style={styles.triggerText}>Sonucu Paylaş</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Yakalanacak kart */}
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <LinearGradient
              colors={["#1D1330", "#3B1D6E", "#17102B"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.cardBody}
            >
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              <Text style={styles.league}>
                {String(scope.leagueLabel ?? "").toLocaleUpperCase("tr-TR")} ·{" "}
                {String(scope.seasonLabel ?? "").toLocaleUpperCase("tr-TR")}
              </Text>

              <View style={styles.divider} />

              <View style={styles.teamRow}>
                <TeamCrest name={match.first_team_name} logo={homeLogo} size={34} />
                <Text style={styles.teamName} numberOfLines={1}>
                  {String(match.first_team_name ?? "").toLocaleUpperCase("tr-TR")}
                </Text>
              </View>
              <Text style={styles.score}>
                {homeScore ?? "-"} - {awayScore ?? "-"}
              </Text>
              <View style={styles.teamRow}>
                <TeamCrest name={match.second_team_name} logo={awayLogo} size={34} />
                <Text style={styles.teamName} numberOfLines={1}>
                  {String(match.second_team_name ?? "").toLocaleUpperCase("tr-TR")}
                </Text>
              </View>

              {mvp ? (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.mvpKicker}>⭐ MAÇIN YILDIZI</Text>
                  <Text style={styles.mvpName}>{mvp.name.toLocaleUpperCase("tr-TR")}</Text>
                </>
              ) : null}

              <View style={styles.divider} />
              <Text style={styles.meta}>
                {match.match_field ? `${match.match_field} · ` : ""}
                {dateLabel}
              </Text>
              {igHandle ? <Text style={styles.handle}>{igHandle}</Text> : null}
            </LinearGradient>
          </ViewShot>

          {/* Eylemler */}
          <View style={styles.actions}>
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.actionBtn, styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.actionBtn, styles.shareBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={16} color={colors.surface} />
              <Text style={styles.shareText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardBody: {
    width: 264,
    borderRadius: 18,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  logo: {
    width: 84,
    height: 42,
  },
  league: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#BCA8E8",
  },
  divider: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: spacing.xs,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  teamName: {
    ...type.small,
    color: "#FFFFFF",
    fontWeight: "800",
    maxWidth: 170,
  },
  score: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.yellow,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  mvpKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.yellow,
  },
  mvpName: {
    ...type.small,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  meta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A79BC8",
  },
  handle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8878B8",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 3,
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  shareBtn: {
    backgroundColor: colors.turf,
  },
  shareText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
});
