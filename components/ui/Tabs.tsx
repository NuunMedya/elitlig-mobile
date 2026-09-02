/**
 * Tabs — SAYFA SEKMESİ. Mor başlık bloğunun içinde yaşar.
 *
 * SİSTEMİN TEK KURALI (bu turun kararı): **sekme SAYFAYI değiştirir ve daima
 * mor blokta durur; segment (`SegmentedControl`) VERİYİ süzer ve daima
 * kâğıtta durur; çip (`Chip`) çoklu/kaydırmalı süzgeçtir.** Uygulamada aynı
 * işi yapan dört ayrı şerit biçimi vardı (alt çizgili şerit, sönük hap, kâğıt
 * segmenti, çip yığını) ve kullanıcı her ekranda "bu neyi değiştirir"
 * sorusunu yeniden çözmek zorunda kalıyordu. Artık biçim, işi söyler.
 *
 * NEDEN MOR BLOĞUN İÇİNDE: şerit kâğıdın üstünde ayrı bir kutu olarak
 * durduğunda ekranın tepesinde iki gezinme katmanı oluşuyordu — başlık bir
 * yüzey, sekmeler başka bir yüzey. Şerit `ScreenHeader`ın `bottom` yuvasına
 * girip aynı mor bloğu paylaşınca tek bir başlık nesnesi olur; ekran ~12px
 * kısalır ve yapışkan kaydırmada blok bütün hâlde daralır.
 *
 * SEÇİM HAP, ALT ÇİZGİ DEĞİL: 2px'lik alt çizgi, yuvarlak yüzeylerden ve hap
 * düğmelerden kurulu bir dilde tek keskin öğeydi — şerit, sayfanın geri
 * kalanına ait görünmüyordu. Hap seçili sekmenin ARKASINDA durur (bu yüzden
 * ağaçta sekmelerden ÖNCE çizilir) ve zemini `brandDim`dir: dolgu sönük
 * olduğu için etiket `textPrimary` kalabiliyor, yani beş sekmelik bir şeritte
 * seçim güçlü ama gürültüsüz okunuyor.
 *
 * ÖLÇÜM STRATEJİSİ: `distribute="auto"` içerik ekrana SIĞIYORSA sekmeleri eşit
 * dağıtır, sığmıyorsa kaydırmaya geçer. Bu karar `onContentSizeChange` ile
 * verilir; eşit dağıtıldığında içerik genişliği kapsayıcıya eşitlenir, yani
 * karar salınım yapmaz. Aktif sekme görünür alanın dışındaysa `scrollTo` ile
 * ortalanır — kullanıcı hangi sekmede olduğunu daima görür.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colors,
  duration,
  easing,
  fonts,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { Badge } from "./Badge";
import { Touchable } from "./Pressable";

export interface TabItem<T extends string> {
  key: T;
  label: string;
  badge?: number | "dot";
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Yapışkan kullanımda: opak zemin + alt kenarlık. */
  sticky?: boolean;
  /**
   * Yapışkan şeridin zemini. Verilmezse sayfa kâğıdı (`bg`) kullanılır; maç
   * detayı gibi kendi kâğıdı olan ekranlar kendi rengini verir, aksi hâlde
   * şerit sayfadan farklı bir tonda kalır ve altında yatay bir dikiş görünür.
   */
  surface?: string;
  /**
   * Şeridin üstünde durduğu yüzey. Varsayılan `"ink"`: şerit mor başlık
   * bloğunun içindedir ve renklerini `onDark` ailesinden alır. `"paper"`
   * yalnız blok DIŞINDA, beyaz kâğıdın üstünde duran birkaç istisna içindir.
   */
  tone?: "ink" | "paper";
  /** Sığıyorsa eşit dağıt, sığmıyorsa kaydır — varsayılan "auto". */
  distribute?: "auto" | "equal" | "scroll";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface TabLayout {
  x: number;
  width: number;
}

/**
 * Göstergenin sekme kenarlarından içeri çekilme payı — DOLGUDAN KÜÇÜK olmak
 * zorunda. Önceki değer (10px) sekme dolgusundan (6px) büyüktü: hap, etiketin
 * her iki yanından 4px İÇERİDE kalıyor ve "Gol Krallığı" gibi etiketler hapın
 * dışına taşıyordu. Şimdi hap, etiketi iki yandan 10px sarar.
 */
const INDICATOR_INSET = space.xxs;

/** `styles.tab` yatay dolgusu — kırpılma hesabı bunu bilmek zorunda. */
const TAB_PADDING = space.md;

function TabsBase<T extends string>({
  items,
  value,
  onChange,
  sticky,
  surface,
  tone = "ink",
  distribute = "auto",
  style,
  testID,
}: TabsProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const translate = useRef(new Animated.Value(0)).current;
  const firstRun = useRef(true);

  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [layouts, setLayouts] = useState<TabLayout[]>([]);
  /**
   * Etiket metninin DOĞAL genişliği. Sekme kutusunun genişliği eşit kipte
   * zorlandığı için kendi ölçümü doğal genişliği vermez; kırpılma kararını
   * verebilmek için metin ayrıca ölçülür.
   */
  const [labelWidths, setLabelWidths] = useState<number[]>([]);

  const index = Math.max(
    0,
    items.findIndex((item) => item.key === value),
  );

  /*
   * EŞİT DAĞITIM KOŞULU: toplam genişliğin şeride sığması YETMEZ.
   *
   * Eşit kipte kap genişliği sekme sayısına bölünür; yani her sekme aynı
   * yuvayı alır. Toplam sığsa bile EN GENİŞ etiket o yuvadan büyükse yalnız o
   * etiket üç noktaya düşer ("Kadrolar" → "Kadro…", "Sonuçlar" → "Sonuç…")
   * ve şerit, bir sekmesi kırpılmış hâlde durur. Bu yüzden koşul en geniş
   * sekmeye bakar: sığmıyorsa şerit kaydırmaya geçer, hiçbir etiket kırpılmaz.
   */
  const widestLabel = labelWidths.reduce((max, width) => Math.max(max, width), 0);
  const equalSlot = containerWidth / Math.max(1, items.length);
  const fits =
    containerWidth > 0 &&
    contentWidth > 0 &&
    contentWidth <= containerWidth + 1 &&
    (widestLabel === 0 || widestLabel + TAB_PADDING * 2 <= equalSlot + 1);
  const mode: "equal" | "scroll" =
    distribute === "equal" ? "equal" : distribute === "scroll" ? "scroll" : fits ? "equal" : "scroll";

  const equalWidth = mode === "equal" && containerWidth > 0
    ? containerWidth / Math.max(1, items.length)
    : 0;

  /*
   * HAP DAİMA ÖLÇÜLEN YERLEŞİMDEN HESAPLANIR. Eşit kipte hap konumu eskiden
   * `equalWidth × index` diye TÜRETİLİYORDU, sekmeler ise ölçülen kutularına
   * çiziliyordu; kip bir kare geç değiştiğinde ("sığıyor" kararı ölçümlerden
   * sonra gelir) hap eşit-yuva ölçüsüyle, etiketler doğal genişlikle
   * kalıyor ve hap komşu etiketin üstüne biniyordu (koyu temada oyuncu
   * sayfasında yakalandı). Tek doğruluk kaynağı: her sekmenin kendi
   * `onLayout`u — kip ne olursa olsun hap, etiketin gerçekten bulunduğu yeri
   * sarar.
   */
  const active: TabLayout | undefined = layouts[index];

  const indicatorWidth = active ? Math.max(16, active.width - INDICATOR_INSET * 2) : 0;
  const indicatorX = active ? active.x + (active.width - indicatorWidth) / 2 : 0;

  useEffect(() => {
    if (indicatorWidth <= 0) return;
    if (firstRun.current) {
      translate.setValue(indicatorX);
      firstRun.current = false;
      return;
    }
    Animated.timing(translate, {
      toValue: indicatorX,
      duration: duration.base,
      easing: easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [indicatorWidth, indicatorX, translate]);

  // Seçili sekmeyi görünür alanın ortasına getir (yalnız kaydırma kipinde).
  useEffect(() => {
    if (mode !== "scroll" || !active || containerWidth <= 0) return;
    const target = active.x + active.width / 2 - containerWidth / 2;
    const max = Math.max(0, contentWidth - containerWidth);
    scrollRef.current?.scrollTo({ x: Math.min(Math.max(0, target), max), animated: true });
  }, [active, containerWidth, contentWidth, mode]);

  const labelKey = items.map((item) => item.label).join("|");
  useEffect(() => {
    // Etiketler değiştiyse doğal genişlikler geçersizdir.
    setLabelWidths([]);
  }, [labelKey]);

  /* Kip değişince (eşit ↔ kaydırma) sekme kutuları yeniden ölçülür; eski
     ölçümlerle bir kare bile çizmemek için yerleşim sıfırlanır. */
  useEffect(() => {
    setLayouts([]);
  }, [mode]);

  const handleTabLayout = useCallback((i: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((prev) => {
      const current = prev[i];
      if (current && current.x === x && current.width === width) return prev;
      const next = prev.slice();
      next[i] = { x, width };
      return next;
    });
  }, []);

  const handleLabelLayout = useCallback((i: number, event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setLabelWidths((prev) => {
      // Metin yalnız BÜYÜDÜĞÜNDE güncellenir: eşit kipte kutu daralınca metin
      // de daralır ve doğal genişlik kaybolurdu (karar kendi kendini besler).
      if ((prev[i] ?? 0) >= width) return prev;
      const next = prev.slice();
      next[i] = width;
      return next;
    });
  }, []);

  return (
    <View
      style={[
        styles.wrapper,
        /* Mor blokta şerit KENDİ zeminini basmaz: zemin bloğun gradyanıdır ve
           şerit onun bir parçasıdır. Kendi zeminini bassaydı bloğun içinde
           farklı tonda bir dikdörtgen olarak görünürdü. */
        sticky && tone === "paper" ? styles.sticky : null,
        sticky && tone === "paper" && surface === "transparent" ? styles.stickyBare : null,
        sticky && tone === "paper" && surface && surface !== "transparent"
          ? { backgroundColor: surface }
          : null,
        style,
      ]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      testID={testID}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={mode === "scroll"}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(width) => setContentWidth(width)}
        contentContainerStyle={styles.content}
        accessibilityRole="tablist"
      >
        {/* Gösterge sekmelerden ÖNCE çizilir: hap, etiketin ARKASINDA kalmalı.
            Sonra çizilseydi etiketlerin üstünü örterdi. */}
        {indicatorWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              tone === "ink" ? styles.indicatorInk : null,
              { width: indicatorWidth, transform: [{ translateX: translate }] },
            ]}
          />
        ) : null}

        {items.map((item, i) => {
          const isActive = item.key === value;
          return (
            <Touchable
              key={item.key}
              feedback="row"
              haptic="none"
              onPress={() => {
                if (isActive) return;
                haptics.select();
                onChange(item.key);
              }}
              onLayout={(event) => handleTabLayout(i, event)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              style={[styles.tab, mode === "equal" && equalWidth > 0 ? { width: equalWidth } : null]}
            >
              <Text
                style={[
                  styles.label,
                  tone === "ink" ? styles.labelInk : null,
                  isActive ? (tone === "ink" ? styles.labelInkActive : styles.labelActive) : null,
                ]}
                numberOfLines={1}
                onLayout={(event) => handleLabelLayout(i, event)}
                {...textScale.dense}
              >
                {item.label}
              </Text>
              {/* Mor blok üstünde marka moru rozet okunmaz (mor üstüne mor);
                  orada rozet CANLI tonundadır — zaten "yeni/şu an" demek
                  istiyor. Kâğıt üstünde marka tonu kalır. */}
              {item.badge === "dot" ? (
                <Badge dot tone={tone === "ink" ? "live" : "brand"} />
              ) : typeof item.badge === "number" && item.badge > 0 ? (
                <Badge label={item.badge} tone={tone === "ink" ? "live" : "brand"} size="xs" />
              ) : null}
            </Touchable>
          );
        })}

      </ScrollView>
    </View>
  );
}

export const Tabs = React.memo(TabsBase) as typeof TabsBase;

const styles = StyleSheet.create({
  wrapper: {
    height: layout.tabStripHeight,
  },
  sticky: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  /* Şerit, yuvarlak köşeli bir yüzeyin İÇİNDEYSE kendi zeminini ve alt
     ayracını basmamalı: köşesiz bir dikdörtgen olarak yüzeyin köşelerinin
     üstünde görünürdü. `surface="transparent"` bunu söyler. */
  stickyBare: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  /**
   * `flexGrow: 1` içerik kapsayıcısını en az şerit genişliğinde tutar; böylece
   * `onContentSizeChange` "sığıyor mu" sorusunu tek başına cevaplar:
   * içerik === kapsayıcı ise sığıyordur, büyükse kaydırma gerekir.
   */
  content: {
    flexGrow: 1,
    alignItems: "stretch",
    /* Hap ekran kenarından 8px içeride başlar (maket: 12px); etiket
       kenardan 20px. Kenara yapışık bir hap, şeridi kırpılmış gösteriyordu. */
    paddingHorizontal: space.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: layout.tabStripHeight,
    /* Eşit kipte kap sekme sayısına bölünür; en geniş etiket yuvaya
       sığmıyorsa şerit zaten kaydırmaya geçer (bkz. `fits`), yani dolgu
       kırpılmaya yol açmaz. 12px, hapın etiketi rahatça sarması için. */
    paddingHorizontal: TAB_PADDING,
  },
  /*
   * Aktif sekme AİLE DEĞİŞTİRMEZ, yalnız renk değiştirir. Önceki sürümde aktif
   * etiket Archivo Bold'a geçiyordu; iki ailenin genişliği farklı olduğu için
   * sekmeye her dokunuşta şerit yatayda zıplıyordu (görünür bir kusurdu).
   */
  label: {
    ...type.label,
    color: colors.textTertiary,
    fontFamily: fonts.semibold,
  },
  labelActive: {
    color: colors.textPrimary,
  },
  /* Mor blok üstünde: sönük etiket yarı saydam beyaz (AA'yı geçer, bkz.
     scripts/check-tokens.mjs), seçili etiket tam beyaz. */
  labelInk: {
    color: colors.onDarkMuted,
  },
  labelInkActive: {
    color: colors.onDark,
  },
  /*
   * GÖSTERGE ÇUBUK DEĞİL, HAP.
   *
   * 2px'lik alt çizgi, yuvarlak yüzeylerden ve hap düğmelerden kurulu bir
   * dilde tek keskin öğeydi — sekme şeridi, sayfanın geri kalanına ait
   * görünmüyordu. Hap, seçili sekmenin ALTINDA değil ARKASINDA durur ve aynı
   * eğri ailesine katılır; etiket de marka rengine döner.
   */
  indicator: {
    position: "absolute",
    left: 0,
    top: 5,
    bottom: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  /**
   * Mor blok üstündeki hap: dolgu, bloğun kendi ışığından bir tık daha
   * aydınlık yarı saydam bir mor + ince ışıklı çerçeve. Düz bir dolgu rengi
   * denendi ve bloğun gradyanı boyunca kâğıt gibi bir leke bırakıyordu; yarı
   * saydam hap, altındaki geçişi taşıdığı için bloğun parçası olarak okunur.
   * Alt menü kapsülünden AÇIK durur: kapsül ikonun arkasında sessiz bir
   * puldur, bu hap ise seçili sayfayı söyleyen tek işaret.
   */
  indicatorInk: {
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
});
