/**
 * KULÜP ŞEHRİ 2.0 · FAZ 5 — PRESTİJ (merdivenin zirvesinde, isteğe bağlı).
 *
 *   · PrestigeCard — 19. kademede (son basamak) merdivenin başında: ne
 *     kazanılır, "Önizle" ile iki adımlı akışı açar.
 *   · PrestigeTeaser — zirvede değilken merdivenin sonunda kısa tanıtım
 *     ("son basamakta açılır") ve varsa bugünkü prestij seviyesi.
 *   · PrestigeSheet — 1. adım: sunucunun önizlemesi (sıfırlananlar,
 *     korunanlar, kazanılanlar, uyarı); 2. adım: "anladım" onayı ve geri
 *     sayımlı jetonla kesin onay. Jetonun süresi dolarsa yeniden önizlenir.
 *   · PrestigeCelebration — onaydan sonra yeni prestij yıldızı.
 *
 * Prestij bonusları yalnız oyun içidir (EL üretimi ve yıldız kazancı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Reveal, Toggle, Touchable } from "@/components/ui";
import { fmtEl, fmtPct, type City2Crest, type City2Prestige, type City2PrestigePreviewResult, type City2PrestigeResult } from "@/lib/puzzle/city2";
import { CITY2_SEASON, CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { useNow } from "./Academy";
import { CrestBadge, PrestigeStars } from "./Season";
import { cardStyle, fmt } from "./shared";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

type IconName = keyof typeof Ionicons.glyphMap;

function GainLine({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  return (
    <View style={styles.gainLine}>
      <View style={styles.gainIcon}>
        <Ionicons name={icon} size={15} color={CITY2_UI.star} />
      </View>
      <Text style={styles.gainTitle} numberOfLines={2} {...textScale.dense}>
        {title}
      </Text>
      <Text style={styles.gainValue} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

/** Zirvedeki kart: ne kazanılır, ne olur; "Prestiji önizle". */
export function PrestigeCard({ prestige, crest, busy, onStart }: { prestige: City2Prestige; crest: City2Crest | null | undefined; busy: boolean; onStart: () => void }) {
  const next = prestige.next;
  const maxed = prestige.blocked === "PRESTIGE_MAXED" || !next;
  return (
    <View style={styles.card}>
      <LinearGradient colors={CITY2_SEASON.prestige} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.cardTop}>
        <CrestBadge crest={crest} size={52} onDark />
        <View style={styles.flex}>
          <Text style={styles.over} {...textScale.badge}>
            {maxed ? "EN YÜKSEK PRESTİJ" : next ? `${next.level}. PRESTİJ` : "PRESTİJ"}
          </Text>
          <Text style={styles.cardTitle} {...textScale.dense}>
            {maxed ? `${prestige.level}. prestij yıldızı` : "Zirvedesin"}
          </Text>
        </View>
      </View>
      <Text style={styles.cardText} {...textScale.long}>
        {maxed ? "Prestij yıldızlarının hepsini topladın. Bonusların kalıcı." : prestige.intro}
      </Text>
      {!maxed && next ? (
        <View style={styles.gains}>
          <GainLine icon="trending-up" title="Elit Lira üretimi (kalıcı)" value={`${fmtPct(prestige.el_pct)} → ${fmtPct(next.el_pct)}`} />
          <GainLine icon="star" title="Yıldız kazancı (prestijden sonra)" value={`${fmtPct(prestige.star_pct)} → ${fmtPct(next.star_pct)}`} />
          <GainLine icon="shield" title="Armada prestij yıldızı ve prestij anıtı" value={`${next.level}.`} />
        </View>
      ) : null}
      {!maxed ? <Button label="Prestiji önizle" icon="eye-outline" onPress={onStart} loading={busy} fullWidth haptic="medium" /> : null}
    </View>
  );
}

/** Zirvede değilken: son basamakta açılır. */
export function PrestigeTeaser({ prestige, crest }: { prestige: City2Prestige; crest: City2Crest | null | undefined }) {
  return (
    <View style={styles.teaser}>
      <View style={styles.teaserIcon}>
        <Ionicons name="star" size={18} color={CITY2_UI.star} />
      </View>
      <View style={styles.flex}>
        <View style={styles.teaserHead}>
          <Text style={styles.teaserTitle} {...textScale.dense}>
            Prestij
          </Text>
          {prestige.level > 0 ? <PrestigeStars count={crest?.prestige_stars ?? prestige.level} size={12} /> : null}
          <Text style={styles.teaserTag} {...textScale.badge}>
            SON BASAMAKTA AÇILIR
          </Text>
        </View>
        <Text style={styles.teaserText} {...textScale.long}>
          Zirveye çıkınca istersen şehrini yeniden kurarsın: kasan, sembol yapıların ve akademi oyuncuların kalır; her prestijde EL üretimine kalıcı +{fmtPct(prestige.next?.el_pct != null ? prestige.next.el_pct - prestige.el_pct : 0.05)} ve armana bir yıldız eklenir.
        </Text>
        {prestige.level > 0 ? (
          <Text style={styles.teaserNow} {...textScale.dense}>
            Şu an {prestige.level}. prestij · EL üretimi +{fmtPct(prestige.el_pct)} · yıldız +{fmtPct(prestige.star_pct)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ───────────────────────── Önizleme + onay ───────────────────────── */

function Section({ icon, tone, title, children }: { icon: IconName; tone: "reset" | "keep" | "gain"; title: string; children: React.ReactNode }) {
  const color = tone === "reset" ? colors.danger : tone === "keep" ? colors.win : colors.brandAccent;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={styles.sectionTitle} {...textScale.dense}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Row({ text, value }: { text: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <Text style={styles.rowText} numberOfLines={3} {...textScale.dense}>
        {text}
      </Text>
      {value ? (
        <Text style={styles.rowValue} {...textScale.badge}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

const TOKEN_MS = 10 * 60_000 - 5_000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function PrestigeSheet({
  visible,
  onClose,
  preview,
  loading,
  confirming,
  onRefresh,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  preview: (City2PrestigePreviewResult & { receivedAt: number }) | null;
  loading: boolean;
  confirming: boolean;
  onRefresh: () => void;
  onConfirm: (token: string) => void;
}) {
  const [agree, setAgree] = useState(false);
  const now = useNow(1000);
  const token = preview?.token ?? null;
  useEffect(() => setAgree(false), [token, visible]);
  const p = preview?.preview ?? null;
  // Jeton 10 dakika geçerli; süre yanıtın geldiği andan ölçülür (cihaz saati
  // sunucuyla kayık olabilir), küçük bir payla.
  const left = preview ? Math.max(0, TOKEN_MS - (now - preview.receivedAt)) : 0;
  const expired = Boolean(preview) && left <= 0;
  const closing = p ? p.reset.buildings.filter((b) => b.before > b.after) : [];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Prestij"
      snap="full"
      footer={
        p ? (
          <View style={styles.footer}>
            {expired ? (
              <Button label="Önizlemeyi yenile" icon="refresh" variant="secondary" onPress={onRefresh} loading={loading} fullWidth />
            ) : (
              <>
                <Touchable feedback="row" onPress={() => setAgree((v) => !v)} style={styles.agree} accessibilityRole="switch" accessibilityState={{ checked: agree }} accessibilityLabel="Şehrimin yeniden kurulacağını ve bunun geri alınamayacağını anladım">
                  <Text style={styles.agreeText} {...textScale.dense}>
                    Şehrimin yeniden kurulacağını ve bunun geri alınamayacağını anladım
                  </Text>
                  <Toggle value={agree} onValueChange={setAgree} accessibilityLabel="Anladım" />
                </Touchable>
                <Button label={`${p.level.after}. prestiji onayla`} icon="star" variant="danger" onPress={() => token && onConfirm(token)} disabled={!agree || !token} loading={confirming} fullWidth haptic="success" />
                <Text style={styles.expiry} {...textScale.badge}>
                  Onay {mmss(left)} içinde geçerli
                </Text>
              </>
            )}
          </View>
        ) : null
      }
    >
      {!p ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandAccent} />
          <Text style={styles.loadingText} {...textScale.dense}>
            Önizleme hazırlanıyor…
          </Text>
        </View>
      ) : (
        <View style={styles.sheetBody}>
          <View style={styles.warn}>
            <Ionicons name="warning" size={18} color={colors.warn} />
            <Text style={styles.warnText} {...textScale.long}>
              {p.warning}
            </Text>
          </View>

          <Section icon="refresh-circle" tone="reset" title="Sıfırlananlar">
            <Row text="Kademe" value={`${p.reset.rung.before} → ${p.reset.rung.after}`} />
            <Row text="Gelişim puanı" value={`${fmt(p.reset.dev.before)} → ${fmt(p.reset.dev.after)}`} />
            <Row text={`${closing.length} bina ilk aşamasına döner${closing.length ? `: ${closing.slice(0, 4).map((b) => b.title).join(", ")}${closing.length > 4 ? "…" : ""}` : ""}`} />
            {p.reset.landmarks_unplaced.length ? <Row text={`${p.reset.landmarks_unplaced.length} sembol yapı kapanan yuvalardan depoya kalkar`} /> : null}
            <Row text="Harcanan yıldızlar geri gelmez" value={p.keep.stars_spent_refund > 0 ? fmt(p.keep.stars_spent_refund) : "iade yok"} />
          </Section>

          <Section icon="shield-checkmark" tone="keep" title="Korunanlar">
            <Row text="Elit Lira kasası (depodaki EL önce toplanır)" value={`${fmtEl(p.keep.el_balance)} EL`} />
            {p.keep.el_upgrades ? <Row text="Depo ve personel yükseltmeleri" /> : null}
            <Row text="Bütün sembol yapılar" value={fmt(p.keep.landmarks)} />
            <Row text="Akademi oyuncuları" value={fmt(p.keep.academy_players)} />
            {p.keep.history ? <Row text="Basamak geçmişi ve sezon puanı" /> : null}
          </Section>

          {p.reset.academy ? (
            <View style={styles.academy}>
              <Ionicons name="school-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.academyText} {...textScale.long}>
                {p.reset.academy.text}
              </Text>
            </View>
          ) : null}

          <Section icon="star" tone="gain" title="Kazanılanlar">
            <Row text="Prestij seviyesi" value={`${p.level.before} → ${p.level.after}`} />
            <Row text="Elit Lira üretimi, kalıcı" value={`${fmtPct(p.gains.el_pct.before)} → ${fmtPct(p.gains.el_pct.after)}`} />
            <Row text="Prestijden sonra kazanılan yıldızlara bonus" value={`${fmtPct(p.gains.star_pct.before)} → ${fmtPct(p.gains.star_pct.after)}`} />
            <Row text="Armada prestij yıldızı" value={`${p.gains.crest_stars}`} />
            {p.gains.landmark ? <Row text={p.gains.landmark.title} value={`+${fmt(p.gains.landmark.beauty)} güzellik`} /> : null}
          </Section>
        </View>
      )}
    </BottomSheet>
  );
}

/* ───────────────────────── Kutlama ───────────────────────── */

export function PrestigeCelebration({ result, onClose }: { result: City2PrestigeResult | null; onClose: () => void }) {
  const r = result;
  return (
    <BottomSheet visible={Boolean(r)} onClose={onClose} title="Yeni prestij yıldızı" footer={<Button label="Şehrimi yeniden kur" icon="hammer-outline" onPress={onClose} fullWidth haptic="success" />}>
      {r ? (
        <View style={styles.celebrate}>
          <Reveal scaleFrom={0.7}>
            <View style={styles.celebrateHero}>
              <LinearGradient colors={CITY2_SEASON.prestige} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
              <CrestBadge crest={r.crest} size={84} onDark />
              <Text style={styles.celebrateTitle} {...textScale.dense}>
                {r.level}. prestij
              </Text>
              <Text style={styles.celebrateSub} {...textScale.long}>
                Şehrin 1. kademeden yeniden başlıyor. Bonusların kalıcı.
              </Text>
            </View>
          </Reveal>
          <Reveal index={1}>
            <View style={styles.celebrateList}>
              <Row text="Elit Lira üretimi" value={`+${fmtPct(r.prestige.el_pct)}`} />
              <Row text="Yıldız kazancı" value={`+${fmtPct(r.prestige.star_pct)}`} />
              <Row text={`Prestij anıtı (${r.level}. yıldız) depona eklendi`} />
              {r.collected > 0 ? <Row text="Depolardaki EL kasana toplandı" value={`+${fmtEl(r.collected)} EL`} /> : null}
              {r.unplaced.length ? <Row text={`${r.unplaced.length} sembol yapı depoya kalktı; yuvalar açıldıkça yeniden yerleştir`} /> : null}
            </View>
          </Reveal>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  over: { ...type.overline, color: CITY2_UI.star },
  cardTitle: { ...type.h1, color: CITY_UI.white },
  cardText: { ...type.bodySm, color: CITY2_UI.panelMuted },
  gains: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  gainLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  gainIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CITY2_UI.panelChip },
  gainTitle: { ...type.labelSm, color: CITY_UI.white, flex: 1 },
  gainValue: { ...type.numSmStrong, color: CITY2_UI.star },

  teaser: { ...cardStyle, flexDirection: "row", gap: space.md, padding: space.md },
  teaserIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CITY2_UI.panel[1] },
  teaserHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  teaserTitle: { ...type.h3, color: colors.textPrimary },
  teaserTag: { ...type.nano, color: colors.textTertiary },
  teaserText: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  teaserNow: { ...type.caption, fontFamily: fonts.semibold, color: colors.brandAccent, marginTop: space.xs },

  loading: { alignItems: "center", gap: space.sm, paddingVertical: space.huge },
  loadingText: { ...type.bodySm, color: colors.textSecondary },
  sheetBody: { gap: space.md, paddingBottom: space.md },
  warn: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.warnDim, alignItems: "flex-start" },
  warnText: { ...type.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary, flex: 1 },
  section: { ...cardStyle, padding: space.md, gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xxs },
  sectionTitle: { ...type.h3, color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: colors.textTertiary },
  rowText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  rowValue: { ...type.numSmStrong, color: colors.textPrimary },
  academy: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, alignItems: "flex-start" },
  academyText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  footer: { gap: space.sm },
  agree: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  agreeText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  expiry: { ...type.caption, color: colors.textTertiary, textAlign: "center" },

  celebrate: { gap: space.md, paddingBottom: space.sm },
  celebrateHero: { alignItems: "center", gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg, borderRadius: radius.xxl, overflow: "hidden" },
  celebrateTitle: { ...type.display, color: CITY_UI.white, textAlign: "center" },
  celebrateSub: { ...type.bodySm, color: CITY2_UI.panelMuted, textAlign: "center" },
  celebrateList: { ...cardStyle, padding: space.md, gap: space.sm },
});
