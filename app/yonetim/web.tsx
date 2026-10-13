/**
 * WEB YÖNETİM PANELİ — web sürümündeki her yönetim sayfası uygulamanın içinde.
 *
 * NE: `?path=/editor/maclar&title=Maçlar` ile gelen web sayfasını uygulama içi
 * tarayıcıda açar. Kullanıcı yeniden giriş yapmaz: açılışta sunucudan KISA
 * ömürlü (24 saat) bir web jetonu alınır (POST /api/users/session/web) ve
 * sayfa yüklenmeden önce web istemcisinin okuduğu anahtarlara yazılır
 * (localStorage `accessToken` + `user`, bkz. elitlig-client src/api/api.js).
 *
 * NEDEN UZUN ÖMÜRLÜ MOBİL JETON VERİLMEZ: web sayfası JavaScript'tir; mobilin
 * 365 günlük jetonunu oraya yazmak, onu gereksiz yere açığa çıkarırdı. Web
 * jetonu yalnız bu görünümün kendi deposunda durur.
 *
 * GEZİNME: aynı site içindeki bağlantılar görünümde kalır; başka sitelere
 * giden bağlantılar (WhatsApp, harita, YouTube…) sistem tarayıcısında açılır.
 * Android geri tuşu önce web geçmişinde geri gider.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { EmptyState, ErrorState, ScreenHeader, Skeleton } from "@/components/ui";
import { webSession } from "@/lib/api/auth";
import { WEB_BASE_URL } from "@/lib/config";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

const WEB_HOST = (() => {
  try {
    return new URL(WEB_BASE_URL).host.replace(/^www\./, "");
  } catch {
    return "elitlig.com";
  }
})();

/** Aynı site mi? (www. öneki ve alt yollar dahil) */
function isSameSite(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "about:" || parsed.protocol === "blob:" || parsed.protocol === "data:") return true;
    return parsed.host.replace(/^www\./, "") === WEB_HOST;
  } catch {
    return true;
  }
}

/** Yalnız sitenin kendi yollarına izin verilir; mutlak adres reddedilir. */
function safePath(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text.startsWith("/") || text.startsWith("//")) return "/yonetim";
  return text;
}

interface Session {
  token: string;
  user: unknown;
}

export default function AdminWebScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ path?: string; title?: string }>();
  const path = safePath(params.path);
  const title = (Array.isArray(params.title) ? params.title[0] : params.title) || "Yönetim Paneli";

  const webRef = useRef<WebView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Web jetonu: ekran her açıldığında tazelenir (24 saatlik ömür).
  useEffect(() => {
    if (!auth.user || !auth.isManagement) return;
    let cancelled = false;
    setSessionError(null);
    webSession()
      .then((data) => {
        if (!cancelled) setSession({ token: data.token, user: data.user });
      })
      .catch((error) => {
        if (!cancelled) setSessionError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user, auth.isManagement, attempt]);

  /* Sayfa yüklenmeden ÖNCE çalışır: web istemcisi açılışta bu anahtarlardan
     oturumu okur. Değerler JSON.stringify ile kaçışlanır (enjeksiyon yok). */
  const injected = useMemo(() => {
    if (!session) return "";
    const token = JSON.stringify(session.token);
    const user = JSON.stringify(JSON.stringify(session.user ?? null));
    return `(function(){try{
      localStorage.setItem("accessToken", ${token});
      localStorage.setItem("user", ${user});
      localStorage.setItem("elitlig.embeddedApp", "1");
    }catch(e){}})();true;`;
  }, [session]);

  const goBack = useCallback(() => {
    if (canGoBack) webRef.current?.goBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/yonetim");
  }, [canGoBack, router]);

  // Android geri tuşu önce web geçmişinde geri gider.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  const onShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    if (isSameSite(request.url)) return true;
    // tel:, mailto:, whatsapp: ve başka siteler sistemde açılır.
    void Linking.openURL(request.url).catch(() => {});
    return false;
  }, []);

  const reload = useCallback(() => {
    setLoadError(null);
    webRef.current?.reload();
  }, []);

  const header = (
    <ScreenHeader
      title={title}
      back
      onBack={goBack}
      actions={[{ icon: "refresh", onPress: reload, accessibilityLabel: "Sayfayı yenile" }]}
    />
  );

  if (!auth.user || !auth.isManagement) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Yönetim Paneli" back />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüm yönetime açık"
          body="Web yönetim paneli yalnız yönetim hesaplarına açıktır."
          action={{ label: "Yönetim girişi", onPress: () => router.push("/giris?yonetim=1") }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      {header}

      {sessionError ? (
        <ErrorState error={sessionError} onRetry={() => setAttempt((value) => value + 1)} />
      ) : !session ? (
        <View style={styles.loading}>
          <Skeleton width="70%" height={16} radius="xs" />
          <Skeleton width="90%" height={12} radius="xs" />
          <Skeleton width="60%" height={12} radius="xs" />
          <Text style={styles.loadingText} {...textScale.dense}>
            Web yönetim paneli hazırlanıyor…
          </Text>
        </View>
      ) : loadError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Sayfa açılamadı"
          body={loadError}
          action={{ label: "Tekrar dene", onPress: reload }}
        />
      ) : null}

      {session && !sessionError ? (
        <View style={[styles.webWrap, loadError ? styles.hidden : null]}>
          {progress > 0 && progress < 1 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
          <WebView
            ref={webRef}
            source={{ uri: `${WEB_BASE_URL}${path}` }}
            injectedJavaScriptBeforeContentLoaded={injected}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
            onLoadStart={() => setLoadError(null)}
            onError={({ nativeEvent }) =>
              setLoadError(nativeEvent.description || "İnternet bağlantını kontrol edip tekrar dene.")
            }
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.statusCode >= 500) setLoadError("Site şu anda yanıt vermiyor. Az sonra tekrar dene.");
            }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            allowsBackForwardNavigationGestures
            allowsInlineMediaPlayback
            setSupportMultipleWindows={false}
            pullToRefreshEnabled
            startInLoadingState={false}
            style={styles.web}
            testID="admin-webview"
          />
        </View>
      ) : null}

      <View style={styles.footer} pointerEvents="none">
        <Ionicons name="globe-outline" size={12} color={colors.textTertiary} />
        <Text style={styles.footerText} numberOfLines={1} {...textScale.dense}>
          {WEB_HOST}
          {path}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { padding: layout.screenPadding, gap: space.sm },
  loadingText: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
  webWrap: { flex: 1 },
  hidden: { height: 0, flex: 0, opacity: 0 },
  web: { flex: 1, backgroundColor: colors.bg },
  progressTrack: { height: 2, backgroundColor: colors.border },
  progressBar: { height: 2, backgroundColor: colors.brandAccent },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.xxs,
  },
  footerText: { ...type.caption, color: colors.textTertiary, flex: 1 },
});
