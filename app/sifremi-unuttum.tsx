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

import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import {
  AuthCard,
  AuthLink,
  AuthNotice,
  AuthShell,
  AuthSteps,
  PasswordEye,
  PasswordRules,
} from "@/components/account/AuthShell";
import { Button, Input, useToast } from "@/components/ui";
import { forgotPassword, resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/http";

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

  /* replace değil dismissTo: modal içinden replace iOS'ta pencereyi kapatıp
     yenisini açmayabiliyor (bkz. app/giris.tsx openRegister). */
  const toLogin = useCallback(() => router.dismissTo("/giris"), [router]);

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
      router.dismissTo("/giris");
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

  const eye = <PasswordEye secure={secure} onToggle={() => setSecure((v) => !v)} />;

  return (
    <AuthShell
      title="Şifremi unuttum"
      heading="Şifreni sıfırla"
      lede={
        step === "identify"
          ? "İki adım: önce kod iste, sonra kodla yeni şifreni belirle."
          : "Lig yönetiminden aldığın kodu ve yeni şifreni gir."
      }
      icon="key-outline"
      onClose={close}
    >
      <AuthSteps steps={["Kod iste", "Yeni şifre"]} current={step === "identify" ? 0 : 1} />

      {step === "identify" ? (
        <>
          <AuthCard>
            <Input
              label="Kullanıcı adı veya e-posta"
              value={identifier}
              onChangeText={(v) => {
                setIdentifier(v);
                setError(null);
              }}
              onBlur={blur("identifier")}
              error={show("identifier", identifierError)}
              hint="Hesabın kayıtlıysa lig yönetimi sana tek kullanımlık bir sıfırlama kodu iletir."
              leadingIcon="person-outline"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="kullanici.adi veya ad@ornek.com"
              returnKeyType="go"
              onSubmitEditing={request}
              editable={!busy}
            />
          </AuthCard>

          {error ? <AuthNotice message={error} /> : null}

          <Button label="Kod iste" icon="paper-plane-outline" onPress={request} loading={busy} size="lg" fullWidth />

          <AuthLink prompt="Kodun zaten var mı?" action="Kodla devam et" onPress={() => setStep("reset")} disabled={busy} />
        </>
      ) : (
        <>
          {notice ? <AuthNotice message={notice} tone="success" /> : null}

          <AuthCard>
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
          </AuthCard>

          <AuthCard title="Yeni şifre">
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
              leadingIcon="lock-closed-outline"
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
            <PasswordRules value={password} minLength={PASSWORD_MIN} />
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
              leadingIcon="lock-closed-outline"
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
          </AuthCard>

          {error ? <AuthNotice message={error} /> : null}

          <Button label="Şifreyi sıfırla" onPress={reset} loading={busy} size="lg" fullWidth />

          <AuthLink prompt="Kod gelmedi mi?" action="Yeniden iste" onPress={() => setStep("identify")} disabled={busy} />
        </>
      )}

      <AuthLink prompt="Şifreni hatırladın mı?" action="Giriş yap" onPress={toLogin} disabled={busy} />
    </AuthShell>
  );
}
