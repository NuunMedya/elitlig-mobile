/**
 * MESAJ STICKER'I — uygulamanın her ekranında duran, sürüklenebilir mesaj balonu.
 *
 * NEDEN VAR: yönetimle yazışma bu uygulamada bir "ayar" değil, sık yapılan bir
 * iştir (maç talebi, kadro sorunu, ceza itirazı hep mesajla yürür). Daha önce
 * mesajlara ulaşmanın yolu ya Profil → Kulübüm → Mesajlarım (üç dokunuş) ya da
 * yalnız Maçlar sekmesinin başlığındaki zarf düğmesiydi: kullanıcı takım
 * panelindeyken ya da maç detayındayken gelen mesajı hiç görmüyordu.
 *
 * NEDEN SEKME DEĞİL: sekme çubuğunda altı yuva zaten dolu ve mesajlaşma bir
 * "bölüm" değil, her bölümün üstünde duran bir eylem. Yüzen balon bunu kalıcı
 * dikey alan harcamadan verir.
 *
 * NEDEN SÜRÜKLENEBİLİR: sabit bir balon, altında kalan içeriği (liste
 * satırının sağ ucundaki puan, kadro ekranındaki oyuncu menüsü) kalıcı olarak
 * kapatır. Kullanıcı balonu dikeyde istediği yere taşır; bırakınca en yakın
 * KENARA yapışır ve konumu cihazda saklanır. Yatayda serbest bırakılsaydı
 * ekranın ortasında durup her şeyi kapatabilirdi.
 *
 * NEREDE GİZLENİR (hepsi bilinçli):
 *   · Mesaj ekranlarının kendisinde — kendi üstüne kapı açmaz.
 *   · Giriş / karşılama / şehir seçimi — henüz oturum ve bağlam yok.
 *   · Oyun ekranlarında — hepsi dokunma tabanlı, balon oyun alanını kapatır.
 *   · Girişsiz kullanıcıda — gidecek bir yazışma kutusu yok.
 *
 * ROZET YALNIZ MESAJ SAYAR: bildirim sayısını da katsaydı kullanıcı zarfa
 * basıp boş liste görürdü. Bildirimlerin kendi kapısı başlıktaki zil ikonudur.
 *
 * TEK ÖRNEK: `app/_layout.tsx` içinde bir kez mount edilir; ekranlar kendi
 * kopyasını yaratmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Touchable } from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAuth } from "@/providers/AuthProvider";
import { colors, haptics, layout, radius, space, textScale, type } from "@/theme";

/** Balonun çapı. 52px: 44px dokunma hedefinin üstünde, ama içeriği kapatacak kadar büyük değil. */
const SIZE = 52;

/** Kenar boşluğu — balon ekran kenarına yapışırken bırakılan pay. */
const EDGE_GAP = 12;

/** Sürükleme bu eşiği aşmadıysa dokunuş "basma" sayılır, "sürükleme" değil. */
const DRAG_THRESHOLD = 6;

const POSITION_KEY = "elitlig.messageSticker.v1";

/**
 * Balonun gizleneceği rota önekleri.
 *
 * Önek eşleşmesi kullanılır (tam eşitlik değil): `/mesaj/12` gibi parametreli
 * rotalar da kapsansın diye.
 */
const HIDDEN_PREFIXES = [
  "/mesajlarim",
  "/mesaj",
  "/giris",
  "/hosgeldin",
  "/sehir",
  "/ara",
  // Oyunlar: hepsi dokunma tabanlı, balon oyun alanının üstüne düşer.
  "/penalti",
  "/sektir",
  "/slalom",
  "/kimbu",
  "/arena",
  "/gunun",
  // Yönetimin kendi mesaj ekranı.
  "/yonetim/mesajlar",
];

interface StoredPosition {
  /** Ekranın sağ kenarında mı (varsayılan) yoksa sol kenarında mı. */
  side: "left" | "right";
  /** Üstten uzaklık — ekran yüksekliğine oranla saklanır ki cihaz değişse de
      aynı göreli yerde kalsın. */
  ratio: number;
}

const DEFAULT_POSITION: StoredPosition = { side: "right", ratio: 0.72 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const MessageSticker = React.memo(function MessageSticker() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const { messages } = useUnreadCount();

  const [position, setPosition] = useState<StoredPosition>(DEFAULT_POSITION);
  const [restored, setRestored] = useState(false);

  // Klavye açıldığında/cihaz döndüğünde ölçü güncellensin diye hook;
  // `Dimensions.get()` bir kez okuyup donardı.
  const window = useWindowDimensions();

  /* Dikeyde serbest gezinme aralığı: üstte başlık, altta sekme çubuğu ve
     güvenli alan dışarıda tutulur — balon ne başlığın ne de çubuğun altına
     kaçabilsin. */
  const minTop = insets.top + layout.headerHeightCollapsed + space.sm;
  const maxTop =
    window.height - insets.bottom - layout.tabBarHeight - SIZE - space.md;

  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  /** Sürükleme başındaki taban konum — pan yalnız FARKI taşır. */
  const baseTop = useRef(0);
  const dragged = useRef(false);

  /* ---------------------- Saklı konumu geri yükle ------------------------- */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(POSITION_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const stored = JSON.parse(raw) as StoredPosition;
          if (stored?.side === "left" || stored?.side === "right") {
            setPosition({
              side: stored.side,
              ratio: clamp(Number(stored.ratio) || DEFAULT_POSITION.ratio, 0, 1),
            });
          }
        } catch {
          // Bozuk kayıt: varsayılan konumda kal.
        }
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const top = useMemo(
    () => clamp(minTop + position.ratio * (maxTop - minTop), minTop, maxTop),
    [maxTop, minTop, position.ratio],
  );

  /* Konum değiştiğinde pan sıfırlanır: `top`/`left` artık yeni yeri gösteriyor,
     kalan pan değeri olsaydı balon iki kez kaymış olurdu. */
  useEffect(() => {
    translateY.setValue(0);
    translateX.setValue(0);
  }, [position, translateX, translateY]);

  const persist = useCallback((next: StoredPosition) => {
    setPosition(next);
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify(next)).catch(() => {
      // Depolama hatası konumu bozmaz; oturum boyunca bellekte geçerli kalır.
    });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Basma anında değil, PARMAK KAYINCA yakala: aksi hâlde `Touchable`ın
        // onPress'i hiç çalışmaz ve balon yalnız sürüklenebilir olurdu.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD,

        onPanResponderGrant: () => {
          dragged.current = false;
          baseTop.current = top;
        },

        onPanResponderMove: (_event, gesture) => {
          dragged.current = true;
          translateX.setValue(gesture.dx);
          translateY.setValue(gesture.dy);
        },

        onPanResponderRelease: (_event, gesture) => {
          if (!dragged.current) return;

          const droppedTop = clamp(baseTop.current + gesture.dy, minTop, maxTop);
          const droppedCenterX =
            (position.side === "right" ? window.width - EDGE_GAP - SIZE / 2 : EDGE_GAP + SIZE / 2) +
            gesture.dx;

          // En yakın kenara yapış: ekranın ortasında kalan bir balon altındaki
          // içeriği kalıcı olarak kapatır.
          const side: StoredPosition["side"] =
            droppedCenterX < window.width / 2 ? "left" : "right";

          haptics.select();
          persist({
            side,
            ratio: maxTop > minTop ? (droppedTop - minTop) / (maxTop - minTop) : 0.5,
          });
        },
      }),
    [maxTop, minTop, persist, position.side, top, translateX, translateY, window.width],
  );

  const open = useCallback(() => {
    // Sürüklemenin sonundaki dokunuş yanlışlıkla ekran açmasın.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    router.push("/mesajlarim");
  }, [router]);

  /* ------------------------------ Görünürlük ------------------------------ */

  const hidden =
    !restored ||
    !auth.user ||
    HIDDEN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (hidden) return null;

  const count = messages > 99 ? "99+" : messages > 0 ? String(messages) : null;
  const unread = messages > 0;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top,
          /* İKİ KENAR DA AÇIKÇA YAZILIR. Hesaplanmış tek anahtar
             (`[position.side]: EDGE_GAP`) kullanılsaydı kenar değiştiğinde
             önceki anahtar stil nesnesinden düşerdi; RN'in stil farkı alma
             davranışına güvenmek yerine karşı kenar `undefined` verilir. */
          left: position.side === "left" ? EDGE_GAP : undefined,
          right: position.side === "right" ? EDGE_GAP : undefined,
          transform: [{ translateX }, { translateY }],
        },
      ]}
      pointerEvents="box-none"
      {...panResponder.panHandlers}
    >
      <Touchable
        feedback="icon"
        haptic="light"
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Mesajlar, ${messages} okunmamış` : "Mesajlar"}
        accessibilityHint="Basılı tutup sürükleyerek taşıyabilirsiniz"
        style={[styles.bubble, unread ? styles.bubbleUnread : null]}
      >
        <Ionicons
          name={unread ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
          size={22}
          color={unread ? colors.textOnBrand : colors.textPrimary}
        />
      </Touchable>

      {count ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText} numberOfLines={1} {...textScale.badge}>
            {count}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    zIndex: 50,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...Platform.select({
      ios: {
        // Koyu zeminde gölge görünmez; balon yüzeyi zaten `elevated`. Gölge
        // yalnız açık temada işe yarar ve orada da yumuşak kalır.
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  /** Okunmamış varsa balon mor dolgu olur — "seni bekleyen bir şey var". */
  bubbleUnread: {
    backgroundColor: colors.brand,
    borderColor: colors.brandStrong,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    // Balondan ayrılsın: mor dolgunun üstünde kırmızı rozet sınırsız kalırsa
    // iki renk birbirine yapışık görünür.
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: {
    ...type.micro,
    color: colors.textOnStatus,
    letterSpacing: 0,
  },
});
