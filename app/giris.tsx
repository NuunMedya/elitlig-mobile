/**
 * GİRİŞ — POST /api/users/login
 *
 * NE: marka başlığı, iki alan (kullanıcı adı + şifre), tek birincil düğme ve
 * gerektiğinde tek bir hata kutusu. Modal olarak açılır (bkz. app/_layout.tsx),
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

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
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
import { Button, Input, ScreenHeader, Touchable, toneColors } from "@/components/ui";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
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

/** Hata kutusunun tonu tek yerden okunur — kendi kırmızısını yazan yok. */
const DANGER = toneColors("danger");

export default function LoginScreen() {
  const { signIn, signingIn } = useAuth();
  const router = useRouter();

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

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await signIn(username, password);
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
  }, [canSubmit, password, router, signIn, username]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Giriş yap"
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
          <Text style={styles.lede} {...textScale.long}>
            Üye, oyuncu, takım başkanı ve yönetim hesapları buradan giriş
            yapabilir. Hesabınız yoksa elitlig.com üzerinden üye olabilirsiniz.
          </Text>

          <View style={styles.form}>
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
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={DANGER.fg} />
              <Text style={styles.errorText} {...textScale.long}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label="Giriş yap"
            onPress={submit}
            loading={signingIn}
            disabled={!canSubmit}
            size="lg"
            fullWidth
          />

          <Text style={styles.footnote} {...textScale.long}>
            Şifrenizi unuttuysanız elitlig.com üzerinden sıfırlama isteği gönderin.
          </Text>
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

  lede: {
    ...type.bodySm,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  form: {
    gap: space.md,
  },

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
  },
});
