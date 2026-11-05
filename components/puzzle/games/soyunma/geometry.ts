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

export function computeGeometry(caps: number[], maxWidth: number): BoardGeometry {
  const n = caps.length;
  const rows = n <= 6 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const gap = perRow >= 7 ? space.s : space.sm;
  const colW = Math.max(40, Math.min(76, Math.floor((maxWidth - gap * (perRow - 1)) / perRow)));
  const pad = space.xs;
  const slotH = Math.round((colW - pad * 2) * 0.8);
  const headerH = Math.round(colW * 0.32);
  const maxCap = Math.max(...caps);
  const liftReserve = slotH + space.sm;
  const rowH = liftReserve + headerH + maxCap * slotH + pad * 2;
  const rowGap = space.md;
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
    height: rows * rowH + (rows - 1) * rowGap,
    colW,
    slotH,
    pad,
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
