/**
 * KULÜBE KATIL — misafir ve henüz bir role bağlı olmayan üyenin Yönetim
 * sekmesindeki EYLEM AKIŞI.
 *
 * KURGU (Gece teması · ikinci tur):
 *   1. AÇILIŞ KARTI — sahne zemininde (gradientInk + Aurora) "Kulübüne katıl"
 *      / "Hesabını bağla" başlığı, tek cümle ve üç adımın ilerleme özeti.
 *   2. ADIMLAR — tek kartta DİKEY YOL: numaralı düğümler imza degradeli bir
 *      çizgiyle bağlanır; her adımda başlık, açıklama ve durum hapı
 *      (Onay bekliyor · Reddedildi · Giriş gerekli). Dokununca adımın ekranı.
 *   3. MİSAFİRDE giriş kartı (Giriş yap / Üye ol), ÜYEDE hesap satırları.
 *
 * MİSAFİR — üç adım:
 *   1. Takımını bul        → `/ara?tip=takim` (girişsiz çalışır)
 *   2. Davet ve başvuru    → giriş ister
 *   3. Takım kur           → `/iletisim?konu=…` (girişsiz de gönderilebilir)
 *
 * ÜYE (giriş yapmış, oyuncu profili ve takımı YOK) — adımlar hesabın yapacağı
 * gerçek işlerdir:
 *   1. Oyuncu profilini bağla → `/oyuncum/bagla` (kaydını sahiplen / yeni aç)
 *   2. Takım bul ve başvur    → `/davetler` (başvuru + gelen davetler)
 *   3. Takımını yönet          → `/oyuncum/bagla?tur=takim`
 *   Bekleyen talep varsa adımın yerinde DURUMU yazar ("Onay bekliyor");
 *   reddedilen talebin yönetici notu görünür.
 *
 * PROPS sabittir: `{ signedIn, go }` (app/(tabs)/kulubum.tsx çizer).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MenuGroup, type MenuItemSpec } from "@/components/account/MenuBlocks";
import { Aurora, Badge, Button, IconTile, Reveal, SectionHeader, Touchable, type IconTileTone } from "@/components/ui";
import { accountRequestList, memberKeys } from "@/lib/api/member/player";
import { getAccountRequests } from "@/lib/api/playerProfile";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** İletişim formunun "Konu" alanına yazılan ön dolgu. */
export const TEAM_APPLICATION_SUBJECT = "Takım kurma başvurusu";

type IconName = keyof typeof Ionicons.glyphMap;

interface Step {
  key: string;
  icon: IconName;
  tone: IconTileTone;
  title: string;
  subtitle: string;
  href: string;
  needsAuth?: boolean;
  /** Bu adımı kilitleyen bekleyen talep türleri. */
  requestTypes?: string[];
}

const GUEST_STEPS: Step[] = [
  { key: "bul", icon: "search", tone: "cyan", title: "Takımını bul", subtitle: "Adıyla ara, takım sayfasını aç", href: "/ara?tip=takim" },
  {
    key: "davet",
    icon: "mail-unread",
    tone: "violet",
    title: "Davet ve başvurular",
    subtitle: "Takıma başvur, gelen daveti kabul et",
    href: "/davetler",
    needsAuth: true,
  },
  {
    key: "kur",
    icon: "flag",
    tone: "gold",
    title: "Takım kurmak için başvur",
    subtitle: "Lig yönetimine başvuru gönder",
    href: `/iletisim?konu=${encodeURIComponent(TEAM_APPLICATION_SUBJECT)}`,
  },
];

const MEMBER_STEPS: Step[] = [
  {
    key: "oyuncu",
    icon: "person-add",
    tone: "cyan",
    title: "Oyuncu profilini bağla",
    subtitle: "Kaydını bul ve sahiplen ya da yeni profil aç",
    href: "/oyuncum/bagla",
    requestTypes: ["player_claim", "player_create"],
  },
  {
    key: "basvur",
    icon: "mail-unread",
    tone: "violet",
    title: "Takım bul ve başvur",
    subtitle: "Takımlara başvur, gelen davetleri yanıtla",
    href: "/davetler",
  },
  {
    key: "yonet",
    icon: "shield-half",
    tone: "gold",
    title: "Takımını yönet",
    subtitle: "Başkanıysan yönetim yetkisi iste ya da yeni takım kur",
    href: "/oyuncum/bagla?tur=takim",
    requestTypes: ["team_management", "team_create"],
  },
];

type StepStatus = "open" | "locked" | "pending" | "rejected";

export const JoinFlow = React.memo(function JoinFlow({
  signedIn,
  go,
}: {
  signedIn: boolean;
  go: (href: string) => void;
}) {
  /* oyuncum/bagla ve Kariyerim ile ORTAK anahtar — ikinci istek atılmaz. */
  const requests = useQuery({
    queryKey: memberKeys.accountRequests,
    queryFn: getAccountRequests,
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
  });
  const list = accountRequestList(requests.data);
  const steps = signedIn ? MEMBER_STEPS : GUEST_STEPS;

  const resolved = steps.map((step) => {
    const locked = Boolean(step.needsAuth && !signedIn);
    const mine = step.requestTypes ? list.filter((item) => step.requestTypes!.includes(item.type)) : [];
    const pending = mine.some((item) => item.status === "pending");
    const rejected = !pending ? mine.find((item) => item.status === "rejected") : undefined;
    const rejectedNote = rejected ? (rejected.adminNote ?? rejected.admin_note ?? rejected.reviewNote ?? null) : null;
    const status: StepStatus = locked ? "locked" : pending ? "pending" : rejected ? "rejected" : "open";
    const subtitle = locked
      ? "Önce giriş yap"
      : pending
        ? "Talebin lig yönetiminde; dokun, durumu gör ya da geri çek"
        : rejected
          ? `Son talebin reddedildi${rejectedNote ? `: ${rejectedNote}` : ""} — yeniden dene`
          : step.subtitle;
    return { step, status, subtitle };
  });
  const pendingCount = resolved.filter((item) => item.status === "pending").length;

  const accountItems: MenuItemSpec[] = [
    {
      key: "modlar",
      icon: "toggle",
      tone: "neutral",
      title: "Profil modları",
      subtitle: "Oyuncu / takım başkanı alanını aç-kapat",
      onPress: () => go("/oyuncum/modlar"),
    },
    {
      key: "bildirim",
      icon: "notifications",
      tone: "violet",
      title: "Bildirim tercihleri",
      subtitle: "Hangi bildirimler telefonuna gelsin",
      onPress: () => go("/bildirim-tercihleri"),
    },
    {
      key: "hesabim",
      icon: "person-circle",
      tone: "cyan",
      title: "Hesabım",
      subtitle: "Üyelik bilgileri ve güvenlik",
      onPress: () => go("/hesabim"),
    },
  ];

  return (
    <View style={styles.wrap}>
      {/* 1) AÇILIŞ KARTI */}
      <Reveal>
        <View style={styles.intro}>
          <LinearGradient
            colors={colors.gradientInk}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Aurora variant="stage" style={StyleSheet.absoluteFill} />
          <View style={styles.introHead}>
            <IconTile icon={signedIn ? "link" : "shield-half"} tone="signature" size={44} />
            <View style={styles.flex}>
              <Text style={styles.introOverline} {...textScale.badge}>
                {upperTR(signedIn ? "Rolün henüz yok" : "Üç adımda kulübündesin")}
              </Text>
              <Text style={styles.introTitle} {...textScale.dense}>
                {signedIn ? "Hesabını bağla" : "Kulübüne katıl"}
              </Text>
            </View>
          </View>
          <Text style={styles.introBody} {...textScale.long}>
            {signedIn
              ? "Oyuncu profilin ya da takımın bağlanınca kadro, maç hazırlığı ve sözleşme araçların burada açılır."
              : "Takımını bul, başvur ya da kendi takımını kur. Rolüne göre takım, oyuncu ve lig araçların burada açılır."}
          </Text>
          <View style={styles.introSteps}>
            {resolved.map(({ step, status }, index) => (
              <View
                key={step.key}
                style={[
                  styles.introPip,
                  status === "pending" ? styles.introPipPending : null,
                  index === 0 && status === "open" ? styles.introPipNext : null,
                ]}
              />
            ))}
            <Text style={styles.introStepsText} {...textScale.badge}>
              {pendingCount > 0 ? `${pendingCount} talep inceleniyor` : `${steps.length} adım`}
            </Text>
          </View>
        </View>
      </Reveal>

      {/* 2) ADIMLAR — dikey yol */}
      <SectionHeader title={signedIn ? "Adımlar" : "Nasıl katılırım?"} icon="footsteps" iconTone="violet" inset="flush" />
      <View style={styles.card}>
        {resolved.map(({ step, status, subtitle }, index) => (
          <Reveal key={step.key} index={index + 1}>
            <StepRow
              index={index}
              step={step}
              status={status}
              subtitle={subtitle}
              last={index === resolved.length - 1}
              onPress={() => go(status === "locked" ? "/giris" : step.href)}
            />
          </Reveal>
        ))}
      </View>

      {/* 3) GİRİŞ / HESAP */}
      {signedIn ? (
        <MenuGroup title="Hesap" icon="person" tone="cyan" items={accountItems} style={styles.accountGroup} />
      ) : (
        <View style={styles.auth}>
          <View style={styles.authHead}>
            <IconTile icon="log-in" tone="violet" size={36} glow={false} />
            <View style={styles.flex}>
              <Text style={styles.authTitle} {...textScale.dense}>
                Zaten bir takımın var mı?
              </Text>
              <Text style={styles.authText} {...textScale.long}>
                Giriş yap; rolüne göre takım, oyuncu ve lig araçların açılır.
              </Text>
            </View>
          </View>
          <View style={styles.authActions}>
            <Button label="Giriş yap" onPress={() => go("/giris")} style={styles.flex} />
            <Button label="Üye ol" onPress={() => go("/kayit")} variant="secondary" style={styles.flex} />
          </View>
        </View>
      )}
    </View>
  );
});

/* ═══════════════════════════════ ADIM SATIRI ═══════════════════════════════ */

const NODE = 30;

const StepRow = React.memo(function StepRow({
  index,
  step,
  status,
  subtitle,
  last,
  onPress,
}: {
  index: number;
  step: Step;
  status: StepStatus;
  subtitle: string;
  last: boolean;
  onPress: () => void;
}) {
  const pending = status === "pending";
  const rejected = status === "rejected";
  const locked = status === "locked";
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Adım ${index + 1}: ${step.title}. ${subtitle}`}
      style={styles.step}
    >
      {/* Yol: düğüm + alttaki bağlantı çizgisi */}
      <View style={styles.rail}>
        <View
          style={[
            styles.node,
            pending ? styles.nodePending : rejected ? styles.nodeRejected : locked ? styles.nodeLocked : null,
          ]}
        >
          {pending ? (
            <Ionicons name="hourglass" size={14} color={colors.warn} />
          ) : rejected ? (
            <Ionicons name="refresh" size={14} color={colors.danger} />
          ) : locked ? (
            <Ionicons name="lock-closed" size={13} color={colors.textTertiary} />
          ) : (
            <Text style={styles.nodeNumber} {...textScale.badge}>
              {index + 1}
            </Text>
          )}
        </View>
        {!last ? (
          <LinearGradient
            colors={colors.gradientSignature}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.link}
          />
        ) : null}
      </View>

      <View style={[styles.stepBody, !last && styles.stepBodyGap]}>
        <View style={styles.stepHead}>
          <Text style={styles.stepTitle} numberOfLines={1} {...textScale.dense}>
            {step.title}
          </Text>
          {pending ? (
            <Badge label="Onay bekliyor" tone="warn" size="xs" />
          ) : rejected ? (
            <Badge label="Reddedildi" tone="danger" size="xs" />
          ) : locked ? (
            <Badge label="Giriş gerekli" tone="neutral" size="xs" />
          ) : null}
        </View>
        <Text style={[styles.stepSub, rejected && styles.stepSubDanger]} numberOfLines={2} {...textScale.dense}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.stepEnd}>
        <IconTile icon={step.icon} tone={locked ? "neutral" : step.tone} size={32} glow={false} />
      </View>
    </Touchable>
  );
});

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenPadding, gap: space.xs, marginTop: space.md },
  flex: { flex: 1, minWidth: 0 },

  intro: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    marginBottom: space.md,
    ...elevate(2),
  },
  introHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  introOverline: { ...type.overline, color: colors.brandOnDark },
  introTitle: { ...type.display, color: colors.onDark, marginTop: 2 },
  introBody: { ...type.bodySm, color: colors.onDarkMuted },
  introSteps: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  introPip: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.inkTileBorder },
  introPipNext: { backgroundColor: colors.brandOnDark },
  introPipPending: { backgroundColor: colors.warn },
  introStepsText: { ...type.micro, color: colors.onDarkMuted, marginLeft: space.xs },

  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingVertical: space.sm,
    overflow: "hidden",
    ...elevate(1),
  },
  step: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  rail: { width: NODE, alignItems: "center" },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  nodePending: { backgroundColor: colors.warnDim, borderColor: colors.warn },
  nodeRejected: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  nodeLocked: { backgroundColor: colors.surface3, borderColor: colors.border },
  nodeNumber: { ...type.label, fontFamily: fonts.bold, color: colors.brandAccent },
  link: { width: 2, flex: 1, minHeight: space.md, borderRadius: 1, marginVertical: space.xs, opacity: 0.6 },
  stepBody: { flex: 1, minWidth: 0, gap: 2, paddingTop: space.xs, paddingBottom: space.sm },
  stepBodyGap: { paddingBottom: space.lg },
  stepHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stepTitle: { ...type.h3, color: colors.textPrimary, flexShrink: 1 },
  stepSub: { ...type.bodySm, color: colors.textTertiary },
  stepSubDanger: { color: colors.danger },
  stepEnd: { paddingTop: 2 },

  accountGroup: { marginTop: space.md },

  auth: {
    marginTop: space.lg,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  authHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  authTitle: { ...type.h3, color: colors.textPrimary },
  authText: { ...type.bodySm, color: colors.textSecondary, marginTop: 1 },
  authActions: { flexDirection: "row", gap: space.sm },
});
