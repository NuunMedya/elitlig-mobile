/**
 * KULÜBE KATIL — misafir ve kulüpsüz üyenin Yönetim sekmesindeki EYLEM AKIŞI.
 *
 * NE: üç numaralı adım, tek kâğıt grupta (ListRow `position` grubu — iç içe
 * kart yok):
 *   1. Takımını bul        → `/ara?tip=takim` (takım araması; girişsiz çalışır)
 *   2. Davet koduyla katıl → `/davetler` (giriş ister)
 *   3. Takım kur           → `/iletisim?konu=…` ("takım kurma başvurusu" konusu
 *                            ön dolu form; girişsiz de gönderilebilir)
 *
 * NEDEN AKIŞ, TANITIM DEĞİL: eski grafit tanıtım kartı "giriş yap" dışında
 * hiçbir yol göstermiyordu; kulübü olmayan biri için asıl soru "bir takıma
 * nasıl girerim?" sorusudur. Adımlar o sorunun yanıtıdır.
 *
 * MİSAFİR: giriş gerektiren adım (`needsAuth`) önce `/giris`'e götürür (sitenin
 * genel kalıbı — giriş ekranı dönüş adresi almaz). Altta "Giriş yap / Üye ol".
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, ListRow, SectionHeader } from "@/components/ui";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

/** İletişim formunun "Konu" alanına yazılan ön dolgu. */
export const TEAM_APPLICATION_SUBJECT = "Takım kurma başvurusu";

interface Step {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: string;
  needsAuth?: boolean;
}

const STEPS: Step[] = [
  {
    key: "bul",
    icon: "search",
    title: "Takımını bul",
    subtitle: "Adıyla ara, takım sayfasını aç",
    href: "/ara?tip=takim",
  },
  {
    key: "davet",
    icon: "key",
    title: "Davet koduyla katıl",
    subtitle: "Gelen daveti gör, kabul et",
    href: "/davetler",
    needsAuth: true,
  },
  {
    key: "kur",
    icon: "flag",
    title: "Takım kurmak için başvur",
    subtitle: "Lig yönetimine başvuru gönder",
    href: `/iletisim?konu=${encodeURIComponent(TEAM_APPLICATION_SUBJECT)}`,
  },
];

export const JoinFlow = React.memo(function JoinFlow({
  signedIn,
  go,
}: {
  signedIn: boolean;
  go: (href: string) => void;
}) {
  return (
    <View>
      <SectionHeader
        title="Kulübe katıl"
        meta={signedIn ? "Henüz bir takıma bağlı değilsin" : undefined}
      />
      <View style={styles.group}>
        {STEPS.map((step, index) => {
          const locked = Boolean(step.needsAuth && !signedIn);
          return (
            <ListRow
              key={step.key}
              position={index === 0 ? "first" : index === STEPS.length - 1 ? "last" : "middle"}
              leading={
                <View style={styles.pip}>
                  <Text style={styles.pipNumber} {...textScale.badge}>
                    {index + 1}
                  </Text>
                </View>
              }
              title={step.title}
              subtitle={locked ? "Önce giriş yap" : step.subtitle}
              trailing={
                <View style={styles.trailing}>
                  <Ionicons name={locked ? "lock-closed-outline" : step.icon} size={16} color={colors.textTertiary} />
                  <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
                </View>
              }
              onPress={() => go(locked ? "/giris" : step.href)}
              accessibilityLabel={`Adım ${index + 1}: ${step.title}${locked ? ", önce giriş yap" : ""}`}
            />
          );
        })}
      </View>

      {!signedIn ? (
        <View style={styles.auth}>
          <Text style={styles.authText} {...textScale.dense}>
            Hesabın varsa giriş yap; rolüne göre takım, oyuncu ve lig araçların burada açılır.
          </Text>
          <View style={styles.authActions}>
            <Button label="Giriş yap" onPress={() => go("/giris")} style={styles.flex} />
            <Button label="Üye ol" onPress={() => go("/kayit")} variant="secondary" style={styles.flex} />
          </View>
        </View>
      ) : null}
    </View>
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
