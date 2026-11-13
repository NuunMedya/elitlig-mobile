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
import React, { useCallback, useState } from "react";
import {
  Alert,
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
  IconTile,
  Input,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  toneColors,
  useToast,
} from "@/components/ui";
import { deleteAccount, getDeletionSummary, type DeletionSummary } from "@/lib/api/account";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { AuthNotice } from "@/components/account/AuthShell";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

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

  /** Görsel hazırlık durumu — gönderim mantığını değiştirmez. */
  const ready = {
    password: password.length > 0,
    phrase: confirmation.trim() === phrase,
  };

  const goToSignIn = useCallback(() => router.push("/giris"), [router]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  /* Düğme hiçbir zaman pasif değil: boş alanla basılınca ne eksik olduğu
     yazıyla söylenir. Soluk/pasif düğme "çalışmıyor" izlenimi veriyor; hem
     kullanıcı hem mağaza inceleyicisi buna takılıyordu. */
  const submit = useCallback(async () => {
    if (busy) return;
    if (!password) {
      setError("Önce şifreni gir.");
      return;
    }
    if (!confirmation.trim()) {
      setError(`Onaylamak için Onay kutusuna ${phrase} yaz.`);
      return;
    }
    /* Son kapı: alanlar doluyken bile bir kez daha sorulur. Şifre + yazılı
       cümle "bilinçli mi" sorusunu yanıtlar; bu pencere "şu an mı" sorusunu.
       Yanlış anda basılan tek dokunuş geri alınamaz bir silme olmasın. */
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Hesabın kalıcı olarak silinecek",
        "Bu işlem geri alınamaz. Hesabın, mesajların ve kişisel kayıtların silinir. Devam etmek istiyor musun?",
        [
          { text: "Vazgeç", style: "cancel", onPress: () => resolve(false) },
          { text: "Evet, sil", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!confirmed) return;

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
  }, [auth, busy, confirmation, password, phrase, reason, router, toast]);

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
          {/* UYARI BAŞLIĞI — ekranın ilk cümlesi geri dönüşün olmadığını söyler. */}
          <View style={styles.warning}>
            <IconTile icon="trash" tone="red" size={44} />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle} accessibilityRole="header" {...textScale.dense}>
                Bu işlem geri alınamaz
              </Text>
              <Text style={styles.warningBody} {...textScale.long}>
                Hesabın kalıcı olarak silinir. Aynı kullanıcı adıyla yeniden kaydolsan bile eski
                hesabın geri gelmez.
              </Text>
            </View>
          </View>

          {/* ÜÇ ADIM — oku, doğrula, sil. Doldukça adım yanar. */}
          <View style={styles.steps} accessibilityLabel={`Adım: ${ready.password && ready.phrase ? 3 : ready.password ? 2 : 1} / 3`}>
            {[
              { key: "oku", label: "Sonuçları oku", done: true },
              { key: "dogrula", label: "Doğrula", done: ready.password && ready.phrase },
              { key: "sil", label: "Sil", done: false },
            ].map((step, index) => (
              <React.Fragment key={step.key}>
                {index > 0 ? <View style={[styles.stepLine, step.done || ready.password ? styles.stepLineOn : null]} /> : null}
                <View style={styles.stepItem}>
                  <View style={[styles.stepDot, step.done ? styles.stepDotDone : null]}>
                    {step.done ? (
                      <Ionicons name="checkmark" size={11} color={colors.textOnStatus} />
                    ) : (
                      <Text style={styles.stepNum} {...textScale.badge}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.stepLabel} numberOfLines={1} {...textScale.badge}>
                    {step.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {summaryFailed ? (
            <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
          ) : null}

          {/* NE OLACAK — sunucudan gelen sonuçlar tek kartta, satır satır. */}
          <SectionHeader title="Ne olacak?" icon="alert-circle" iconTone="red" inset="flush" style={styles.flushHeader} />
          <View style={styles.card}>
            {summary.consequences.map((item, index) => (
              <View key={item.key} style={[styles.consequence, index > 0 ? styles.consequenceBorder : null]}>
                <View style={styles.bullet}>
                  <Text style={styles.bulletNum} {...textScale.badge}>
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.consequenceCopy}>
                  <Text style={styles.consequenceTitle} {...textScale.long}>
                    {item.title}
                  </Text>
                  <Text style={styles.consequenceBody} {...textScale.long}>
                    {item.description}
                  </Text>
                </View>
              </View>
            ))}
            {summary.team ? (
              <View style={[styles.consequence, styles.consequenceBorder]}>
                <View style={[styles.bullet, styles.bulletInfo]}>
                  <Ionicons name="information" size={12} color={colors.textSecondary} />
                </View>
                <Text style={[styles.consequenceBody, styles.consequenceCopy]} {...textScale.long}>
                  Takımını bırakmak istemiyorsan hesabını silmeden önce elitlig.com üzerinden
                  başka bir üyeye devredebilirsin.
                </Text>
              </View>
            ) : null}
          </View>

          {/* ONAY — şifre + elle yazılan cümle (+ isteğe bağlı neden). */}
          <SectionHeader title="Onayla" icon="key" iconTone="gold" inset="flush" style={styles.flushHeader} />
          <View style={[styles.card, styles.form]}>
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
              label={`Onay: ${phrase} yaz`}
              value={confirmation}
              onChangeText={(value) => { setConfirmation(value); setError(null); }}
              leadingIcon="create-outline"
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={phrase}
              hint="Büyük harflerle, birebir."
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

            {/* HAZIRLIK — iki şart karşılandıkça yeşile döner. */}
            <View style={styles.checks}>
              <CheckLine done={ready.password} label="Şifre girildi" />
              <CheckLine done={ready.phrase} label={`"${phrase}" birebir yazıldı`} />
            </View>
          </View>

          {error ? <AuthNotice message={error} /> : null}

          <Button
            label="Hesabımı kalıcı olarak sil"
            onPress={submit}
            variant="danger"
            size="lg"
            fullWidth
            loading={busy}
          />

          <Button label="Vazgeç" onPress={leave} variant="ghost" size="md" fullWidth disabled={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Hazırlık satırı: tamamlandıysa yeşil onay, değilse boş halka. */
function CheckLine({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.checkLine}>
      <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={16} color={done ? colors.win : colors.textDisabled} />
      <Text style={[styles.checkText, done ? styles.checkTextDone : null]} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
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

  flushHeader: { paddingHorizontal: 0, paddingBottom: 0 },

  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: DANGER.dim,
    borderWidth: hairline,
    borderColor: DANGER.fg,
  },
  steps: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xs,
  },
  stepItem: { alignItems: "center", gap: space.xs, width: 84 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stepDotDone: { backgroundColor: colors.win, borderColor: colors.win },
  stepNum: { ...type.numSmStrong, color: colors.textSecondary },
  stepLabel: { ...type.micro, color: colors.textTertiary },
  stepLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.surface3, marginBottom: space.lg },
  stepLineOn: { backgroundColor: colors.win },
  checks: {
    gap: space.s,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  checkLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  checkText: { ...type.bodySm, color: colors.textTertiary, flex: 1 },
  checkTextDone: { color: colors.textPrimary },
  warningCopy: { flex: 1, gap: space.xxs },
  warningTitle: { ...type.h2, color: DANGER.fg },
  warningBody: { ...type.bodySm, color: colors.textPrimary, lineHeight: 19 },

  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  consequence: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.m,
    padding: space.md,
  },
  consequenceBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DANGER.dim,
  },
  bulletInfo: { backgroundColor: colors.surface3 },
  bulletNum: { ...type.numSmStrong, color: DANGER.fg },
  consequenceCopy: { flex: 1, gap: space.xxs },
  consequenceTitle: { ...type.h4, color: colors.textPrimary },
  consequenceBody: { ...type.bodySm, color: colors.textSecondary, lineHeight: 18 },

  form: { gap: space.md, padding: space.lg },
});
