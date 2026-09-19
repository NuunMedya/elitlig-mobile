/**
 * HESABI SİL — GET /api/users/me/deletion-summary + DELETE /api/users/me
 *
 * NEDEN AYRI EKRAN: silme geri alınamaz. Hesabım'daki bir uyarı kutusu ("emin
 * misin?") üç satırlık bir soru sorup evet/hayır bekler; burada anlatılacak
 * şey daha uzun — oyuncu kartın ligde kalır, takımın başkansız kalır, premium
 * süren yanar — ve üstüne iki alan doldurulur. Bu bir ekranın işidir.
 *
 * NEDEN SONUÇ METNİ SUNUCUDAN: neyin ne olacağı hesabın durumuna bağlı
 * (oyuncu bağlı mı, takım yönetiyor mu, premium mi). Aynı kuralları burada bir
 * kez daha yazmak iki tarafın ayrışması demekti; sunucu ne olacağını söyler,
 * ekran çizer (bkz. lib/api/account.ts).
 *
 * NEDEN ŞİFRE + ONAY CÜMLESİ: şifre, açık kalmış bir telefonun hesabı yok
 * etmesini engeller; elle yazılan cümle ise "yanlışlıkla bastım"ı imkânsız
 * kılar. İkisini de sunucu ayrıca doğrular; buradaki kontrol yalnız kullanıcıyı
 * boş isteğe göndermemek içindir.
 *
 * NEDEN MAĞAZA İÇİN ÖNEMLİ: App Store (Guideline 5.1.1-v) ve Google Play,
 * hesap açtıran her uygulamadan hesabın uygulama içinden silinebilmesini
 * ister. Bu ekran o şarttır; kaldırılırsa sürüm reddedilir.
 *
 * NEDEN ÖZET YÜKLENEMESE DE FORM AÇILIR: özet ucu yalnız "neyi
 * kaybedeceksin" metnini getirir; silmenin kendisi ona bağlı değildir. Ağ
 * hatası ya da eski bir sunucu yüzünden özet gelmezse ekran "hata" deyip
 * kapanmaz — genel bir uyarı metniyle form yine çizilir, hata bir şerit
 * olarak duyurulur. İnceleyicinin karşısına hiçbir koşulda "silinemiyor"
 * izlenimi veren bir ekran çıkmamalı.
 *
 * NEDEN YÖNETİM HESABI DA SİLEBİLİR: mağaza şartı herkes içindir, incelemede
 * kullanılan test hesabı da dâhil. Sunucu yalnız sistemdeki son admini
 * engeller (LAST_ADMIN); o durumda ne yapılacağını `blockedReason` söyler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonCard,
  Surface,
  toneColors,
  useToast,
} from "@/components/ui";
import { deleteAccount, getDeletionSummary, type DeletionSummary } from "@/lib/api/account";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const DANGER = toneColors("danger");

/** Sunucu kodu → ekranda görünecek cümle. Kod yoksa ApiError kendi metnini verir. */
const ERROR_TEXTS: Record<string, string> = {
  PASSWORD_INVALID: "Şifren hatalı.",
  CONFIRMATION_REQUIRED: "Onay cümlesini birebir yazman gerekiyor.",
  LAST_ADMIN:
    "Sistemdeki son yönetici hesabı silinemez. Önce başka bir üyeyi yönetici yap, sonra hesabını silebilirsin.",
  /* Eski sunucu sürümü için: yeni sürüm yönetim hesaplarını da siler. */
  MANAGEMENT_ACCOUNT: "Bu hesap şu an silinemiyor. Lig yönetimiyle iletişime geç.",
  TOO_MANY_REQUESTS: "Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.",
};

/** Sunucudan ne olacağı gelmezse gösterilecek genel özet; silme yine mümkündür. */
const FALLBACK_SUMMARY: DeletionSummary = {
  canDelete: true,
  blockedReason: null,
  requiresPassword: true,
  confirmationPhrase: "HESABIMI SİL",
  player: null,
  team: null,
  consequences: [
    {
      key: "account",
      title: "Hesabın ve kişisel kayıtların kalıcı olarak silinir",
      description:
        "Mesajların, bildirimlerin, takip ettiklerin, taleplerin ve oyun skorların geri alınamaz biçimde silinir. " +
        "Lig kayıtları (maçlar, goller, puan durumu) ligin ortak verisidir; onlar yerinde kalır, hesabınla bağı kopar.",
    },
  ],
};

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && ERROR_TEXTS[error.code]) return ERROR_TEXTS[error.code];
    // 400'lerde sunucunun kendi metni daha açıklayıcı (alan bazlı uyarılar).
    return error.status >= 400 && error.status < 500 ? error.message : error.userMessage;
  }
  return "Hesap silinemedi. Tekrar dene.";
}

export default function DeleteAccountScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const signedIn = Boolean(auth.user);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.accountDeletionSummary(),
    queryFn: getDeletionSummary,
    enabled: signedIn,
    retry: false,
  });

  /* Özet gelmediyse (ağ hatası, eski sunucu) genel metinle devam edilir;
     kullanıcı silme hakkından mahrum kalmaz. */
  const summaryFailed = Boolean(query.error) && !query.data;
  const summary: DeletionSummary | undefined = query.data ?? (summaryFailed ? FALLBACK_SUMMARY : undefined);
  const phrase = summary?.confirmationPhrase ?? FALLBACK_SUMMARY.confirmationPhrase;
  const ready = password.length > 0 && confirmation.trim().length > 0 && !busy;

  const goToSignIn = useCallback(() => router.push("/giris"), [router]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const submit = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({
        password,
        confirmation,
        reason: reason.trim() || undefined,
      });
      /* Hesap sunucuda yok; elimizdeki jeton artık hiçbir şey açmıyor. signOut
         yerel oturumu, push kaydını ve bildirim defterini de temizler —
         cihazda eski hesaba ait iz kalmaz. */
      await auth.signOut();
      /* Karşılama ekranı değil ana sekme: uygulama girişsiz de çalışır ve
         tanıtımı yeniden izletmek silmenin ardından tuhaf durur. Veda mesajı
         Toast ile verilir; gidilecek ekranın işi değildir. */
      router.replace("/(tabs)");
      toast.show({ message: "Hesabın silindi. Bizi tercih ettiğin için teşekkürler.", tone: "neutral" });
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  }, [auth, confirmation, password, ready, reason, router, toast]);

  const header = <ScreenHeader title="Hesabı sil" back />;

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="person-outline"
          title="Önce giriş yap"
          body="Hesabını silebilmek için o hesapla giriş yapmış olman gerekiyor."
          action={{ label: "Giriş yap", onPress: goToSignIn }}
        />
      </SafeAreaView>
    );
  }

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  if (!summary.canDelete) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="shield-checkmark-outline"
          title="Bu hesap buradan silinemez"
          body={summary.blockedReason ?? "Yönetim hesapları için lig yönetimiyle iletişime geç."}
          action={{ label: "Geri dön", onPress: leave }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede} {...textScale.long}>
            Hesabını kalıcı olarak silersin. Bu işlem geri alınamaz; aynı kullanıcı adıyla
            yeniden kaydolsan bile eski hesabın geri gelmez.
          </Text>

          {summaryFailed ? (
            <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
          ) : null}

          {summary.consequences.map((item) => (
            <Surface key={item.key} style={styles.consequence}>
              <Ionicons name="warning-outline" size={18} color={DANGER.fg} />
              <View style={styles.consequenceCopy}>
                <Text style={styles.consequenceTitle} {...textScale.long}>
                  {item.title}
                </Text>
                <Text style={styles.consequenceBody} {...textScale.long}>
                  {item.description}
                </Text>
              </View>
            </Surface>
          ))}

          {summary.team ? (
            <Text style={styles.note} {...textScale.long}>
              Takımını bırakmak istemiyorsan hesabını silmeden önce elitlig.com üzerinden
              başka bir üyeye devredebilirsin.
            </Text>
          ) : null}

          <View style={styles.form}>
            <Input
              label="Şifren"
              value={password}
              onChangeText={(value) => { setPassword(value); setError(null); }}
              leadingIcon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              placeholder="••••••••"
              hint="Hesabın gerçekten senin olduğunu doğrulamak için."
              editable={!busy}
            />

            <Input
              label="Onay"
              value={confirmation}
              onChangeText={(value) => { setConfirmation(value); setError(null); }}
              leadingIcon="create-outline"
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={phrase}
              hint={`Onaylamak için ${phrase} yaz.`}
              editable={!busy}
            />

            <Input
              label="Ayrılma nedenin (isteğe bağlı)"
              value={reason}
              onChangeText={setReason}
              leadingIcon="chatbubble-ellipses-outline"
              maxLength={500}
              placeholder="Ligi geliştirmemize yardımcı olur"
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

          <Button
            label="Hesabımı kalıcı olarak sil"
            onPress={submit}
            variant="danger"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!ready}
          />

          <Button label="Vazgeç" onPress={leave} variant="ghost" size="md" fullWidth disabled={busy} />
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
    gap: space.md,
  },

  lede: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },

  consequence: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
  },
  consequenceCopy: { flex: 1, gap: space.xs },
  consequenceTitle: { ...type.bodySm, color: colors.textPrimary },
  consequenceBody: { ...type.caption, color: colors.textSecondary, lineHeight: 17 },

  note: { ...type.caption, color: colors.textTertiary, lineHeight: 17 },

  form: { gap: space.md, paddingTop: space.xs },

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
