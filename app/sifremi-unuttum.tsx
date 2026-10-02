/**
 * ŞİFREMİ UNUTTUM — POST /api/users/password/forgot + /password/reset
 *
 * NEDEN VAR: giriş akışı tarayıcıya çıkmaz (App Store 4). İki adım:
 *   1. Kullanıcı adı veya e-posta → sunucu 202 döner; hesap kayıtlıysa lig
 *      yönetimi tek kullanımlık sıfırlama kodunu iletir (hesap sayımını
 *      önlemek için yanıt her koşulda aynıdır, ekran da öyle davranır).
 *   2. Kod + yeni şifre → sunucu doğrular, şifreyi günceller. Sonra giriş
 *      ekranına dönülür.
 *
 * Kodu olan kullanıcı 1. adımı atlayıp doğrudan "Kodum var" diyebilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
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
import { BrandMark, Button, Input, ScreenHeader, Touchable, toneColors, useToast } from "@/components/ui";
import { forgotPassword, resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/http";
import { colors, fonts, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";

const DANGER = toneColors("danger");
const PASSWORD_MIN = 8;

type Step = "identify" | "reset";

function passwordError(value: string): string | undefined {
  if (!value) return "Yeni şifre zorunludur.";
  if (value.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalıdır.`;
  if (!/[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(value) || !/[0-9]/.test(value)) {
    return "Şifre en az bir harf ve bir rakam içermelidir.";
  }
  return undefined;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const codeRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);

  const identifierError = identifier.trim() ? undefined : "Kullanıcı adı veya e-posta zorunludur.";
  const codeError = code.trim() ? undefined : "Sıfırlama kodu zorunludur.";
  const pwError = useMemo(() => passwordError(password), [password]);
  const repeatError = repeat === password ? undefined : "Şifreler eşleşmiyor.";

  const canRequest = !identifierError && !busy;
  const canReset = !identifierError && !codeError && !pwError && !repeatError && !busy;

  const show = (name: string, message?: string) => (touched[name] ? message : undefined);
  const blur = (name: string) => () => setTouched((t) => ({ ...t, [name]: true }));

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const toLogin = useCallback(() => router.replace("/giris"), [router]);

  const request = useCallback(async () => {
    setTouched((t) => ({ ...t, identifier: true }));
    if (!canRequest) return;
    setBusy(true);
    setError(null);
    try {
      const response = await forgotPassword(identifier.trim());
      setNotice(response.message || "Talebin alındı. Kod sana iletilince aşağıya gir.");
      setStep("reset");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.userMessage : "Talep gönderilemedi.");
    } finally {
      setBusy(false);
    }
  }, [canRequest, identifier]);

  const reset = useCallback(async () => {
    setTouched({ identifier: true, code: true, password: true, repeat: true });
    if (!canReset) return;
    setBusy(true);
    setError(null);
    try {
      const response = await resetPassword(identifier.trim(), code.trim(), password);
      toast.show({ message: response.message || "Şifren güncellendi.", tone: "success" });
      router.replace("/giris");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 400 || caught.status === 404 || caught.status === 410
            ? caught.message
            : caught.userMessage
          : "Şifre sıfırlanamadı."
      );
    } finally {
      setBusy(false);
    }
  }, [canReset, code, identifier, password, router, toast]);

  const eye = (
    <Touchable
      feedback="icon"
      haptic="none"
      onPress={() => setSecure((v) => !v)}
      hitSlop={touchSlop(20)}
      accessibilityRole="button"
      accessibilityLabel={secure ? "Şifreyi göster" : "Şifreyi gizle"}
    >
      <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textTertiary} />
    </Touchable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Şifremi unuttum"
        overline="ELİTLİG"
        actions={[{ icon: "close", onPress: close, accessibilityLabel: "Kapat" }]}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <BrandMark size="md" />
          </View>

          {step === "identify" ? (
            <>
              <Text style={styles.lede} {...textScale.long}>
                Kullanıcı adını veya e-postanı gir. Hesabın kayıtlıysa lig yönetimi sana tek
                kullanımlık bir sıfırlama kodu iletir; kodu bir sonraki adımda gireceksin.
              </Text>

              <View style={styles.form}>
                <Input
                  label="Kullanıcı adı veya e-posta"
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    setError(null);
                  }}
                  onBlur={blur("identifier")}
                  error={show("identifier", identifierError)}
                  leadingIcon="person-outline"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  placeholder="kullanici.adi veya ad@ornek.com"
                  returnKeyType="go"
                  onSubmitEditing={request}
                  editable={!busy}
                />
              </View>

              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={DANGER.fg} />
                  <Text style={styles.errorText} {...textScale.long}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <Button label="Kod iste" onPress={request} loading={busy} size="lg" fullWidth />

              <Touchable onPress={() => setStep("reset")} accessibilityRole="button" disabled={busy}>
                <Text style={styles.footnote} {...textScale.long}>
                  Kodun zaten var mı? <Text style={styles.link}>Kodla devam et</Text>
                </Text>
              </Touchable>
            </>
          ) : (
            <>
              {notice ? (
                <View style={styles.noticeBox}>
                  <Ionicons name="mail-outline" size={16} color={colors.brandAccent} />
                  <Text style={styles.noticeText} {...textScale.long}>
                    {notice}
                  </Text>
                </View>
              ) : (
                <Text style={styles.lede} {...textScale.long}>
                  Lig yönetiminden aldığın sıfırlama kodunu ve yeni şifreni gir.
                </Text>
              )}

              <View style={styles.form}>
                <Input
                  label="Kullanıcı adı veya e-posta"
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    setError(null);
                  }}
                  onBlur={blur("identifier")}
                  error={show("identifier", identifierError)}
                  leadingIcon="person-outline"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  placeholder="kullanici.adi veya ad@ornek.com"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => codeRef.current?.focus()}
                  editable={!busy}
                />
                <Input
                  ref={codeRef}
                  label="Sıfırlama kodu"
                  value={code}
                  onChangeText={(v) => {
                    setCode(v);
                    setError(null);
                  }}
                  onBlur={blur("code")}
                  error={show("code", codeError)}
                  leadingIcon="keypad-outline"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="Örn. A7K2M9"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!busy}
                />
                <Input
                  ref={passwordRef}
                  label="Yeni şifre"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError(null);
                  }}
                  onBlur={blur("password")}
                  error={show("password", pwError)}
                  hint="En az 8 karakter; bir harf ve bir rakam içermeli."
                  leadingIcon="key-outline"
                  secureTextEntry={secure}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  placeholder="••••••••"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => repeatRef.current?.focus()}
                  editable={!busy}
                  trailing={eye}
                />
                <Input
                  ref={repeatRef}
                  label="Yeni şifre (tekrar)"
                  value={repeat}
                  onChangeText={(v) => {
                    setRepeat(v);
                    setError(null);
                  }}
                  onBlur={blur("repeat")}
                  error={show("repeat", repeatError)}
                  leadingIcon="key-outline"
                  secureTextEntry={secure}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  placeholder="••••••••"
                  returnKeyType="go"
                  onSubmitEditing={reset}
                  editable={!busy}
                />
              </View>

              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={DANGER.fg} />
                  <Text style={styles.errorText} {...textScale.long}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <Button label="Şifreyi sıfırla" onPress={reset} loading={busy} size="lg" fullWidth />

              <Touchable onPress={() => setStep("identify")} accessibilityRole="button" disabled={busy}>
                <Text style={styles.footnote} {...textScale.long}>
                  Kod gelmedi mi? <Text style={styles.link}>Yeniden iste</Text>
                </Text>
              </Touchable>
            </>
          )}

          <Touchable onPress={toLogin} accessibilityRole="button" disabled={busy}>
            <Text style={styles.footnote} {...textScale.long}>
              Şifreni hatırladın mı? <Text style={styles.link}>Giriş yap</Text>
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
  brand: { alignItems: "center", paddingTop: space.s },
  lede: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  form: { gap: space.md },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  noticeText: { ...type.bodySm, color: colors.textSecondary, flex: 1, lineHeight: 19 },
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
  errorText: { ...type.bodySm, color: DANGER.fg, flex: 1, lineHeight: 19 },
  footnote: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 17,
    paddingVertical: space.sm,
  },
  link: { color: colors.brandAccent, textDecorationLine: "underline" },
});
