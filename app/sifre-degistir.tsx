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

import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import {
  AuthCard,
  AuthLink,
  AuthNotice,
  AuthShell,
  PasswordEye,
  PasswordRules,
} from "@/components/account/AuthShell";
import { Button, Input, useToast } from "@/components/ui";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

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

  const eye = <PasswordEye secure={secure} onToggle={toggleSecure} />;

  return (
    <AuthShell
      title="Şifre değiştir"
      variant="form"
      overline="Hesap ve güvenlik"
      heading="Şifreni değiştir"
      lede="Önce mevcut şifren sorulur. Bu cihazda oturumun açık kalır; diğer cihazlarda yeniden giriş gerekebilir."
      icon="lock-closed-outline"
      back
    >
      <AuthCard title="Mevcut şifre">
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
      </AuthCard>

      <AuthCard title="Yeni şifre">
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
        <PasswordRules value={next} minLength={PASSWORD_MIN} />
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
      </AuthCard>

      {error ? <AuthNotice message={error} /> : null}

      <Button label="Şifreyi güncelle" onPress={submit} loading={busy} size="lg" fullWidth />

      {/* Mevcut şifreyi hatırlamayan girişli kullanıcı da çıkış yapmadan
          kodla sıfırlama akışına geçebilir. */}
      <AuthLink
        prompt="Mevcut şifreni hatırlamıyor musun?"
        action="Kodla sıfırla"
        onPress={() => router.push("/sifremi-unuttum")}
        disabled={busy}
      />
    </AuthShell>
  );
}
