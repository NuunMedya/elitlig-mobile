/**
 * AuthShell — giriş, üyelik ve şifre ekranlarının ortak kabuğu.
 *
 * NEDEN ORTAK KABUK: dört ekran (giriş, üye ol, şifremi unuttum, şifre
 * değiştir) aynı soruyu sorar — "sen kimsin?" — ve aynı iskeletle konuşmalı:
 *
 *   [SAHNE: marka karosu · büyük başlık · tek cümle]   ← kimlik anı (Arena §1.2)
 *   [kâğıt: beyaz form kartı (alanlar)]
 *   [hata şeridi] [birincil düğme] [ikincil yol] [küçük yazı]
 *
 * Eski ekranlarda her biri kendi hata kutusunu, göz düğmesini ve dipnot
 * stilini yazıyordu; dört ekranda dört ayrı kırmızı, dört ayrı satır aralığı.
 *
 * FORM KİPİ (`variant="form"`): hesap içindeki düzenleme ekranları aynı
 * kartları, hata şeridini ve düğmeleri kullanır ama marka sahnesi yerine düz
 * kâğıt başlık taşır.
 *
 * SAHNE BAŞLIKTA: `ScreenHeader variant="stage"` + `hero`. Kaydırınca kimlik
 * kapanır ve başlık satırına sayfanın adı gelir; klavye açıkken form ekranda
 * kalır, marka bloğu yer kaplamaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BrandMark,
  ScreenHeader,
  Touchable,
  toneColors,
  useHeaderScroll,
  type ScreenHeaderAction,
} from "@/components/ui";
import {
  colors,
  elevate,
  hairline,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
  upperTR,
} from "@/theme";

const DANGER = toneColors("danger");
const SUCCESS = toneColors("win");

/* ================================ KABUK ================================ */

/**
 * Form kipinde sahnenin büyük başlığı çoğu zaman sayfa adının tekrarıdır
 * ("Şifre değiştir" / "Şifreni değiştir"); öyleyse alt başlık olarak
 * yazılmaz. Yalnız yeni bilgi taşıyorsa (teklifteki oyuncu adı) görünür.
 */
function restatesTitle(heading: string, title: string): boolean {
  const stem = (value: string) => value.toLocaleLowerCase("tr-TR").trim().slice(0, 5);
  return stem(heading) === stem(title);
}

export interface AuthShellProps {
  /** Başlık satırının adı — kaydırınca görünür, ekran okuyucu bunu okur. */
  title: string;
  /** Sahnedeki küçük üst satır ("ELİTLİG", "ELİTLİG YÖNETİM"). */
  overline?: string;
  /** Sahnenin büyük başlığı. */
  heading: string;
  /** Tek cümlelik açıklama. */
  lede?: string;
  /** Marka karosu yerine ikon (şifre ekranları kilit gösterir). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Modal ekranlar sağ üstte "kapat" taşır; itilen ekranlar geri oku. */
  onClose?: () => void;
  back?: boolean;
  actions?: ScreenHeaderAction[];
  /**
   * "brand" (varsayılan): giriş, üyelik, şifremi unuttum — koyu mor marka
   * sahnesi. "form": hesap içindeki düzenleme ekranları (şifre değiştir,
   * profil, takım bilgileri, teklif, transfer izni) — düz kâğıt başlık, sahne
   * yok. Kimlik sorusu sormayan bir formun tepesinde marka bloğu, ekranın
   * yarısını süse harcıyordu.
   */
  variant?: "brand" | "form";
  children: React.ReactNode;
}

export function AuthShell({
  title,
  overline = "ELİTLİG",
  heading,
  lede,
  icon,
  onClose,
  back,
  actions,
  variant = "brand",
  children,
}: AuthShellProps) {
  const { scrollY, scrollProps } = useHeaderScroll();
  const headerActions: ScreenHeaderAction[] = [
    ...(actions ?? []),
    ...(onClose ? [{ icon: "close" as const, onPress: onClose, accessibilityLabel: "Kapat" }] : []),
  ];

  if (variant === "form") {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScreenHeader
          title={title}
          subtitle={restatesTitle(heading, title) ? undefined : heading}
          back={back}
          scrollY={scrollY}
          actions={headerActions}
        />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            {...scrollProps}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {lede ? (
              <Text style={styles.formLede} {...textScale.long}>
                {lede}
              </Text>
            ) : null}
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title={title}
        variant="stage"
        back={back}
        scrollY={scrollY}
        actions={headerActions}
        hero={
          <View style={styles.hero}>
            {icon ? (
              <View style={styles.heroIcon}>
                <Ionicons name={icon} size={24} color={colors.brandOnDark} />
              </View>
            ) : (
              <BrandMark size="md" />
            )}
            <View style={styles.heroText}>
              <Text style={styles.overline} {...textScale.badge}>
                {upperTR(overline)}
              </Text>
              <Text style={styles.heading} accessibilityRole="header" {...textScale.dense}>
                {heading}
              </Text>
              {lede ? (
                <Text style={styles.lede} {...textScale.long}>
                  {lede}
                </Text>
              ) : null}
            </View>
          </View>
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          {...scrollProps}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ============================== FORM KARTI ============================== */

/** Alanları tek beyaz kartta toplar; isteğe bağlı küçük başlık taşır. */
export const AuthCard = React.memo(function AuthCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <Text style={styles.cardTitle} {...textScale.badge}>
          {upperTR(title)}
        </Text>
      ) : null}
      {children}
    </View>
  );
});

/* ============================== DURUM ŞERİDİ ============================== */

/** Hata (danger) ya da başarı (win) şeridi — ekran okuyucuya "alert" olarak. */
export const AuthNotice = React.memo(function AuthNotice({
  message,
  tone = "danger",
}: {
  message: string;
  tone?: "danger" | "success";
}) {
  const palette = tone === "danger" ? DANGER : SUCCESS;
  return (
    <View
      style={[styles.notice, { backgroundColor: palette.dim, borderColor: palette.fg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={tone === "danger" ? "alert-circle" : "checkmark-circle"}
        size={18}
        color={palette.fg}
      />
      <Text style={[styles.noticeText, { color: palette.fg }]} {...textScale.long}>
        {message}
      </Text>
    </View>
  );
});

/* ============================ ŞİFRE GÖZ DÜĞMESİ ============================ */

export const PasswordEye = React.memo(function PasswordEye({
  secure,
  onToggle,
}: {
  secure: boolean;
  onToggle: () => void;
}) {
  return (
    <Touchable
      feedback="icon"
      haptic="none"
      onPress={onToggle}
      hitSlop={touchSlop(20)}
      accessibilityRole="button"
      accessibilityLabel={secure ? "Şifreyi göster" : "Şifreyi gizle"}
    >
      <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textTertiary} />
    </Touchable>
  );
});

/* ============================ ŞİFRE KURALLARI ============================ */

/**
 * Şifre kuralları — yazarken canlı işaretlenir. Kurallar "ipucu" metninde
 * tek cümle olarak duruyordu ve kullanıcı hangisini karşılamadığını ancak
 * gönderince öğreniyordu. Üç küçük işaret, gereksinimi ve durumu birlikte
 * söyler. Kurallar sunucuyla aynıdır (services/passwordService.js).
 */
export const PasswordRules = React.memo(function PasswordRules({
  value,
  minLength = 8,
}: {
  value: string;
  minLength?: number;
}) {
  const rules = [
    { key: "len", label: `En az ${minLength} karakter`, ok: value.length >= minLength },
    { key: "letter", label: "Bir harf", ok: /[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(value) },
    { key: "digit", label: "Bir rakam", ok: /[0-9]/.test(value) },
  ];
  return (
    <View style={styles.rules} accessibilityRole="summary">
      {rules.map((rule) => (
        <View
          key={rule.key}
          style={styles.rule}
          accessibilityLabel={`${rule.label}: ${rule.ok ? "tamam" : "eksik"}`}
        >
          <Ionicons
            name={rule.ok ? "checkmark-circle" : "ellipse-outline"}
            size={14}
            color={rule.ok ? SUCCESS.fg : colors.textTertiary}
          />
          <Text style={[styles.ruleText, rule.ok ? styles.ruleOk : null]} {...textScale.dense}>
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
});

/* ================================ ADIMLAR ================================ */

/**
 * Çok adımlı akışın (şifre sıfırlama) yeri: "1 Kod iste — 2 Yeni şifre".
 * Kullanıcı ikinci ekranda neden kod istendiğini, birincide sonrasında ne
 * olacağını görür. Geçilen adım işaretlenir, bulunulan adım marka rengindedir.
 */
export const AuthSteps = React.memo(function AuthSteps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <View style={styles.steps} accessibilityLabel={`Adım ${current + 1} / ${steps.length}: ${steps[current]}`}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <React.Fragment key={label}>
            {index > 0 ? <View style={[styles.stepLine, done || active ? styles.stepLineOn : null]} /> : null}
            <View style={styles.step}>
              <View style={[styles.stepDot, active ? styles.stepDotActive : done ? styles.stepDotDone : null]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color={colors.textOnBrand} />
                ) : (
                  <Text style={[styles.stepNum, active ? styles.stepNumActive : null]} {...textScale.badge}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]} {...textScale.dense}>
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
});

/* ================================ AYRAÇ ================================ */

/** "ya da" ayracı — birincil yol ile ikincil yolu ayırır. */
export function AuthDivider({ label = "ya da" }: { label?: string }) {
  return (
    <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText} {...textScale.dense}>
        {label}
      </Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/* ============================== BAĞLANTI SATIRI ============================== */

/** "Zaten üye misin? Giriş yap" gibi ortalanmış iki parçalı bağlantı. */
export const AuthLink = React.memo(function AuthLink({
  prompt,
  action,
  onPress,
  disabled,
  testID,
}: {
  prompt?: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Touchable
      feedback="chip"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={prompt ? `${prompt} ${action}` : action}
      style={styles.link}
      testID={testID}
    >
      <Text style={styles.linkText} {...textScale.long}>
        {prompt ? `${prompt} ` : ""}
        <Text style={styles.linkAction}>{action}</Text>
      </Text>
    </Touchable>
  );
});

/** Küçük yazı (rıza, gizlilik) — iç bağlantılar `authStyles.inlineLink` ile. */
export const authStyles = StyleSheet.create({
  fine: {
    ...type.caption,
    color: colors.textTertiary,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: space.sm,
  },
  inlineLink: {
    color: colors.brandAccent,
    textDecorationLine: "underline",
  },
  /** Kartın içindeki alanların aralığı. */
  fields: {
    gap: space.md,
  },
});

/* ================================ STİLLER ================================ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding + space.xxs,
    paddingTop: space.xs,
    paddingBottom: space.xl,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  overline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  heading: {
    ...type.display,
    color: colors.onDark,
  },
  lede: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: 2,
  },

  /** Form kipinde açıklama: kartların üstünde, kâğıtta ikincil metin. */
  formLede: {
    ...type.body,
    color: colors.textSecondary,
  },

  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    paddingBottom: space.giant,
    gap: space.md,
  },

  card: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  cardTitle: {
    ...type.overline,
    color: colors.textTertiary,
    marginBottom: -space.xs,
  },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  noticeText: {
    ...type.bodySm,
    flex: 1,
    lineHeight: 19,
  },

  rules: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: space.md,
    rowGap: space.xs,
    marginTop: -space.xs,
  },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  ruleText: {
    ...type.caption,
    color: colors.textTertiary,
  },
  ruleOk: {
    color: colors.textSecondary,
  },

  steps: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  stepLine: {
    flex: 1,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  stepLineOn: {
    backgroundColor: colors.brand,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  stepDotActive: {
    backgroundColor: colors.brand,
  },
  stepDotDone: {
    backgroundColor: colors.brand,
  },
  stepNum: {
    ...type.micro,
    color: colors.textSecondary,
  },
  stepNumActive: {
    color: colors.textOnBrand,
  },
  stepLabel: {
    ...type.label,
    color: colors.textTertiary,
  },
  stepLabelActive: {
    color: colors.textPrimary,
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.xs,
  },
  dividerLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.borderStrong,
  },
  dividerText: {
    ...type.caption,
    color: colors.textTertiary,
  },

  link: {
    alignSelf: "center",
    minHeight: layout.minTouch,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  linkText: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  linkAction: {
    ...type.label,
    color: colors.brandAccent,
  },
});
