/**
 * Tahta geometrisi — dolapların yerleri hesaplanır (ölçüm yok): uçuş
 * animasyonu ve rozet uçuşu aynı sayılardan beslenir, onLayout beklemez.
 */
import { space } from "@/theme";

export interface BoardGeometry {
  width: number;
  height: number;
  colW: number;
  slotH: number;
  pad: number;
  headerH: number;
  liftReserve: number;
  rowH: number;
  maxCap: number;
  /** Dolabın sol üst köşesi (satırın kaldırma payı dahil). */
  rackX: number[];
  rackY: number[];
}

interface RowPlan {
  rows: number;
  perRow: number;
  gap: number;
  colW: number;
  slotH: number;
  headerH: number;
  /** Formanın ekranda çizileceği etkin genişlik (sıralama ölçütü). */
  eff: number;
}

const PAD = space.xs;
const ROW_GAP = space.md;
const MIN_COL = 36;
const MAX_COL = 112;
const header = (colW: number) => Math.min(28, Math.round(colW * 0.32));

/** Verilen satır sayısıyla en büyük yuva: genişlik VE yükseklik sınırı. */
function plan(n: number, maxCap: number, rows: number, maxWidth: number, maxHeight: number): RowPlan {
  const perRow = Math.ceil(n / rows);
  const gap = perRow >= 7 ? space.s : space.sm;
  let colW = Math.max(MIN_COL, Math.min(MAX_COL, Math.floor((maxWidth - gap * (perRow - 1)) / perRow)));
  // Satır yüksekliği = (kapasite + 1 kaldırma payı) × yuva + başlık + iç pay.
  const perRowH = (maxHeight - (rows - 1) * ROW_GAP) / rows;
  const slotFor = (cw: number) => Math.floor((perRowH - space.sm - header(cw) - PAD * 2) / (maxCap + 1));
  let slotH = Math.min(slotFor(colW), Math.round((colW - PAD * 2) * 1.2));
  if (slotH < (colW - PAD * 2) * 0.8) {
    // Yükseklik dar: sütunu forma oranına çek (dolap orantılı kalsın).
    colW = Math.max(MIN_COL, Math.min(colW, Math.floor(slotH / 0.8) + PAD * 2));
    slotH = Math.min(slotFor(colW), Math.round((colW - PAD * 2) * 1.2));
  }
  slotH = Math.max(20, slotH);
  const jW = colW - PAD * 2;
  // Forma 52×46 kutuda "meet" ile çizilir: genişlik ya da yükseklik sınırlar.
  const eff = Math.min(jW, slotH * (52 / 46));
  return { rows, perRow, gap, colW, slotH, headerH: header(colW), eff };
}

/**
 * Dolap yerleşimi: hem genişliğe hem YÜKSEKLİĞE göre en büyük yuva seçilir.
 * Satır sayısı (1–3) formaları en büyük çizen seçenektir; artan dikey alan
 * satır arasına ve ortalamaya dağılır. `maxHeight` verilmezse eski davranış
 * (yalnız genişlik) korunur.
 */
export function computeGeometry(caps: number[], maxWidth: number, maxHeight = 0): BoardGeometry {
  const n = caps.length;
  const maxCap = Math.max(...caps);
  const H = maxHeight > 0 ? maxHeight : 10_000;
  const options = n <= 3 ? [1] : n <= 6 ? [1, 2] : n <= 9 ? [2, 3] : [2, 3];
  let best = plan(n, maxCap, options[0], maxWidth, H);
  for (const r of options.slice(1)) {
    const c = plan(n, maxCap, r, maxWidth, H);
    if (c.eff > best.eff + 1) best = c;
  }
  if (maxHeight <= 0) {
    // Yalnız genişlik: eski oranlar.
    best.slotH = Math.round((best.colW - PAD * 2) * 0.8);
  }
  const { rows, perRow, gap, colW, slotH, headerH } = best;
  const liftReserve = slotH + space.sm;
  const rowH = liftReserve + headerH + maxCap * slotH + PAD * 2;
  const used = rows * rowH + (rows - 1) * ROW_GAP;
  const spare = maxHeight > 0 ? Math.max(0, maxHeight - used) : 0;
  const rowGap = rows > 1 ? ROW_GAP + Math.min(space.xxxl, spare / (rows + 1)) : ROW_GAP;
  const height = rows * rowH + (rows - 1) * rowGap;
  const rackX: number[] = [];
  const rackY: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    const start = r * perRow;
    const count = Math.min(perRow, n - start);
    const rowW = count * colW + (count - 1) * gap;
    const left = (maxWidth - rowW) / 2;
    for (let c = 0; c < count; c += 1) {
      rackX.push(left + c * (colW + gap));
      rackY.push(r * (rowH + rowGap));
    }
  }
  return {
    width: maxWidth,
    height,
    colW,
    slotH,
    pad: PAD,
    headerH,
    liftReserve,
    rowH,
    maxCap,
    rackX,
    rackY,
  };
}

/** Dolabın yerel koordinatında j. yuvanın (alttan) üst kenarı. */
export function slotTop(g: BoardGeometry, j: number): number {
  return g.rowH - g.pad - (j + 1) * g.slotH;
}

/** Dolabın gövdesinin (başlık dahil) yerel üst kenarı — kapasiteye göre. */
export function bodyTop(g: BoardGeometry, cap: number): number {
  return g.rowH - g.pad * 2 - cap * g.slotH - g.headerH;
}

/** Seçilen grubun kalkma miktarı: grubun en üstü kaldırma payına çıkar. */
export function liftOffset(g: BoardGeometry, topIndex: number): number {
  return space.xs - slotTop(g, topIndex);
}
