/**
 * ARAÇLAR → TABLOLAR → DÜZENLEYİCİ (web SheetEditor.js)
 *
 * Yerleşim (yukarıdan aşağı): başlık (geri al / yinele / menü) · formül
 * çubuğu (ad kutusu + değer / formül, işlev önerileri, hızlı tuşlar) · araç
 * şeridi (kalın, italik, altı çizili, hizalama, sayı biçimi, ondalık, renk,
 * Σ, doldur, sırala, satır/sütun, kes-kopyala-yapıştır, temizle) · ızgara
 * (sabit sütun başlıkları ve satır numaraları, sanallaştırılmış) · sayfa
 * sekmeleri + seçim özeti (toplam, ortalama, min, maks).
 *
 * DOKUNMA KİPİ:
 *   · Hücreye dokun → seçer; seçili hücreye yeniden dokun → düzenler.
 *   · Uzun bas → seçimi o hücreye kadar genişletir (aralık seçimi);
 *     "Genişlet" aracı açıkken tek dokunuş da genişletir.
 *   · Formül yazarken hücreye dokunmak başvurusunu ekler (Sayfa2!B3 dahil),
 *     hemen ardından uzun basmak başvuruyu aralığa (A1:B5) çevirir.
 *   · Satır/sütun başlığına dokun → tümünü seçer; uzun bas → ekle/sil menüsü.
 *
 * KAYIT: her değişiklik ~0,9 sn sonra kendiliğinden kaydedilir (menüde
 * "Şimdi kaydet" de var). İstemci bildiği sürümü (base_version) gönderir;
 * arada başkası kaydetmişse sunucu 409 ile güncel içeriği döner, benim
 * değiştirdiğim hücreler onun üstüne birleştirilip yeniden denenir.
 * Kaydedilemeyen değişiklik cihazda taslak olarak saklanır, dosya yeniden
 * açılınca geri yüklenir. Paylaşılan dosyada başkasının kaydı (sürüm ucu
 * ile) 10 sn'de bir denetlenir ve bende bekleyen değişiklik yoksa yüklenir.
 */

import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Keyboard, ScrollView, StyleSheet, Text, View, type TextInput } from "react-native";

import { ActionSheet, AdminScreen, FormSheet, OptionSheet, useAdminMutation, type SheetAction } from "@/components/admin";
import { clearDraft, readDraft, saveDraft, trackSave, waitForSave } from "@/components/admin/sheets/drafts";
import { FormulaBar } from "@/components/admin/sheets/FormulaBar";
import { FunctionSheet } from "@/components/admin/sheets/FunctionSheet";
import { ShareSheet } from "@/components/admin/sheets/ShareSheet";
import { shareCsv } from "@/components/admin/sheets/shareFile";
import { SheetGrid, type SheetGridHandle } from "@/components/admin/sheets/SheetGrid";
import { ColorSheet, SheetToolbar, type ToolItem } from "@/components/admin/sheets/SheetToolbar";
import { BottomSheet, Button, Chip, ErrorState, Input, SkeletonTable, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  ERROR_HINTS,
  MAX_COLS,
  MAX_ROWS,
  MAX_SHEETS,
  NUMBER_FORMATS,
  SHEET_FILL_COLORS,
  SHEET_TEXT_COLORS,
  acceptFunction,
  addr,
  blankSheet,
  blockFromText,
  blockToText,
  canInsertRef,
  cleanSheetName,
  clearRange,
  closeParens,
  colName,
  copyBlock,
  createEvaluator,
  eachCell,
  fill,
  formatValue,
  isError,
  isNumeric,
  mergeWorkbooks,
  normRange,
  parseAddr,
  pasteBlock,
  rangeLabel,
  rangeStats,
  renameSheet,
  sheetToCsv,
  shiftAxis,
  sortRange,
  styleRange,
  uniqueSheetName,
  usedBounds,
  workbooksDiffer,
  writeCells,
  type Block,
  type CellStyle,
  type NumberFormat,
  type Pos,
  type Range,
  type Workbook,
} from "@/lib/admin/sheetEngine";
import { conflictItem, getSheet, getSheetVersion, updateSheet, ACCESS_LABELS, type SheetMeta } from "@/lib/api/admin/sheets";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const HISTORY = 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const SAVE_LABEL = { saved: "Kaydedildi", saving: "Kaydediliyor…", dirty: "Değişiklikler var…", error: "Kaydedilemedi" } as const;
type SaveState = keyof typeof SAVE_LABEL;

interface Editing {
  text: string;
  row: number;
  col: number;
  si: number;
}
/** Formüle son işaretlenen başvuru: imleç hemen sonundaysa yeni dokunuş onu değiştirir. */
interface Point {
  start: number;
  end: number;
  anchor: Pos;
  si: number;
}
interface Clip {
  block: Block;
  text: string;
  cut: { si: number; range: Range } | null;
}

const sheetPrefix = (name: string) => (/^[\wÇĞİÖŞÜçğıöşü]+$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "")}'!`);

export default function SheetEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sheetId = Number(id);
  const toastApi = useToast();
  // Toast nesnesi değişse de yükleme/kayıt geri çağrıları yeniden kurulmasın.
  const toastRef = useRef(toastApi);
  toastRef.current = toastApi;
  const toast = useMemo(() => ({ show: (o: Parameters<typeof toastApi.show>[0]) => toastRef.current.show(o) }), []);

  const [meta, setMeta] = useState<SheetMeta | null>(null);
  const [book, setBook] = useState<Workbook | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);
  const [si, setSi] = useState(0);
  const [sel, setSel] = useState<{ anchor: Pos; focus: Pos }>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [caret, setCaret] = useState({ start: 0, end: 0 });
  const [forcedSel, setForcedSel] = useState<{ start: number; end: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [extend, setExtend] = useState(false);
  const [, forceRender] = useState(0);

  const [more, setMore] = useState(false);
  const [axisMenu, setAxisMenu] = useState<"row" | "col" | "cell" | null>(null);
  const [sheetMenu, setSheetMenu] = useState<number | null>(null);
  const [colorPick, setColorPick] = useState<"c" | "bg" | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [fnOpen, setFnOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [renamingSheet, setRenamingSheet] = useState<number | null>(null);
  const [renameFile, setRenameFile] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");

  const bookRef = useRef<Workbook | null>(null);
  const versionRef = useRef<number | null>(null);
  const baseRef = useRef<Workbook | null>(null);
  const dirty = useRef(false);
  const savingRef = useRef(false);
  const past = useRef<Workbook[]>([]);
  const future = useRef<Workbook[]>([]);
  const editingRef = useRef<Editing | null>(null);
  const caretRef = useRef({ start: 0, end: 0 });
  const pointRef = useRef<Point | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const gridRef = useRef<SheetGridHandle>(null);
  const readOnly = meta?.access === "viewer";
  const readOnlyRef = useRef(false);
  readOnlyRef.current = readOnly;
  editingRef.current = editing;

  /* ─────────────────────────── yükleme ─────────────────────────── */

  const loadBook = useCallback(async () => {
    setLoadError(null);
    // Bu dosyanın önceki oturumdan süren kaydı varsa önce o biter.
    await waitForSave(sheetId);
    try {
      const { item } = await getSheet(sheetId);
      const { data: serverBook, ...rest } = item;
      // Güvenlik: sunucu dolu hücre var diyor ama içerik boş geldiyse düzenleme kapanır.
      const loaded = serverBook.sheets.reduce((n, s) => n + Object.keys(s.cells || {}).length, 0);
      const broken = Number(rest.cell_count) > 0 && loaded === 0;
      const access = broken ? "viewer" : rest.access;
      versionRef.current = rest.version ?? null;
      baseRef.current = serverBook;
      let initial = serverBook;
      let restored = false;
      const draft = access !== "viewer" ? await readDraft(sheetId) : null;
      if (draft && workbooksDiffer(draft.book, serverBook)) {
        initial =
          draft.baseVersion == null || draft.baseVersion === rest.version
            ? draft.book
            : mergeWorkbooks(draft.baseBook || serverBook, draft.book, serverBook);
        restored = true;
      } else if (draft) void clearDraft(sheetId);
      setMismatch(broken);
      setMeta({ ...rest, access });
      bookRef.current = initial;
      setBook(initial);
      setSi((cur) => Math.min(cur, initial.sheets.length - 1));
      if (restored) {
        dirty.current = true;
        setSaveState("dirty");
        toast.show({ message: "Kaydedilmemiş değişikliklerin geri yüklendi.", tone: "neutral" });
      }
    } catch (error) {
      setLoadError(error);
    }
  }, [sheetId, toast]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  /* ─────────────────────────── kayıt ─────────────────────────── */

  const scheduleDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (bookRef.current && dirty.current) void saveDraft(sheetId, bookRef.current, versionRef.current, baseRef.current);
    }, 400);
  }, [sheetId]);

  const save = useCallback(async () => {
    if (!dirty.current || !bookRef.current || readOnlyRef.current || savingRef.current) return;
    savingRef.current = true;
    dirty.current = false;
    setSaveState("saving");

    const attempt = async (payload: Workbook, tries: number): Promise<void> => {
      try {
        const { item } = await updateSheet(sheetId, { data: payload, base_version: versionRef.current });
        versionRef.current = item.version ?? versionRef.current;
        baseRef.current = payload;
        setMeta((m) => (m ? { ...m, ...item, shares: m.shares } : m));
      } catch (error) {
        const latest = conflictItem(error);
        if (!latest || tries >= 3) throw error;
        // Başkası arada kaydetti: benim değiştirdiğim hücreler onun sürümünün üstüne uygulanır.
        const merged = mergeWorkbooks(baseRef.current || latest.data, bookRef.current ?? payload, latest.data);
        versionRef.current = latest.version;
        baseRef.current = latest.data;
        bookRef.current = merged;
        setBook(merged);
        past.current = [];
        future.current = [];
        toast.show({ message: `${latest.updated_by_name || "Başka biri"} de bu tabloyu değiştirdi; değişiklikler birleştirildi.`, tone: "neutral" });
        await attempt(merged, tries + 1);
      }
    };

    const run = attempt(bookRef.current, 0);
    trackSave(sheetId, run);
    try {
      await run;
      if (!dirty.current) void clearDraft(sheetId);
      else void saveDraft(sheetId, bookRef.current!, versionRef.current, baseRef.current);
      setSaveState(dirty.current ? "dirty" : "saved");
    } catch (error) {
      dirty.current = true;
      setSaveState("error");
      void saveDraft(sheetId, bookRef.current!, versionRef.current, baseRef.current);
      toast.show({
        message: errorText(error, "Değişiklikler kaydedilemedi. Cihazda saklanıyor; bağlantı gelince yeniden kaydedilecek."),
        tone: "danger",
      });
    } finally {
      savingRef.current = false;
    }
  }, [sheetId, toast]);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (saveState !== "dirty") return undefined;
    const timer = setTimeout(() => void save(), 900);
    return () => clearTimeout(timer);
  }, [saveState, book, save]);

  // Kayıt hata verdiyse 10 sn sonra kendiliğinden yeniden denenir.
  useEffect(() => {
    if (saveState !== "error") return undefined;
    const timer = setTimeout(() => {
      if (dirty.current) setSaveState("dirty");
    }, 10000);
    return () => clearTimeout(timer);
  }, [saveState]);

  const commit = useCallback(
    (next: Workbook | null | undefined) => {
      if (!next || next === bookRef.current) return;
      if (readOnlyRef.current) {
        toast.show({ message: "Bu tabloyu yalnız görüntüleyebilirsin.", tone: "warn" });
        return;
      }
      if (bookRef.current) past.current.push(bookRef.current);
      if (past.current.length > HISTORY) past.current.shift();
      future.current = [];
      bookRef.current = next;
      setBook(next);
      dirty.current = true;
      scheduleDraft();
      setSaveState("dirty");
    },
    [scheduleDraft, toast]
  );

  /** Açık düzenlemeyi (onaylanmamış olsa da) kitaba işler — çıkışta kaybolmasın. */
  const applyPendingEdit = useCallback(() => {
    const ed = editingRef.current;
    const current = bookRef.current;
    if (!ed || !current || readOnlyRef.current) return;
    const key = addr(ed.col, ed.row);
    if ((current.sheets[ed.si]?.cells[key]?.v ?? "") === ed.text) return;
    const next = writeCells(current, ed.si, { [key]: { v: ed.text } });
    bookRef.current = next;
    dirty.current = true;
    void saveDraft(sheetId, next, versionRef.current, baseRef.current);
  }, [sheetId]);

  // Uygulama arka plana geçince ya da ekrandan çıkınca bekleyen değişiklik hemen gönderilir.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        applyPendingEdit();
        void saveRef.current();
      }
    });
    return () => {
      sub.remove();
      applyPendingEdit();
      void saveRef.current();
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [applyPendingEdit]);

  // Paylaşılan dosyada başkasının kaydı, bende bekleyen değişiklik yokken yüklenir.
  const sharedDoc = Boolean(meta && (meta.access !== "owner" || (meta.shares?.length || 0) > 0));
  useEffect(() => {
    if (!sharedDoc) return undefined;
    const timer = setInterval(async () => {
      if (AppState.currentState !== "active" || dirty.current || savingRef.current || editingRef.current) return;
      try {
        const v = await getSheetVersion(sheetId);
        if (versionRef.current == null || v.version == null || !(v.version > versionRef.current)) return;
        const { item } = await getSheet(sheetId);
        if (dirty.current || editingRef.current) return;
        const { data: workbook, ...rest } = item;
        versionRef.current = rest.version;
        baseRef.current = workbook;
        bookRef.current = workbook;
        past.current = [];
        future.current = [];
        setBook(workbook);
        setMeta((m) => (m ? { ...m, ...rest, access: m.access } : m));
        setSi((cur) => Math.min(cur, workbook.sheets.length - 1));
        toast.show({ message: `${v.updated_by_name || "Başka biri"} tabloyu güncelledi.`, tone: "neutral" });
      } catch {
        // bir sonraki denemede
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [sharedDoc, sheetId, toast]);

  const undo = () => {
    if (!past.current.length || readOnly) return;
    if (bookRef.current) future.current.push(bookRef.current);
    const prev = past.current.pop()!;
    bookRef.current = prev;
    setBook(prev);
    if (si >= prev.sheets.length) setSi(prev.sheets.length - 1);
    dirty.current = true;
    scheduleDraft();
    setSaveState("dirty");
  };
  const redo = () => {
    if (!future.current.length || readOnly) return;
    if (bookRef.current) past.current.push(bookRef.current);
    const next = future.current.pop()!;
    bookRef.current = next;
    setBook(next);
    if (si >= next.sheets.length) setSi(next.sheets.length - 1);
    dirty.current = true;
    scheduleDraft();
    setSaveState("dirty");
  };

  /* ─────────────────────────── türetilenler ─────────────────────────── */

  const sheet = book?.sheets[si] ?? null;
  const evaluator = useMemo(() => (book ? createEvaluator(book) : null), [book]);
  const valueOf = useCallback((key: string) => (evaluator ? evaluator.value(si, key) : null), [evaluator, si]);
  const range = normRange(sel.anchor, sel.focus);
  const activeKey = addr(sel.focus.col, sel.focus.row);
  const activeCell = sheet?.cells[activeKey];
  const activeStyle: CellStyle = activeCell?.s || {};
  const activeValue = activeCell ? valueOf(activeKey) : null;

  const stats = useMemo(() => {
    if (!sheet || !evaluator) return null;
    const count = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (count < 2 || count > 20000) return null;
    const values: ReturnType<typeof valueOf>[] = [];
    eachCell(range, (key) => {
      if (sheet.cells[key]) values.push(evaluator.value(si, key));
    });
    return rangeStats(values);
  }, [sheet, evaluator, si, range.r1, range.r2, range.c1, range.c2]); // eslint-disable-line react-hooks/exhaustive-deps

  // Etkin hücre görünür kalsın; tüm satır/sütun seçiminde kaydırılmaz (uca atlamasın).
  const wholeRow = Boolean(sheet && range.c1 === 0 && range.c2 === sheet.cols - 1);
  const wholeCol = Boolean(sheet && range.r1 === 0 && range.r2 === sheet.rows - 1);
  useEffect(() => {
    if (wholeRow || wholeCol) return;
    gridRef.current?.reveal(sel.focus.row, sel.focus.col);
  }, [sel.focus.row, sel.focus.col, si, wholeRow, wholeCol]);

  /* ─────────────────────────── düzenleme ─────────────────────────── */

  const moveTo = (row: number, col: number) => {
    if (!sheet) return;
    const pos = { row: clamp(row, 0, sheet.rows - 1), col: clamp(col, 0, sheet.cols - 1) };
    setSel({ anchor: pos, focus: pos });
  };

  const setText = (text: string, nextCaret?: number) => {
    setEditing((e) => (e ? { ...e, text } : e));
    if (nextCaret != null) {
      const s = { start: nextCaret, end: nextCaret };
      caretRef.current = s;
      setCaret(s);
      setForcedSel(s);
    }
  };

  const startEdit = (text?: string, at?: Pos) => {
    if (readOnly || !sheet || !book) return;
    const pos = at ?? sel.focus;
    const value = text ?? book.sheets[si]?.cells[addr(pos.col, pos.row)]?.v ?? "";
    pointRef.current = null;
    setEditing({ text: value, row: pos.row, col: pos.col, si });
    const s = { start: value.length, end: value.length };
    caretRef.current = s;
    setCaret(s);
    setForcedSel(s);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  /** Düzenlemeyi hücreye yazar. move: "down" → alt hücrede düzenlemeye devam. */
  const finishEdit = (move: "down" | null = null) => {
    const ed = editingRef.current;
    if (!ed || !bookRef.current) return;
    const text = ed.text.startsWith("=") ? closeParens(ed.text) : ed.text;
    const key = addr(ed.col, ed.row);
    if ((bookRef.current.sheets[ed.si]?.cells[key]?.v ?? "") !== text) commit(writeCells(bookRef.current, ed.si, { [key]: { v: text } }));
    pointRef.current = null;
    setEditing(null);
    setForcedSel(null);
    if (si !== ed.si) setSi(ed.si);
    if (move === "down") {
      const sh = bookRef.current.sheets[ed.si];
      const row = Math.min(ed.row + 1, (sh?.rows ?? 1) - 1);
      const pos = { row, col: ed.col };
      setSel({ anchor: pos, focus: pos });
      // Veri girişini hızlandırır: klavye açık kalır, alt hücre düzenlenir.
      setTimeout(() => {
        const v = bookRef.current?.sheets[ed.si]?.cells[addr(pos.col, pos.row)]?.v ?? "";
        setEditing({ text: v, row: pos.row, col: pos.col, si: ed.si });
        const s = { start: v.length, end: v.length };
        caretRef.current = s;
        setCaret(s);
        setForcedSel(s);
      }, 0);
    } else {
      Keyboard.dismiss();
      inputRef.current?.blur();
    }
  };

  const cancelEdit = () => {
    const ed = editingRef.current;
    pointRef.current = null;
    setEditing(null);
    setForcedSel(null);
    if (ed && si !== ed.si) setSi(ed.si);
    Keyboard.dismiss();
    inputRef.current?.blur();
  };

  const insertText = (str: string) => {
    const ed = editingRef.current;
    if (!ed) return;
    const { start, end } = caretRef.current;
    const next = ed.text.slice(0, start) + str + ed.text.slice(end);
    pointRef.current = null;
    setText(next, start + str.length);
  };

  /** Formül yazarken hücreye dokunma: başvuruyu ekler ya da son eklenen başvuruyu değiştirir. */
  const pointAt = (pos: Pos, asRange: boolean): boolean => {
    const ed = editingRef.current;
    if (!ed || !ed.text.startsWith("=") || !bookRef.current) return false;
    const { start, end } = caretRef.current;
    const point = pointRef.current;
    const live = point && point.end === end && start === end;
    if (!live && !canInsertRef(ed.text, start)) return false;
    const prefix = si !== ed.si ? sheetPrefix(bookRef.current.sheets[si].name) : "";
    let ref = `${prefix}${addr(pos.col, pos.row)}`;
    let anchor = pos;
    if (asRange && live && point && point.si === si) {
      anchor = point.anchor;
      ref = `${prefix}${rangeLabel(normRange(point.anchor, pos))}`;
    }
    const from = live && point ? point.start : start;
    const to = live && point ? point.end : end;
    const next = ed.text.slice(0, from) + ref + ed.text.slice(to);
    const caretAt = from + ref.length;
    pointRef.current = { start: from, end: caretAt, anchor, si };
    setText(next, caretAt);
    setSel({ anchor: asRange ? anchor : pos, focus: pos });
    return true;
  };

  const onCellPress = (pos: Pos) => {
    if (pointAt(pos, false)) return;
    if (editingRef.current) finishEdit(null);
    if (extend) {
      setSel((s) => ({ anchor: s.anchor, focus: pos }));
      return;
    }
    const single = range.r1 === range.r2 && range.c1 === range.c2;
    if (single && pos.row === sel.focus.row && pos.col === sel.focus.col) startEdit(undefined, pos);
    else setSel({ anchor: pos, focus: pos });
  };

  const onCellLongPress = (pos: Pos) => {
    if (pointAt(pos, true)) return;
    if (editingRef.current) finishEdit(null);
    setSel((s) => ({ anchor: s.anchor, focus: pos }));
  };

  const selectCol = (col: number, ext: boolean) =>
    sheet && setSel((s) => ({ anchor: { row: 0, col: ext ? s.anchor.col : col }, focus: { row: sheet.rows - 1, col } }));
  const selectRow = (row: number, ext: boolean) =>
    sheet && setSel((s) => ({ anchor: { row: ext ? s.anchor.row : row, col: 0 }, focus: { row, col: sheet.cols - 1 } }));

  /* ─────────────────────────── işlemler ─────────────────────────── */

  const applyStyle = (patch: Partial<Record<keyof CellStyle, unknown>>) => book && commit(styleRange(book, si, range, patch));
  const toggleStyle = (key: "b" | "i" | "u") => applyStyle({ [key]: activeStyle[key] ? null : true });
  const setDigits = (delta: number) => {
    const current = activeStyle.d ?? (activeStyle.f === "money" || activeStyle.f === "number" ? 2 : 0);
    applyStyle({ d: clamp(current + delta, 0, 6) });
  };

  const insertRows = (where: "above" | "below") =>
    book && commit(shiftAxis(book, si, "row", where === "above" ? range.r1 : range.r2 + 1, range.r2 - range.r1 + 1));
  const insertCols = (where: "left" | "right") =>
    book && commit(shiftAxis(book, si, "col", where === "left" ? range.c1 : range.c2 + 1, range.c2 - range.c1 + 1));
  const deleteRows = () => {
    if (!book || !sheet || sheet.rows <= range.r2 - range.r1 + 1) return;
    commit(shiftAxis(book, si, "row", range.r1, -(range.r2 - range.r1 + 1)));
    moveTo(range.r1, sel.focus.col);
  };
  const deleteCols = () => {
    if (!book || !sheet || sheet.cols <= range.c2 - range.c1 + 1) return;
    commit(shiftAxis(book, si, "col", range.c1, -(range.c2 - range.c1 + 1)));
    moveTo(sel.focus.row, range.c1);
  };
  const addRows = (n = 50) => book && commit({ ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, rows: Math.min(MAX_ROWS, s.rows + n) } : s)) });
  const addCols = (n = 5) => book && commit({ ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, cols: Math.min(MAX_COLS, s.cols + n) } : s)) });
  const setColWidth = (delta: number | null) => {
    if (!book || !sheet) return;
    const colW = { ...(sheet.colW || {}) };
    for (let c = range.c1; c <= range.c2; c += 1) {
      const k = colName(c);
      if (delta == null) delete colW[k];
      else colW[k] = clamp((colW[k] || 96) + delta, 30, 600);
    }
    commit({ ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, colW } : s)) });
  };

  const sort = (ascending: boolean) => {
    if (!book || !sheet) return;
    // Tek hücre seçiliyse dolu bölgenin tamamı, ilk satır başlık sayılır.
    let target = range;
    if (range.r1 === range.r2 && range.c1 === range.c2) {
      const used = usedBounds(sheet);
      if (!used.rows) return;
      target = { r1: 1, r2: used.rows - 1, c1: 0, c2: Math.max(0, used.cols - 1) };
      if (target.r2 < target.r1) return;
    }
    commit(sortRange(book, si, target, sel.focus.col, ascending, valueOf));
    toast.show({ message: `${colName(sel.focus.col)} sütununa göre ${ascending ? "A→Z" : "Z→A"} sıralandı.`, tone: "success" });
  };

  const autoSum = () => {
    if (!book || !sheet) return;
    const col = sel.focus.col;
    if (range.r2 > range.r1) {
      const row = range.r2 + 1;
      if (row >= sheet.rows) return;
      const updates: Record<string, { v: string }> = {};
      for (let c = range.c1; c <= range.c2; c += 1) updates[addr(c, row)] = { v: `=TOPLA(${addr(c, range.r1)}:${addr(c, range.r2)})` };
      commit(writeCells(book, si, updates));
      moveTo(row, col);
      return;
    }
    // Tek hücre: üstteki (yoksa soldaki) sayı bloğu önerilir; onaylanınca yazılır.
    const isNum = (r: number, c: number) => r >= 0 && c >= 0 && Boolean(sheet.cells[addr(c, r)]) && isNumeric(valueOf(addr(c, r)));
    const { row } = sel.focus;
    let text = "=TOPLA()";
    if (isNum(row - 1, col)) {
      let top = row - 1;
      while (isNum(top - 1, col)) top -= 1;
      text = `=TOPLA(${addr(col, top)}:${addr(col, row - 1)})`;
    } else if (isNum(row, col - 1)) {
      let left = col - 1;
      while (isNum(row, left - 1)) left -= 1;
      text = `=TOPLA(${addr(left, row)}:${addr(col - 1, row)})`;
    }
    startEdit(text);
  };

  const doCopy = async (cut: boolean) => {
    if (!sheet) return;
    const block = copyBlock(sheet, range);
    const text = blockToText(block);
    clipRef.current = { block, text, cut: cut ? { si, range } : null };
    await Clipboard.setStringAsync(text).catch(() => undefined);
    forceRender((n) => n + 1);
    toast.show({ message: cut ? "Kesildi; yapıştırılacak yeri seç." : `${rangeLabel(range)} kopyalandı.`, tone: "success" });
  };

  const doPaste = async (valuesOnly: boolean) => {
    if (!book) return;
    const text = await Clipboard.getStringAsync().catch(() => "");
    const clip = clipRef.current;
    const internal = clip && clip.text === text ? clip : null;
    const block = internal ? internal.block : text ? blockFromText(text) : null;
    if (!block) {
      toast.show({ message: "Panoda yapıştırılacak bir şey yok.", tone: "warn" });
      return;
    }
    let next = book;
    if (internal?.cut) next = clearRange(next, internal.cut.si, internal.cut.range, { values: true, styles: true });
    const h = block.rows.length;
    const w = block.rows[0]?.length || 0;
    const fits = (range.r2 - range.r1 + 1) % h === 0 && (range.c2 - range.c1 + 1) % w === 0 && (range.r2 > range.r1 || range.c2 > range.c1);
    const target = fits ? range : { r1: range.r1, c1: range.c1, r2: range.r1 + h - 1, c2: range.c1 + w - 1 };
    commit(pasteBlock(next, si, target, block, { valuesOnly }));
    if (internal?.cut) clipRef.current = null;
    setSel({ anchor: { row: target.r1, col: target.c1 }, focus: { row: Math.min(target.r2, (sheet?.rows ?? 1) - 1), col: Math.min(target.c2, (sheet?.cols ?? 1) - 1) } });
  };

  const find = (forward: boolean) => {
    if (!sheet) return;
    const q = findText.trim().toLocaleLowerCase("tr-TR");
    if (!q) return;
    const keys = Object.keys(sheet.cells)
      .map((k) => ({ k, p: parseAddr(k)! }))
      .filter((x) => x.p)
      .sort((a, b) => a.p.row - b.p.row || a.p.col - b.p.col);
    const hits = keys.filter(({ k }) => {
      const shown = formatValue(valueOf(k), sheet.cells[k].s).toLocaleLowerCase("tr-TR");
      return shown.includes(q) || String(sheet.cells[k].v).toLocaleLowerCase("tr-TR").includes(q);
    });
    if (!hits.length) {
      toast.show({ message: "Eşleşme yok.", tone: "warn" });
      return;
    }
    const cur = sel.focus.row * 1000 + sel.focus.col;
    const ordered = forward ? hits : [...hits].reverse();
    const hit = ordered.find(({ p }) => (forward ? p.row * 1000 + p.col > cur : p.row * 1000 + p.col < cur)) || ordered[0];
    moveTo(hit.p.row, hit.p.col);
  };

  /* — sayfalar — */

  const addSheet = () => {
    if (!book) return;
    if (book.sheets.length >= MAX_SHEETS) {
      toast.show({ message: `En fazla ${MAX_SHEETS} sayfa.`, tone: "warn" });
      return;
    }
    commit({ ...book, sheets: [...book.sheets, blankSheet(uniqueSheetName(book))] });
    setSi(book.sheets.length);
    setSel({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  };
  const duplicateSheet = (index: number) => {
    if (!book || book.sheets.length >= MAX_SHEETS) return;
    const src = book.sheets[index];
    const copy = { ...src, name: `${src.name.slice(0, 32)} kopya`, cells: { ...src.cells }, colW: { ...src.colW } };
    const sheets = [...book.sheets];
    sheets.splice(index + 1, 0, copy);
    commit({ ...book, sheets });
    setSi(index + 1);
  };
  const deleteSheetAt = (index: number) => {
    if (!book || book.sheets.length <= 1) return;
    commit({ ...book, sheets: book.sheets.filter((_, i) => i !== index) });
    setSi((cur) => clamp(cur > index ? cur - 1 : cur === index ? Math.max(0, index - 1) : cur, 0, book.sheets.length - 2));
  };
  const moveSheet = (index: number, delta: number) => {
    if (!book) return;
    const to = index + delta;
    if (to < 0 || to >= book.sheets.length) return;
    const sheets = [...book.sheets];
    [sheets[index], sheets[to]] = [sheets[to], sheets[index]];
    commit({ ...book, sheets });
    setSi(to);
  };
  const finishRenameSheet = (index: number, name: string) => {
    if (!book) return;
    const clean = cleanSheetName(name);
    if (!clean || clean === book.sheets[index].name) return;
    if (book.sheets.some((s, i) => i !== index && s.name.toLocaleLowerCase("tr-TR") === clean.toLocaleLowerCase("tr-TR"))) {
      throw new Error("Bu adda bir sayfa var.");
    }
    commit(renameSheet(book, index, clean));
  };

  const switchSheet = (index: number) => {
    const ed = editingRef.current;
    // Formül yazarken başka sayfaya geçilir; dokunulan hücreler Sayfa2!A1 olarak eklenir.
    if (ed && ed.text.startsWith("=")) {
      setSi(index);
      return;
    }
    if (ed) finishEdit(null);
    setSi(index);
    setSel({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  };

  const renameTitle = useAdminMutation((title: string) => updateSheet(sheetId, { title }), {
    success: "Dosya adı değişti.",
    invalidate: [["admin", "sheets"]],
    onSuccess: (res) => setMeta((m) => (m ? { ...m, title: res.item.title } : m)),
    silentError: true,
  });

  const exportCsv = async () => {
    if (!book || !sheet) return;
    const base = (meta?.title || "tablo").replace(/[\\/:*?"<>|]/g, "").trim() || "tablo";
    try {
      await shareCsv(`${base} - ${sheet.name}`, sheetToCsv(book, si, evaluator ?? undefined));
    } catch (error) {
      toast.show({ message: errorText(error, "CSV oluşturulamadı."), tone: "danger" });
    }
  };

  /* ─────────────────────────── çizim ─────────────────────────── */

  if (loadError && !book) {
    return (
      <AdminScreen app="tablolar" title="Tablo">
        <ErrorState error={loadError} onRetry={() => void loadBook()} variant="inline" />
      </AdminScreen>
    );
  }
  if (!book || !sheet || !meta) {
    return (
      <AdminScreen app="tablolar" title="Tablo">
        <SkeletonTable />
      </AdminScreen>
    );
  }

  const barText = editing ? editing.text : activeCell?.v ?? "";
  const cutRange = clipRef.current?.cut?.si === si ? clipRef.current.cut.range : null;
  const errHint = isError(activeValue) ? ERROR_HINTS[activeValue.code] ?? activeValue.code : null;

  const tools: ToolItem[] = [
    { key: "b", label: "Kalın", text: "K", active: Boolean(activeStyle.b), onPress: () => toggleStyle("b") },
    { key: "i", text: "İ", label: "İtalik", active: Boolean(activeStyle.i), onPress: () => toggleStyle("i") },
    { key: "u", text: "A̲", label: "Altı çizili", active: Boolean(activeStyle.u), onPress: () => toggleStyle("u") },
    { key: "d1", divider: true },
    { key: "al-l", icon: "reorder-four-outline", text: "Sol", label: "Sola hizala", active: activeStyle.al === "left", onPress: () => applyStyle({ al: activeStyle.al === "left" ? null : "left" }) },
    { key: "al-c", text: "Orta", label: "Ortala", active: activeStyle.al === "center", onPress: () => applyStyle({ al: activeStyle.al === "center" ? null : "center" }) },
    { key: "al-r", text: "Sağ", label: "Sağa hizala", active: activeStyle.al === "right", onPress: () => applyStyle({ al: activeStyle.al === "right" ? null : "right" }) },
    { key: "d2", divider: true },
    { key: "fmt", text: NUMBER_FORMATS.find((f) => f.key === (activeStyle.f || "general"))?.label.split(" ")[0] ?? "Genel", label: "Sayı biçimi", onPress: () => setFormatOpen(true) },
    { key: "money", text: "₺", label: "Para biçimi", active: activeStyle.f === "money", onPress: () => applyStyle({ f: activeStyle.f === "money" ? null : "money" }) },
    { key: "pct", text: "%", label: "Yüzde biçimi", active: activeStyle.f === "percent", onPress: () => applyStyle({ f: activeStyle.f === "percent" ? null : "percent" }) },
    { key: "dig-", text: ",0←", label: "Ondalık azalt", onPress: () => setDigits(-1) },
    { key: "dig+", text: ",00→", label: "Ondalık artır", onPress: () => setDigits(1) },
    { key: "d3", divider: true },
    { key: "color", icon: "color-palette-outline", label: "Yazı rengi", swatch: activeStyle.c ?? null, onPress: () => setColorPick("c") },
    { key: "bg", icon: "color-fill-outline", label: "Dolgu rengi", swatch: activeStyle.bg ?? null, onPress: () => setColorPick("bg") },
    { key: "d4", divider: true },
    { key: "sum", text: "Σ", label: "Otomatik toplam", onPress: autoSum },
    { key: "fx", text: "fx", label: "İşlevler", onPress: () => setFnOpen(true) },
    { key: "filld", icon: "arrow-down", label: "Aşağı doldur", disabled: range.r2 === range.r1, onPress: () => commit(fill(book, si, range, "down")) },
    { key: "fillr", icon: "arrow-forward", label: "Sağa doldur", disabled: range.c2 === range.c1, onPress: () => commit(fill(book, si, range, "right")) },
    { key: "asc", icon: "arrow-up-outline", text: "A→Z", label: "Artan sırala", onPress: () => sort(true) },
    { key: "desc", icon: "arrow-down-outline", text: "Z→A", label: "Azalan sırala", onPress: () => sort(false) },
    { key: "d5", divider: true },
    { key: "ext", icon: "scan-outline", text: "Genişlet", label: "Seçimi genişletme kipi", active: extend, onPress: () => setExtend((v) => !v) },
    { key: "cut", icon: "cut-outline", label: "Kes", onPress: () => void doCopy(true) },
    { key: "copy", icon: "copy-outline", label: "Kopyala", onPress: () => void doCopy(false) },
    { key: "paste", icon: "clipboard-outline", label: "Yapıştır", onPress: () => void doPaste(false) },
    { key: "clear", icon: "backspace-outline", label: "İçeriği temizle", onPress: () => commit(clearRange(book, si, range)) },
    { key: "cell", icon: "ellipsis-horizontal-circle-outline", label: "Hücre işlemleri", onPress: () => setAxisMenu("cell") },
  ];

  const axisActions: SheetAction[] =
    axisMenu === "row"
      ? [
          { label: "Üste satır ekle", icon: "arrow-up", onPress: () => insertRows("above") },
          { label: "Alta satır ekle", icon: "arrow-down", onPress: () => insertRows("below") },
          { label: range.r2 > range.r1 ? `${range.r2 - range.r1 + 1} satırı sil` : "Satırı sil", icon: "remove-circle-outline", danger: true, onPress: deleteRows },
          { label: "Sona 50 satır ekle", icon: "add", onPress: () => addRows(50), disabled: sheet.rows >= MAX_ROWS },
        ]
      : axisMenu === "col"
        ? [
            { label: "Sola sütun ekle", icon: "arrow-back", onPress: () => insertCols("left") },
            { label: "Sağa sütun ekle", icon: "arrow-forward", onPress: () => insertCols("right") },
            { label: range.c2 > range.c1 ? `${range.c2 - range.c1 + 1} sütunu sil` : "Sütunu sil", icon: "remove-circle-outline", danger: true, onPress: deleteCols },
            { label: `${colName(sel.focus.col)} sütununa göre A→Z`, icon: "arrow-up-outline", onPress: () => sort(true) },
            { label: `${colName(sel.focus.col)} sütununa göre Z→A`, icon: "arrow-down-outline", onPress: () => sort(false) },
            { label: "Sütunu genişlet", icon: "resize-outline", onPress: () => setColWidth(24) },
            { label: "Sütunu daralt", icon: "contract-outline", onPress: () => setColWidth(-24) },
            { label: "Varsayılan genişlik", icon: "refresh-outline", onPress: () => setColWidth(null) },
            { label: "Sona 5 sütun ekle", icon: "add", onPress: () => addCols(5), disabled: sheet.cols >= MAX_COLS },
          ]
        : [
            { label: "Düzenle", icon: "create-outline", onPress: () => startEdit() },
            { label: "Kes", icon: "cut-outline", onPress: () => void doCopy(true) },
            { label: "Kopyala", icon: "copy-outline", onPress: () => void doCopy(false) },
            { label: "Yapıştır", icon: "clipboard-outline", onPress: () => void doPaste(false) },
            { label: "Yalnız değerleri yapıştır", icon: "clipboard-outline", onPress: () => void doPaste(true) },
            { label: "Üste satır ekle", icon: "arrow-up", onPress: () => insertRows("above") },
            { label: "Sola sütun ekle", icon: "arrow-back", onPress: () => insertCols("left") },
            { label: "Satırı sil", icon: "remove-circle-outline", danger: true, onPress: deleteRows },
            { label: "Sütunu sil", icon: "remove-circle-outline", danger: true, onPress: deleteCols },
            { label: "İçeriği temizle", icon: "backspace-outline", onPress: () => commit(clearRange(book, si, range)) },
            { label: "Biçimi temizle", icon: "brush-outline", onPress: () => commit(clearRange(book, si, range, { values: false, styles: true })) },
          ];

  const owner = meta.access === "owner";

  return (
    <AdminScreen
      app="tablolar"
      title={meta.title}
      subtitle={`${readOnly ? ACCESS_LABELS.viewer : SAVE_LABEL[saveState]}${meta.updated_by_name ? ` · ${meta.updated_by_name}` : ""}`}
      scroll={false}
      actions={[
        ...(!readOnly
          ? [
              { icon: "arrow-undo" as const, onPress: undo, accessibilityLabel: "Geri al" },
              { icon: "arrow-redo" as const, onPress: redo, accessibilityLabel: "Yinele" },
            ]
          : []),
        { icon: "ellipsis-horizontal" as const, onPress: () => setMore(true), accessibilityLabel: "Tablo menüsü" },
      ]}
    >
      {readOnly ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText} {...textScale.dense}>
            {mismatch
              ? "Tablo içeriği tam yüklenemedi; verinin üstüne yazılmasın diye düzenleme kapatıldı. Yeniden açmayı dene."
              : "Bu tabloyu yalnız görüntüleyebilirsin. Kopyalayabilir ve CSV olarak paylaşabilirsin."}
          </Text>
        </View>
      ) : null}

      <FormulaBar
        ref={inputRef}
        label={rangeLabel(range)}
        text={barText}
        editing={Boolean(editing)}
        readOnly={readOnly}
        caret={caret.end}
        selection={forcedSel}
        hint={editing ? null : errHint}
        onFocus={() => {
          if (!editingRef.current) startEdit();
        }}
        onChange={(t) => {
          pointRef.current = null;
          setText(t);
        }}
        onSelection={(s) => {
          caretRef.current = s;
          setCaret(s);
          if (forcedSel) setForcedSel(null);
        }}
        onSubmit={() => finishEdit("down")}
        onCancel={cancelEdit}
        onNameBox={() => setGotoOpen(true)}
        onAcceptFunction={(start, name) => {
          const ed = editingRef.current;
          if (!ed) return;
          const res = acceptFunction(ed.text, caretRef.current.end, start, name);
          pointRef.current = null;
          setText(res.text, res.caret);
        }}
        onInsert={insertText}
      />

      {!readOnly ? <SheetToolbar tools={tools} /> : null}

      <SheetGrid
        ref={gridRef}
        sheet={sheet}
        valueOf={valueOf}
        range={range}
        active={sel.focus}
        onCellPress={onCellPress}
        onCellLongPress={onCellLongPress}
        onColPress={(c) => {
          if (editingRef.current) finishEdit(null);
          selectCol(c, extend);
        }}
        onColLongPress={(c) => {
          if (editingRef.current) finishEdit(null);
          if (!(c >= range.c1 && c <= range.c2 && range.r1 === 0 && range.r2 === sheet.rows - 1)) selectCol(c, false);
          if (!readOnly) setAxisMenu("col");
        }}
        onRowPress={(r) => {
          if (editingRef.current) finishEdit(null);
          selectRow(r, extend);
        }}
        onRowLongPress={(r) => {
          if (editingRef.current) finishEdit(null);
          if (!(r >= range.r1 && r <= range.r2 && range.c1 === 0 && range.c2 === sheet.cols - 1)) selectRow(r, false);
          if (!readOnly) setAxisMenu("row");
        }}
      />

      <View style={styles.footer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} keyboardShouldPersistTaps="always">
          {!readOnly ? <Chip label="Sayfa" icon="add" size="sm" onPress={addSheet} /> : null}
          {book.sheets.map((s, i) => (
            <Touchable
              key={`${i}-${s.name}`}
              onPress={() => switchSheet(i)}
              onLongPress={() => !readOnly && setSheetMenu(i)}
              style={[styles.tab, i === si ? styles.tabOn : null]}
              feedback="chip"
              accessibilityLabel={`${s.name} sayfası`}
              accessibilityState={{ selected: i === si }}
            >
              <Text style={[styles.tabText, i === si ? styles.tabTextOn : null]} numberOfLines={1} {...textScale.badge}>
                {s.name}
              </Text>
            </Touchable>
          ))}
        </ScrollView>
        <Touchable onPress={() => void save()} disabled={readOnly || saveState === "saved"} feedback="none" style={styles.stats} accessibilityLabel="Seçim özeti; dokununca kaydeder">
          <Text style={styles.statsText} numberOfLines={1} {...textScale.dense}>
            {stats && stats.count > 0
              ? [
                  stats.numbers > 0 ? `Toplam ${formatValue(stats.sum)}` : null,
                  stats.numbers > 0 && stats.avg != null ? `Ort. ${formatValue(Math.round(stats.avg * 100) / 100)}` : null,
                  stats.numbers > 1 && stats.min != null ? `Min ${formatValue(stats.min)}` : null,
                  stats.numbers > 1 && stats.max != null ? `Maks ${formatValue(stats.max)}` : null,
                  `Sayı ${stats.count}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : `${rangeLabel(range)}${cutRange ? " · kesilen alan bekliyor" : ""}${errHint ? ` · ${errHint}` : ""}`}
          </Text>
          {!readOnly ? (
            <Text style={[styles.saveText, saveState === "error" ? styles.saveError : null]} {...textScale.badge}>
              {SAVE_LABEL[saveState]}
            </Text>
          ) : null}
        </Touchable>
      </View>

      {/* — alt sayfalar — */}

      <ActionSheet visible={axisMenu != null} onClose={() => setAxisMenu(null)} title={rangeLabel(range)} actions={axisActions} />

      <ActionSheet
        visible={sheetMenu != null}
        onClose={() => setSheetMenu(null)}
        title={sheetMenu != null ? book.sheets[sheetMenu]?.name : undefined}
        actions={
          sheetMenu == null
            ? []
            : [
                { label: "Yeniden adlandır", icon: "create-outline", onPress: () => setRenamingSheet(sheetMenu) },
                { label: "Çoğalt", icon: "copy-outline", onPress: () => duplicateSheet(sheetMenu), disabled: book.sheets.length >= MAX_SHEETS },
                { label: "Sola taşı", icon: "arrow-back", onPress: () => moveSheet(sheetMenu, -1), disabled: sheetMenu === 0 },
                { label: "Sağa taşı", icon: "arrow-forward", onPress: () => moveSheet(sheetMenu, 1), disabled: sheetMenu === book.sheets.length - 1 },
                {
                  label: "Sayfayı sil",
                  icon: "trash-outline",
                  danger: true,
                  disabled: book.sheets.length <= 1,
                  hint: "Bu sayfaya başvuran formüller #BAŞV! verir.",
                  onPress: () => deleteSheetAt(sheetMenu),
                },
              ]
        }
      />

      <ActionSheet
        visible={more}
        onClose={() => setMore(false)}
        app="tablolar"
      title={meta.title}
        actions={[
          { label: "Şimdi kaydet", icon: "cloud-upload-outline", hint: SAVE_LABEL[saveState], onPress: () => void save(), hidden: readOnly },
          { label: "Dosyayı yeniden adlandır", icon: "create-outline", onPress: () => setRenameFile(true), hidden: readOnly },
          {
            label: "Paylaş",
            icon: "person-add-outline",
            hint: meta.shares?.length ? `${meta.shares.length} kişiyle paylaşılıyor` : "Yönetim kullanıcılarıyla",
            onPress: () => setShareOpen(true),
            hidden: !owner,
          },
          { label: "Bu sayfayı CSV olarak paylaş", icon: "document-text-outline", onPress: () => void exportCsv() },
          { label: "Bul", icon: "search-outline", onPress: () => setFindOpen(true) },
          { label: "Hücreye git", icon: "locate-outline", onPress: () => setGotoOpen(true) },
          { label: "İşlevler", icon: "calculator-outline", onPress: () => setFnOpen(true) },
          { label: "Seçimi kopyala", icon: "copy-outline", onPress: () => void doCopy(false), hidden: !readOnly },
          {
            label: sheet.freeze ? "İlk satırın dondurmasını kaldır" : "İlk satırı dondur",
            icon: "snow-outline",
            onPress: () => commit({ ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, freeze: !s.freeze } : s)) }),
            hidden: readOnly,
          },
          { label: "Sona 50 satır ekle", icon: "add", onPress: () => addRows(50), hidden: readOnly || sheet.rows >= MAX_ROWS },
          { label: "Sona 5 sütun ekle", icon: "add", onPress: () => addCols(5), hidden: readOnly || sheet.cols >= MAX_COLS },
          { label: "Sunucudan yeniden yükle", icon: "refresh-outline", onPress: () => void loadBook(), hidden: saveState !== "saved" },
        ]}
      />

      <OptionSheet<NumberFormat>
        visible={formatOpen}
        onClose={() => setFormatOpen(false)}
        title="Sayı biçimi"
        options={NUMBER_FORMATS.map((f) => ({ value: f.key, label: f.label }))}
        value={activeStyle.f || "general"}
        onSelect={(v) => applyStyle({ f: !v || v === "general" ? null : v })}
      />

      <ColorSheet
        visible={colorPick != null}
        onClose={() => setColorPick(null)}
        title={colorPick === "bg" ? "Dolgu rengi" : "Yazı rengi"}
        palette={colorPick === "bg" ? SHEET_FILL_COLORS : SHEET_TEXT_COLORS}
        value={colorPick ? activeStyle[colorPick] : null}
        onPick={(c) => colorPick && applyStyle({ [colorPick]: c || null })}
      />

      <FunctionSheet
        visible={fnOpen}
        onClose={() => setFnOpen(false)}
        onPick={(f) => {
          if (readOnly) return;
          if (editingRef.current?.text.startsWith("=")) insertText(`${f.tr}(`);
          else setTimeout(() => startEdit(`=${f.tr}(`), 250);
        }}
      />

      <FormSheet
        visible={gotoOpen}
        onClose={() => setGotoOpen(false)}
        title="Hücreye git"
        fields={[{ key: "ref", label: "Hücre", kind: "text", placeholder: "Ör. B12", required: true }]}
        initial={{ ref: addr(sel.focus.col, sel.focus.row) }}
        submitLabel="Git"
        onSubmit={(v) => {
          const text = String(v.ref ?? "").trim().toUpperCase();
          const [a, b] = text.split(":");
          const p = parseAddr(a);
          if (!p) throw new Error("Geçerli bir hücre yaz (ör. B12 ya da A1:C5).");
          const q = b ? parseAddr(b) : null;
          const clampPos = (x: Pos) => ({ row: clamp(x.row, 0, sheet.rows - 1), col: clamp(x.col, 0, sheet.cols - 1) });
          setSel({ anchor: clampPos(p), focus: clampPos(q ?? p) });
        }}
      />

      <FormSheet
        visible={renamingSheet != null}
        onClose={() => setRenamingSheet(null)}
        title="Sayfa adı"
        fields={[{ key: "name", label: "Sayfa adı", kind: "text", required: true, maxLength: 40, hint: "Diğer sayfalardaki formül başvuruları da güncellenir." }]}
        initial={{ name: renamingSheet != null ? book.sheets[renamingSheet]?.name : "" }}
        onSubmit={(v) => renamingSheet != null && finishRenameSheet(renamingSheet, String(v.name ?? ""))}
      />

      <FormSheet
        visible={renameFile}
        onClose={() => setRenameFile(false)}
        title="Dosya adı"
        fields={[{ key: "title", label: "Dosya adı", kind: "text", required: true, maxLength: 120 }]}
        initial={{ title: meta.title }}
        onSubmit={(v) => renameTitle.mutateAsync(String(v.title ?? "").trim())}
      />

      <BottomSheet visible={findOpen} onClose={() => setFindOpen(false)} title="Bu sayfada ara">
        <View style={styles.find}>
          <Input value={findText} onChangeText={setFindText} placeholder="Aranacak metin ya da sayı" autoFocus returnKeyType="search" onSubmitEditing={() => find(true)} />
          <View style={styles.findRow}>
            <Button label="Önceki" icon="chevron-up" variant="secondary" onPress={() => find(false)} style={styles.flex} />
            <Button label="Sonraki" icon="chevron-down" onPress={() => find(true)} style={styles.flex} />
          </View>
        </View>
      </BottomSheet>

      {owner ? (
        <ShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          sheetId={sheetId}
          app="tablolar"
      title={meta.title}
          initialShares={meta.shares ?? []}
          onSaved={(shares) => setMeta((m) => (m ? { ...m, shares } : m))}
        />
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.warnDim },
  bannerText: { ...type.caption, color: colors.textPrimary },
  footer: { borderTopWidth: hairline, borderTopColor: colors.border, backgroundColor: colors.surface1, paddingBottom: space.sm },
  tabs: { gap: space.xs, paddingHorizontal: space.sm, paddingTop: space.xs, alignItems: "center" },
  tab: {
    paddingHorizontal: space.md,
    height: 30,
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    maxWidth: 160,
  },
  tabOn: { backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  tabText: { ...type.labelSm, color: colors.textSecondary },
  tabTextOn: { color: colors.brandAccent },
  stats: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs },
  statsText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  saveText: { ...type.micro, color: colors.textTertiary },
  saveError: { color: colors.danger },
  find: { gap: space.md, paddingBottom: space.lg },
  findRow: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
