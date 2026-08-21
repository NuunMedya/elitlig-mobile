import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import { Avatar, TeamLogo, Touchable, withAlpha } from "@/components/ui";
import {
  colors,
  dark as darkPalette,
  fonts,
  light,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { instagramUrl } from "@/lib/socials";
import { useScope } from "@/providers/ScopeProvider";
import type { ContribRow, StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch } from "@/lib/types";

/**
 * Paylaşım kartları — İçerik Havuzu şablonlarının renk dilinde, iki boyda.
 *
 * Boylar: Hikâye 9:16 ve Gönderi 3:4 — pencerede haplarla seçilir; kart
 * seçilen oranda yeniden akar (içerik üstte, alt bilgi dipte). Paylaş, kartı
 * PNG yakalayıp sistem menüsünü açar; oradaki "Görüntüyü Kaydet" ile galeriye
 * indirme de mümkündür (ayrı izin gerektirmez).
 *
 * ————— SABİT HEX NEDEN BURADA KALIYOR (bilinçli istisna) —————
 * Aşağıdaki CORAL_TEXT / CORAL_DEEP / INK / GRAY / CARD_BORDER ve kart içindeki
 * beyaz-lila gradyan, EKRANIN değil DIŞA AKTARILAN PNG'NİN renkleridir.
 * Kullanıcı kartı Instagram'a atar; oradaki görselin, paylaşanın telefonunda
 * koyu tema açık olup olmamasına göre değişmesi kabul edilemez — İçerik Havuzu
 * şablonu her paylaşımda BİREBİR aynı görünmelidir. Bu yüzden kart tuvali
 * temadan bağımsız sabit bir palet kullanır ve `colors.*` okumaz.
 *
 * BİLİNEN AÇIK (geçiş öncesinden devralındı): karttaki `TeamLogo`/`Avatar`,
 * logo bulunamadığında baş harfleri UYGULAMA paletiyle çizer — koyu temada
 * beyaz kartın üstünde koyu bir amblem kutusu çıkar. Logolu maçlarda görünmez,
 * çözümü de bu dosyada değil (`components/ui`de sabit renk seçeneği gerekir),
 * bu yüzden burada değiştirilmedi.
 *
 * KART GEOMETRİSİ DE DONDURULDU: tuval 264px genişliğe göre ayarlandığı için
 * kart içi boşluklar yeni ölçeğe DEĞER OLARAK birebir taşındı
 * (eski `spacing.md` = 16 → `space.lg` = 16). Yoğunluk için daraltmak
 * şablonun oranlarını bozardı.
 *
 * UYGULAMA KABUĞU İSE TOKENLI: tetikleyici düğme, boy hapları, alt eylemler ve
 * perde `@/theme` tokenlarından beslenir; kartın hep koyu bir perde üstünde
 * durması gerektiği için perde ve üstündeki beyaz metin, koyu paletten
 * (`darkPalette`) türetilir — böylece açık temada da kontrast korunur.
 */

const CARD_W = 264;
const FORMATS = {
  story: { label: "Hikâye 9:16", height: Math.round((CARD_W * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((CARD_W * 4) / 3) },
} as const;
type Fmt = keyof typeof FORMATS;

/*
 * KART TUVALİ PALETİ — dışa aktarılan PNG'nin renkleri (bkz. dosya başlığı).
 * Temayla DEĞİŞMEZ: paylaşılan görsel her cihazda birebir aynı görünmelidir.
 * Bu yüzden aktif palet (`colors`) değil, DONMUŞ AÇIK PALET (`light`) okunur —
 * koyu temadaki kullanıcı Instagram'a koyu zeminli bir kart göndermez, ama
 * değerler yine de token'dan gelir; burada da çıplak hex yoktur.
 *
 * MERCAN İKİ AYRI TOKEN: `CORAL` yalnız DOLGUDUR (üst şerit). Mercan METİN
 * olarak kağıt üstünde 2,44:1 verir ve AA'yı geçmez; metin için koyu mercan
 * (`light.brandAccent`, 4,70:1) kullanılır.
 */
const CORAL = light.brand;
const CORAL_DEEP = light.brandStrong;
/** Mercanın metin sürümü — kağıt üstünde AA geçen tek mercan. */
const CORAL_TEXT = light.brandAccent;
const INK = light.inverse;
const GRAY = light.textTertiary;
const CARD_BORDER = light.brandBorder;
/** Kartın dış çerçevesi (7px kenarlık etkisi veren zemin). */
const FRAME_INK = light.inverse;
/** Kart gövdesinin mercan tint → kağıt → beyaz gradyanı. */
const BODY_GRADIENT = [light.brandDim, light.bg, light.surface1] as const;
/** Kart içi kutuların beyaz zemini. */
const CARD_WHITE = light.surface1;

type Mode = "matchday" | "fulltime";

export function ShareScoreCard({
  mode,
  match,
  homeScore,
  awayScore,
  mvp,
  stats,
  contributions,
  homeLogo,
  awayLogo,
}: {
  mode: Mode;
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  mvp: TopPlayer | null;
  stats: StatRow[];
  contributions?: { home: ContribRow[]; away: ContribRow[] };
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
      <Touchable
        feedback="button"
        haptic="light"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={mode === "matchday" ? "Maç gününü paylaş" : "Sonucu paylaş"}
        style={styles.trigger}
      >
        <Ionicons name="share-social" size={15} color={colors.textOnBrand} />
        <Text style={styles.triggerText} {...textScale.dense}>
          {mode === "matchday" ? "Maç Gününü Paylaş" : "Sonucu Paylaş"}
        </Text>
      </Touchable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Boy seçici */}
          <View style={styles.fmtRow}>
            {(Object.keys(FORMATS) as Fmt[]).map((key) => (
              <Touchable
                key={key}
                feedback="chip"
                haptic="selection"
                onPress={() => setFmt(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: fmt === key }}
                accessibilityLabel={FORMATS[key].label}
                style={[styles.fmtPill, fmt === key && styles.fmtPillActive]}
              >
                <Text style={styles.fmtText} {...textScale.badge}>
                  {FORMATS[key].label}
                </Text>
              </Touchable>
            ))}
          </View>

          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={[styles.frame, { height: FORMATS[fmt].height }]}>
              <LinearGradient
                colors={[CORAL, CORAL_DEEP]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.topStrip}
              />
              <LinearGradient
                colors={BODY_GRADIENT}
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
                    contributions={contributions}
                    dateLabel={dateLabel}
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
            <Touchable
              feedback="button"
              haptic="light"
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              style={[styles.actionBtn, styles.closeBtn]}
            >
              <Text style={styles.closeText} {...textScale.dense}>
                Kapat
              </Text>
            </Touchable>
            <Touchable
              feedback="button"
              haptic="medium"
              onPress={share}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Paylaş"
              accessibilityState={{ busy }}
              style={[styles.actionBtn, styles.shareBtn]}
            >
              <Ionicons name="share-social" size={16} color={colors.textOnBrand} />
              <Text style={styles.shareText} {...textScale.dense}>
                {busy ? "Hazırlanıyor…" : "Paylaş"}
              </Text>
            </Touchable>
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
            <TeamLogo name={match.first_team_name} logo={homeLogo} size={64} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.first_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
          <Text style={styles.vsMark}>VS</Text>
          <View style={styles.vsSide}>
            <TeamLogo name={match.second_team_name} logo={awayLogo} size={64} />
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

/** "Doğukan YILDIRIM" → "D. YILDIRIM" */
function shortName(full: string) {
  const parts = String(full ?? "").trim().split(/\s+/);
  if (parts.length < 2) return String(full ?? "").toLocaleUpperCase("tr-TR");
  return `${parts[0][0]}. ${parts[parts.length - 1]}`.toLocaleUpperCase("tr-TR");
}

function FullTimeBody({
  match,
  homeScore,
  awayScore,
  mvp,
  stats,
  contributions,
  dateLabel,
  homeLogo,
  awayLogo,
}: {
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  mvp: TopPlayer | null;
  stats: StatRow[];
  contributions?: { home: ContribRow[]; away: ContribRow[] };
  dateLabel: string;
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const wanted: Record<string, string> = {
    Goller: "GOL",
    Asistler: "ASİST",
    "Sarı Kart": "SARI",
    "Kırmızı Kart": "KIRMIZI",
  };
  const rows = (stats ?? [])
    .filter((row) => wanted[row.label])
    .filter((row) => row.label !== "Kırmızı Kart" || row.home + row.away > 0)
    .slice(0, 4);

  const scorers = (list?: ContribRow[]) =>
    (list ?? []).filter((p) => p.goals > 0).slice(0, 4);
  const homeScorers = scorers(contributions?.home);
  const awayScorers = scorers(contributions?.away);
  const venue = match.match_field
    ? String(match.match_field).toLocaleUpperCase("tr-TR")
    : "";

  return (
    <>
      <Text style={styles.subMeta}>
        {venue ? `${venue} · ` : ""}
        {dateLabel}
      </Text>
      <View style={styles.mainCard}>
        <View style={styles.vsRow}>
          <View style={styles.vsSide}>
            <TeamLogo name={match.first_team_name} logo={homeLogo} size={56} />
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
            <TeamLogo name={match.second_team_name} logo={awayLogo} size={56} />
            <Text style={styles.vsName} numberOfLines={2}>
              {String(match.second_team_name ?? "").toLocaleUpperCase("tr-TR")}
            </Text>
          </View>
        </View>
        {homeScorers.length > 0 || awayScorers.length > 0 ? (
          <View style={styles.scorersRow}>
            <View style={styles.scorersCol}>
              {homeScorers.map((p) => (
                <Text key={`h-${p.playerId}-${p.name}`} style={styles.scorerLine} numberOfLines={1}>
                  ⚽ {shortName(p.name)}
                  {p.goals > 1 ? ` ×${p.goals}` : ""}
                </Text>
              ))}
            </View>
            <View style={[styles.scorersCol, styles.scorersColRight]}>
              {awayScorers.map((p) => (
                <Text key={`a-${p.playerId}-${p.name}`} style={styles.scorerLine} numberOfLines={1}>
                  {shortName(p.name)}
                  {p.goals > 1 ? ` ×${p.goals}` : ""} ⚽
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {mvp ? (
          <>
            <View style={styles.cardDivider} />
            <View style={styles.mvpRow}>
              <Avatar name={mvp.name} image={mvp.image} size={22} />
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
  /* ————— Uygulama kabuğu: tokenlı, temayla hareket eder ————— */
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: space.m,
    marginTop: space.sm,
  },
  triggerText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textOnBrand,
  },
  /**
   * Perde HER İKİ TEMADA DA koyudur: üstünde duran kart her zaman açık renkli
   * bir tuvaldir, açık temanın soluk perdesi onu zeminden ayıramazdı.
   */
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(darkPalette.bg, 0.65),
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
    gap: space.lg,
  },
  fmtRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  fmtPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.textOnStatus, 0.45),
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  fmtPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  fmtText: {
    ...type.label,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
  },
  actions: {
    flexDirection: "row",
    gap: space.lg,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    borderRadius: radius.pill,
    paddingHorizontal: space.xxxl,
    paddingVertical: space.md,
  },
  closeBtn: {
    backgroundColor: withAlpha(colors.textOnStatus, 0.14),
  },
  closeText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
  },
  shareBtn: {
    backgroundColor: colors.brand,
  },
  shareText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textOnBrand,
  },
  saveHint: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: withAlpha(colors.textOnStatus, 0.75),
  },

  /* ————— Kart tuvali: sabit palet + dondurulmuş geometri ————— */
  frame: {
    width: CARD_W,
    backgroundColor: FRAME_INK,
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
    paddingHorizontal: space.lg,
    paddingTop: space.m,
    paddingBottom: space.sm,
    overflow: "hidden",
  },
  spacer: {
    flex: 1,
  },
  spacerSm: {
    height: space.xxl,
  },
  watermark: {
    position: "absolute",
    right: -34,
    bottom: 18,
    fontSize: 78,
    fontFamily: fonts.bold,
    color: CORAL_TEXT,
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
    fontFamily: fonts.bold,
    color: CORAL_TEXT,
  },
  corner: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    color: CORAL_TEXT,
  },
  kicker: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    color: CORAL_TEXT,
    marginTop: space.sm,
  },
  headline: {
    fontSize: 19,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
    color: INK,
    marginTop: 2,
    marginBottom: space.m,
  },
  mainCard: {
    backgroundColor: CARD_WHITE,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  vsSide: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
  },
  vsName: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: INK,
    textAlign: "center",
  },
  vsMark: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: CORAL_TEXT,
  },
  score: {
    fontSize: 29,
    fontFamily: fonts.bold,
    color: INK,
    fontVariant: ["tabular-nums"],
  },
  scoreDash: {
    color: GRAY,
  },
  cardDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginVertical: space.sm,
    marginHorizontal: space.sm,
  },
  mvpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  mvpLine: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: GRAY,
    letterSpacing: 0.3,
  },
  mvpName: {
    color: INK,
    fontFamily: fonts.bold,
  },
  boxRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  infoBox: {
    flex: 1,
    backgroundColor: CARD_WHITE,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingVertical: space.m,
    paddingHorizontal: space.s,
    alignItems: "flex-start",
  },
  boxValue: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: INK,
  },
  boxValueSmall: {
    fontSize: 11,
    marginTop: 4,
  },
  boxLabel: {
    fontSize: 7,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    color: GRAY,
    marginTop: 3,
  },
  subMeta: {
    fontSize: 8,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    color: GRAY,
    marginTop: -6,
    marginBottom: space.sm,
  },
  scorersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
  scorersCol: {
    flex: 1,
    gap: 2,
  },
  scorersColRight: {
    alignItems: "flex-end",
  },
  scorerLine: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: INK,
  },
  statPair: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: INK,
    fontVariant: ["tabular-nums"],
  },
  statPairDash: {
    color: GRAY,
  },
  liveNote: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: GRAY,
    textAlign: "center",
    marginTop: space.sm,
  },
  footer: {
    alignItems: "center",
    gap: 1,
  },
  footerSite: {
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 2,
    color: GRAY,
  },
  footerHandle: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: CORAL_TEXT,
  },
});
