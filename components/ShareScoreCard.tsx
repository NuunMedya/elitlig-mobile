import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing } from "@/constants/theme";
import { instagramUrl } from "@/lib/socials";
import { useScope } from "@/providers/ScopeProvider";
import type { StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch } from "@/lib/types";

/**
 * Paylaşım kartları — İçerik Havuzu şablonlarının renk dilinde, iki boyda.
 *
 * Boylar: Hikâye 9:16 ve Gönderi 3:4 — pencerede haplarla seçilir; kart
 * seçilen oranda yeniden akar (içerik üstte, alt bilgi dipte). Paylaş, kartı
 * PNG yakalayıp sistem menüsünü açar; oradaki "Görüntüyü Kaydet" ile galeriye
 * indirme de mümkündür (ayrı izin gerektirmez).
 */

const CARD_W = 264;
const FORMATS = {
  story: { label: "Hikâye 9:16", height: Math.round((CARD_W * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((CARD_W * 4) / 3) },
} as const;
type Fmt = keyof typeof FORMATS;

const PURPLE = "#6D28D9";
const PURPLE_DARK = "#4C1D95";
const INK = "#100D16";
const GRAY = "#8B8797";
const CARD_BORDER = "#D9CBF2";

type Mode = "matchday" | "fulltime";

export function ShareScoreCard({
  mode,
  match,
  homeScore,
  awayScore,
  mvp,
  stats,
  homeLogo,
  awayLogo,
}: {
  mode: Mode;
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  mvp: TopPlayer | null;
  stats: StatRow[];
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const scope = useScope();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fmt, setFmt] = useState<Fmt>("story");
  const shotRef = useRef<View>(null);

  const igHandle = (() => {
    const url = instagramUrl(match.city ?? scope.cityLabel);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : null;
  })();

  const kicker = [scope.cityLabel, scope.leagueLabel, scope.seasonLabel]
    .filter(Boolean)
    .map((part) => String(part).toLocaleUpperCase("tr-TR"))
    .join("  •  ");

  const dateLabel = (() => {
    try {
      const day = String(match.date).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (day === today) return "BUGÜN";
      return new Date(day)
        .toLocaleDateString("tr-TR", { day: "numeric", month: "long" })
        .toLocaleUpperCase("tr-TR");
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
        <Text style={styles.triggerText}>
          {mode === "matchday" ? "Maç Gününü Paylaş" : "Sonucu Paylaş"}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Boy seçici */}
          <View style={styles.fmtRow}>
            {(Object.keys(FORMATS) as Fmt[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setFmt(key)}
                style={({ pressed }) => [
                  styles.fmtPill,
                  fmt === key && styles.fmtPillActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.fmtText}>{FORMATS[key].label}</Text>
              </Pressable>
            ))}
          </View>

          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={[styles.frame, { height: FORMATS[fmt].height }]}>
              <LinearGradient
                colors={[PURPLE, PURPLE_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.topStrip}
              />
              <LinearGradient
                colors={["#CDBFE8", "#EFEAF7", "#FFFFFF"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.body}
              >
                <Text style={styles.watermark}>elitlig</Text>

                <View style={styles.headRow}>
                  <Text style={styles.brand}>elitlig</Text>
                  <Text style={styles.corner}>ELİTLİG MOBİL</Text>
                </View>
                <Text style={styles.kicker}>{kicker}</Text>
                <Text style={styles.headline}>
                  {mode === "matchday" ? "MAÇ GÜNÜ" : "MAÇ SONU"}
                </Text>

                {fmt === "story" ? <View style={styles.spacerSm} /> : null}

                {mode === "matchday" ? (
                  <MatchDayBody
                    match={match}
                    homeLogo={homeLogo}
                    awayLogo={awayLogo}
                    dateLabel={dateLabel}
                  />
                ) : (
                  <FullTimeBody
                    match={match}
                    homeScore={homeScore}
                    awayScore={awayScore}
                    mvp={mvp}
                    stats={stats}
                    homeLogo={homeLogo}
                    awayLogo={awayLogo}
                  />
                )}

                <View style={styles.spacer} />

                <View style={styles.footer}>
                  <Text style={styles.footerSite}>ELİTLİG.COM</Text>
                  {igHandle ? <Text style={styles.footerHandle}>{igHandle}</Text> : null}
                </View>
              </LinearGradient>
            </View>
          </ViewShot>

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
          <Text style={styles.saveHint}>İndirmek için: Paylaş → "Görüntüyü Kaydet"</Text>
        </View>
      </Modal>
    </>
  );
}

/* ============ MAÇ GÜNÜ gövdesi ============ */

function MatchDayBody({
  match,
  homeLogo,
  awayLogo,
  dateLabel,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  dateLabel: string;
}) {
  const timeLabel = String(match.time ?? "").slice(0, 5);

  return (
    <>
      <View style={styles.mainCard}>
        <View style={styles.vsRow}>
          <View style={styles.vsSide}>
            <TeamCrest name={match.first_team_name} logo={homeLogo} size={64} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.first_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
          <Text style={styles.vsMark}>VS</Text>
          <View style={styles.vsSide}>
            <TeamCrest name={match.second_team_name} logo={awayLogo} size={64} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.second_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.boxRow}>
        <InfoBox value={dateLabel} label="TARİH" small={dateLabel.length > 6} />
        <InfoBox value={timeLabel} label="SAAT" />
        <InfoBox
          value={match.match_field ? String(match.match_field).toLocaleUpperCase("tr-TR") : "—"}
          label="SAHA"
          small
        />
      </View>
      <Text style={styles.liveNote}>▶ CANLI YAYIN: YouTube / Elitlig</Text>
    </>
  );
}

/* ============ MAÇ SONU gövdesi ============ */

function FullTimeBody({
  match,
  homeScore,
  awayScore,
  mvp,
  stats,
  homeLogo,
  awayLogo,
}: {
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  mvp: TopPlayer | null;
  stats: StatRow[];
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const wanted: Record<string, string> = {
    Goller: "GOL",
    Asistler: "ASİST",
    "Sarı Kart": "SARI KART",
  };
  const rows = (stats ?? []).filter((row) => wanted[row.label]).slice(0, 3);

  return (
    <>
      <View style={styles.mainCard}>
        <View style={styles.vsRow}>
          <View style={styles.vsSide}>
            <TeamCrest name={match.first_team_name} logo={homeLogo} size={56} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.first_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
          <Text style={styles.score}>
            {homeScore ?? "-"}
            <Text style={styles.scoreDash}> - </Text>
            {awayScore ?? "-"}
          </Text>
          <View style={styles.vsSide}>
            <TeamCrest name={match.second_team_name} logo={awayLogo} size={56} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.second_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
        </View>
        {mvp ? (
          <>
            <View style={styles.cardDivider} />
            <View style={styles.mvpRow}>
              <PlayerAvatar name={mvp.name} image={mvp.image} size={22} />
              <Text style={styles.mvpLine}>
                MAÇIN YILDIZI{"  "}
                <Text style={styles.mvpName}>{mvp.name.toLocaleUpperCase("tr-TR")}</Text>
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {rows.length > 0 ? (
        <View style={styles.boxRow}>
          {rows.map((row) => (
            <View key={row.label} style={styles.infoBox}>
              <Text style={styles.statPair}>
                {row.home}
                <Text style={styles.statPairDash}> - </Text>
                {row.away}
              </Text>
              <Text style={styles.boxLabel}>{wanted[row.label]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

function InfoBox({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <View style={styles.infoBox}>
      <Text style={[styles.boxValue, small && styles.boxValueSmall]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.boxLabel}>{label}</Text>
    </View>
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
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  fmtRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fmtPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fmtPillActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  fmtText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  frame: {
    width: CARD_W,
    backgroundColor: "#0B0A0E",
    borderRadius: 14,
    padding: 7,
    overflow: "hidden",
  },
  topStrip: {
    height: 7,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  body: {
    flex: 1,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    overflow: "hidden",
  },
  spacer: {
    flex: 1,
  },
  spacerSm: {
    height: spacing.lg,
  },
  watermark: {
    position: "absolute",
    right: -34,
    bottom: 18,
    fontSize: 78,
    fontWeight: "900",
    color: PURPLE,
    opacity: 0.07,
    transform: [{ rotate: "-14deg" }],
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontSize: 15,
    fontWeight: "900",
    color: PURPLE,
  },
  corner: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: PURPLE,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: PURPLE,
    marginTop: spacing.sm,
  },
  headline: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: INK,
    marginTop: 2,
    marginBottom: spacing.sm + 2,
  },
  mainCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  vsSide: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
  },
  vsName: {
    fontSize: 10,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
  },
  vsMark: {
    fontSize: 18,
    fontWeight: "900",
    color: PURPLE,
  },
  score: {
    fontSize: 29,
    fontWeight: "900",
    color: INK,
    fontVariant: ["tabular-nums"],
  },
  scoreDash: {
    color: GRAY,
  },
  cardDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  mvpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  mvpLine: {
    fontSize: 9,
    fontWeight: "700",
    color: GRAY,
    letterSpacing: 0.3,
  },
  mvpName: {
    color: INK,
    fontWeight: "900",
  },
  boxRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  infoBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 6,
    alignItems: "flex-start",
  },
  boxValue: {
    fontSize: 17,
    fontWeight: "900",
    color: INK,
  },
  boxValueSmall: {
    fontSize: 11,
    marginTop: 4,
  },
  boxLabel: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: GRAY,
    marginTop: 3,
  },
  statPair: {
    fontSize: 16,
    fontWeight: "900",
    color: INK,
    fontVariant: ["tabular-nums"],
  },
  statPairDash: {
    color: GRAY,
  },
  liveNote: {
    fontSize: 9,
    fontWeight: "700",
    color: GRAY,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  footer: {
    alignItems: "center",
    gap: 1,
  },
  footerSite: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    color: GRAY,
  },
  footerHandle: {
    fontSize: 8,
    fontWeight: "700",
    color: PURPLE,
  },
  saveHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
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
