/**
 * LİG PENCERESİ — şehrin üstünde ahşap çerçeveli oyun penceresi (eski alttan
 * açılan "Lig ilerlemesi" sayfasının yerine; components/city2/CityHome silindi).
 *
 *   · Kalkan rozet: şu anki lig → sıradaki lig, gelişim puanı çubuğu.
 *   · Üç adımda ilerleme (ara adım → ana yükseltme → lig) tahta karolarda.
 *   · Sıradaki ligin koşulları (gelişim, bina aşamaları, gerçek hayat kilidi;
 *     StepCard/NextRequirements) ve altta "LİGE YÜKSEL".
 *   · "Bütün ligler": kariyer merdiveni penceresi.
 *
 * Bütün adlar ve koşullar sunucudan gelir (GET /city2 → ladder).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import type { City2Building, City2Ladder } from "@/lib/puzzle/city2";
import { CG, CP } from "@/lib/puzzle/cityGamePalette";
import { fonts, radius, space, textScale, type } from "@/theme";

import { NextRequirements } from "../StepCard";
import { cardStyle, fmt } from "../shared";
import { BOTTOM, GameBar, GlossyButton, PaperText, TOP } from "./CityGameKit";
import { GameModal } from "./GameModal";

type IconName = keyof typeof Ionicons.glyphMap;

const shadowText = { textShadowColor: CG.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 };

export function LeagueWindow({
  visible,
  onClose,
  ladder,
  buildings,
  busy,
  onAdvance,
  onBuilding,
  onLadder,
}: {
  visible: boolean;
  onClose: () => void;
  ladder: City2Ladder | null;
  buildings: City2Building[];
  busy: boolean;
  onAdvance: (pay?: boolean) => void;
  onBuilding: (key: string) => void;
  onLadder: () => void;
}) {
  const next = ladder?.next ?? null;
  const footer = (
    <>
      {next?.can_advance ? (
        <GlossyButton label={busy ? "YÜKSELİYOR…" : "LİGE YÜKSEL"} sub={next.title} icon="arrow-up-circle" tone="green" busy={busy} onPress={() => onAdvance()} accessibilityLabel={`Lige yüksel: ${next.title}`} />
      ) : null}
      <GlossyButton label="BÜTÜN LİGLER" icon="trending-up" tone="purple" small onPress={onLadder} accessibilityLabel="Bütün ligleri ve geçmişi gör" />
    </>
  );
  const last = ladder ? ladder.steps[ladder.steps.length - 1]?.label ?? String(ladder.max_rung) : "";
  const devPct = next ? Math.min(1, next.dev.have / Math.max(1, next.dev.need)) : 1;
  return (
    <GameModal visible={visible} onClose={onClose} title="Lig ilerlemesi" footer={ladder ? footer : null}>
      {ladder ? (
        <>
          <LinearGradient colors={CG.league} start={TOP} end={BOTTOM} style={styles.hero}>
            <View style={styles.heroShine} />
            <View style={styles.heroRow}>
              <Shield label={ladder.current.label} />
              <View style={styles.heroTexts}>
                <Text style={styles.heroOver} {...textScale.badge}>
                  {`ŞU ANKİ LİG · ${ladder.current.label}/${last}`}
                </Text>
                <Text style={styles.heroTitle} numberOfLines={2} {...textScale.dense}>
                  {ladder.current.title}
                </Text>
              </View>
            </View>
            {next ? (
              <View style={styles.nextRow}>
                <Ionicons name="arrow-forward-circle" size={18} color={CG.star} />
                <Text style={styles.nextText} numberOfLines={1} {...textScale.dense}>
                  {`Sıradaki: ${next.title}`}
                </Text>
              </View>
            ) : null}
            {next ? <GameBar value={devPct} tone={next.can_advance ? "green" : "gold"} height={16} label={`${fmt(next.dev.have)} / ${fmt(next.dev.need)} gelişim`} /> : null}
          </LinearGradient>

          <View style={styles.how}>
            <HowStep icon="construct" tone="blue" title="Ara adımlar" text="Binaya eşya ve oda ekle. Yalnız yıldız ister." />
            <Ionicons name="chevron-forward" size={16} color={CP.textTertiary} />
            <HowStep icon="business" tone="gold" title="Ana yükseltme" text="Bina büyür: yıldız, Elit Lira ve lig şartı." />
            <Ionicons name="chevron-forward" size={16} color={CP.textTertiary} />
            <HowStep icon="trophy" tone="green" title="Lige yüksel" text="Gelişim ve bina aşamaları tamamsa." />
          </View>

          {next ? (
            <View style={styles.reqCard}>
              <Text style={styles.reqHead} {...textScale.dense}>
                {`${next.title} için gerekenler`.toLocaleUpperCase("tr-TR")}
              </Text>
              <NextRequirements next={next} buildings={buildings} onBuilding={onBuilding} busy={busy} onPay={() => onAdvance(true)} />
            </View>
          ) : (
            <PaperText center>Zirvedesin: Şampiyonlar Ligi şampiyonu. Prestij ve sembol yapılarla şehrini büyütmeye devam et.</PaperText>
          )}
        </>
      ) : null}
    </GameModal>
  );
}

/** Lig kalkanı: altın kalkanın üstünde basamak etiketi. */
function Shield({ label }: { label: string }) {
  return (
    <View style={styles.shieldWrap}>
      <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={styles.shield}>
        <Ionicons name="shield" size={50} color={CG.btn.gold.lip} style={styles.shieldIcon} />
        <Text style={styles.shieldText} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}

function HowStep({ icon, tone, title, text }: { icon: IconName; tone: "blue" | "gold" | "green"; title: string; text: string }) {
  const t = CG.btn[tone];
  return (
    <View style={styles.howStep}>
      <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={styles.howIcon}>
        <Ionicons name={icon} size={18} color={t.ink} />
      </LinearGradient>
      <Text style={styles.howTitle} numberOfLines={2} {...textScale.dense}>
        {title}
      </Text>
      <Text style={styles.howText} {...textScale.long}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.md, gap: space.sm, borderWidth: 3, borderColor: CG.white, overflow: "hidden" },
  heroShine: { position: "absolute", top: 4, left: 16, right: 16, height: 16, borderRadius: radius.pill, backgroundColor: CG.shine, opacity: 0.4 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroTexts: { flex: 1, gap: 2 },
  heroOver: { ...type.micro, fontFamily: fonts.bold, color: CG.star, letterSpacing: 1 },
  heroTitle: { ...type.h2, fontFamily: fonts.bold, color: CG.white, ...shadowText },
  nextRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  nextText: { ...type.labelSm, fontFamily: fonts.bold, color: CG.white, flex: 1 },

  shieldWrap: { width: 62, height: 62 },
  shield: { width: 62, height: 62, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CG.white },
  shieldIcon: { position: "absolute" },
  shieldText: { ...type.h3, fontFamily: fonts.bold, color: CG.white, ...shadowText },

  how: { flexDirection: "row", alignItems: "center", gap: 2 },
  howStep: { flex: 1, alignItems: "center", gap: 4, padding: space.xs, borderRadius: radius.lg, backgroundColor: CP.surface2, alignSelf: "stretch" },
  howIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CG.white },
  howTitle: { ...type.labelXs, fontFamily: fonts.bold, color: CP.textPrimary, textAlign: "center" },
  howText: { ...type.caption, color: CP.textSecondary, textAlign: "center" },

  reqCard: { ...cardStyle, padding: space.md, gap: space.sm },
  reqHead: { ...type.micro, fontFamily: fonts.bold, color: CP.textTertiary, letterSpacing: 1 },
});
