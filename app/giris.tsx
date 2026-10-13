/**
 * GİRİŞ — POST /api/users/login
 *
 * NE (ortak kabuk: components/account/AuthShell.tsx): sahnede marka + "Tekrar
 * hoş geldin", beyaz kartta iki alan ve şifrenin hemen altında "Şifremi
 * unuttum", tek birincil düğme, "Hesabın yok mu?" ayracıyla üyelik yolu,
 * yönetim girişi bağlantısı ve en altta rıza metni. Modal olarak açılır (bkz. app/_layout.tsx),
 * bu yüzden sağ üstte geri oku değil KAPAT düğmesi vardır.
 *
 * HATA METNİ SUNUCUDAN GELİR: onaylanmamış hesaplara sunucu 403 döner ve
 * nedenini mesajda yazar ("Onay bekleyin" gibi); o mesaj olduğu gibi gösterilir,
 * çünkü kullanıcıya ne yapması gerektiğini asıl o anlatır. 401/403 dışındaki
 * durumlarda `ApiError.userMessage` (genel, güvenli metin) kullanılır.
 *
 * YÖNLENDİRME KORUNUR: girişten sonra yığında geri dönülecek bir ekran varsa
 * oraya dönülür (kullanıcı korumalı bir sayfadan buraya yollanmıştır); yoksa
 * Profil SEKMESİ açılır. Bu davranış değiştirilmemelidir.
 *
 * KLAVYE: iOS'ta içerik klavyenin üstüne itilir, "İleri" tuşu şifre alanına
 * atlar, "Git" tuşu formu gönderir; boşluğa dokunmak klavyeyi kapatır ama
 * düğmeye ilk dokunuş kaybolmaz (`keyboardShouldPersistTaps="handled"`).
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, type TextInput } from "react-native";
import {
  AuthCard,
  AuthDivider,
  AuthLink,
  AuthNotice,
  AuthShell,
  PasswordEye,
  authStyles,
} from "@/components/account/AuthShell";
import { Button, Input, Touchable } from "@/components/ui";
import { ApiError } from "@/lib/http";
import { openLink } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, touchSlop, type } from "@/theme";

const PRIVACY_URL = "https://elitlig.com/gizlilik-politikasi";

export default function LoginScreen() {
  const { signIn, signingIn } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ yonetim?: string }>();

  /* YÖNETİM GİRİŞİ: `/giris?yonetim=1` ya da alttaki bağlantı. Sunucuya
     scope=management gider; yönetim rolü olmayan hesap reddedilir ve giriş
     sonrası doğrudan Yönetim Paneli açılır. Web'deki /yonetim/giris ile aynı. */
  const [managementMode, setManagementMode] = useState(params.yonetim === "1");
  const toggleMode = useCallback(() => {
    setManagementMode((value) => !value);
    setError(null);
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !signingIn;

  /* Alan düzeltilince eski hata kalmasın: kullanıcı zaten yanıtı uyguluyor. */
  const changeUsername = useCallback((value: string) => {
    setUsername(value);
    setError(null);
  }, []);

  const changePassword = useCallback((value: string) => {
    setPassword(value);
    setError(null);
  }, []);

  const toggleSecure = useCallback(() => setSecure((value) => !value), []);
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  /* PUSH, REPLACE DEĞİL: bir modalı başka bir modalla "replace" etmek iOS'ta
     ilk modalı kapatıp yenisini açmayabiliyor (App Store incelemesinde "Üye Ol
     penceresi kapanıyor" diye reddedildi). Push ile kayıt ekranı girişin
     üstüne açılır; "Giriş yap" bağlantısı dismissTo ile buraya döner. */
  const openRegister = useCallback(() => router.push("/kayit"), [router]);
  const openForgot = useCallback(() => router.push("/sifremi-unuttum"), [router]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const signedUser = await signIn(username, password, managementMode ? "management" : undefined);
      // Yönetim girişinde (ya da yönetim hesabı yığında dönülecek ekran
      // yokken) doğrudan Yönetim Paneli açılır.
      if (managementMode || (signedUser?.isManagement && !router.canGoBack())) {
        router.replace("/yonetim");
        return;
      }
      if (router.canGoBack()) router.back();
      // Eski `(tabs)/profile` ekranı kaldırıldı; girişten sonra yığında geri
      // dönülecek bir şey yoksa Profil SEKMESİ açılır (hesap detayı oradaki
      // kimlik kartından /hesabim ile açılıyor).
      else router.replace("/(tabs)/profil");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? // 401/403'te sunucunun kendi metni daha açıklayıcı.
            caught.status === 401 || caught.status === 403
            ? caught.message
            : caught.userMessage
          : "Giriş yapılamadı."
      );
    }
  }, [canSubmit, managementMode, password, router, signIn, username]);

  return (
    <AuthShell
      title={managementMode ? "Yönetim girişi" : "Giriş yap"}
      overline={managementMode ? "ElitLig yönetim" : "ElitLig"}
      heading={managementMode ? "Yönetim girişi" : "Tekrar hoş geldin"}
      lede={
        managementMode
          ? "Admin, editör, il / lig / maç yöneticisi, disiplin kurulu ve sosyal medya hesapları. Giriş sonrası Yönetim Paneli açılır."
          : "Üye, oyuncu, takım başkanı ve yönetim hesapları buradan girer."
      }
      icon={managementMode ? "shield-checkmark-outline" : undefined}
      onClose={close}
    >
      <AuthCard>
        <Input
          label="Kullanıcı adı"
          value={username}
          onChangeText={changeUsername}
          leadingIcon="person-outline"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          placeholder="kullanici.adi"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={focusPassword}
          editable={!signingIn}
        />

        <Input
          ref={passwordRef}
          label="Şifre"
          value={password}
          onChangeText={changePassword}
          leadingIcon="lock-closed-outline"
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          placeholder="••••••••"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!signingIn}
          trailing={<PasswordEye secure={secure} onToggle={toggleSecure} />}
        />

        {/* Şifre sıfırlama, şifre alanının hemen altında — kullanıcının
            "şifremi hatırlamıyorum" dediği an baktığı yer orası. */}
        <Touchable
          feedback="chip"
          onPress={openForgot}
          disabled={signingIn}
          accessibilityRole="button"
          hitSlop={touchSlop(20)}
          style={styles.forgot}
        >
          <Text style={styles.forgotText} {...textScale.dense}>
            Şifremi unuttum
          </Text>
        </Touchable>
      </AuthCard>

      {error ? <AuthNotice message={error} /> : null}

      <Button
        label={managementMode ? "Yönetim paneline gir" : "Giriş yap"}
        icon={managementMode ? "shield-checkmark-outline" : undefined}
        onPress={submit}
        loading={signingIn}
        disabled={!canSubmit}
        size="lg"
        fullWidth
      />

      {/* App Store 4 (Design): kayıt tarayıcıya yönlendirilmez, uygulama
          içindeki /kayit ekranında yapılır. */}
      {managementMode ? null : (
        <>
          <AuthDivider label="Hesabın yok mu?" />
          <Button
            label="Ücretsiz üye ol"
            onPress={openRegister}
            variant="secondary"
            size="lg"
            fullWidth
            disabled={signingIn}
          />
        </>
      )}

      <AuthLink
        prompt={managementMode ? "Üye misin?" : "Yönetim hesabın mı var?"}
        action={managementMode ? "Üye girişi" : "Yönetim girişi"}
        onPress={toggleMode}
        disabled={signingIn}
        testID="toggle-management-login"
      />

      {/* Mağaza şartı (App Store 1.2): kullanıcı içeriği olan uygulama,
          hakaret ve taciz için hoşgörü olmadığını kullanıcıya kabul
          ettirir. Kurallar uygulama içinde (app/kurallar.tsx). */}
      <Text style={authStyles.fine} {...textScale.long}>
        Giriş yaparak{" "}
        <Text style={authStyles.inlineLink} onPress={() => router.push("/kurallar")} accessibilityRole="link">
          Lig Kuralları
        </Text>
        {"'nı ve "}
        <Text style={authStyles.inlineLink} onPress={() => void openLink(PRIVACY_URL)} accessibilityRole="link">
          Gizlilik Politikası
        </Text>
        {"'nı kabul etmiş olursun. Sohbet ve aramalarda hakaret, taciz ve uygunsuz içeriğe hoşgörü yoktur; ihlal eden üye engellenebilir ve şikayet edilebilir."}
      </Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: {
    alignSelf: "flex-end",
    marginTop: -space.xs,
  },
  forgotText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
