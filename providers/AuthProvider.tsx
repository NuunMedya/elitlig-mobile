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
import * as authApi from "@/lib/api/auth";
import { ApiError, configureAuth } from "@/lib/http";
import { clearToken, loadToken, saveToken } from "@/lib/storage";
import type { AuthUser } from "@/lib/types";

/**
 * Oturum yönetimi.
 *
 * Sunucu tarayıcı için httpOnly çerez kullanır; mobilde çerez taşınmadığından
 * login yanıtındaki jeton güvenli depoya yazılır ve http katmanı her isteğe
 * Authorization başlığı olarak ekler (routes/User.js readToken bunu okur).
 */

interface AuthContextValue {
  user: AuthUser | null;
  /** Açılışta saklı jeton doğrulanırken true. */
  initializing: boolean;
  signingIn: boolean;
  signIn: (username: string, password: string) => Promise<void>;
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
  }, []);

  // Jeton kaynağını ve 401 davranışını bir kez bağla.
  useEffect(() => {
    configureAuth(
      () => tokenRef.current,
      () => {
        // Jeton süresi dolmuş: sessizce çık, ekranlar misafir moduna düşer.
        void forgetSession();
      }
    );
  }, [forgetSession]);

  // Açılış: saklı jeton varsa sunucuya doğrulat.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadToken();
        if (!stored) return;
        tokenRef.current = stored;

        const verified = await authApi.verifySession();
        if (!cancelled) setUser(verified);
      } catch (error) {
        // Süresi dolmuş / iptal edilmiş jeton: temizle. Ağ hatasındaysa da
        // misafir olarak devam edilir, uygulama açılışta kilitlenmez.
        if (error instanceof ApiError && error.status !== 0) await clearToken();
        tokenRef.current = null;
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setSigningIn(true);
      try {
        const response = await authApi.login(username.trim(), password);
        tokenRef.current = response.token;
        await saveToken(response.token);
        setUser(response.user);
        // Yetkiye göre değişen uçlar (oyuncu iletişim bilgisi vb.) yeniden çekilsin.
        await queryClient.invalidateQueries();
      } finally {
        setSigningIn(false);
      }
    },
    [queryClient]
  );

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
      signOut,
      isManagement: Boolean(user && MANAGEMENT_ROLES.includes(user.role)),
    }),
    [user, initializing, signingIn, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return context;
}
