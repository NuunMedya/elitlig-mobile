/**
 * SheetGrid — tablo düzenleyicinin kaydırılabilir ızgarası.
 *
 * YERLEŞİM: dış yatay ScrollView'in içinde dikey FlatList (satırlar). Sütun
 * başlık şeridi ve (dondurulmuşsa) ilk satır ızgaranın üstünde ayrı durur ve
 * yatay kaydırmayı Animated translateX ile izler; satır numaraları her
 * satırın içinde +scrollX ile ters kaydırılarak solda SABİT kalır. Böylece
 * iki ayrı listeyi JS'te eşitleme gecikmesi olmaz (yerel sürücü).
 *
 * SANALLAŞTIRMA: dikeyde FlatList (getItemLayout, küçük pencere), yatayda
 * yalnız görünen sütunlar (+ tampon) çizilir; pencere sütun sınırı aşılınca
 * güncellenir. Satır bileşeni memo'lu; seçim yalnız ilgili satırları çizer.
 *
 * DOKUNMA: hücre başına Pressable yerine satır başına tek Pressable; sütun
 * dokunma konumundan (locationX) bulunur. Hücre içeriği pointerEvents="none".
 */

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import {
  SHEET_FILLED_INK,
  addr,
  colName,
  formatValue,
  isError,
  isNumeric,
  type Cell,
  type CellValue,
  type Pos,
  type Range,
  type Sheet,
} from "@/lib/admin/sheetEngine";
import { colors, fonts, hairline, type } from "@/theme";

export const ROW_H = 34;
export const HEAD_W = 44;
export const HEAD_H = 28;
export const DEFAULT_W = 96;
const COL_BUFFER = 3;

export interface SheetGridHandle {
  reveal: (row: number, col: number) => void;
}

export interface SheetGridProps {
  sheet: Sheet;
  valueOf: (key: string) => CellValue;
  range: Range;
  active: Pos;
  onCellPress: (pos: Pos) => void;
  onCellLongPress: (pos: Pos) => void;
  onColPress: (col: number) => void;
  onColLongPress: (col: number) => void;
  onRowPress: (row: number) => void;
  onRowLongPress: (row: number) => void;
}

/** Sıralı sol kenarlar içinde x'in düştüğü sütun (ikili arama). */
function colAt(lefts: number[], widths: number[], x: number) {
  let lo = 0;
  let hi = lefts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lefts[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return x > lefts[lo] + widths[lo] ? -1 : lo;
}

export const SheetGrid = forwardRef<SheetGridHandle, SheetGridProps>(function SheetGrid(props, ref) {
  const { sheet, valueOf, range, active, onCellPress, onCellLongPress, onColPress, onColLongPress, onRowPress, onRowLongPress } = props;
  const scrollX = useRef(new Animated.Value(0)).current;
  const negX = useMemo(() => Animated.multiply(scrollX, -1), [scrollX]);
  const hRef = useRef<ScrollViewRef>(null);
  const listRef = useRef<FlatList<number>>(null);
  const view = useRef({ x: 0, y: 0, w: 360, h: 500 });
  const [win, setWin] = useState({ c0: 0, c1: 8 });

  const widths = useMemo(() => Array.from({ length: sheet.cols }, (_, c) => sheet.colW?.[colName(c)] || DEFAULT_W), [sheet.cols, sheet.colW]);
  const lefts = useMemo(() => {
    const out: number[] = [];
    widths.reduce((x, w) => {
      out.push(x);
      return x + w;
    }, 0);
    return out;
  }, [widths]);
  const totalW = HEAD_W + widths.reduce((s, w) => s + w, 0);

  const firstRow = sheet.freeze ? 1 : 0;
  const rows = useMemo(() => Array.from({ length: Math.max(0, sheet.rows - firstRow) }, (_, i) => i + firstRow), [sheet.rows, firstRow]);

  // Görünen sütun penceresi; yalnız sınır aşılınca güncellenir (gereksiz çizim yok).
  const updateWindow = useCallback(
    (x: number, w: number) => {
      const left = Math.max(0, x - HEAD_W);
      const c0 = Math.max(0, colAt(lefts, widths, left) - COL_BUFFER);
      let c1 = colAt(lefts, widths, left + w);
      if (c1 < 0) c1 = widths.length - 1;
      c1 = Math.min(widths.length - 1, c1 + COL_BUFFER);
      setWin((cur) => (cur.c0 === c0 && cur.c1 === c1 ? cur : { c0, c1 }));
    },
    [lefts, widths]
  );

  const onHScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          view.current.x = e.nativeEvent.contentOffset.x;
          updateWindow(view.current.x, view.current.w);
        },
      }),
    [scrollX, updateWindow]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    view.current.w = e.nativeEvent.layout.width;
    view.current.h = e.nativeEvent.layout.height;
    updateWindow(view.current.x, view.current.w);
  };

  useImperativeHandle(ref, () => ({
    reveal: (row, col) => {
      const v = view.current;
      if (col >= 0 && col < lefts.length) {
        const cellL = HEAD_W + lefts[col];
        const cellR = cellL + widths[col];
        if (cellL - HEAD_W < v.x || cellR > v.x + v.w) {
          hRef.current?.scrollTo({ x: Math.max(0, cellL - HEAD_W - 12), animated: true });
        }
      }
      if (row >= firstRow && row < sheet.rows) {
        const top = (row - firstRow) * ROW_H;
        const bodyH = v.h - HEAD_H - (sheet.freeze ? ROW_H : 0);
        if (top < v.y || top + ROW_H > v.y + bodyH) {
          listRef.current?.scrollToOffset({ offset: Math.max(0, top - bodyH / 2), animated: true });
        }
      }
    },
  }));

  // Satır dokunuşları: sütun dokunma konumundan bulunur.
  const posFromEvent = useCallback(
    (row: number, e: GestureResponderEvent): Pos | null => {
      const col = colAt(lefts, widths, e.nativeEvent.locationX - HEAD_W);
      return col < 0 ? null : { row, col };
    },
    [lefts, widths]
  );

  const handlers = useRef({ onCellPress, onCellLongPress, onRowPress, onRowLongPress });
  handlers.current = { onCellPress, onCellLongPress, onRowPress, onRowLongPress };

  const pressCell = useCallback(
    (row: number, e: GestureResponderEvent, long: boolean) => {
      const pos = posFromEvent(row, e);
      if (!pos) return;
      if (long) handlers.current.onCellLongPress(pos);
      else handlers.current.onCellPress(pos);
    },
    [posFromEvent]
  );
  const pressRow = useCallback((row: number, long: boolean) => {
    if (long) handlers.current.onRowLongPress(row);
    else handlers.current.onRowPress(row);
  }, []);

  const rowProps = (r: number) => ({
    r,
    cells: sheet.cells,
    valueOf,
    lefts,
    widths,
    totalW,
    c0: win.c0,
    c1: win.c1,
    selKey: `${r >= range.r1 && r <= range.r2 ? `${range.c1}:${range.c2}` : ""}|${r === active.row ? active.col : -1}|${range.r1 === range.r2 && range.c1 === range.c2 ? 1 : 0}`,
    headX: scrollX,
    onCell: pressCell,
    onHead: pressRow,
  });

  const colHeadPress = (e: GestureResponderEvent, long: boolean) => {
    const col = colAt(lefts, widths, e.nativeEvent.locationX - HEAD_W);
    if (col < 0) return;
    if (long) onColLongPress(col);
    else onColPress(col);
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Sütun başlıkları */}
      <View style={styles.headStrip}>
        <Animated.View style={[styles.slide, { width: totalW, transform: [{ translateX: negX }] }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => colHeadPress(e, false)}
            onLongPress={(e) => colHeadPress(e, true)}
            accessibilityLabel="Sütun başlıkları"
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {widths.map((w, c) =>
                c < win.c0 || c > win.c1 ? null : (
                  <View
                    key={c}
                    style={[styles.colHead, { left: HEAD_W + lefts[c], width: w }, c >= range.c1 && c <= range.c2 ? styles.headHl : null]}
                  >
                    <Text style={[styles.headText, c >= range.c1 && c <= range.c2 ? styles.headTextHl : null]} allowFontScaling={false}>
                      {colName(c)}
                    </Text>
                  </View>
                )
              )}
            </View>
          </Pressable>
        </Animated.View>
        <View style={styles.corner} />
      </View>

      {/* Dondurulmuş ilk satır */}
      {sheet.freeze ? (
        <View style={styles.frozen}>
          <Animated.View style={[styles.slide, { width: totalW, transform: [{ translateX: negX }] }]}>
            <GridRow {...rowProps(0)} />
          </Animated.View>
        </View>
      ) : null}

      <Animated.ScrollView
        ref={hRef as never}
        horizontal
        bounces={false}
        directionalLockEnabled
        showsHorizontalScrollIndicator
        scrollEventThrottle={16}
        onScroll={onHScroll}
        keyboardShouldPersistTaps="handled"
      >
        <FlatList
          ref={listRef}
          style={{ width: totalW }}
          data={rows}
          keyExtractor={(r) => String(r)}
          renderItem={({ item }) => <GridRow {...rowProps(item)} />}
          getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
          extraData={`${win.c0}-${win.c1}-${range.r1}-${range.r2}-${range.c1}-${range.c2}-${active.row}-${active.col}-${totalW}`}
          initialNumToRender={24}
          maxToRenderPerBatch={16}
          windowSize={5}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            view.current.y = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator
        />
      </Animated.ScrollView>
    </View>
  );
});

type ScrollViewRef = { scrollTo: (opts: { x?: number; y?: number; animated?: boolean }) => void };

interface GridRowProps {
  r: number;
  cells: Record<string, Cell>;
  valueOf: (key: string) => CellValue;
  lefts: number[];
  widths: number[];
  totalW: number;
  c0: number;
  c1: number;
  /** Bu satıra düşen seçim özeti: değişmedikçe satır yeniden çizilmez. */
  selKey: string;
  headX: Animated.Value;
  onCell: (row: number, e: GestureResponderEvent, long: boolean) => void;
  onHead: (row: number, long: boolean) => void;
}

const GridRow = React.memo(function GridRow({ r, cells, valueOf, lefts, widths, totalW, c0, c1, selKey, headX, onCell, onHead }: GridRowProps) {
  const [rangeCols, activeColText, singleText] = selKey.split("|");
  const activeCol = Number(activeColText);
  const single = singleText === "1";
  const [rc1, rc2] = rangeCols ? rangeCols.split(":").map(Number) : [-1, -2];
  const rowSelected = Boolean(rangeCols);

  const nodes: React.ReactNode[] = [];
  for (let c = c0; c <= c1 && c < widths.length; c += 1) {
    const key = addr(c, r);
    const cell = cells[key];
    const inRange = rowSelected && c >= rc1 && c <= rc2 && !single;
    const isActive = c === activeCol;
    const value = cell ? valueOf(key) : null;
    const s = cell?.s ?? {};
    const numeric = isNumeric(value) && s.f !== "text";
    const text = s.f === "text" && cell && !String(cell.v).startsWith("=") ? String(cell.v) : formatValue(value, s);
    const align = s.al || (isError(value) || typeof value === "boolean" ? "center" : numeric ? "right" : "left");
    nodes.push(
      <View
        key={c}
        style={[
          styles.cell,
          { left: HEAD_W + lefts[c], width: widths[c] },
          s.bg ? { backgroundColor: s.bg } : null,
          inRange ? styles.inRange : null,
          isActive ? styles.active : null,
        ]}
      >
        {text ? (
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[
              styles.cellText,
              { textAlign: align },
              s.bg && !s.c ? { color: SHEET_FILLED_INK } : null,
              s.c ? { color: s.c } : null,
              s.b ? styles.bold : null,
              s.i ? styles.italic : null,
              s.u ? styles.underline : null,
              isError(value) ? styles.error : null,
            ]}
          >
            {text}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.row, { width: totalW }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={(e) => onCell(r, e, false)} onLongPress={(e) => onCell(r, e, true)} delayLongPress={350}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {nodes}
        </View>
      </Pressable>
      <Animated.View style={[styles.rowHeadWrap, { transform: [{ translateX: headX }] }]}>
        <Pressable
          style={[styles.rowHead, rowSelected ? styles.headHl : null]}
          onPress={() => onHead(r, false)}
          onLongPress={() => onHead(r, true)}
          accessibilityLabel={`${r + 1}. satır`}
        >
          <Text style={[styles.headText, rowSelected ? styles.headTextHl : null]} allowFontScaling={false}>
            {r + 1}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1, overflow: "hidden" },
  headStrip: { height: HEAD_H, overflow: "hidden", backgroundColor: colors.surface2, borderBottomWidth: hairline, borderBottomColor: colors.borderStrong },
  frozen: { height: ROW_H, overflow: "hidden", borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  slide: { position: "absolute", top: 0, bottom: 0, left: 0 },
  corner: { position: "absolute", left: 0, top: 0, width: HEAD_W, height: HEAD_H, backgroundColor: colors.surface3, borderRightWidth: hairline, borderRightColor: colors.border },
  colHead: {
    position: "absolute",
    top: 0,
    height: HEAD_H,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: hairline,
    borderRightColor: colors.border,
  },
  headHl: { backgroundColor: colors.brandDim },
  headText: { ...type.micro, color: colors.textTertiary },
  headTextHl: { color: colors.brandAccent },
  row: { height: ROW_H },
  rowHeadWrap: { position: "absolute", left: 0, top: 0, width: HEAD_W, height: ROW_H, zIndex: 2 },
  rowHead: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderRightWidth: hairline,
    borderRightColor: colors.borderStrong,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  cell: {
    position: "absolute",
    top: 0,
    height: ROW_H,
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRightWidth: hairline,
    borderRightColor: colors.border,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  inRange: { backgroundColor: colors.brandDim },
  active: { borderWidth: 2, borderColor: colors.brand },
  cellText: { ...type.bodySm, color: colors.textPrimary },
  bold: { fontFamily: fonts.heading },
  italic: { fontStyle: "italic" },
  underline: { textDecorationLine: "underline" },
  error: { color: colors.danger },
});
