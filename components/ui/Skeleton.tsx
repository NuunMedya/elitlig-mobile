/**
 * Skeleton — yükleme iskeleti ve hazır şablonları (§4.17 / §5.6).
 *
 * NEDEN SPINNER DEĞİL: skor uygulamasında ilk açılış her zaman aynı düzeni
 * getirir (satır satır maç, satır satır tablo). Ortada dönen bir çark
 * "bilmiyorum, bekle" der; iskelet ise "gelecek olan tam olarak bu" der ve
 * veri düştüğünde ekran zıplamaz — yerleşim zaten oturmuştur.
 *
 * NEDEN TEK PAYLAŞILAN ANIMATED.VALUE: bir ekranda 20 iskelet satırı olabilir.
 * Her satır kendi `Animated.loop`'unu açsaydı 20 ayrı zamanlayıcı dönerdi ve
 * parlamalar birbirinden bağımsız kayardı (görsel olarak da kirli durur).
 * Burada modül seviyesinde TEK bir değer vardır; ilk iskelet mount olunca
 * döngü başlar, sonuncusu unmount olunca durur (abone sayacı). Bütün satırlar
 * aynı fazda parlar — dalga ekranda tek parça geçer.
 *
 * NEDEN LINEAR-GRADIENT + translateX: `useNativeDriver: true` ile çalışan tek
 * parlama biçimi budur; backgroundColor animasyonu JS iş parçacığına bağımlıdır
 * ve tam da veri çözülürken (en yoğun anda) takılır.
 *
 * ERİŞİLEBİLİRLİK: iskeletler ekran okuyucuya "İçerik yükleniyor" olarak tek
 * bir düğüm hâlinde verilir; içindeki kutular okunmaz. "Hareketi azalt" açıksa
 * parlama hiç başlamaz, sabit `skeletonBase` yüzey kalır (§5.8).
 */

import React, { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, duration, hairline, layout, radius as radiusScale, space } from "@/theme";
import { useReduceMotion } from "./LiveBadge";

/* ——————————————————— Paylaşılan parlama döngüsü ——————————————————— */

/** 0 → 1 ilerleyen tek kaynak. Tüm iskeletler bunu okur, kimse kendi döngüsünü açmaz. */
const shimmerProgress = new Animated.Value(0);

let subscribers = 0;
let loop: Animated.CompositeAnimation | null = null;

/** Döngüler arası 200ms bekleme — sürekli akan bir bant yerine "nabız" hissi. */
const SHIMMER_GAP_MS = 200;

function startShimmer(): void {
  if (loop) return;
  shimmerProgress.setValue(0);
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: duration.shimmer,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.delay(SHIMMER_GAP_MS),
    ]),
  );
  loop.start();
}

function stopShimmer(): void {
  loop?.stop();
  loop = null;
  shimmerProgress.setValue(0);
}

/** Abone olur, dönen fonksiyon aboneliği bırakır; son abone çıkınca döngü durur. */
function useSharedShimmer(active: boolean): Animated.Value | null {
  useEffect(() => {
    if (!active) return;
    subscribers += 1;
    startShimmer();
    return () => {
      subscribers -= 1;
      if (subscribers <= 0) {
        subscribers = 0;
        stopShimmer();
      }
    };
  }, [active]);

  return active ? shimmerProgress : null;
}

/* ——————————————————————— Temel kutu ——————————————————————— */

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  /** Köşe yarıçapı tokenı — varsayılan "xs". */
  radius?: keyof typeof radiusScale;
  /** Parlama animasyonu (varsayılan true; "Hareketi azalt" açıkken kapanır). */
  shimmer?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tek bir iskelet kutusu. Parlama bandı kutunun ölçülen genişliği kadar
 * yolculuk eder (-1× → +1×); bu yüzden genişlik `onLayout` ile okunur —
 * yüzde genişliklerde başka türlü doğru mesafe hesaplanamaz.
 */
export const Skeleton = React.memo(function Skeleton({
  width = "100%",
  height = 12,
  radius = "xs",
  shimmer = true,
  style,
}: SkeletonProps) {
  const reduceMotion = useReduceMotion();
  const [boxWidth, setBoxWidth] = useState(0);
  const active = shimmer && !reduceMotion;
  const progress = useSharedShimmer(active);

  const translateX =
    progress && boxWidth > 0
      ? progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-boxWidth, boxWidth],
        })
      : null;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={active ? (event) => setBoxWidth(event.nativeEvent.layout.width) : undefined}
      style={[
        styles.box,
        { width, height, borderRadius: radiusScale[radius] },
        style,
      ]}
    >
      {translateX ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[colors.skeletonBase, colors.skeletonHighlight, colors.skeletonBase]}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

/** Parıltı süpürmesi de aynı eksende: yatay, sağdan sola. */
const GRADIENT_START = { x: 1, y: 0.5 } as const;
const GRADIENT_END = { x: 0, y: 0.5 } as const;

/**
 * Şablonların ortak sarmalayıcısı: gruba tek bir "yükleniyor" etiketi verir.
 * Sarmalayıcı EK BİR VIEW AÇMAZ — yerleşim stilleri (gap, alignItems) doğrudan
 * bu düğüme uygulanır; araya görünmez bir kutu koymak şablonların hizasını
 * bozardı. İçerideki kutular zaten kendi başlarına okunmaz.
 */
function SkeletonGroup({
  label = "İçerik yükleniyor",
  style,
  children,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={style}>
      {children}
    </View>
  );
}

/** `count` kadar öğe üretir — her şablonda tekrarlanan map'i tek yere alır. */
function repeat(count: number, render: (index: number) => React.ReactNode): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  for (let i = 0; i < count; i += 1) items.push(render(i));
  return items;
}

/* ——————————————————————— Hazır şablonlar ——————————————————————— */

/**
 * Maç listesi iskeleti — gerçek `MatchRow` iskeletini taklit eder:
 * saat sütunu (44) · iki takım satırı · skor sütunu (30) · yıldız (32).
 */
export const SkeletonMatchRow = React.memo(function SkeletonMatchRow({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <SkeletonGroup label="Maçlar yükleniyor" style={styles.block}>
      {repeat(count, (index) => (
        <View key={index} style={styles.matchRow}>
          <View style={styles.timeColumn}>
            <Skeleton width={30} height={11} />
          </View>
          <View style={styles.matchTeams}>
            <View style={styles.teamLine}>
              <Skeleton width={20} height={20} radius="sm" />
              <Skeleton width="62%" height={12} />
            </View>
            <View style={styles.teamLine}>
              <Skeleton width={20} height={20} radius="sm" />
              <Skeleton width="48%" height={12} />
            </View>
          </View>
          <View style={styles.scoreColumn}>
            <Skeleton width={16} height={12} />
            <Skeleton width={16} height={12} />
          </View>
          <View style={styles.starColumn}>
            <Skeleton width={16} height={16} radius="pill" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
});

/** Genel liste satırı iskeleti — isteğe bağlı avatar sütunuyla. */
export const SkeletonListRow = React.memo(function SkeletonListRow({
  count = 8,
  avatar = true,
}: {
  count?: number;
  avatar?: boolean;
}) {
  return (
    <SkeletonGroup style={styles.block}>
      {repeat(count, (index) => (
        <View key={index} style={styles.listRow}>
          {avatar ? <Skeleton width={32} height={32} radius="pill" /> : null}
          <View style={styles.listText}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="34%" height={10} />
          </View>
          <Skeleton width={24} height={12} />
        </View>
      ))}
    </SkeletonGroup>
  );
});

/**
 * Tablo iskeleti — puan durumu, istatistik ve krallık tablolarının ortak
 * biçimi: sıra numarası + amblem + ad + `columns` kadar sayı sütunu.
 */
export const SkeletonTable = React.memo(function SkeletonTable({
  count = 10,
  columns = 5,
  header = true,
}: {
  count?: number;
  columns?: number;
  header?: boolean;
}) {
  return (
    <SkeletonGroup label="Tablo yükleniyor" style={styles.block}>
      {header ? (
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Skeleton width={16} height={9} />
          <View style={styles.tableName}>
            <Skeleton width="40%" height={9} />
          </View>
          {repeat(columns, (index) => (
            <View key={index} style={styles.tableCell}>
              <Skeleton width={12} height={9} />
            </View>
          ))}
        </View>
      ) : null}

      {repeat(count, (index) => (
        <View key={index} style={styles.tableRow}>
          <Skeleton width={14} height={12} />
          <View style={styles.tableName}>
            <Skeleton width={20} height={20} radius="sm" />
            <Skeleton width="58%" height={12} />
          </View>
          {repeat(columns, (col) => (
            <View key={col} style={styles.tableCell}>
              <Skeleton width={14} height={12} />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
});

/** Puan durumu iskeleti — tablonun O/G/B/M/P sütun sayısıyla sabitlenmiş hâli. */
export const SkeletonStandings = React.memo(function SkeletonStandings({
  count = 12,
}: {
  count?: number;
}) {
  return <SkeletonTable count={count} columns={5} />;
});

/** Kart iskeleti — başlık + `lines` kadar metin satırı. */
export const SkeletonCard = React.memo(function SkeletonCard({
  lines = 3,
  style,
}: {
  lines?: number;
  /** Çağıranın kenar boşluğu — iskelet, yerini tutacağı kartla aynı hizada
      durmazsa yükleme bitince düzen zıplar. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonGroup style={[styles.card, style]}>
      <Skeleton width="45%" height={14} radius="sm" />
      <View style={styles.cardLines}>
        {repeat(lines, (index) => (
          <Skeleton key={index} width={index === lines - 1 ? "62%" : "100%"} height={11} />
        ))}
      </View>
    </SkeletonGroup>
  );
});

/** Hero iskeleti — maç/takım detayının tepesindeki büyük blok. */
export const SkeletonHero = React.memo(function SkeletonHero() {
  return (
    <SkeletonGroup style={styles.hero}>
      <Skeleton width={90} height={11} radius="pill" />
      <View style={styles.heroTeams}>
        <View style={styles.heroTeam}>
          <Skeleton width={56} height={56} radius="lg" />
          <Skeleton width={64} height={12} />
        </View>
        <Skeleton width={64} height={34} radius="md" />
        <View style={styles.heroTeam}>
          <Skeleton width={56} height={56} radius="lg" />
          <Skeleton width={64} height={12} />
        </View>
      </View>
    </SkeletonGroup>
  );
});

/**
 * Sayfalama iskeleti — listenin sonunda "devamı geliyor" işareti (§5.6).
 * 40px sabit yükseklik: `getItemLayout` hesabını bozmasın diye liste
 * `ListFooterComponent`'i olarak kullanılır.
 */
export const SkeletonListFooter = React.memo(function SkeletonListFooter() {
  return (
    <SkeletonGroup label="Devamı yükleniyor" style={styles.footer}>
      <View style={styles.footerDots}>
        <Skeleton width={6} height={6} radius="pill" />
        <Skeleton width={6} height={6} radius="pill" />
        <Skeleton width={6} height={6} radius="pill" />
      </View>
    </SkeletonGroup>
  );
});

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.skeletonBase,
    overflow: "hidden",
  },
  block: {
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: colors.border,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    height: layout.matchRowHeight,
    paddingHorizontal: layout.rowPaddingH,
    gap: space.sm,
  },
  timeColumn: {
    width: layout.timeColumnWidth,
    alignItems: "center",
  },
  matchTeams: {
    flex: 1,
    gap: space.s,
  },
  teamLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  scoreColumn: {
    width: layout.scoreColumnWidth,
    alignItems: "center",
    gap: space.s,
  },
  starColumn: {
    width: layout.starColumnWidth,
    alignItems: "flex-end",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    height: layout.listRowHeight,
    paddingHorizontal: layout.rowPaddingH,
    gap: space.md,
  },
  listText: {
    flex: 1,
    gap: space.s,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: layout.rowPaddingH,
    gap: space.sm,
  },
  tableHeader: {
    height: 28,
    backgroundColor: colors.surface3,
  },
  tableName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  tableCell: {
    width: 22,
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radiusScale.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  cardLines: {
    gap: space.sm,
  },
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.xl,
    gap: space.lg,
    alignItems: "center",
  },
  heroTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  heroTeam: {
    alignItems: "center",
    gap: space.sm,
  },
  footer: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  footerDots: {
    flexDirection: "row",
    gap: space.sm,
  },
});
