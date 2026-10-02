/**
 * ÜYE OL — POST /api/users/register
 *
 * NEDEN VAR: App Store 4 (Design) kayıt için kullanıcıyı tarayıcıya
 * (elitlig.com) yollamayı reddeder; kayıt uygulamanın içinde olmalıdır.
 * Sunucu kayıt ucu zaten vardı; bu ekran web'deki Register.js'in mobil
 * karşılığıdır ve aynı kuralları uygular.
 *
 * ZORUNLU ALANLAR yalnız kullanıcı adı, şifre, ad soyad, e-posta ve şehir.
 * Telefon isteğe bağlıdır (App Store 5.1.1(v): uygulamanın çalışması için
 * gerekmeyen kişisel bilgi zorunlu tutulamaz).
 *
 * KAYIT = GİRİŞ: sunucu onay beklemeden hesabı açar ve jeton döndürür;
 * AuthProvider.signUp jetonu saklar, ekran Profil sekmesine geçer.
 *
 * DOĞRULAMA: alan ancak kullanıcı ondan ayrıldıktan (blur) veya gönder'e
 * bastıktan sonra kırmızıya döner; boş formu açar açmaz hata yağmuru olmaz.
 * Sunucudan dönen alan hataları (fieldErrors) ilgili alanın altına yazılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark, Button, Chip, Input, ScreenHeader, Touchable, toneColors } from "@/components/ui";
import { getCities } from "@/lib/api/meta";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";

const DANGER = toneColors("danger");

/* Kurallar web kayıt formuyla (elitlig-client Register.js) ve sunucuyla
   (services/passwordService.js) aynı tutulur. */
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\s-]{10,20}$/;
const PASSWORD_MIN = 8;

type FieldName = "fullName" | "username" | "email" | "phone" | "city" | "password" | "passwordRepeat";
type Form = Record<FieldName, string>;
type Errors = Partial<Record<FieldName, string>>;

const EMPTY: Form = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  city: "",
  password: "",
  passwordRepeat: "",
};

function validate(form: Form): Errors {
  const errors: Errors = {};
  const fullName = form.fullName.trim();
  const username = form.username.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();

  if (!fullName) errors.fullName = "Ad soyad zorunludur.";
  else if (fullName.length < 3) errors.fullName = "En az 3 karakter girin.";

  if (!username) errors.username = "Kullanıcı adı zorunludur.";
  else if (!USERNAME_RE.test(username)) errors.username = "3-30 karakter; harf, rakam, nokta, tire kullanın.";

  if (!email) errors.email = "E-posta zorunludur.";
  else if (!EMAIL_RE.test(email)) errors.email = "Geçerli bir e-posta adresi girin.";

  if (phone && !PHONE_RE.test(phone)) errors.phone = "Geçerli bir telefon numarası girin.";

  if (!form.city) errors.city = "Şehir seçin.";

  if (!form.password) errors.password = "Şifre zorunludur.";
  else if (form.password.length < PASSWORD_MIN) errors.password = `Şifre en az ${PASSWORD_MIN} karakter olmalıdır.`;
  else if (!/[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(form.password) || !/[0-9]/.test(form.password)) {
    errors.password = "Şifre en az bir harf ve bir rakam içermelidir.";
  }

  if (form.passwordRepeat !== form.password) errors.passwordRepeat = "Şifreler eşleşmiyor.";

  return errors;
}

/** Sunucu 400 gövdesindeki { fieldErrors: { password: "..." } } biçimini okur. */
function serverFieldErrors(detail: unknown): Errors {
  if (!detail || typeof detail !== "object") return {};
  const raw = (detail as { fieldErrors?: unknown }).fieldErrors;
  if (!raw || typeof raw !== "object") return {};
  const out: Errors = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && key in EMPTY) out[key as FieldName] = value;
  }
  return out;
}

export default function RegisterScreen() {
  const { signUp, signingIn } = useAuth();
  const scope = useScope();
  const router = useRouter();

  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [secure, setSecure] = useState(true);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordRepeatRef = useRef<TextInput>(null);

  const citiesQuery = useQuery({
    queryKey: queryKeys.cities(),
    queryFn: getCities,
    staleTime: 60 * 60_000,
  });
  const cities = useMemo(() => citiesQuery.data ?? [], [citiesQuery.data]);

  /* Kullanıcı uygulamada zaten bir şehir seçtiyse o önerilir; tek dokunuşla
     değiştirilebilir. */
  const effectiveCity = useMemo(() => {
    if (form.city) return form.city;
    const current = cities.find((city) => city.id === scope.cityId);
    return current?.label ?? "";
  }, [cities, form.city, scope.cityId]);

  const errors = useMemo(() => validate({ ...form, city: effectiveCity }), [form, effectiveCity]);
  const canSubmit = Object.keys(errors).length === 0 && !signingIn;

  const errorFor = useCallback(
    (name: FieldName) => serverErrors[name] ?? (touched[name] ? errors[name] : undefined),
    [errors, serverErrors, touched]
  );

  const change = useCallback(
    (name: FieldName) => (value: string) => {
      setForm((current) => ({ ...current, [name]: value }));
      setServerErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
      setError(null);
    },
    []
  );

  const blur = useCallback(
    (name: FieldName) => () => setTouched((current) => ({ ...current, [name]: true })),
    []
  );

  const selectCity = useCallback((label: string) => {
    setForm((current) => ({ ...current, city: label }));
    setTouched((current) => ({ ...current, city: true }));
    setServerErrors((current) => (current.city ? { ...current, city: undefined } : current));
  }, []);

  const toggleSecure = useCallback(() => setSecure((value) => !value), []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const openLogin = useCallback(() => router.replace("/giris"), [router]);

  const submit = useCallback(async () => {
    setTouched({
      fullName: true,
      username: true,
      email: true,
      phone: true,
      city: true,
      password: true,
      passwordRepeat: true,
    });
    if (!canSubmit) return;
    setError(null);
    setServerErrors({});
    try {
      await signUp({
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        city: effectiveCity,
      });
      router.replace("/(tabs)/profil");
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = serverFieldErrors(caught.detail);
        setServerErrors(fields);
        // Alan hatası varsa genel kutuya aynı cümleyi bir daha yazmaya gerek yok.
        setError(Object.keys(fields).length ? null : caught.status === 400 || caught.status === 409 ? caught.message : caught.userMessage);
      } else {
        setError("Kayıt yapılamadı.");
      }
    }
  }, [canSubmit, effectiveCity, form, router, signUp]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Üye ol"
        overline="ELİTLİG"
        actions={[{ icon: "close", onPress: close, accessibilityLabel: "Kapat" }]}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <BrandMark size="md" />
          </View>

          <Text style={styles.lede} {...textScale.long}>
            Üyelik ücretsizdir ve hemen açılır. Üye olduktan sonra oyuncu profilini
            sahiplenebilir, takımını ve maçlarını takip edebilir, mesajlaşabilirsin.
          </Text>

          <View style={styles.form}>
            <Input
              label="Ad soyad"
              value={form.fullName}
              onChangeText={change("fullName")}
              onBlur={blur("fullName")}
              error={errorFor("fullName")}
              leadingIcon="person-outline"
              autoComplete="name"
              textContentType="name"
              placeholder="Adın Soyadın"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => usernameRef.current?.focus()}
              editable={!signingIn}
            />

            <Input
              ref={usernameRef}
              label="Kullanıcı adı"
              value={form.username}
              onChangeText={change("username")}
              onBlur={blur("username")}
              error={errorFor("username")}
              hint="Giriş yaparken bu adı kullanacaksın."
              leadingIcon="at-outline"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              textContentType="username"
              placeholder="kullanici.adi"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!signingIn}
            />

            <Input
              ref={emailRef}
              label="E-posta"
              value={form.email}
              onChangeText={change("email")}
              onBlur={blur("email")}
              error={errorFor("email")}
              leadingIcon="mail-outline"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              placeholder="ad@ornek.com"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => phoneRef.current?.focus()}
              editable={!signingIn}
            />

            <Input
              ref={phoneRef}
              label="Telefon (isteğe bağlı)"
              value={form.phone}
              onChangeText={change("phone")}
              onBlur={blur("phone")}
              error={errorFor("phone")}
              hint="Yönetimin sana ulaşabilmesi için; boş bırakabilirsin."
              leadingIcon="call-outline"
              autoComplete="tel"
              textContentType="telephoneNumber"
              keyboardType="phone-pad"
              placeholder="05xx xxx xx xx"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!signingIn}
            />

            <View style={styles.cityBlock}>
              <Text style={styles.cityLabel}>Şehir</Text>
              {citiesQuery.isPending ? (
                <Text style={styles.cityHint}>Şehirler yükleniyor…</Text>
              ) : citiesQuery.isError || cities.length === 0 ? (
                <Touchable onPress={() => citiesQuery.refetch()} accessibilityRole="button">
                  <Text style={[styles.cityHint, styles.cityRetry]}>
                    Şehirler alınamadı. Yeniden denemek için dokun.
                  </Text>
                </Touchable>
              ) : (
                <View style={styles.cityChips}>
                  {cities.map((city) => (
                    <Chip
                      key={city.id}
                      label={city.label}
                      selected={effectiveCity === city.label}
                      onPress={() => selectCity(city.label)}
                      disabled={signingIn}
                    />
                  ))}
                </View>
              )}
              {errorFor("city") ? (
                <Text style={styles.cityError} accessibilityRole="alert">
                  {errorFor("city")}
                </Text>
              ) : (
                <Text style={styles.cityHint}>Oyuncu ve takım kayıtların bu ille sınırlıdır.</Text>
              )}
            </View>

            <Input
              ref={passwordRef}
              label="Şifre"
              value={form.password}
              onChangeText={change("password")}
              onBlur={blur("password")}
              error={errorFor("password")}
              hint="En az 8 karakter; bir harf ve bir rakam içermeli."
              leadingIcon="lock-closed-outline"
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRepeatRef.current?.focus()}
              editable={!signingIn}
              trailing={
                <Touchable
                  feedback="icon"
                  haptic="none"
                  onPress={toggleSecure}
                  hitSlop={touchSlop(20)}
                  accessibilityRole="button"
                  accessibilityLabel={secure ? "Şifreyi göster" : "Şifreyi gizle"}
                >
                  <Ionicons
                    name={secure ? "eye-outline" : "eye-off-outline"}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Touchable>
              }
            />

            <Input
              ref={passwordRepeatRef}
              label="Şifre (tekrar)"
              value={form.passwordRepeat}
              onChangeText={change("passwordRepeat")}
              onBlur={blur("passwordRepeat")}
              error={errorFor("passwordRepeat")}
              leadingIcon="lock-closed-outline"
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={submit}
              editable={!signingIn}
            />
          </View>

          {/* Mağaza şartı (App Store 1.2): kullanıcı içeriği olan uygulama,
              hakaret ve taciz için hoşgörü olmadığını kayıtta kabul ettirir. */}
          <Text style={styles.consent} {...textScale.long}>
            Üye olarak{" "}
            <Text style={styles.consentLink} onPress={() => router.push("/kurallar")} accessibilityRole="link">
              Lig Kuralları
            </Text>
            {"'nı kabul etmiş olursun. Sohbet ve aramalarda hakaret, taciz ve uygunsuz içeriğe hoşgörü yoktur. Hesabını dilediğin zaman Profil → Hesabı sil ile kalıcı olarak silebilirsin."}
          </Text>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={DANGER.fg} />
              <Text style={styles.errorText} {...textScale.long}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label="Üye ol"
            onPress={submit}
            loading={signingIn}
            size="lg"
            fullWidth
          />

          <Touchable onPress={openLogin} accessibilityRole="button" disabled={signingIn}>
            <Text style={styles.footnote} {...textScale.long}>
              Zaten üye misin? <Text style={styles.footnoteLink}>Giriş yap</Text>
            </Text>
          </Touchable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant,
    gap: space.lg,
  },

  brand: {
    alignItems: "center",
    paddingTop: space.s,
  },

  lede: {
    ...type.bodySm,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  form: {
    gap: space.md,
  },

  cityBlock: { gap: space.sm },
  cityLabel: { ...type.label, color: colors.textSecondary },
  cityChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cityHint: { ...type.caption, color: colors.textTertiary, lineHeight: 17 },
  cityRetry: { color: colors.brandAccent, textDecorationLine: "underline" },
  cityError: { ...type.caption, color: DANGER.fg, lineHeight: 17 },

  consent: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },
  consentLink: { color: colors.brandAccent, textDecorationLine: "underline" },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    backgroundColor: DANGER.dim,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: DANGER.fg,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  errorText: {
    ...type.bodySm,
    color: DANGER.fg,
    flex: 1,
    lineHeight: 19,
  },

  footnote: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 17,
    paddingVertical: space.sm,
  },
  footnoteLink: { color: colors.brandAccent, textDecorationLine: "underline" },
});
