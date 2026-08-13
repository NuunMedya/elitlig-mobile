import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/constants/theme";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Giriş ekranı — POST /api/users/login
 *
 * Sunucu onaylanmamış hesaplara 403 döner ve nedenini mesajda yazar; o mesaj
 * olduğu gibi gösterilir, çünkü kullanıcıya ne yapması gerektiğini o anlatır
 * ("Onay bekleyin" gibi).
 */
export default function LoginScreen() {
  const { signIn, signingIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !signingIn;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await signIn(username, password);
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/profile");
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
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>ELİTLİG</Text>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.line} />
            </Pressable>
          </View>

          <Text style={styles.title}>Giriş yap</Text>
          <Text style={styles.subtitle}>
            Hesabınız yoksa elitlig.com üzerinden üye olabilirsiniz.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Kullanıcı adı</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="kullanici.adi"
              placeholderTextColor={colors.faint}
              style={styles.input}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Şifre</Text>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secure}
                autoCapitalize="none"
                autoComplete="current-password"
                placeholder="••••••••"
                placeholderTextColor={colors.faint}
                style={[styles.input, styles.passwordInput]}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable onPress={() => setSecure((value) => !value)} hitSlop={10} style={styles.eye}>
                <Ionicons
                  name={secure ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.live} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && styles.pressed,
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color={colors.pitch} />
            ) : (
              <Text style={styles.submitText}>Giriş yap</Text>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            Şifrenizi unuttuysanız elitlig.com üzerinden sıfırlama isteği gönderin.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    ...type.caption,
    color: colors.turf,
  },
  title: {
    ...type.title,
    color: colors.line,
  },
  subtitle: {
    ...type.small,
    color: colors.muted,
    marginTop: -spacing.sm,
    lineHeight: 20,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...type.caption,
    color: colors.muted,
  },
  input: {
    ...type.body,
    color: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  passwordRow: {
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: spacing.xl + spacing.md,
  },
  eye: {
    position: "absolute",
    right: spacing.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "rgba(255,77,77,0.12)",
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    ...type.small,
    color: colors.live,
    flex: 1,
    lineHeight: 20,
  },
  submit: {
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
  },
  submitText: {
    ...type.body,
    color: colors.pitch,
    fontWeight: "800",
  },
  footnote: {
    ...type.caption,
    color: colors.faint,
    letterSpacing: 0,
    textAlign: "center",
    lineHeight: 18,
  },
});
