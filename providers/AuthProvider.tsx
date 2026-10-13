import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as authApi from "@/lib/api/auth";
import type { RegisterInput } from "@/lib/api/auth";
import { ApiError, configureAuth } from "@/lib/http";
import { resetPushSync } from "@/hooks/usePushStatus";
import { clearLedger } from "@/lib/notificationLedger";
import {
  clearSessionCache,
  clearToken,
  loadSessionRefreshedAt,
  loadSessionUser,
  loadToken,
  markSessionRefreshed,
  saveSessionUser,
  saveToken,
} from "@/lib/storage";
import type { AuthUser } from "@/lib/types";

/**
 * Oturum yönetimi.
 *
 * Sunucu tarayıcı için httpOnly çerez kullanır; mobilde çerez taşınmadığından
 * login yanıtındaki jeton güvenli depoya yazılır ve http katmanı her isteğe
 * Authorization başlığı olarak ekler (routes/User.js readToken bunu okur).
 *
 * KALICI OTURUM (Instagram / WhatsApp gibi): kullanıcı kendisi çıkış yapana
 * kadar oturum açık kalır.
 *   · Sunucu mobil istemciye uzun ömürlü jeton verir ve uygulama açıldıkça
 *     jeton yenilenir (en fazla günde bir, `refreshSession`). Kullanılan
 *     cihazda süre hiç dolmaz.
 *   · Son bilinen profil cihazda saklanır: uygulama internetsiz açılsa ya da
 *     sunucu o an yanıt vermese bile kullanıcı girişli görünür; doğrulama
 *     bağlantı gelince (ön plana dönüşte) arkada yapılır.
 *   · Oturumu YALNIZ şunlar kapatır: çıkış, sunucunun jetonu açıkça
 *     reddetmesi (şifre değişti, hesap kapatıldı / askıya alındı). Ağ hatası,
 *     zaman aşımı ya da 5xx oturumu ASLA silmez.
 */

/** Jeton bu aralıktan eskiyse yenilenir. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Ön plana dönüşte sunucu doğrulaması en fazla bu sıklıkla yapılır. */
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

/** Hata oturumun gerçekten bittiğini mi söylüyor? (ağ / sunucu hatası değil) */
function sessionEnded(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401) return true;
  return error.status === 403 && ["ACCOUNT_INACTIVE", "ACCOUNT_BLOCKED"].includes(String(error.code));
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Açılışta saklı jeton doğrulanırken true. */
  initializing: boolean;
  signingIn: boolean;
  /**
   * Giriş. `scope: "management"` yönetim girişidir: sunucu yönetim rolü
   * olmayan hesabı reddeder (routes/User.js assertLoginScope).
   */
  signIn: (username: string, password: string, scope?: "management" | "member") => Promise<AuthUser>;
  /** Uygulama içi kayıt; başarılıysa oturum da kurulur. */
  signUp: (input: RegisterInput) => Promise<void>;
  /** Şifre değiştirir ve sunucunun verdiği taze jetonu saklar. Mesajı döndürür. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
  signOut: () => Promise<void>;
  isManagement: boolean;
}

// Sunucudaki gerçek yönetim rolleri (middleware/requirePermission kapsamı).
const MANAGEMENT_ROLES = [
  "admin",
  "editor",
  "il_yoneticisi",
  "lig_yoneticisi",
  "mac_yoneticisi",
  "disiplin_kurulu",
  "sosyal_medya_yoneticisi",
];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const queryClient = useQueryClient();

  // http katmanı senkron okur; state yerine ref tutulur.
  const tokenRef = useRef<string | null>(null);

  const forgetSession = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    await clearToken();
    await clearSessionCache();

    /* BİLDİRİM DURUMUNU DA UNUT.
       Teslimat defteri bildirim kimliklerini tutuyor; aynı cihaza başka bir üye
       girerse onun bildirimleri "zaten gösterildi" sanılıp yutulurdu. Push
       senkron işareti de sıfırlanır ki yeni oturumda cihaz token'ı mutlaka
       yeniden yazılsın — aksi hâlde token eski üyenin hesabında kalırdı. */
    resetPushSync();
    await clearLedger();
  }, []);

  /** Yeni jetonu bellekte ve güvenli depoda tutar; yenileme saatini işler. */
  const adoptToken = useCallback(async (token: string) => {
    tokenRef.current = token;
    await saveToken(token);
    await markSessionRefreshed();
  }, []);

  const rememberUser = useCallback((next: AuthUser) => {
    setUser(next);
    void saveSessionUser(next);
  }, []);

  // Jeton kaynağını ve 401 davranışını bir kez bağla.
  useEffect(() => {
    configureAuth(
      () => tokenRef.current,
      (rejectedToken) => {
        /* Yalnız GÜNCEL jeton reddedildiyse çık: yenileme ile aynı anda
           uçuşta olan eski jetonlu bir isteğin 401'i yeni oturumu silmesin. */
        if (rejectedToken && rejectedToken === tokenRef.current) void forgetSession();
      }
    );
  }, [forgetSession]);

  /**
   * Sunucu doğrulaması + gerekirse jeton yenileme.
   *
   * Ağ ya da sunucu hatasında HİÇBİR ŞEY silinmez: kullanıcı son bilinen
   * profille girişli kalır, bir sonraki ön plana dönüşte tekrar denenir.
   */
  const lastValidatedRef = useRef(0);
  const validatingRef = useRef<Promise<void> | null>(null);

  const revalidate = useCallback(
    (force = false): Promise<void> => {
      if (!tokenRef.current) return Promise.resolve();
      if (validatingRef.current) return validatingRef.current;
      if (!force && Date.now() - lastValidatedRef.current < REVALIDATE_INTERVAL_MS) return Promise.resolve();

      const run = (async () => {
        const tokenAtStart = tokenRef.current;
        try {
          const verified = await authApi.verifySession();
          // Doğrulama sürerken çıkış yapıldıysa sonucu yok say.
          if (tokenRef.current !== tokenAtStart) return;
          rememberUser(verified);
          lastValidatedRef.current = Date.now();

          const refreshedAt = await loadSessionRefreshedAt();
          if (Date.now() - refreshedAt >= REFRESH_INTERVAL_MS) {
            const refreshed = await authApi.refreshSession();
            if (tokenRef.current !== tokenAtStart || !refreshed?.token) return;
            await adoptToken(refreshed.token);
            if (refreshed.user) rememberUser(refreshed.user);
          }
        } catch (error) {
          if (sessionEnded(error) && tokenRef.current === tokenAtStart) await forgetSession();
          // Diğer hatalar (çevrimdışı, zaman aşımı, 5xx): oturum korunur.
        }
      })().finally(() => {
        validatingRef.current = null;
      });

      validatingRef.current = run;
      return run;
    },
    [adoptToken, forgetSession, rememberUser]
  );

  // Açılış: saklı jeton varsa son bilinen profille HEMEN girişli aç, sunucu
  // doğrulamasını arkada yap.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadToken();
        if (!stored) return;
        tokenRef.current = stored;

        const cached = await loadSessionUser<AuthUser>();
        if (cached && !cancelled) {
          setUser(cached);
          setInitializing(false);
          void revalidate(true);
          return;
        }

        // Profil önbelleği yoksa (ilk sürüm geçişi) doğrulama beklenir.
        await revalidate(true);
      } catch {
        // Depo okunamadı: misafir olarak devam edilir, jeton silinmez.
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [revalidate]);

  // Ön plana dönüşte doğrula / yenile: uygulama haftalarca arka planda kalsa
  // bile oturum tazelenir, çevrimdışı açılışta eksik kalan doğrulama tamamlanır.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") void revalidate(false);
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [revalidate]);

  const signIn = useCallback(
    async (username: string, password: string, scope?: "management" | "member") => {
      setSigningIn(true);
      try {
        const response = await authApi.login(username.trim(), password, scope);
        await adoptToken(response.token);
        rememberUser(response.user);
        lastValidatedRef.current = Date.now();
        // Yetkiye göre değişen uçlar (oyuncu iletişim bilgisi vb.) yeniden çekilsin.
        await queryClient.invalidateQueries();
        return response.user;
      } finally {
        setSigningIn(false);
      }
    },
    [adoptToken, queryClient, rememberUser]
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      setSigningIn(true);
      try {
        const response = await authApi.register(input);
        await adoptToken(response.token);
        rememberUser(response.user);
        lastValidatedRef.current = Date.now();
        await queryClient.invalidateQueries();
      } finally {
        setSigningIn(false);
      }
    },
    [adoptToken, queryClient, rememberUser]
  );

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const response = await authApi.changePassword(currentPassword, newPassword);
    // Eski jeton sunucuda geçersiz kılındı; yenisi yazılmazsa bir sonraki
    // istek 401 alır ve kullanıcı dışarı atılır.
    await adoptToken(response.token);
    return response.message;
  }, [adoptToken]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Sunucuya ulaşılamasa da yerel oturum kapatılır.
    }
    await forgetSession();
    await queryClient.invalidateQueries();
  }, [forgetSession, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signingIn,
      signIn,
      signUp,
      changePassword,
      signOut,
      // Sunucunun rol kaydı esas alınır (panelden eklenen yönetim rolleri de
      // yönetim sayılır); eski sunucu yanıtında alan yoksa sabit listeye düşülür.
      isManagement: Boolean(
        user && (typeof user.isManagement === "boolean" ? user.isManagement : MANAGEMENT_ROLES.includes(user.role))
      ),
    }),
    [user, initializing, signingIn, signIn, signUp, changePassword, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return context;
}
