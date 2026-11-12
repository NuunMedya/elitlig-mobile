import type { ReactNode } from "react";
import { SHARE_FORMATS, unitFor, type ShareFormat, type Unit } from "@/lib/share/canvas";
import type { ShareTheme } from "@/lib/share/palette";

/** Bir şablonun çizildiği tuvalin her şeyi: boy, birim, renk. */
export interface ShareFrame {
  fmt: ShareFormat;
  story: boolean;
  /** Piksel (dp) genişlik / yükseklik. */
  W: number;
  H: number;
  u: Unit;
  t: ShareTheme;
}

export interface ShareTemplateDef {
  key: string;
  /** Küçük resmin altındaki ad ("Sade", "Golcüler"…). */
  label: string;
  render: (frame: ShareFrame) => ReactNode;
}

export function makeFrame(fmt: ShareFormat, width: number, t: ShareTheme): ShareFrame {
  const [uw, uh] = SHARE_FORMATS[fmt].units;
  return { fmt, story: fmt === "story", W: width, H: (width * uh) / uw, u: unitFor(width), t };
}
