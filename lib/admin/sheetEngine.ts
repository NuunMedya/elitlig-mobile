/**
 * TABLOLAR FORMÜL MOTORU + ÇALIŞMA KİTABI İŞLEMLERİ
 *
 * Web'deki elitlig-client/src/pages/management/tools/sheets/sheetEngine.js
 * ile sheetOps.js'in TypeScript karşılığı. Davranış BİREBİR aynıdır: aynı
 * dosya web'de ve telefonda aynı sonucu vermeli; sunucu yalnız hücre
 * metnini saklar, hesap istemcidedir.
 *
 * Hücre değeri "=" ile başlıyorsa formüldür. Desteklenenler:
 *   · Sayılar (12, 3.5, 12,5), metin ("…"), DOĞRU/YANLIŞ (TRUE/FALSE)
 *   · Hücre (A1, $B$2), aralık (A1:C5), tam sütun/satır (A:A, 2:5),
 *     başka sayfa ('Ekim'!B2, Sayfa2!A1:A9)
 *   · + − * / ^ & % ve karşılaştırma = <> < > <= >=
 *   · İşlevler İngilizce ve Türkçe adlarıyla (SUM / TOPLA …), bkz. FUNCTIONS
 * Bağımsız değişken ayracı ";" ya da ",". Hatalar Türkçe: #BÖL/0!, #DEĞER!,
 * #AD?, #BAŞV!, #DÖNGÜ!, #YOK, #SAYI!. Döngüsel başvurular algılanır.
 *
 * Renk paletleri (hücre yazı/dolgu) veri rengi olduğu için burada durur;
 * app/ ve components/ çıplak hex taşıyamaz.
 */

/* ═══════════════════════════════ TİPLER ═══════════════════════════════ */

export type NumberFormat = "general" | "number" | "money" | "percent" | "date" | "text";
export type Align = "left" | "center" | "right";

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  al?: Align;
  /** Yazı rengi (#rrggbb). */
  c?: string;
  /** Dolgu rengi (#rrggbb). */
  bg?: string;
  f?: NumberFormat;
  /** Ondalık basamak (0-6). */
  d?: number;
}

export interface Cell {
  v: string;
  s?: CellStyle;
}

export interface Sheet {
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, Cell>;
  colW: Record<string, number>;
  freeze?: boolean;
}

export interface Workbook {
  sheets: Sheet[];
}

export interface DateValue {
  date: number;
}

export class CellError {
  code: string;
  constructor(code: string) {
    this.code = code;
  }
  toString() {
    return this.code;
  }
}

export type CellValue = number | string | boolean | DateValue | CellError | null;

interface RangeValue {
  range: true;
  values: CellValue[];
  rows: number;
  cols: number;
}

type EvalValue = CellValue | RangeValue | undefined;

/* ═══════════════════════════════ ADRESLER ═══════════════════════════════ */

export const colName = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

export const colIndex = (name: string): number => {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export const addr = (col: number, row: number) => `${colName(col)}${row + 1}`;

export interface Pos {
  row: number;
  col: number;
}

export const parseAddr = (text: string): Pos | null => {
  const m = /^\$?([A-Za-z]{1,2})\$?(\d{1,4})$/.exec(String(text).trim());
  if (!m) return null;
  return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
};

/* ═══════════════════════════════ HATALAR ═══════════════════════════════ */

const ERR = {
  div0: () => new CellError("#BÖL/0!"),
  value: () => new CellError("#DEĞER!"),
  name: () => new CellError("#AD?"),
  ref: () => new CellError("#BAŞV!"),
  cycle: () => new CellError("#DÖNGÜ!"),
  na: () => new CellError("#YOK"),
  num: () => new CellError("#SAYI!"),
};

export const isError = (v: unknown): v is CellError => v instanceof CellError;
const isRange = (v: unknown): v is RangeValue => Boolean(v && typeof v === "object" && (v as RangeValue).range === true);
const isDate = (v: unknown): v is DateValue => Boolean(v && typeof v === "object" && !isError(v) && "date" in (v as object));

/** Hata kodunun Türkçe açıklaması (hücreye dokununca gösterilir). */
export const ERROR_HINTS: Record<string, string> = {
  "#BÖL/0!": "Sıfıra bölme",
  "#DEĞER!": "Değer türü uygun değil ya da formül hatalı",
  "#AD?": "Bilinmeyen işlev adı",
  "#BAŞV!": "Geçersiz başvuru (silinmiş hücre ya da sayfa)",
  "#DÖNGÜ!": "Formül kendisine başvuruyor (döngü)",
  "#YOK": "Aranan değer bulunamadı",
  "#SAYI!": "Geçersiz sayı",
};

/* ═══════════════════════════ SAYI AYRIŞTIRMA ═══════════════════════════ */

const EPOCH = Date.UTC(1899, 11, 30);
export const serialToDate = (serial: number) => new Date(EPOCH + serial * 86400000);
export const dateToSerial = (date: Date) =>
  Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH) / 86400000);

/** Hücreye yazılan metni değere çevirir: "1.250,50" → 1250.5, "%15" → 0.15. */
export function parseLiteral(raw: unknown): CellValue {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const upper = text.toLocaleUpperCase("tr-TR");
  if (upper === "DOĞRU" || upper === "TRUE") return true;
  if (upper === "YANLIŞ" || upper === "FALSE") return false;
  let t = text.replace(/\s|₺|TL$/gi, "");
  let percent = false;
  if (/^%/.test(t) || /%$/.test(t)) {
    percent = true;
    t = t.replace(/%/g, "");
  }
  let normalized: string | null = null;
  if (/^-?\d+$/.test(t)) normalized = t;
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) normalized = t.replace(",", ".");
  else if (/^-?\d*\.\d+$/.test(t)) normalized = t;
  else if (/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) normalized = t.replace(/,/g, "");
  if (normalized != null) {
    const n = Number(normalized);
    if (Number.isFinite(n)) return percent ? n / 100 : n;
  }
  // Tarih: 31.12.2026 ya da 2026-12-31 → seri gün (1899-12-30 tabanlı).
  const d1 = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  const d2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (d1 || d2) {
    const [y, mo, d] = d1 ? [d1[3], d1[2], d1[1]] : [d2![1], d2![2], d2![3]];
    const date = Date.UTC(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(date)) return { date: Math.round((date - EPOCH) / 86400000) };
  }
  return text;
}

/* ═══════════════════════════════ SÖZCÜKLEYİCİ ═══════════════════════════════ */

type Token =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "ref"; sheet: string | null; a: string; b: string | null; kind?: "col" | "row" }
  | { t: "word"; v: string }
  | { t: "op"; v: string }
  | { t: "(" | ")" | "," | ";"; v: string };

const REF_RE =
  /^(?:(?:'([^']+)'|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*))!)?(\$?[A-Za-z]{1,2}\$?\d{1,4})(?::(\$?[A-Za-z]{1,2}\$?\d{1,4}))?/;
// Tam sütun (A:A, $B:$D) ve tam satır (1:1, $3:$9) aralıkları.
const FULL_RE =
  /^(?:(?:'([^']+)'|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*))!)?(?:(\$?[A-Za-z]{1,2}):(\$?[A-Za-z]{1,2})|(\$?\d{1,4}):(\$?\d{1,4}))/;

export function tokenize(src: string): Token[] {
  // ";" ayraçlı (Türkçe) formüllerde ya da işlevsiz ifadelerde "1,18" ondalıktır.
  const commaDecimal = src.includes(";") || !src.includes("(");
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let str = "";
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') {
          str += '"';
          j += 2;
          continue;
        }
        if (src[j] === '"') break;
        str += src[j];
        j += 1;
      }
      if (j >= src.length) throw ERR.value();
      tokens.push({ t: "str", v: str });
      i = j + 1;
      continue;
    }
    const rest = src.slice(i);
    const full = FULL_RE.exec(rest);
    if (full && !/^[(\wÇĞİÖŞÜçğıöşü.!]/.test(rest.slice(full[0].length))) {
      const kind = full[3] ? "col" : "row";
      tokens.push({ t: "ref", sheet: full[1] || full[2] || null, a: full[3] || full[5], b: full[4] || full[6], kind });
      i += full[0].length;
      continue;
    }
    const num = (commaDecimal ? /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/ : /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/).exec(rest);
    if (num && !/^[A-Za-z]/.test(rest)) {
      tokens.push({ t: "num", v: Number(num[0].replace(",", ".")) });
      i += num[0].length;
      continue;
    }
    const ref = REF_RE.exec(rest);
    if (ref && !/^[(\wÇĞİÖŞÜçğıöşü.]/.test(rest.slice(ref[0].length))) {
      tokens.push({ t: "ref", sheet: ref[1] || ref[2] || null, a: ref[3], b: ref[4] || null });
      i += ref[0].length;
      continue;
    }
    const word = /^[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü.]*/.exec(rest);
    if (word) {
      tokens.push({ t: "word", v: word[0] });
      i += word[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<>", "<=", ">="].includes(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%(),;:".includes(ch)) {
      if (ch === "(" || ch === ")" || ch === "," || ch === ";") tokens.push({ t: ch, v: ch });
      else tokens.push({ t: "op", v: ch });
      i += 1;
      continue;
    }
    throw ERR.value();
  }
  return tokens;
}

/* ═══════════════════════════════ AYRIŞTIRICI ═══════════════════════════════ */

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "ref"; sheet: string | null; a: string; b: string | null; kind?: "col" | "row" }
  | { k: "neg"; e: Node }
  | { k: "pct"; e: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "call"; name: string; args: Node[] }
  | { k: "name"; v: string }
  | { k: "empty" }
  | { k: "err"; e: CellError };

const BINARY: Record<string, number> = {
  "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1,
  "&": 2,
  "+": 3, "-": 3,
  "*": 4, "/": 4,
  "^": 5,
};

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function primary(): Node {
    const tok = next();
    if (!tok) throw ERR.value();
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "ref") return { k: "ref", sheet: tok.sheet, a: tok.a, b: tok.b, kind: tok.kind };
    if (tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      const operand = postfix();
      return tok.v === "-" ? { k: "neg", e: operand } : operand;
    }
    if (tok.t === "(") {
      const inner = expr(0);
      if (next()?.t !== ")") throw ERR.value();
      return inner;
    }
    if (tok.t === "word") {
      const upper = tok.v.toLocaleUpperCase("tr-TR");
      if (peek()?.t === "(") {
        next();
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          for (;;) {
            if (peek()?.t === "," || peek()?.t === ";") args.push({ k: "empty" });
            else args.push(expr(0));
            const sep = next();
            if (sep?.t === ")") break;
            if (sep?.t !== "," && sep?.t !== ";") throw ERR.value();
          }
        } else next();
        return { k: "call", name: upper, args };
      }
      if (upper === "TRUE" || upper === "DOĞRU") return { k: "bool", v: true };
      if (upper === "FALSE" || upper === "YANLIŞ") return { k: "bool", v: false };
      return { k: "name", v: tok.v };
    }
    throw ERR.value();
  }

  function postfix(): Node {
    let node = primary();
    for (;;) {
      const tok = peek();
      if (!(tok && tok.t === "op" && tok.v === "%")) break;
      next();
      node = { k: "pct", e: node };
    }
    return node;
  }

  function expr(minPrec: number): Node {
    let left = postfix();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op" || !(tok.v in BINARY)) break;
      const prec = BINARY[tok.v];
      if (prec < minPrec) break;
      next();
      const right = expr(tok.v === "^" ? prec : prec + 1);
      left = { k: "bin", op: tok.v, l: left, r: right };
    }
    return left;
  }

  const tree = expr(0);
  if (pos !== tokens.length) throw ERR.value();
  return tree;
}

const astCache = new Map<string, Node>();
export function compile(formula: string): Node {
  const src = String(formula).replace(/^=/, "");
  const cached = astCache.get(src);
  if (cached) return cached;
  let ast: Node;
  try {
    ast = parse(tokenize(src));
  } catch (error) {
    ast = { k: "err", e: isError(error) ? error : ERR.value() };
  }
  if (astCache.size > 5000) astCache.clear();
  astCache.set(src, ast);
  return ast;
}

/* ═══════════════════════════════ DÖNÜŞÜMLER ═══════════════════════════════ */

const toNumber = (v: EvalValue): number => {
  if (isError(v)) throw v;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isDate(v)) return v.date;
  if (isRange(v)) throw ERR.value();
  const parsed = parseLiteral(v);
  if (typeof parsed === "number") return parsed;
  if (isDate(parsed)) return parsed.date;
  throw ERR.value();
};

const toText = (v: EvalValue): string => {
  if (isError(v)) throw v;
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "DOĞRU" : "YANLIŞ";
  if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10).replace(".", ",");
  if (isDate(v)) return serialToDate(v.date).toLocaleDateString("tr-TR", { timeZone: "UTC" });
  if (isRange(v)) throw ERR.value();
  return String(v);
};

const toBool = (v: EvalValue): boolean => {
  if (isError(v)) throw v;
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return false;
  if (typeof v === "string") {
    const u = v.toLocaleUpperCase("tr-TR");
    if (u === "DOĞRU" || u === "TRUE") return true;
    if (u === "YANLIŞ" || u === "FALSE") return false;
    throw ERR.value();
  }
  return toNumber(v) !== 0;
};

const flat = (args: EvalValue[]): EvalValue[] => args.flatMap((a) => (isRange(a) ? a.values : [a]));

const numbersOf = (args: EvalValue[]): number[] => {
  // Aralıktaki metin ve boşlar atlanır; doğrudan yazılan değerler sayıya çevrilir.
  const out: number[] = [];
  for (const a of args) {
    if (isRange(a)) {
      for (const v of a.values) {
        if (isError(v)) throw v;
        if (typeof v === "number") out.push(v);
        else if (isDate(v)) out.push(v.date);
      }
    } else if (a !== undefined) out.push(toNumber(a));
  }
  return out;
};

/** "<10", ">=5", "<>x", "Ali" gibi koşul ölçütü. */
function criterion(raw: EvalValue): (v: CellValue) => boolean {
  if (typeof raw === "number" || typeof raw === "boolean") {
    return (v) => v === raw || (typeof v === "number" && v === Number(raw));
  }
  const text = toText(raw);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(text)!;
  const op = m[1] || "=";
  const target = parseLiteral(m[2]);
  const isNum = typeof target === "number";
  return (v) => {
    if (isNum) {
      if (typeof v !== "number") return op === "<>";
      switch (op) {
        case "<": return v < (target as number);
        case ">": return v > (target as number);
        case "<=": return v <= (target as number);
        case ">=": return v >= (target as number);
        case "<>": return v !== target;
        default: return v === target;
      }
    }
    const a = toText(v ?? "").toLocaleLowerCase("tr-TR");
    const b = String(m[2]).toLocaleLowerCase("tr-TR");
    const pattern = new RegExp(`^${b.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    return op === "<>" ? !pattern.test(a) : pattern.test(a);
  };
}

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};

/** METNEÇEVİR/TEXT için sade biçimleyici: sayı (0, 0.00, #,##0), yüzde ve tarih. */
function textFormat(x: EvalValue, fmt: string): string {
  const f = fmt.trim();
  if (!f) return toText(x);
  const noQuoted = f.replace(/"[^"]*"/g, "");
  const dateFmt = /[dmy]/i.test(noQuoted) && !/[#0]/.test(noQuoted.replace(/[dmy]/gi, ""));
  if (dateFmt) {
    const d = serialToDate(toNumber(x));
    const pad = (n: number) => String(n).padStart(2, "0");
    return f.replace(/yyyy|yy|dd|d|mm|m/gi, (t) => {
      const k = t.toLowerCase();
      if (k === "yyyy") return String(d.getUTCFullYear());
      if (k === "yy") return pad(d.getUTCFullYear() % 100);
      if (k === "dd") return pad(d.getUTCDate());
      if (k === "d") return String(d.getUTCDate());
      if (k === "mm") return pad(d.getUTCMonth() + 1);
      return String(d.getUTCMonth() + 1);
    });
  }
  let n = toNumber(x);
  const percent = f.includes("%");
  if (percent) n *= 100;
  // Hem "0.00" (Excel) hem "0,00" (Türkçe) yazımı: son ayraçtan sonraki sıfırlar ondalıktır.
  const bare = f.replace(/%/g, "");
  const m = /[.,](0+)[^0]*$/.exec(bare);
  const digits = m && !/^#?[.,]##0$/.test(bare) ? m[1].length : 0;
  const grouping = /#[.,]##0/.test(f);
  const body = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping }).format(n);
  return percent ? `%${body}` : body;
}

/* ═══════════════════════════════ İŞLEVLER ═══════════════════════════════ */

type Evaluate = (node: Node) => CellValue;

interface FunctionDef {
  tr: string;
  hint: string;
  lazy?: boolean;
  fn: (args: any[], ev: Evaluate) => CellValue; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const rangeOf = (v: EvalValue): RangeValue | null => (isRange(v) ? v : null);

// lazy: bağımsız değişkenleri kendisi hesaplar (EĞER, EĞERHATA …).
export const FUNCTIONS: Record<string, FunctionDef> = {
  SUM: { tr: "TOPLA", hint: "TOPLA(A1:A10) — sayıları toplar", fn: (a: EvalValue[]) => numbersOf(a).reduce((s, n) => s + n, 0) },
  AVERAGE: {
    tr: "ORTALAMA", hint: "ORTALAMA(B2:B20) — ortalama",
    fn: (a: EvalValue[]) => { const n = numbersOf(a); if (!n.length) throw ERR.div0(); return n.reduce((s, x) => s + x, 0) / n.length; },
  },
  MIN: { tr: "MİN", hint: "MİN(A1:A9) — en küçük", fn: (a: EvalValue[]) => { const n = numbersOf(a); return n.length ? Math.min(...n) : 0; } },
  MAX: { tr: "MAK", hint: "MAK(A1:A9) — en büyük", fn: (a: EvalValue[]) => { const n = numbersOf(a); return n.length ? Math.max(...n) : 0; } },
  COUNT: { tr: "BAĞ_DEĞ_SAY", hint: "BAĞ_DEĞ_SAY(A:A) — sayı içeren hücre sayısı", fn: (a: EvalValue[]) => flat(a).filter((v) => typeof v === "number" || isDate(v)).length },
  COUNTA: { tr: "BAĞ_DEĞ_DOLU_SAY", hint: "BAĞ_DEĞ_DOLU_SAY(A1:A9) — dolu hücre sayısı", fn: (a: EvalValue[]) => flat(a).filter((v) => v != null && v !== "").length },
  COUNTBLANK: { tr: "BOŞLUKSAY", hint: "BOŞLUKSAY(A1:A9) — boş hücre sayısı", fn: (a: EvalValue[]) => flat(a).filter((v) => v == null || v === "").length },
  ROUND: { tr: "YUVARLA", hint: "YUVARLA(A1; 2) — basamağa yuvarlar", fn: ([x, d]: EvalValue[]) => round(toNumber(x), d === undefined ? 0 : toNumber(d)) },
  ROUNDUP: {
    tr: "YUKARIYUVARLA", hint: "YUKARIYUVARLA(A1; 0)",
    fn: ([x, d]: EvalValue[]) => { const f = 10 ** (d === undefined ? 0 : toNumber(d)); const n = toNumber(x); return (n >= 0 ? Math.ceil(n * f - 1e-9) : Math.floor(n * f + 1e-9)) / f; },
  },
  ROUNDDOWN: {
    tr: "AŞAĞIYUVARLA", hint: "AŞAĞIYUVARLA(A1; 0)",
    fn: ([x, d]: EvalValue[]) => { const f = 10 ** (d === undefined ? 0 : toNumber(d)); return Math.trunc(toNumber(x) * f) / f; },
  },
  INT: { tr: "TAMSAYI", hint: "TAMSAYI(A1) — aşağı tam sayı", fn: ([x]: EvalValue[]) => Math.floor(toNumber(x)) },
  ABS: { tr: "MUTLAK", hint: "MUTLAK(A1)", fn: ([x]: EvalValue[]) => Math.abs(toNumber(x)) },
  SQRT: { tr: "KAREKÖK", hint: "KAREKÖK(A1)", fn: ([x]: EvalValue[]) => { const n = toNumber(x); if (n < 0) throw ERR.num(); return Math.sqrt(n); } },
  POWER: { tr: "KUVVET", hint: "KUVVET(2; 10)", fn: ([x, y]: EvalValue[]) => toNumber(x) ** toNumber(y) },
  MOD: {
    tr: "MOD", hint: "MOD(10; 3) — bölümden kalan",
    fn: ([x, y]: EvalValue[]) => { const d = toNumber(y); if (!d) throw ERR.div0(); const n = toNumber(x); return n - d * Math.floor(n / d); },
  },
  PRODUCT: { tr: "ÇARPIM", hint: "ÇARPIM(A1:A3)", fn: (a: EvalValue[]) => numbersOf(a).reduce((s, n) => s * n, 1) },
  IF: {
    tr: "EĞER", hint: "EĞER(A1>10; \"Yüksek\"; \"Düşük\")", lazy: true,
    fn: (args: Node[], ev) => (toBool(ev(args[0])) ? (args[1] ? ev(args[1]) : true) : (args[2] ? ev(args[2]) : false)),
  },
  IFERROR: {
    tr: "EĞERHATA", hint: "EĞERHATA(A1/B1; 0)", lazy: true,
    fn: (args: Node[], ev) => {
      try {
        const v = ev(args[0]);
        if (isError(v)) return ev(args[1]);
        return v;
      } catch (e) {
        if (isError(e)) return ev(args[1]);
        throw e;
      }
    },
  },
  AND: { tr: "VE", hint: "VE(A1>0; B1>0)", fn: (a: EvalValue[]) => flat(a).every(toBool) },
  OR: { tr: "YADA", hint: "YADA(A1>0; B1>0)", fn: (a: EvalValue[]) => flat(a).some(toBool) },
  NOT: { tr: "DEĞİL", hint: "DEĞİL(A1)", fn: ([x]: EvalValue[]) => !toBool(x) },
  TRUE: { tr: "DOĞRU", hint: "DOĞRU() — mantıksal doğru", fn: () => true },
  FALSE: { tr: "YANLIŞ", hint: "YANLIŞ() — mantıksal yanlış", fn: () => false },
  SUMIF: {
    tr: "ETOPLA", hint: "ETOPLA(A2:A20; \"Ödendi\"; C2:C20) — koşula uyanları toplar",
    fn: ([range, crit, sumRange]: EvalValue[]) => {
      const test = criterion(crit);
      const values = rangeOf(range)?.values || [];
      const sums = rangeOf(sumRange)?.values || values;
      return values.reduce<number>((s, v, i) => (test(v) && typeof sums[i] === "number" ? s + (sums[i] as number) : s), 0);
    },
  },
  COUNTIF: {
    tr: "EĞERSAY", hint: "EĞERSAY(B2:B30; \">=50\")",
    fn: ([range, crit]: EvalValue[]) => { const test = criterion(crit); return (rangeOf(range)?.values || []).filter(test).length; },
  },
  AVERAGEIF: {
    tr: "EĞERORTALAMA", hint: "EĞERORTALAMA(A2:A9; \"Gol\"; B2:B9)",
    fn: ([range, crit, avgRange]: EvalValue[]) => {
      const test = criterion(crit);
      const values = rangeOf(range)?.values || [];
      const nums = rangeOf(avgRange)?.values || values;
      const picked = values.map((v, i) => (test(v) && typeof nums[i] === "number" ? (nums[i] as number) : null)).filter((n): n is number => n != null);
      if (!picked.length) throw ERR.div0();
      return picked.reduce((s, n) => s + n, 0) / picked.length;
    },
  },
  VLOOKUP: {
    tr: "DÜŞEYARA", hint: "DÜŞEYARA(\"Ali\"; A2:C20; 3; YANLIŞ) — tabloda arar",
    fn: ([needle, tableArg, col, approx]: EvalValue[]) => {
      const table = rangeOf(tableArg);
      if (!table) throw ERR.value();
      const c = Math.floor(toNumber(col)) - 1;
      if (c < 0 || c >= table.cols) throw ERR.ref();
      const exact = approx === undefined ? false : !toBool(approx);
      const key = typeof needle === "number" ? needle : toText(needle).toLocaleLowerCase("tr-TR");
      for (let r = 0; r < table.rows; r += 1) {
        const v = table.values[r * table.cols];
        const k = typeof v === "number" ? v : toText(v ?? "").toLocaleLowerCase("tr-TR");
        if (k === key) return table.values[r * table.cols + c] ?? "";
        if (!exact && typeof key === "number" && typeof v === "number" && v > key) {
          if (r === 0) throw ERR.na();
          return table.values[(r - 1) * table.cols + c] ?? "";
        }
      }
      throw ERR.na();
    },
  },
  CONCAT: { tr: "BİRLEŞTİR", hint: "BİRLEŞTİR(A1; \" \"; B1)", fn: (a: EvalValue[]) => flat(a).map(toText).join("") },
  TEXTJOIN: {
    tr: "METİNBİRLEŞTİR", hint: "METİNBİRLEŞTİR(\", \"; DOĞRU; A1:A5)",
    fn: ([sep, skip, ...rest]: EvalValue[]) => flat(rest).map(toText).filter((t) => !toBool(skip ?? false) || t !== "").join(toText(sep)),
  },
  TEXT: {
    tr: "METNEÇEVİR", hint: "METNEÇEVİR(A1; \"#.##0,00\") — sayıyı/tarihi biçimli metne çevirir",
    fn: ([x, fmt]: EvalValue[]) => textFormat(x, toText(fmt ?? "")),
  },
  LEN: { tr: "UZUNLUK", hint: "UZUNLUK(A1)", fn: ([x]: EvalValue[]) => toText(x).length },
  UPPER: { tr: "BÜYÜKHARF", hint: "BÜYÜKHARF(A1)", fn: ([x]: EvalValue[]) => toText(x).toLocaleUpperCase("tr-TR") },
  LOWER: { tr: "KÜÇÜKHARF", hint: "KÜÇÜKHARF(A1)", fn: ([x]: EvalValue[]) => toText(x).toLocaleLowerCase("tr-TR") },
  TRIM: { tr: "KIRP", hint: "KIRP(A1) — fazla boşlukları siler", fn: ([x]: EvalValue[]) => toText(x).trim().replace(/\s+/g, " ") },
  LEFT: { tr: "SOLDAN", hint: "SOLDAN(A1; 3)", fn: ([x, n]: EvalValue[]) => toText(x).slice(0, n === undefined ? 1 : toNumber(n)) },
  RIGHT: {
    tr: "SAĞDAN", hint: "SAĞDAN(A1; 3)",
    fn: ([x, n]: EvalValue[]) => { const t = toText(x); const k = n === undefined ? 1 : toNumber(n); return k ? t.slice(-k) : ""; },
  },
  TODAY: { tr: "BUGÜN", hint: "BUGÜN() — bugünün tarihi", fn: () => ({ date: dateToSerial(new Date()) }) },
  NOW: {
    tr: "ŞİMDİ", hint: "ŞİMDİ() — tarih ve saat",
    fn: () => { const d = new Date(); return { date: dateToSerial(d) + (d.getHours() * 60 + d.getMinutes()) / 1440 }; },
  },
  DATE: {
    tr: "TARİH", hint: "TARİH(2026; 12; 31)",
    fn: ([y, m, d]: EvalValue[]) => ({ date: Math.round((Date.UTC(toNumber(y), toNumber(m) - 1, toNumber(d)) - EPOCH) / 86400000) }),
  },
  YEAR: { tr: "YIL", hint: "YIL(A1)", fn: ([x]: EvalValue[]) => serialToDate(toNumber(x)).getUTCFullYear() },
  MONTH: { tr: "AY", hint: "AY(A1)", fn: ([x]: EvalValue[]) => serialToDate(toNumber(x)).getUTCMonth() + 1 },
  DAY: { tr: "GÜN", hint: "GÜN(A1)", fn: ([x]: EvalValue[]) => serialToDate(toNumber(x)).getUTCDate() },
  DAYS: { tr: "GÜNSAY", hint: "GÜNSAY(bitiş; başlangıç) — iki tarih arası gün", fn: ([end, start]: EvalValue[]) => toNumber(end) - toNumber(start) },
  RANK: {
    tr: "RANK", hint: "RANK(B2; B2:B20) — sıralamadaki yeri (büyükten küçüğe)",
    fn: ([x, range, order]: EvalValue[]) => {
      const n = toNumber(x);
      const list = numbersOf([range]);
      const asc = order !== undefined && toNumber(order) !== 0;
      return list.filter((v) => (asc ? v < n : v > n)).length + 1;
    },
  },
  MEDIAN: {
    tr: "ORTANCA", hint: "ORTANCA(A1:A9)",
    fn: (a: EvalValue[]) => {
      const n = numbersOf(a).sort((x, y) => x - y);
      if (!n.length) throw ERR.num();
      const m = Math.floor(n.length / 2);
      return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
    },
  },
};

/** Türkçe harfleri sadeleştirir: "BİRLEŞTİR" → "BIRLESTIR". */
const fold = (name: string) =>
  name
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");

const NAME_INDEX = (() => {
  const map = new Map<string, FunctionDef>();
  for (const [en, def] of Object.entries(FUNCTIONS)) {
    map.set(en, def);
    map.set(def.tr.toLocaleUpperCase("tr-TR"), def);
    // "İ"siz yazımlar da tanınır (MIN, BIRLESTIR …).
    map.set(fold(def.tr), def);
  }
  return map;
})();

export interface FunctionInfo {
  en: string;
  tr: string;
  hint: string;
}

export const FUNCTION_LIST: FunctionInfo[] = Object.entries(FUNCTIONS).map(([en, def]) => ({ en, tr: def.tr, hint: def.hint }));

/**
 * Formül yazarken imlecin solundaki sözcük (öneri listesi için). Formül
 * değilse, metin içindeyse ya da sözcük bir başvurunun parçasıysa null.
 */
export function wordAt(text: string, caret: number): { start: number; word: string } | null {
  if (!text.startsWith("=")) return null;
  let quoted = false;
  for (let i = 0; i < caret; i += 1) if (text[i] === '"') quoted = !quoted;
  if (quoted) return null;
  const m = /[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-zÇĞİÖŞÜçğıöşü_.]*$/.exec(text.slice(0, caret));
  if (!m) return null;
  const start = caret - m[0].length;
  const before = text[start - 1];
  if (before && /[\w$!'":ÇĞİÖŞÜçğıöşü]/.test(before)) return null;
  const after = text[caret];
  if (after && /[\wÇĞİÖŞÜçğıöşü(]/.test(after)) return null;
  return { start, word: m[0] };
}

/** Yazılan öneke uyan işlevler (Türkçe ve İngilizce adla; Türkçe karakter şart değil). */
export function functionMatches(word: string, limit = 8): (FunctionInfo & { insert: string })[] {
  if (!word) return [];
  const q = fold(word);
  const scored: { f: FunctionInfo; score: number; useEn: boolean }[] = [];
  for (const f of FUNCTION_LIST) {
    const tr = fold(f.tr);
    const en = fold(f.en);
    let score = -1;
    if (tr === q || en === q) score = 0;
    else if (tr.startsWith(q)) score = 1;
    else if (en.startsWith(q)) score = 2;
    if (score >= 0) scored.push({ f, score, useEn: score === 2 || (score === 0 && en === q && tr !== q) });
  }
  scored.sort((a, b) => a.score - b.score || a.f.tr.localeCompare(b.f.tr, "tr"));
  return scored.slice(0, limit).map(({ f, useEn }) => ({ ...f, insert: useEn ? f.en : f.tr }));
}

/** Öneriyi kabul eder: sözcüğü "AD(" ile değiştirir, imleç parantezin içine gelir. */
export function acceptFunction(text: string, caret: number, start: number, name: string) {
  const hasParen = text[caret] === "(";
  const insert = hasParen ? name : `${name}(`;
  const next = text.slice(0, start) + insert + text.slice(caret);
  return { text: next, caret: start + insert.length + (hasParen ? 1 : 0) };
}

/** Açık kalan parantezleri kapatır (Enter'da web'deki gibi). */
export function closeParens(text: string): string {
  if (!text.startsWith("=")) return text;
  let depth = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth += 1;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
  }
  return quoted ? text : text + ")".repeat(depth);
}

/** Başvuru eklenebilecek yer mi (formülde işleç, "(" ya da ayraçtan sonra)? */
export function canInsertRef(text: string, caret: number): boolean {
  if (!text.startsWith("=")) return false;
  let quoted = false;
  for (let i = 0; i < caret; i += 1) if (text[i] === '"') quoted = !quoted;
  if (quoted) return false;
  const before = text.slice(0, caret).trimEnd();
  return /[=(;,+\-*/^&<>:]$/.test(before);
}

/* ═══════════════════════════════ HESAPLAMA ═══════════════════════════════ */

export interface Evaluator {
  value: (sheetIndex: number, key: string) => CellValue;
}

/**
 * Çalışma kitabı için hesaplayıcı. value(sheetIndex, "A1") hücrenin sonucunu
 * döner (sayı, metin, mantıksal, { date } ya da CellError). Sonuçlar önbelleğe
 * alınır; veri değişince yeni hesaplayıcı kurulmalıdır.
 */
export function createEvaluator(workbook: Workbook): Evaluator {
  const sheets = workbook.sheets;
  const memo = sheets.map(() => new Map<string, CellValue>());
  const visiting = new Set<string>();
  const sheetIndexByName = new Map(sheets.map((s, i) => [s.name.toLocaleLowerCase("tr-TR"), i]));

  const resolveSheet = (name: string | null, current: number) => {
    if (!name) return current;
    const idx = sheetIndexByName.get(name.toLocaleLowerCase("tr-TR"));
    if (idx === undefined) throw ERR.ref();
    return idx;
  };

  function value(si: number, key: string): CellValue {
    const cache = memo[si];
    if (!cache) return ERR.ref();
    if (cache.has(key)) return cache.get(key) as CellValue;
    const raw = sheets[si]?.cells?.[key]?.v;
    let result: CellValue;
    if (raw == null || raw === "") result = null;
    else if (typeof raw === "string" && raw.startsWith("=") && raw.length > 1) {
      const token = `${si}!${key}`;
      if (visiting.has(token)) return ERR.cycle();
      visiting.add(token);
      try {
        let out = evalNode(compile(raw), si);
        if (isRange(out)) out = out.values[0] ?? null;
        result = out === undefined ? null : (out as CellValue);
        if (typeof result === "number" && !Number.isFinite(result)) result = ERR.num();
      } catch (error) {
        result = isError(error) ? error : ERR.value();
      }
      visiting.delete(token);
    } else if (typeof raw === "string" && raw.startsWith("'")) result = raw.slice(1);
    else result = parseLiteral(raw);
    cache.set(key, result);
    return result;
  }

  // Tam sütun/satır aralığı sayfanın (dolu bölge dahil) boyutuyla sınırlanır.
  const extentCache = new Map<number, { rows: number; cols: number }>();
  const extent = (si: number) => {
    const hit = extentCache.get(si);
    if (hit) return hit;
    const sh = sheets[si];
    let rows = Number(sh?.rows) || 0;
    let cols = Number(sh?.cols) || 0;
    for (const key of Object.keys(sh?.cells || {})) {
      const p = parseAddr(key);
      if (p) {
        rows = Math.max(rows, p.row + 1);
        cols = Math.max(cols, p.col + 1);
      }
    }
    const out = { rows: Math.max(rows, 1), cols: Math.max(cols, 1) };
    extentCache.set(si, out);
    return out;
  };

  function rangeValues(si: number, a: string, b: string, kind?: "col" | "row"): RangeValue {
    let p: Pos | null;
    let q: Pos | null;
    if (kind === "col") {
      const rows = extent(si).rows;
      p = { col: colIndex(a), row: 0 };
      q = { col: colIndex(b), row: rows - 1 };
    } else if (kind === "row") {
      const cols = extent(si).cols;
      p = { col: 0, row: Number(a) - 1 };
      q = { col: cols - 1, row: Number(b) - 1 };
      if (p.row < 0 || q.row < 0) throw ERR.ref();
    } else {
      p = parseAddr(a);
      q = parseAddr(b);
    }
    if (!p || !q) throw ERR.ref();
    const c1 = Math.min(p.col, q.col);
    const c2 = Math.max(p.col, q.col);
    const r1 = Math.min(p.row, q.row);
    const r2 = Math.min(Math.max(p.row, q.row), 9999);
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > 60000) throw ERR.ref();
    const values: CellValue[] = [];
    for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) values.push(value(si, addr(c, r)));
    return { range: true, values, rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
  }

  const single = (v: EvalValue): CellValue => {
    if (isRange(v)) {
      if (v.values.length === 1) return v.values[0];
      throw ERR.value();
    }
    if (isError(v)) throw v;
    return v === undefined ? null : v;
  };

  function compare(op: string, l: CellValue, r: CellValue): boolean {
    const norm = (v: CellValue) => (v == null ? "" : isDate(v) ? v.date : v);
    let a = norm(l);
    let b = norm(r);
    if (typeof a === "string" && typeof b === "string") {
      a = a.toLocaleLowerCase("tr-TR");
      b = b.toLocaleLowerCase("tr-TR");
    } else if (typeof a === "number" && b === "") b = 0;
    else if (typeof b === "number" && a === "") a = 0;
    else if (typeof a !== typeof b) return op === "<>";
    switch (op) {
      case "=": return a === b;
      case "<>": return a !== b;
      case "<": return (a as number) < (b as number);
      case ">": return (a as number) > (b as number);
      case "<=": return (a as number) <= (b as number);
      default: return (a as number) >= (b as number);
    }
  }

  function evalNode(node: Node, si: number): EvalValue {
    switch (node.k) {
      case "num":
      case "str":
      case "bool":
        return node.v;
      case "empty":
        return undefined;
      case "err":
        throw node.e;
      case "name":
        throw ERR.name();
      case "ref": {
        const target = resolveSheet(node.sheet, si);
        const a = node.a.replace(/\$/g, "").toUpperCase();
        if (node.b) return rangeValues(target, a, node.b.replace(/\$/g, "").toUpperCase(), node.kind);
        const v = value(target, a);
        if (isError(v)) throw v;
        return v;
      }
      case "neg":
        return -toNumber(single(evalNode(node.e, si)));
      case "pct":
        return toNumber(single(evalNode(node.e, si))) / 100;
      case "bin": {
        const l = single(evalNode(node.l, si));
        const r = single(evalNode(node.r, si));
        switch (node.op) {
          case "+": return toNumber(l) + toNumber(r);
          case "-": return toNumber(l) - toNumber(r);
          case "*": return toNumber(l) * toNumber(r);
          case "/": {
            const d = toNumber(r);
            if (d === 0) throw ERR.div0();
            return toNumber(l) / d;
          }
          case "^": return toNumber(l) ** toNumber(r);
          case "&": return toText(l) + toText(r);
          default: return compare(node.op, l, r);
        }
      }
      case "call": {
        const def = NAME_INDEX.get(node.name) || NAME_INDEX.get(node.name.replace(/\./g, "_"));
        if (!def) throw ERR.name();
        if (def.lazy) return def.fn(node.args, (n) => single(evalNode(n, si)));
        const args = node.args.map((n) => evalNode(n, si));
        return def.fn(args, () => null);
      }
      default:
        throw ERR.value();
    }
  }

  return { value };
}

/* ═══════════════════════════ REFERANS KAYDIRMA ═══════════════════════════ */

// Gruplar: 1 dizge · 2 sayfa öneki · 3-6 tam sütun ($A:$B) · 7-10 tam satır ($1:$5) · 11-14 hücre ($A$1).
const REF_IN_FORMULA =
  /("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*)!)?(?:(\$?)([A-Za-z]{1,2}):(\$?)([A-Za-z]{1,2})(?![\w(!])|(\$?)(\d{1,4}):(\$?)(\d{1,4})(?![\w(.!])|(\$?)([A-Za-z]{1,2})(\$?)(\d{1,4})(?![\w(]))/g;

interface RefEnd {
  abs: string;
  i: number;
}
type RefMatch =
  | { kind: "col" | "row"; match: string; prefix: string; sheet?: string; ends: [RefEnd, RefEnd] }
  | { kind: "cell"; match: string; prefix: string; sheet?: string; colAbs: string; rowAbs: string; c: number; r: number };

/** Formüldeki her başvuruyu fn ile dönüştürür; dizgeler olduğu gibi kalır. */
function mapRefs(formula: string, fn: (ref: RefMatch) => string): string {
  return formula.replace(
    REF_IN_FORMULA,
    (match, str, sheet, ca1, c1, ca2, c2, ra1, r1, ra2, r2, colAbs, col, rowAbs, row) => {
      if (str) return str;
      const prefix = sheet || "";
      if (c1) return fn({ kind: "col", match, prefix, sheet, ends: [{ abs: ca1, i: colIndex(c1) }, { abs: ca2, i: colIndex(c2) }] });
      if (r1) return fn({ kind: "row", match, prefix, sheet, ends: [{ abs: ra1, i: Number(r1) - 1 }, { abs: ra2, i: Number(r2) - 1 }] });
      return fn({ kind: "cell", match, prefix, sheet, colAbs, rowAbs, c: colIndex(col), r: Number(row) - 1 });
    }
  );
}

const fullText = (kind: "col" | "row", prefix: string, ends: RefEnd[]) =>
  `${prefix}${ends.map((e) => `${e.abs}${kind === "col" ? colName(e.i) : e.i + 1}`).join(":")}`;

/** Formülü kopyalarken göreli başvuruları kaydırır ($ olanlar sabit kalır). */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  return mapRefs(formula, (ref) => {
    if (ref.kind !== "cell") {
      const d = ref.kind === "col" ? dCol : dRow;
      const ends = ref.ends.map((e) => ({ abs: e.abs, i: e.abs ? e.i : e.i + d }));
      if (ends.some((e) => e.i < 0)) return "#BAŞV!";
      return fullText(ref.kind, ref.prefix, ends);
    }
    const c = ref.colAbs ? ref.c : ref.c + dCol;
    const r = ref.rowAbs ? ref.r : ref.r + dRow;
    if (c < 0 || r < 0) return "#BAŞV!";
    return `${ref.prefix}${ref.colAbs}${colName(c)}${ref.rowAbs}${r + 1}`;
  });
}

/**
 * Satır/sütun eklenip silinince formüllerdeki başvuruları günceller.
 * axis: "row" | "col", at: ilk etkilenen indeks, count: + ekleme / − silme.
 * Yalnız aynı sayfaya (ya da adıyla bu sayfaya) giden başvurular değişir.
 */
export function adjustFormula(
  formula: string,
  axis: "row" | "col",
  at: number,
  count: number,
  { sameSheet = true, sheetName = "" }: { sameSheet?: boolean; sheetName?: string } = {}
): string {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  const lower = sheetName.toLocaleLowerCase("tr-TR");
  return mapRefs(formula, (ref) => {
    const refSheet = ref.sheet ? ref.sheet.slice(0, -1).replace(/^'|'$/g, "").toLocaleLowerCase("tr-TR") : null;
    const affects = refSheet ? refSheet === lower : sameSheet;
    if (!affects) return ref.match;
    if (ref.kind !== "cell") {
      // Tam sütun/satır: yalnız kendi ekseni etkiler; silinen bölüm aralıktan düşülür.
      if ((ref.kind === "col") !== (axis === "col")) return ref.match;
      const [s, e] = ref.ends;
      let a = s.i;
      let b = e.i;
      if (count > 0) {
        if (a >= at) a += count;
        if (b >= at) b += count;
      } else {
        const gone = -count;
        const mapIdx = (idx: number, isEnd: boolean) => {
          if (idx < at) return idx;
          if (idx >= at + gone) return idx - gone;
          return isEnd ? at - 1 : at;
        };
        a = mapIdx(s.i, false);
        b = mapIdx(e.i, true);
        if (b < a) return "#BAŞV!";
      }
      return fullText(ref.kind, ref.prefix, [{ abs: s.abs, i: a }, { abs: e.abs, i: b }]);
    }
    let c = ref.c;
    let r = ref.r;
    const idx = axis === "row" ? r : c;
    let nextIdx = idx;
    if (count > 0 && idx >= at) nextIdx = idx + count;
    if (count < 0) {
      if (idx >= at && idx < at - count) return "#BAŞV!";
      if (idx >= at - count) nextIdx = idx + count;
    }
    if (axis === "row") r = nextIdx;
    else c = nextIdx;
    return `${ref.prefix}${ref.colAbs}${colName(c)}${ref.rowAbs}${r + 1}`;
  });
}

/* ═══════════════════════════════ BİÇİMLENDİRME ═══════════════════════════════ */

const fmtCache = new Map<string, Intl.NumberFormat>();
const nf = (digits: number, opts: Intl.NumberFormatOptions = {}) => {
  const key = `${digits}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits, ...opts });
    fmtCache.set(key, f);
  }
  return f;
};

/** Hücrede gösterilecek metin. style.f: general | number | money | percent | date | text */
export function formatValue(value: CellValue, style: CellStyle = {}): string {
  if (value == null) return "";
  if (isError(value)) return value.code;
  if (typeof value === "boolean") return value ? "DOĞRU" : "YANLIŞ";
  const f = style.f || "general";
  const dateVal = isDate(value);
  if (dateVal || (f === "date" && typeof value === "number")) {
    const serial = dateVal ? value.date : (value as number);
    const d = serialToDate(serial);
    return (
      d.toLocaleDateString("tr-TR", { timeZone: "UTC" }) +
      (serial % 1
        ? ` ${String(Math.floor((serial % 1) * 24)).padStart(2, "0")}:${String(Math.round(((serial % 1) * 1440) % 60)).padStart(2, "0")}`
        : "")
    );
  }
  if (typeof value === "number") {
    const d = style.d;
    if (f === "money") return `${nf(d ?? 2).format(value)} ₺`;
    if (f === "percent") return `%${nf(d ?? 0).format(value * 100)}`;
    if (f === "number") return nf(d ?? 2, { useGrouping: true }).format(value);
    if (d != null) return nf(d).format(value);
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return value.toExponential(4).replace(".", ",");
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 10, useGrouping: abs >= 10000 }).format(value);
  }
  return String(value);
}

export const isNumeric = (value: CellValue) => typeof value === "number" || isDate(value);

export interface RangeStats {
  count: number;
  numbers: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

/** Seçili aralığın durum çubuğu özeti. */
export function rangeStats(values: CellValue[]): RangeStats {
  const nums = values.filter((v): v is number => typeof v === "number");
  const filled = values.filter((v) => v != null && v !== "").length;
  const sum = nums.reduce((s, n) => s + n, 0);
  return {
    count: filled,
    numbers: nums.length,
    sum,
    avg: nums.length ? sum / nums.length : null,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
  };
}

/* ═══════════════════════════════════ CSV ═══════════════════════════════════ */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Noktalı virgül ayraçlı, BOM'lu CSV (Türkçe Excel doğrudan açar). */
export function toCsvText(rows: string[][]): string {
  return `﻿${rows
    .map((r) => r.map((v) => (/[";\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(";"))
    .join("\r\n")}`;
}

/* ═══════════════════════ ÇALIŞMA KİTABI İŞLEMLERİ ═══════════════════════
 * Her işlem yeni bir çalışma kitabı döner (değişmez); geri al / yinele bu
 * sayede basittir. */

export const MAX_ROWS = 1000;
export const MAX_COLS = 52;
export const MAX_SHEETS = 20;
export const DEFAULT_ROWS = 100;
export const DEFAULT_COLS = 26;

export const blankSheet = (name = "Sayfa1"): Sheet => ({ name, rows: DEFAULT_ROWS, cols: DEFAULT_COLS, cells: {}, colW: {} });
export const blankWorkbook = (): Workbook => ({ sheets: [blankSheet()] });

export interface Range {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

/** Seçimi (iki köşe) sıralı aralığa çevirir. */
export const normRange = (a: Pos, b: Pos = a): Range => ({
  r1: Math.min(a.row, b.row),
  r2: Math.max(a.row, b.row),
  c1: Math.min(a.col, b.col),
  c2: Math.max(a.col, b.col),
});

export const rangeLabel = ({ r1, r2, c1, c2 }: Range) =>
  r1 === r2 && c1 === c2 ? addr(c1, r1) : `${addr(c1, r1)}:${addr(c2, r2)}`;

export const eachCell = ({ r1, r2, c1, c2 }: Range, fn: (key: string, r: number, c: number) => void) => {
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) fn(addr(c, r), r, c);
};

const withSheet = (book: Workbook, si: number, fn: (s: Sheet) => Sheet): Workbook => ({
  ...book,
  sheets: book.sheets.map((s, i) => (i === si ? fn(s) : s)),
});

export interface CellPatch {
  v?: string;
  s?: CellStyle | null;
}

/** Hücrelerin değerini/biçimini yazar; v === "" ve biçim yoksa hücre silinir. */
export function writeCells(book: Workbook, si: number, updates: Record<string, CellPatch>): Workbook {
  return withSheet(book, si, (sheet) => {
    const cells = { ...sheet.cells };
    for (const [key, patch] of Object.entries(updates)) {
      const current = cells[key] || { v: "" };
      const next: { v?: string; s?: CellStyle | null } = { ...current, ...patch };
      if (patch.s !== undefined) next.s = patch.s && Object.keys(patch.s).length ? patch.s : undefined;
      if (!next.s) delete next.s;
      if ((next.v == null || next.v === "") && !next.s) delete cells[key];
      else cells[key] = { v: next.v ?? "", ...(next.s ? { s: next.s } : {}) };
    }
    return { ...sheet, cells };
  });
}

/** Aralıktaki hücrelerin biçimine yama uygular (ör. { b: true }); null değer anahtarı siler. */
export function styleRange(book: Workbook, si: number, range: Range, patch: Partial<Record<keyof CellStyle, unknown>>): Workbook {
  const sheet = book.sheets[si];
  const updates: Record<string, CellPatch> = {};
  eachCell(range, (key) => {
    const s: Record<string, unknown> = { ...(sheet.cells[key]?.s || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === false || v === "") delete s[k];
      else s[k] = v;
    }
    updates[key] = { s: s as CellStyle };
  });
  return writeCells(book, si, updates);
}

export function clearRange(book: Workbook, si: number, range: Range, { values = true, styles = false } = {}): Workbook {
  const updates: Record<string, CellPatch> = {};
  eachCell(range, (key) => {
    updates[key] = { ...(values ? { v: "" } : {}), ...(styles ? { s: null } : {}) };
  });
  return writeCells(book, si, updates);
}

export interface Block {
  rows: Cell[][];
  origin: Pos | null;
}

/** Kopyalanan blok: 2B dizi { v, s } ve kaynak sol üst köşesi. */
export function copyBlock(sheet: Sheet, range: Range): Block {
  const rows: Cell[][] = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const row: Cell[] = [];
    for (let c = range.c1; c <= range.c2; c += 1) {
      const cell = sheet.cells[addr(c, r)];
      row.push(cell ? { ...cell } : { v: "" });
    }
    rows.push(row);
  }
  return { rows, origin: { row: range.r1, col: range.c1 } };
}

/** Bloğu hedefe yapıştırır; formüller hedefe göre kaydırılır. Hedef aralık bloktan büyükse blok tekrarlanır. */
export function pasteBlock(book: Workbook, si: number, target: Range, block: Block, { valuesOnly = false } = {}): Workbook {
  const h = block.rows.length;
  const w = block.rows[0]?.length || 0;
  if (!h || !w) return book;
  const tr = target.r2 - target.r1 + 1;
  const tc = target.c2 - target.c1 + 1;
  const reps = { r: tr % h === 0 ? tr / h : 1, c: tc % w === 0 ? tc / w : 1 };
  const sheet = book.sheets[si];
  const updates: Record<string, CellPatch> = {};
  for (let rr = 0; rr < reps.r; rr += 1) {
    for (let cc = 0; cc < reps.c; cc += 1) {
      block.rows.forEach((row, i) =>
        row.forEach((cell, j) => {
          const r = target.r1 + rr * h + i;
          const c = target.c1 + cc * w + j;
          if (r >= sheet.rows || c >= sheet.cols) return;
          let v = cell.v ?? "";
          if (block.origin && !valuesOnly) v = shiftFormula(v, r - (block.origin.row + i), c - (block.origin.col + j));
          updates[addr(c, r)] = valuesOnly ? { v } : { v, s: cell.s || null };
        })
      );
    }
  }
  return writeCells(book, si, updates);
}

/** Panodan gelen düz metni (sekme/satır ayraçlı) bloğa çevirir. */
export const blockFromText = (text: string): Block => ({
  rows: text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t").map((v) => ({ v }))),
  origin: null,
});

export const blockToText = (block: Block) => block.rows.map((row) => row.map((c) => c.v ?? "").join("\t")).join("\n");

/** Aşağı / sağa doldurma: ilk satırı (sütunu) aralığa kaydırarak kopyalar. */
export function fill(book: Workbook, si: number, range: Range, direction: "down" | "right" = "down"): Workbook {
  const sheet = book.sheets[si];
  const updates: Record<string, CellPatch> = {};
  if (direction === "down") {
    for (let c = range.c1; c <= range.c2; c += 1) {
      const src = sheet.cells[addr(c, range.r1)] || { v: "" };
      for (let r = range.r1 + 1; r <= range.r2; r += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, r - range.r1, 0), s: src.s || null };
    }
  } else {
    for (let r = range.r1; r <= range.r2; r += 1) {
      const src = sheet.cells[addr(range.c1, r)] || { v: "" };
      for (let c = range.c1 + 1; c <= range.c2; c += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, 0, c - range.c1), s: src.s || null };
    }
  }
  return writeCells(book, si, updates);
}

/**
 * Satır/sütun ekleme (count > 0) ve silme (count < 0). Hücreler kayar, tüm
 * sayfalardaki formüllerin bu sayfaya giden başvuruları güncellenir.
 */
export function shiftAxis(book: Workbook, si: number, axis: "row" | "col", at: number, count: number): Workbook {
  const target = book.sheets[si];
  const sheets = book.sheets.map((sheet, index) => {
    const same = index === si;
    const cells: Record<string, Cell> = {};
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const pos = parseAddr(key);
      if (!pos) continue;
      let { row, col } = pos;
      if (same) {
        const idx = axis === "row" ? row : col;
        if (count < 0 && idx >= at && idx < at - count) continue;
        if (idx >= at) {
          if (axis === "row") row += count;
          else col += count;
        }
        const limit = axis === "row" ? MAX_ROWS : MAX_COLS;
        if ((axis === "row" ? row : col) >= limit) continue;
      }
      const v = adjustFormula(cell.v, axis, at, count, { sameSheet: same, sheetName: target.name });
      cells[addr(col, row)] = { ...cell, v };
    }
    if (!same) return { ...sheet, cells };
    const next: Sheet = { ...sheet, cells };
    if (axis === "row") next.rows = Math.min(MAX_ROWS, Math.max(1, sheet.rows + count));
    else {
      next.cols = Math.min(MAX_COLS, Math.max(1, sheet.cols + count));
      const colW: Record<string, number> = {};
      for (const [k, w] of Object.entries(sheet.colW || {})) {
        const i = colIndex(k);
        if (count < 0 && i >= at && i < at - count) continue;
        colW[colName(i >= at ? i + count : i)] = w;
      }
      next.colW = colW;
    }
    return next;
  });
  return { ...book, sheets };
}

/** Aralığı bir sütuna göre sıralar (değerler hesaplanmış sonuçlara göre). Boşlar sona gider. */
export function sortRange(
  book: Workbook,
  si: number,
  range: Range,
  byCol: number,
  ascending: boolean,
  valueOf: (key: string) => CellValue
): Workbook {
  const sheet = book.sheets[si];
  const rows: { r: number; cells: (Cell | null)[]; key: CellValue }[] = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const cells: (Cell | null)[] = [];
    for (let c = range.c1; c <= range.c2; c += 1) cells.push(sheet.cells[addr(c, r)] || null);
    rows.push({ r, cells, key: valueOf(addr(byCol, r)) });
  }
  const rank = (v: CellValue) => (v == null || v === "" ? 3 : isError(v) ? 2 : isNumeric(v) ? 0 : 1);
  const num = (v: CellValue) => (typeof v === "number" ? v : (v as DateValue).date);
  rows.sort((a, b) => {
    const ra = rank(a.key);
    const rb = rank(b.key);
    if (ra !== rb) return ra - rb;
    if (ra === 3 || ra === 2) return 0;
    const cmp = ra === 0 ? num(a.key) - num(b.key) : String(a.key).localeCompare(String(b.key), "tr", { sensitivity: "base", numeric: true });
    return ascending ? cmp : -cmp;
  });
  const updates: Record<string, CellPatch> = {};
  rows.forEach((row, i) => {
    const r = range.r1 + i;
    row.cells.forEach((cell, j) => {
      const c = range.c1 + j;
      updates[addr(c, r)] = cell ? { v: shiftFormula(cell.v, r - row.r, 0), s: cell.s || null } : { v: "", s: null };
    });
  });
  return writeCells(book, si, updates);
}

/** Dolu hücrelerin son satır/sütunu (CSV dışa aktarım için). */
export function usedBounds(sheet: Sheet) {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells)) {
    const p = parseAddr(key);
    if (!p) continue;
    rows = Math.max(rows, p.row + 1);
    cols = Math.max(cols, p.col + 1);
  }
  return { rows, cols };
}

export function uniqueSheetName(book: Workbook, base = "Sayfa") {
  const names = new Set(book.sheets.map((s) => s.name.toLocaleLowerCase("tr-TR")));
  let i = book.sheets.length + 1;
  while (names.has(`${base}${i}`.toLocaleLowerCase("tr-TR"))) i += 1;
  return `${base}${i}`;
}

/** Bir sayfa yeniden adlandırılınca diğer formüllerdeki 'Eski'!A1 başvuruları da güncellenir. */
export function renameSheet(book: Workbook, si: number, nextName: string): Workbook {
  const old = book.sheets[si].name;
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\w'])(?:'${esc}'|${/^[\wÇĞİÖŞÜçğıöşü]+$/.test(old) ? esc : "(?!)"})!`, "giu");
  const quoted = /^[\wÇĞİÖŞÜçğıöşü]+$/.test(nextName) ? nextName : `'${nextName.replace(/'/g, "")}'`;
  return {
    ...book,
    sheets: book.sheets.map((sheet, i) => {
      const cells: Record<string, Cell> = {};
      for (const [k, cell] of Object.entries(sheet.cells)) {
        cells[k] =
          typeof cell.v === "string" && cell.v.startsWith("=")
            ? { ...cell, v: cell.v.replace(re, (_m, pre: string) => `${pre}${quoted}!`) }
            : cell;
      }
      return { ...sheet, cells, ...(i === si ? { name: nextName } : {}) };
    }),
  };
}

/** Sayfa adını web'deki kurala göre temizler (yasak karakterler, 40 harf). */
export const cleanSheetName = (name: string) => name.trim().replace(/[!'[\]*?/\\:]/g, "").slice(0, 40);

/* ═══════════════════════════════ ŞABLONLAR ═══════════════════════════════ */

const H: CellStyle = { b: true, bg: "#ede9fe", al: "center" };
const cellsOf = (rows: (string | undefined)[][], styles: Record<string, CellStyle> = {}) => {
  const cells: Record<string, Cell> = {};
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === "" || v == null) return;
      const key = addr(c, r);
      cells[key] = { v: String(v), ...(styles[key] ? { s: styles[key] } : {}) };
    })
  );
  for (const [key, s] of Object.entries(styles)) if (!cells[key]) cells[key] = { v: "", s };
  return cells;
};
const headerStyles = (cols: number, row = 0, s: CellStyle = H) =>
  Object.fromEntries(Array.from({ length: cols }, (_, c) => [addr(c, row), s]));
const columnStyle = (col: number, r1: number, r2: number, s: CellStyle) =>
  Object.fromEntries(Array.from({ length: r2 - r1 + 1 }, (_, i) => [addr(col, r1 + i), s]));

export interface SheetTemplate {
  key: string;
  name: string;
  /** Ionicons adı. */
  icon: "document-outline" | "people-outline" | "wallet-outline" | "trophy-outline" | "checkbox-outline";
  description: string;
  build: () => Workbook;
}

export const TEMPLATES: SheetTemplate[] = [
  { key: "blank", name: "Boş tablo", icon: "document-outline", description: "Sıfırdan başlayın.", build: () => blankWorkbook() },
  {
    key: "dues", name: "Aidat takibi", icon: "people-outline", description: "Oyuncu başı aidat, ödenen ve kalan.",
    build: () => {
      const players = ["Ali Yılmaz", "Mehmet Kaya", "Can Demir", "Burak Şahin", "Emre Aydın", "Okan Çelik", "Serkan Arslan", "Kerem Öz"];
      const rows: string[][] = [["Oyuncu", "Aidat", "Ödenen", "Kalan", "Durum"]];
      players.forEach((p, i) => {
        const r = i + 2;
        rows.push([p, "300", i % 3 === 0 ? "150" : "300", `=B${r}-C${r}`, `=EĞER(D${r}<=0; "Ödendi"; "Bekliyor")`]);
      });
      const last = players.length + 1;
      rows.push(["Toplam", `=TOPLA(B2:B${last})`, `=TOPLA(C2:C${last})`, `=TOPLA(D2:D${last})`, `=EĞERSAY(E2:E${last}; "Ödendi")&" / ${players.length} ödedi"`]);
      const money: CellStyle = { f: "money" };
      const styles: Record<string, CellStyle> = { ...headerStyles(5), ...columnStyle(1, 1, last, money), ...columnStyle(2, 1, last, money), ...columnStyle(3, 1, last, money) };
      const t = last + 1;
      Object.assign(styles, {
        [`A${t}`]: { b: true },
        [`B${t}`]: { b: true, f: "money" },
        [`C${t}`]: { b: true, f: "money" },
        [`D${t}`]: { b: true, f: "money", c: "#be123c" },
        [`E${t}`]: { b: true },
      });
      return { sheets: [{ ...blankSheet("Aidatlar"), cells: cellsOf(rows, styles), colW: { A: 160, E: 150 } }] };
    },
  },
  {
    key: "budget", name: "Aylık bütçe", icon: "wallet-outline", description: "Gelir-gider kalemleri ve net sonuç.",
    build: () => {
      const rows: (string | undefined)[][] = [
        ["Kalem", "Tür", "Planlanan", "Gerçekleşen", "Fark"],
        ["Lig katılım ücretleri", "Gelir", "40000", "38500"],
        ["Sponsorluk", "Gelir", "25000", "25000"],
        ["Saha kirası", "Gider", "18000", "19200"],
        ["Hakem ücretleri", "Gider", "9600", "9600"],
        ["Ödüller", "Gider", "6000", "5400"],
        ["Yayın", "Gider", "4500", "4800"],
      ];
      for (let r = 2; r <= 7; r += 1) rows[r - 1][4] = `=D${r}-C${r}`;
      rows.push([]);
      rows.push(["Toplam gelir", "", '=ETOPLA(B2:B7; "Gelir"; C2:C7)', '=ETOPLA(B2:B7; "Gelir"; D2:D7)']);
      rows.push(["Toplam gider", "", '=ETOPLA(B2:B7; "Gider"; C2:C7)', '=ETOPLA(B2:B7; "Gider"; D2:D7)']);
      rows.push(["Net", "", "=C9-C10", "=D9-D10", "=D11-C11"]);
      const money: CellStyle = { f: "money" };
      const styles: Record<string, CellStyle> = { ...headerStyles(5) };
      for (let r = 1; r <= 10; r += 1) for (const c of [2, 3, 4]) styles[addr(c, r)] = money;
      for (const c of [0, 2, 3, 4]) styles[addr(c, 10)] = { b: true, ...(c ? { f: "money" as const } : {}), bg: "#dcfce7" };
      return { sheets: [{ ...blankSheet("Bütçe"), cells: cellsOf(rows, styles), colW: { A: 170 } }] };
    },
  },
  {
    key: "standings", name: "Puan tablosu", icon: "trophy-outline", description: "O-G-B-M, averaj ve puan hesaplı.",
    build: () => {
      const teams: (string | number)[][] = [
        ["Yıldız FK", 6, 4, 1, 1, 15, 7], ["Kartal SK", 6, 4, 0, 2, 12, 8], ["Anadolu Gücü", 6, 3, 2, 1, 11, 6],
        ["Boğaziçi", 6, 2, 1, 3, 9, 11], ["Çankaya SK", 6, 1, 2, 3, 7, 12], ["Mavi Şimşek", 6, 0, 2, 4, 5, 15],
      ];
      const rows: string[][] = [["Takım", "O", "G", "B", "M", "A", "Y", "AV", "Puan", "Sıra"]];
      teams.forEach((t, i) => {
        const r = i + 2;
        rows.push([...t.map(String), `=F${r}-G${r}`, `=C${r}*3+D${r}`, `=RANK(I${r}; I$2:I$7)`]);
      });
      const styles: Record<string, CellStyle> = { ...headerStyles(10, 0, { b: true, bg: "#dbeafe", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) {
        for (let c = 1; c <= 9; c += 1) styles[addr(c, r)] = { al: "center" };
        styles[addr(8, r)] = { al: "center", b: true };
      }
      return {
        sheets: [{ ...blankSheet("Puan Durumu"), cells: cellsOf(rows, styles), colW: { A: 150, B: 50, C: 50, D: 50, E: 50, F: 50, G: 50, H: 60, I: 70, J: 60 } }],
      };
    },
  },
  {
    key: "attendance", name: "Katılım listesi", icon: "checkbox-outline", description: "Maç maç katılım ve oran.",
    build: () => {
      const rows: string[][] = [["Oyuncu", "1. Hafta", "2. Hafta", "3. Hafta", "4. Hafta", "Katılım", "Oran"]];
      ["Ali", "Mehmet", "Can", "Burak", "Emre", "Okan"].forEach((p, i) => {
        const r = i + 2;
        const marks = ["Var", i % 2 ? "Yok" : "Var", "Var", i % 3 ? "Var" : "Yok"];
        rows.push([p, ...marks, `=EĞERSAY(B${r}:E${r}; "Var")`, `=F${r}/4`]);
      });
      const styles: Record<string, CellStyle> = { ...headerStyles(7, 0, { b: true, bg: "#fef3c7", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) styles[addr(6, r)] = { f: "percent", al: "center" };
      return { sheets: [{ ...blankSheet("Katılım"), cells: cellsOf(rows, styles), colW: { A: 140 } }] };
    },
  },
];

/* ═══════════════════════════ EŞZAMANLI DÜZENLEME ═══════════════════════════ */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Üç yollu birleştirme: base = son eşitlenen sürüm, mine = benim sürümüm,
 * theirs = sunucudaki güncel sürüm. Benim değiştirdiğim hücreler (ve sayfa
 * adı, sütun genişliği, boyut, dondurma) theirs'in üstüne uygulanır;
 * dokunmadıklarım theirs'ten gelir. Sayfalar sırayla eşleştirilir.
 */
export function mergeWorkbooks(base: Workbook, mine: Workbook, theirs: Workbook): Workbook {
  const out: Sheet[] = theirs.sheets.map((s) => ({ ...s, cells: { ...s.cells }, colW: { ...(s.colW || {}) } }));
  mine.sheets.forEach((m, i) => {
    const b = base.sheets[i];
    const t = out[i];
    if (!b || !t) {
      // Benim eklediğim sayfa: adı çakışıyorsa değiştirilir.
      const names = new Set(out.map((s) => s.name.toLocaleLowerCase("tr-TR")));
      let name = m.name;
      let n = 2;
      while (names.has(name.toLocaleLowerCase("tr-TR"))) {
        name = `${m.name.slice(0, 34)} (${n})`;
        n += 1;
      }
      out.push({ ...m, name });
      return;
    }
    const keys = new Set([...Object.keys(b.cells || {}), ...Object.keys(m.cells || {})]);
    for (const k of keys) {
      if (same(m.cells[k], b.cells[k])) continue;
      if (m.cells[k]) t.cells[k] = m.cells[k];
      else delete t.cells[k];
    }
    const wkeys = new Set([...Object.keys(b.colW || {}), ...Object.keys(m.colW || {})]);
    for (const k of wkeys) {
      if (same(m.colW?.[k], b.colW?.[k])) continue;
      if (m.colW?.[k]) t.colW[k] = m.colW[k];
      else delete t.colW[k];
    }
    if (m.name !== b.name) t.name = m.name;
    if (m.rows !== b.rows) t.rows = Math.max(t.rows, m.rows);
    if (m.cols !== b.cols) t.cols = Math.max(t.cols, m.cols);
    if (Boolean(m.freeze) !== Boolean(b.freeze)) t.freeze = Boolean(m.freeze);
  });
  return { sheets: out };
}

/** İki sürüm arasında içerik farkı var mı? */
export const workbooksDiffer = (a: Workbook, b: Workbook) => !same(a, b);

/** Sunucudan gelen veriyi güvenli çalışma kitabına çevirir (eksik alanlar doldurulur). */
export function normalizeWorkbook(raw: unknown): Workbook {
  const src = raw && typeof raw === "object" ? (raw as { sheets?: unknown }).sheets : null;
  if (!Array.isArray(src) || !src.length) return blankWorkbook();
  return {
    sheets: src.map((s, i) => {
      const sh = (s ?? {}) as Partial<Sheet>;
      return {
        name: String(sh.name || `Sayfa${i + 1}`),
        rows: Math.min(MAX_ROWS, Math.max(1, Number(sh.rows) || DEFAULT_ROWS)),
        cols: Math.min(MAX_COLS, Math.max(1, Number(sh.cols) || DEFAULT_COLS)),
        cells: sh.cells && typeof sh.cells === "object" ? sh.cells : {},
        colW: sh.colW && typeof sh.colW === "object" ? sh.colW : {},
        ...(sh.freeze ? { freeze: true } : {}),
      };
    }),
  };
}

/** Bir sayfanın hesaplanmış değerleriyle CSV metni (web exportCsv ile aynı kural). */
export function sheetToCsv(book: Workbook, si: number, evaluator: Evaluator = createEvaluator(book)): string {
  const sheet = book.sheets[si];
  const used = usedBounds(sheet);
  const rows: string[][] = [];
  for (let r = 0; r < used.rows; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < used.cols; c += 1) {
      const key = addr(c, r);
      const cell = sheet.cells[key];
      const v = cell ? evaluator.value(si, key) : null;
      row.push(typeof v === "number" && !cell?.s?.f ? String(v).replace(".", ",") : formatValue(v, cell?.s));
    }
    rows.push(row);
  }
  return toCsvText(rows);
}

/** CSV metninden tek sayfalık çalışma kitabı (web importCsv ile aynı). */
export function workbookFromCsv(text: string, name: string): Workbook {
  const rows = parseCsv(text).slice(0, MAX_ROWS);
  const cols = Math.min(MAX_COLS, Math.max(1, ...rows.map((r) => r.length)));
  const cells: Record<string, Cell> = {};
  rows.forEach((row, r) =>
    row.slice(0, cols).forEach((v, c) => {
      if (v !== "") cells[addr(c, r)] = { v: v.startsWith("=") ? `'${v}` : v };
    })
  );
  return {
    sheets: [{ ...blankSheet(name.slice(0, 40) || "Sayfa1"), rows: Math.min(MAX_ROWS, Math.max(100, rows.length + 20)), cols: Math.max(26, cols), cells }],
  };
}

/* ═══════════════════════════════ RENK PALETİ ═══════════════════════════════
 * Web düzenleyicisinin hücre yazı / dolgu renkleri. Boş dizge = renk yok. */

export const SHEET_TEXT_COLORS = ["", "#0f172a", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#4f46e5", "#9333ea", "#db2777", "#64748b"];
export const SHEET_FILL_COLORS = ["", "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#cffafe", "#dbeafe", "#ede9fe", "#fce7f3", "#e2e8f0", "#fde68a"];
/** Dolgulu (açık renkli) hücrede yazı rengi verilmemişse kullanılan mürekkep — koyu temada da okunur kalsın. */
export const SHEET_FILLED_INK = "#0f172a";

export const NUMBER_FORMATS: { key: NumberFormat; label: string }[] = [
  { key: "general", label: "Genel" },
  { key: "number", label: "Sayı (1.234,56)" },
  { key: "money", label: "Para (₺)" },
  { key: "percent", label: "Yüzde (%)" },
  { key: "date", label: "Tarih" },
  { key: "text", label: "Metin" },
];
