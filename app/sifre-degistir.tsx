/**
 * ŞİFRE DEĞİŞTİR — PATCH /api/users/me/password
 *
 * NEDEN VAR: hesap yönetimi tarayıcıya yönlendirilmez (App Store 4); şifre
 * uygulama içinde değiştirilir. Sunucu mevcut şifreyi doğrular, kuralları
 * (en az 8 karakter, harf + rakam) uygular ve taze jeton döndürür;
 * AuthProvider.changePassword jetonu saklar, bu cihazın oturumu kopmaz.
 *
 * Alan hataları sunucudan `fieldErrors` ile gelir (currentPassword /
 * newPassword) ve ilgili alanın altına yazılır.
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
import { Button, Input, ScreenHeader, Touchable, toneColors, useToast } from "@/components/ui";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";

const DANGER = toneColors("danger");
const PASSWORD_MIN = 8;

type FieldName = "currentPassword" | "newPassword" | "newPasswordRepeat";
type Errors = Partial<Record<FieldName, string>>;

function validate(current: string, next: string, repeat: string): Errors {
  const errors: Errors = {};
  if (!current) errors.currentPassword = "Mevcut şifreni gir.";
  if (!next) errors.newPassword = "Yeni şifre zorunludur.";
  else if (next.length < PASSWORD_MIN) errors.newPassword = `Şifre en az ${PASSWORD_MIN} karakter olmalıdır.`;
  else if (!/[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(next) || !/[0-9]/.test(next)) {
    errors.newPassword = "Şifre en az bir harf ve bir rakam içermelidir.";
  } else if (current && next === current) errors.newPassword = "Yeni şifre mevcut şifreyle aynı olamaz.";
  if (repeat !== next) errors.newPasswordRepeat = "Şifreler eşleşmiyor.";
  return errors;
}

function serverFieldErrors(detail: unknown): Errors {
  if (!detail || typeof detail !== "object") return {};
  const raw = (detail as { fieldErrors?: unknown }).fieldErrors;
  if (!raw || typeof raw !== "object") return {};
  const out: Errors = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && (key === "currentPassword" || key === "newPassword")) {
      out[key] = value;
    }
  }
  return out;
}

export default function ChangePasswordScreen() {
  const { changePassword } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);

  const nextRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);

  const errors = useMemo(() => validate(current, next, repeat), [current, next, repeat]);
  const canSubmit = Object.keys(errors).length === 0 && !busy;

  const errorFor = useCallback(
    (name: FieldName) => serverErrors[name] ?? (touched[name] ? errors[name] : undefined),
    [errors, serverErrors, touched]
  );
  const blur = useCallback((name: FieldName) => () => setTouched((t) => ({ ...t, [name]: true })), []);
  const clearServer = useCallback((name: FieldName) => {
    setServerErrors((s) => (s[name] ? { ...s, [name]: undefined } : s));
    setError(null);
  }, []);

  const toggleSecure = useCallback(() => setSecure((v) => !v), []);

  const submit = useCallback(async () => {
    setTouched({ currentPassword: true, newPassword: true, newPasswordRepeat: true });
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setServerErrors({});
    try {
      const message = await changePassword(current, next);
      toast.show({ message: message || "Şifren güncellendi.", tone: "success" });
      if (router.canGoBack()) router.back();
      else router.replace("/hesabim");
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = serverFieldErrors(caught.detail);
        setServerErrors(fields);
        setError(Object.keys(fields).length ? null : caught.status === 400 ? caught.message : caught.userMessage);
      } else {
        setError("Şifre değiştirilemedi.");
      }
    } finally {
      setBusy(false);
    }
  }, [canSubmit, changePassword, current, next, router, toast]);

  const eye = (
    <Touchable
      feedback="icon"
      haptic="none"
      onPress={toggleSecure}
      hitSlop={touchSlop(20)}
      accessibilityRole="button"
      accessibilityLabel={secure ? "Şifreyi göster" : "Şifreyi gizle"}
    >
      <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textTertiary} />
    </Touchable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader title="Şifre değiştir" back />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede} {...textScale.long}>
            Güvenlik için önce mevcut şifren sorulur. Değişiklikten sonra diğer cihazlarda
            yeniden giriş yapman gerekebilir.
          </Text>

          <View style={styles.form}>
            <Input
              label="Mevcut şifre"
              value={current}
              onChangeText={(v) => {
                setCurrent(v);
                clearServer("currentPassword");
              }}
              onBlur={blur("currentPassword")}
              error={errorFor("currentPassword")}
              leadingIcon="lock-closed-outline"
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              placeholder="••••••••"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nextRef.current?.focus()}
              editable={!busy}
              trailing={eye}
            />
            <Input
              ref={nextRef}
              label="Yeni şifre"
              value={next}
              onChangeText={(v) => {
                setNext(v);
                clearServer("newPassword");
              }}
              onBlur={blur("newPassword")}
              error={errorFor("newPassword")}
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
            />
            <Input
              ref={repeatRef}
              label="Yeni şifre (tekrar)"
              value={repeat}
              onChangeText={(v) => {
                setRepeat(v);
                setError(null);
              }}
              onBlur={blur("newPasswordRepeat")}
              error={errorFor("newPasswordRepeat")}
              leadingIcon="key-outline"
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={submit}
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

          <Button label="Şifreyi güncelle" onPress={submit} loading={busy} size="lg" fullWidth />
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
    paddingTop: space.md,
    paddingBottom: space.giant,
    gap: space.lg,
  },
  lede: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  form: { gap: space.md },
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
});
