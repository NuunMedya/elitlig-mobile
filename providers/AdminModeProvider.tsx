/**
 * YÖNETİM MODU — yönetici oturumunda uygulamanın iki yüzü.
 *
 * NE: yönetim rolündeki kullanıcı uygulamayı iki modda kullanır:
 *   · "admin"  → YÖNETİM MODU. Alt menü, ana ekran ve kısayollar tamamen
 *                yönetim araçlarına hizmet eder (Panel · İşler · Uygulamalar ·
 *                Mesajlar · Lig). Yönetici girişinde varsayılan budur.
 *   · "member" → ÜYE GÖRÜNÜMÜ. Uygulama normal kullanıcının gördüğü hâline
 *                döner; alt menünün üstünde tek dokunuşla geri dönülen ince
 *                bir "Yönetime dön" şeridi durur.
 *
 * Geçiş TEK DÜĞMEDİR: `enterMember()` ("Üye gözünden gör") ve `enterAdmin()`
 * ("Yönetim moduna geç"). İkisi de önce yığındaki detay ekranlarını kapatır,
 * sonra o modun kök sekmesine iner; kullanıcı yarım kalmış bir yönetim
 * ekranının üstünde üye sekmeleriyle baş başa kalmaz.
 *
 * Tercih cihazda saklanır (uygulama kapatılıp açılınca aynı modda açılır).
 * Yönetim rolü olmayan hesapta ve misafirde `adminActive` daima false'tur;
 * saklanan tercih onlara hiçbir şey yaptırmaz.
 *
 * GİRİŞ / ÇIKIŞ: oturum değişince mod kendiliğinden doğru köke iner — bu
 * yönlendirmeyi sekme düzeni yapar (app/(tabs)/_layout.tsx), çünkü hangi
 * sekmenin açık olduğunu o bilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/providers/AuthProvider";
import { haptics } from "@/theme";

export type AppMode = "admin" | "member";

const STORAGE_KEY = "elitlig.appMode.v1";

/** Modların kök sekmeleri — sekme düzeni ve geçiş düğmeleri aynı adresi kullanır. */
export const ADMIN_HOME = "/(tabs)/yonetim-panel" as const;
export const MEMBER_HOME = "/(tabs)/skorlar" as const;

interface AdminModeValue {
  /** Saklanan tercih (yönetim rolü olmasa da okunur). */
  mode: AppMode;
  /** Tercih cihazdan okundu mu? Okunmadan yönlendirme yapılmaz. */
  ready: boolean;
  /** Hesap yönetim rolünde mi? (mod düğmeleri yalnız o zaman çizilir) */
  canAdmin: boolean;
  /** Şu an YÖNETİM MODU açık mı? */
  adminActive: boolean;
  /** Yönetici, uygulamaya üye gözünden mi bakıyor? */
  memberPreview: boolean;
  enterAdmin: () => void;
  enterMember: () => void;
}

const AdminModeContext = createContext<AdminModeValue>({
  mode: "admin",
  ready: false,
  canAdmin: false,
  adminActive: false,
  memberPreview: false,
  enterAdmin: () => undefined,
  enterMember: () => undefined,
});

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<AppMode>("admin");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (alive && (value === "admin" || value === "member")) setMode(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const canAdmin = Boolean(auth.user) && auth.isManagement;

  /* YENİ YÖNETİCİ GİRİŞİ → YÖNETİM MODU. Açılışta geri yüklenen oturum
     saklanan tercihe dokunmaz; yalnız uygulama açıkken yapılan giriş (kullanıcı
     değişimi) modu yönetim moduna alır. */
  const userId = auth.user ? String(auth.user.id) : null;
  const settled = useRef(false);
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (auth.initializing) return;
    if (!settled.current) {
      settled.current = true;
      lastUser.current = userId;
      return;
    }
    if (userId === lastUser.current) return;
    lastUser.current = userId;
    if (userId && auth.isManagement) {
      setMode("admin");
      AsyncStorage.setItem(STORAGE_KEY, "admin").catch(() => undefined);
    }
  }, [auth.initializing, auth.isManagement, userId]);

  const go = useCallback(
    (next: AppMode) => {
      haptics.select();
      setMode(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      // Açık detay ekranlarını kapat, sonra modun köküne in.
      if (router.canDismiss()) router.dismissAll();
      router.replace(next === "admin" ? ADMIN_HOME : MEMBER_HOME);
    },
    [router],
  );

  const enterAdmin = useCallback(() => go("admin"), [go]);
  const enterMember = useCallback(() => go("member"), [go]);

  const value = useMemo<AdminModeValue>(
    () => ({
      mode,
      ready: ready && !auth.initializing,
      canAdmin,
      adminActive: canAdmin && mode === "admin",
      memberPreview: canAdmin && mode === "member",
      enterAdmin,
      enterMember,
    }),
    [auth.initializing, canAdmin, enterAdmin, enterMember, mode, ready],
  );

  return <AdminModeContext.Provider value={value}>{children}</AdminModeContext.Provider>;
}

export function useAdminMode(): AdminModeValue {
  return useContext(AdminModeContext);
}

/**
 * Sekme kökü bağlamı: bir yönetim ekranı (AdminScreen) alt menüde SEKME olarak
 * çizildiğinde geri düğmesi anlamsızdır. Sekme sarmalayıcısı bu bağlamı true
 * yapar; AdminScreen geri düğmesini gizler.
 */
export const AdminTabRootContext = createContext(false);
