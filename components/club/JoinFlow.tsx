/**
 * KULÜBE KATIL — misafir ve henüz bir role bağlı olmayan üyenin Yönetim
 * sekmesindeki EYLEM AKIŞI.
 *
 * MİSAFİR — üç adım, tek kâğıt grupta (ListRow `position` grubu):
 *   1. Takımını bul        → `/ara?tip=takim` (girişsiz çalışır)
 *   2. Davet ve başvuru    → giriş ister
 *   3. Takım kur           → `/iletisim?konu=…` (girişsiz de gönderilebilir)
 *   Altta "Giriş yap / Üye ol".
 *
 * ÜYE (giriş yapmış, oyuncu profili ve takımı YOK) — eski akış ona da aynı
 * üç genel adımı gösteriyordu; hesabını oyuncu kaydına ya da takımına
 * BAĞLAMANIN yolu bu ekranda yoktu (çıkmaz). Artık adımlar hesabın yapacağı
 * gerçek işlerdir:
 *   1. Oyuncu profilini bağla → `/oyuncum/bagla` (kaydını sahiplen / yeni aç)
 *   2. Takım bul ve başvur    → `/davetler` (başvuru + gelen davetler)
 *   3. Takımını yönet          → `/oyuncum/bagla?tur=takim` (yönetim yetkisi
 *                                iste ya da yeni takım kur)
 *   Bekleyen talep varsa adımın yerinde DURUMU yazar ("Onay bekliyor");
 *   reddedilen talebin yönetici notu görünür. Altında hesap satırları
 *   (profil modları, hesabım) — plain üyenin ayarları da tek dokunuş.
 *
 * PROPS sabittir: `{ signedIn, go }` (app/(tabs)/kulubum.tsx çizer).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, Button, ListRow, Reveal, SectionHeader } from "@/components/ui";
import { accountRequestList, memberKeys } from "@/lib/api/member/player";
import { getAccountRequests } from "@/lib/api/playerProfile";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

/** İletişim formunun "Konu" alanına yazılan ön dolgu. */
export const TEAM_APPLICATION_SUBJECT = "Takım kurma başvurusu";

type IconName = keyof typeof Ionicons.glyphMap;

interface Step {
  key: string;
  icon: IconName;
  title: string;
  subtitle: string;
  href: string;
  needsAuth?: boolean;
  /** Bu adımı kilitleyen bekleyen talep türleri. */
  requestTypes?: string[];
}

const GUEST_STEPS: Step[] = [
  { key: "bul", icon: "search", title: "Takımını bul", subtitle: "Adıyla ara, takım sayfasını aç", href: "/ara?tip=takim" },
  { key: "davet", icon: "mail-unread", title: "Davet ve başvurular", subtitle: "Takıma başvur, gelen daveti kabul et", href: "/davetler", needsAuth: true },
  {
    key: "kur",
    icon: "flag",
    title: "Takım kurmak için başvur",
    subtitle: "Lig yönetimine başvuru gönder",
    href: `/iletisim?konu=${encodeURIComponent(TEAM_APPLICATION_SUBJECT)}`,
  },
];

const MEMBER_STEPS: Step[] = [
  {
    key: "oyuncu",
    icon: "person-add",
    title: "Oyuncu profilini bağla",
    subtitle: "Kaydını bul ve sahiplen ya da yeni profil aç",
    href: "/oyuncum/bagla",
    requestTypes: ["player_claim", "player_create"],
  },
  { key: "basvur", icon: "mail-unread", title: "Takım bul ve başvur", subtitle: "Takımlara başvur, gelen davetleri yanıtla", href: "/davetler" },
  {
    key: "yonet",
    icon: "shield-half",
    title: "Takımını yönet",
    subtitle: "Başkanıysan yönetim yetkisi iste ya da yeni takım kur",
    href: "/oyuncum/bagla?tur=takim",
    requestTypes: ["team_management", "team_create"],
  },
];

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

  return (
    <Reveal>
      <SectionHeader
        title={signedIn ? "Hesabını bağla" : "Kulübe katıl"}
        meta={signedIn ? "Oyuncu profilin ya da takımın bağlanınca araçların burada açılır" : undefined}
      />
      <View style={styles.group}>
        {steps.map((step, index) => {
          const locked = Boolean(step.needsAuth && !signedIn);
          const mine = step.requestTypes ? list.filter((item) => step.requestTypes!.includes(item.type)) : [];
          const pending = mine.some((item) => item.status === "pending");
          const rejected = !pending ? mine.find((item) => item.status === "rejected") : undefined;
          const rejectedNote = rejected ? (rejected.adminNote ?? rejected.admin_note ?? rejected.reviewNote ?? null) : null;
          const subtitle = locked
            ? "Önce giriş yap"
            : pending
              ? "Talebin lig yönetiminde; dokun, durumu gör ya da geri çek"
              : rejected
                ? `Son talebin reddedildi${rejectedNote ? `: ${rejectedNote}` : ""} — yeniden dene`
                : step.subtitle;
          return (
            <ListRow
              key={step.key}
              position={index === 0 ? "first" : index === steps.length - 1 ? "last" : "middle"}
              leading={
                <View style={[styles.pip, pending && styles.pipPending]}>
                  {pending ? (
                    <Ionicons name="hourglass" size={14} color={colors.warn} />
                  ) : (
                    <Text style={styles.pipNumber} {...textScale.badge}>
                      {index + 1}
                    </Text>
                  )}
                </View>
              }
              title={step.title}
              subtitle={subtitle}
              trailing={
                <View style={styles.trailing}>
                  {pending ? (
                    <Badge label="ONAY BEKLİYOR" tone="warn" size="xs" />
                  ) : (
                    <Ionicons name={locked ? "lock-closed-outline" : step.icon} size={16} color={colors.textTertiary} />
                  )}
                  <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
                </View>
              }
              onPress={() => go(locked ? "/giris" : step.href)}
              accessibilityLabel={`Adım ${index + 1}: ${step.title}. ${subtitle}`}
            />
          );
        })}
      </View>

      {signedIn ? (
        <>
          <SectionHeader title="Hesap" />
          <View style={styles.group}>
            <ListRow
              position="first"
              leading={{ icon: "toggle", tone: "neutral" }}
              title="Profil modları"
              subtitle="Oyuncu / takım başkanı alanını aç-kapat"
              onPress={() => go("/oyuncum/modlar")}
            />
            <ListRow
              position="middle"
              leading={{ icon: "notifications", tone: "brand" }}
              title="Bildirim tercihleri"
              subtitle="Hangi bildirimler telefonuna gelsin"
              onPress={() => go("/bildirim-tercihleri")}
            />
            <ListRow
              position="last"
              leading={{ icon: "person-circle", tone: "neutral" }}
              title="Hesabım"
              subtitle="Üyelik bilgileri ve güvenlik"
              onPress={() => go("/hesabim")}
            />
          </View>
        </>
      ) : (
        <View style={styles.auth}>
          <Text style={styles.authText} {...textScale.dense}>
            Hesabın varsa giriş yap; rolüne göre takım, oyuncu ve lig araçların burada açılır.
          </Text>
          <View style={styles.authActions}>
            <Button label="Giriş yap" onPress={() => go("/giris")} style={styles.flex} />
            <Button label="Üye ol" onPress={() => go("/kayit")} variant="secondary" style={styles.flex} />
          </View>
        </View>
      )}
    </Reveal>
  );
});

const styles = StyleSheet.create({
  group: { paddingHorizontal: layout.screenPadding },
  pip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  pipPending: { backgroundColor: colors.warnDim },
  pipNumber: {
    ...type.label,
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.s },
  auth: {
    paddingHorizontal: layout.screenPadding,
    marginTop: space.md,
    gap: space.m,
  },
  authText: { ...type.bodySm, color: colors.textSecondary },
  authActions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
