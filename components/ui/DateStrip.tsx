/**
 * Yatay tarih şeridi — maç listesinin gün seçicisi.
 *
 * NEDEN ŞERİT: kullanıcı çoğunlukla "bugün ± birkaç gün" arasında geziniyor;
 * takvim açtırmak bu sık işlemi üç dokunuşa çıkarıyordu. Şerit tek dokunuşla
 * gün değiştirir, aylık takvim yalnız uzak tarihler için sağdaki düğmede kalır.
 *
 * TARİH MATEMATİĞİ: değerler "YYYY-MM-DD" metnidir ve YEREL saatle çözülür.
 * `new Date("2026-08-19")` UTC gece yarısı demektir; UTC-… saat diliminde bir
 * gün geriye kayar. Bu yüzden ayrıştırma elle yapılır (Date(y, m-1, d)).
 *
 * PERFORMANS: hücreler sabit 44px genişliktedir → `getItemLayout` sabittir ve
 * seçili güne `scrollToOffset` ile ORTALAYARAK gidilir (spec §4.14). Gün
 * listesi ve etiketleri bir kez hesaplanır (`useMemo`); hücre `memo` ile
 * sarılıdır ve yalnız ilkel prop alır, böylece 43 hücrelik şerit kaydırırken
 * yeniden render edilmez.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { haptics } from "@/lib/haptics";

export interface DateStripProps {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (iso: string) => void;
  /** Maç olan günler — nokta gösterilir */
  markers?: Record<string, { count: number; live?: boolean }>;
  /** Kaydırılabilir aralık (varsayılan: -14 … +28 gün) */
  range?: { start: string; end: string };
  /** Takvim düğmesi — aylık takvim açar */
  onOpenCalendar?: () => void;
  /** "Bugün"e dön düğmesi; seçili gün bugün değilse görünür */
  showTodayButton?: boolean;
}

/** getDay() sırasıyla Türkçe gün kısaltmaları (0 = Pazar) — VERSAL, maket
    §7/2 gün etiketi gibi ("PER", "CUM"). Sabit yazıldığı için `upperTR`
    gerekmez; İ/ı dönüşümü elle doğrudur (ÇAR, PZT). */
const WEEKDAYS = ["PAZ", "PZT", "SAL", "ÇAR", "PER", "CUM", "CMT"] as const;

const CELL_WIDTH = 42;

const pad = (value: number) => String(value).padStart(2, "0");

/** Yerel saatle "YYYY-MM-DD". */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" → yerel gece yarısı; geçersizse bugün. */
function fromIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

interface DayItem {
  iso: string;
  /** Ayın günü — "19" */
  day: string;
  /** Her zaman versal kısa gün adı ("PER"). Bugün, rengiyle ve altındaki
      çizgiyle ayrışır — bkz. `DayCell`. */
  weekday: string;
  isToday: boolean;
  /** Ekran okuyucu metni — "19 Ağustos Çarşamba" */
  speech: string;
}

export const DateStrip = memo(function DateStrip({
  value,
  onChange,
  markers,
  range,
  onOpenCalendar,
  showTodayButton = true,
}: DateStripProps) {
  const listRef = useRef<FlatList<DayItem>>(null);
  const centeredRef = useRef(false);
  /** Kaydırma konumu yalnız görünürlük hesabı için tutulur — state DEĞİL,
      çünkü her kaydırma karesinde yeniden render etmek şeridi tökezletir. */
  const offsetRef = useRef(0);
  const [listWidth, setListWidth] = useState(0);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const days = useMemo<DayItem[]>(() => {
    const today = fromIsoDate(todayIso);
    // Gün eklemek/çıkarmak milisaniyeyle değil TAKVİMLE yapılır: yaz saati
    // uygulayan bir saat diliminde 14×86400000 çıkarmak günü kaydırır.
    const shift = (days: number) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    const start = range?.start ? fromIsoDate(range.start) : shift(-14);
    const end = range?.end ? fromIsoDate(range.end) : shift(28);

    const items: DayItem[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    // Gün gün ilerlerken saat toplamak yaz saati geçişinde kayma yapar; bu
    // yüzden takvim günü artırılır.
    while (cursor.getTime() <= end.getTime() && items.length < 400) {
      const iso = toIsoDate(cursor);
      const isToday = iso === todayIso;
      items.push({
        iso,
        day: String(cursor.getDate()),
        /* BUGÜNÜN ETİKETİ ARTIK "BUGÜN" DEĞİL, GÜNÜN KENDİSİ.
           "BUGÜN" beş harf ve 8 puntoda ~34px yer tutuyordu; hücre 42px, seçili
           dolgu 34px. Yani tek bu hücrede etiket dolgunun iki yanına da
           dayanıyor, üstten de nefes payı bırakmıyor ve kırpılmış görünüyordu.
           Şeritteki her hücre artık aynı biçimde: üç harf gün + rakam. Bugün
           marka renginden ve altındaki çizgiden okunur; şeridin sağındaki
           "BUGÜN" hap düğmesi zaten geri dönüşü sağlar. */
        weekday: WEEKDAYS[cursor.getDay()],
        isToday,
        speech: cursor.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return items;
  }, [range?.start, range?.end, todayIso]);

  const selectedIndex = useMemo(() => days.findIndex((item) => item.iso === value), [days, value]);

  /** Seçili günü şeridin ortasına getirir; ilk yerleşimde animasyonsuz. */
  const centerOn = useCallback(
    (index: number, width: number) => {
      if (index < 0 || width <= 0) return;
      const maxOffset = Math.max(0, days.length * CELL_WIDTH - width);
      const offset = Math.min(maxOffset, Math.max(0, index * CELL_WIDTH - (width - CELL_WIDTH) / 2));
      listRef.current?.scrollToOffset({ offset, animated: centeredRef.current });
      centeredRef.current = true;
    },
    [days.length],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setListWidth(event.nativeEvent.layout.width);
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  /**
   * İlk yerleşimde seçili gün ortalanır (animasyonsuz). Sonrasında yalnız
   * seçili gün EKRANDA GÖRÜNMÜYORSA ortalanır — kullanıcının kendi kaydırdığı
   * şeridi her dokunuşta yerinden oynatmak yön duygusunu bozuyor.
   */
  useEffect(() => {
    if (listWidth <= 0 || selectedIndex < 0) return;
    if (!centeredRef.current) {
      centerOn(selectedIndex, listWidth);
      return;
    }
    const start = selectedIndex * CELL_WIDTH;
    const visible = start >= offsetRef.current && start + CELL_WIDTH <= offsetRef.current + listWidth;
    if (!visible) centerOn(selectedIndex, listWidth);
  }, [centerOn, listWidth, selectedIndex]);

  const handleSelect = useCallback(
    (iso: string) => {
      if (iso === value) return;
      haptics.select();
      onChange(iso);
    },
    [onChange, value],
  );

  const handleToday = useCallback(() => {
    haptics.select();
    if (todayIso !== value) onChange(todayIso);
    const index = days.findIndex((item) => item.iso === todayIso);
    centerOn(index, listWidth);
  }, [centerOn, days, listWidth, onChange, todayIso, value]);

  const handleCalendar = useCallback(() => {
    haptics.light();
    onOpenCalendar?.();
  }, [onOpenCalendar]);

  const renderItem = useCallback(
    ({ item }: { item: DayItem }) => {
      const marker = markers?.[item.iso];
      return (
        <DayCell
          item={item}
          selected={item.iso === value}
          hasMatches={Boolean(marker && marker.count > 0)}
          live={Boolean(marker?.live)}
          onPress={handleSelect}
        />
      );
    },
    [handleSelect, markers, value],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.listBox}>
        <FlatList
          ref={listRef}
          data={days}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          removeClippedSubviews={Platform.OS === "android"}
          extraData={value}
          onLayout={handleLayout}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        />
        {/* Sol kenardaki maske: şeridin devam ettiğini gösterir. */}
        <LinearGradient
          colors={[colors.bg, "transparent"]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.mask}
          pointerEvents="none"
        />
      </View>

      {showTodayButton && value !== todayIso ? (
        <Pressable
          onPress={handleToday}
          style={styles.todayButton}
          hitSlop={touchSlop(32)}
          accessibilityRole="button"
          accessibilityLabel="Bugüne dön"
        >
          <Text style={styles.todayText} {...textScale.badge}>
            BUGÜN
          </Text>
        </Pressable>
      ) : null}

      {onOpenCalendar ? (
        <Pressable
          onPress={handleCalendar}
          style={styles.calendarButton}
          hitSlop={touchSlop(40)}
          accessibilityRole="button"
          accessibilityLabel="Takvimi aç"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
});

const DayCell = memo(function DayCell({
  item,
  selected,
  hasMatches,
  live,
  onPress,
}: {
  item: DayItem;
  selected: boolean;
  hasMatches: boolean;
  live: boolean;
  onPress: (iso: string) => void;
}) {
  const handlePress = useCallback(() => onPress(item.iso), [onPress, item.iso]);

  return (
    <Pressable
      style={styles.cell}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={item.isToday ? `Bugün, ${item.speech}` : item.speech}
    >
      {/* Seçili gün DOLU MARKA MORUDUR: şerit kâğıtta durur ve kâğıtta seçili
          durum daima düz `brand` dolgudur (chip, sekme gibi); gradyan burada
          skor sahnesinin dilini kâğıda taşıyordu. */}
      {selected ? <View style={styles.cellFill} /> : null}
      <Text
        style={[styles.weekday, item.isToday && styles.weekdayToday, selected && styles.onBrand]}
        numberOfLines={1}
        {...textScale.badge}
      >
        {item.weekday}
      </Text>
      <Text
        style={[styles.day, item.isToday && !selected && styles.dayToday, selected && styles.onBrand]}
        {...textScale.badge}
      >
        {item.day}
      </Text>
      <View style={styles.underlineRow}>
        {item.isToday ? (
          <View style={[styles.todayUnderline, selected ? styles.todayUnderlineOnBrand : null]} />
        ) : null}
      </View>
      <View style={styles.dotRow}>
        {hasMatches ? (
          <View style={[styles.dot, live && styles.dotLive, selected && styles.dotOnBrand]} />
        ) : null}
      </View>
    </Pressable>
  );
});

const keyExtractor = (item: DayItem) => item.iso;

const getItemLayout = (_data: ArrayLike<DayItem> | null | undefined, index: number) => ({
  length: CELL_WIDTH,
  offset: CELL_WIDTH * index,
  index,
});

const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 0 } as const;

const styles = StyleSheet.create({
  wrap: {
    height: layout.dateStripHeight,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    paddingRight: space.sm,
  },
  listBox: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
  },
  mask: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 12,
  },
  /*
   * HÜCRE İÇERİK KADAR YÜKSEK. Eskiden `height: 40` sabitti; içerik (gün
   * etiketi 13 + rakam 18 + çizgi 4 + nokta 6 = 41 + üst pay) 40'ı aşıyor ve
   * gün adlarının tepesi (Ç, P) kırpılıyordu. Şimdi hücre `minHeight` +
   * dikey dolgu taşır; 53px içerik 56px'lik şeridin (layout.dateStripHeight)
   * içinde durur, "bugün" çizgisi ve maç noktası dolgunun İÇİNDE kalır.
   */
  cell: {
    width: CELL_WIDTH,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingVertical: space.s,
  },
  /* SEÇİLİ GÜN: dolgu hücrenin TAMAMINI kaplamaz. 42px'lik hücreler yan yana
     dizildiği için tam dolgu, komşu günlere yapışık bir blok gibi duruyor ve
     şeridi ağırlaştırıyordu. 4px içeri çekilince blok kendi etrafında nefes
     alır; seçim yine tartışmasız okunur. Köşe: maketin 11px hapına en yakın
     token (radius.sm). */
  cellFill: {
    position: "absolute",
    left: space.xs,
    right: space.xs,
    top: space.xs,
    bottom: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  /** Gün adı: Archivo versal 9px, geniş aralık (maket 8.5px / .1em). */
  weekday: {
    ...type.micro,
    fontFamily: fonts.display,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 0.9,
    color: colors.textTertiary,
  },
  weekdayToday: {
    color: colors.brandAccent,
  },
  /** Ayın günü: Archivo kalın 14px (maket), tabular. */
  day: {
    ...type.tableNumStrong,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: space.px,
  },
  dayToday: {
    color: colors.brandAccent,
  },
  onBrand: {
    color: colors.textOnBrand,
  },
  underlineRow: {
    height: 2,
    marginTop: space.xxs,
    justifyContent: "center",
  },
  todayUnderline: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.brandAccent,
  },
  todayUnderlineOnBrand: {
    backgroundColor: colors.textOnBrand,
  },
  dotRow: {
    height: 4,
    marginTop: space.xxs,
    justifyContent: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandAccent,
  },
  dotLive: {
    backgroundColor: colors.live,
  },
  dotOnBrand: {
    backgroundColor: colors.textOnBrand,
  },
  todayButton: {
    height: 26,
    paddingHorizontal: space.sm,
    marginLeft: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  todayText: {
    ...type.micro,
    color: colors.brandAccent,
  },
  calendarButton: {
    width: 40,
    height: 40,
    marginLeft: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
