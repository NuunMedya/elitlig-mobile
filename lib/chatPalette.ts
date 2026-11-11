/**
 * SOHBET PALETİ — WhatsApp düzenindeki mesaj ekranının tema tokenı OLMAYAN
 * renkleri (duvar kâğıdı, balonlar, okundu tiki, gönderen adı renkleri).
 *
 * Değerler masaüstü Mesajlar (elitlig-mac renderer/src/views/messages/messages.css
 * `--ms-*`) ile aynıdır; üç istemci aynı balonu çizer. `app/` ve `components/`
 * altında çıplak hex yasak olduğu için hepsi burada durur. Tema, modül
 * yüklenirken donduğundan (`theme/index.ts`) seçim bir kez yapılır.
 */

import { isDark } from "@/theme";

export const chatPalette = isDark
  ? {
      wall: "#100E17",
      wallPattern: "rgba(255,255,255,0.035)",
      bubbleMine: "#0F5A4A",
      bubbleTheirs: "#252134",
      bubbleText: "#E9EDEF",
      bubbleMeta: "rgba(233,237,239,0.62)",
      bubbleBorder: "rgba(255,255,255,0.06)",
      quoteMine: "rgba(0,0,0,0.22)",
      quoteTheirs: "rgba(255,255,255,0.07)",
      tickRead: "#53BDEB",
      tickSent: "rgba(233,237,239,0.62)",
      link: "#7CC7F5",
      mention: "#7CC7F5",
      dayPill: "#1F1B2C",
      dayText: "rgba(233,237,239,0.7)",
      systemPill: "#1F1B2C",
      highlight: "rgba(124,199,245,0.22)",
      waveIdle: "rgba(233,237,239,0.32)",
      waveActive: "#53BDEB",
      voiceMine: "#7DE3C5",
      viewerBg: "#000000",
      viewerText: "#FFFFFF",
      viewerMuted: "rgba(255,255,255,0.7)",
      viewerChrome: "rgba(0,0,0,0.55)",
    }
  : {
      wall: "#EFEAE2",
      wallPattern: "rgba(84,70,50,0.07)",
      bubbleMine: "#D9FDD3",
      bubbleTheirs: "#FFFFFF",
      bubbleText: "#111B21",
      bubbleMeta: "rgba(17,27,33,0.56)",
      bubbleBorder: "rgba(17,27,33,0.06)",
      quoteMine: "rgba(17,27,33,0.07)",
      quoteTheirs: "rgba(17,27,33,0.05)",
      tickRead: "#53BDEB",
      tickSent: "rgba(17,27,33,0.48)",
      link: "#027EB5",
      mention: "#027EB5",
      dayPill: "#FFFFFF",
      dayText: "rgba(17,27,33,0.62)",
      systemPill: "#FFF5C4",
      highlight: "rgba(2,126,181,0.16)",
      waveIdle: "rgba(17,27,33,0.26)",
      waveActive: "#027EB5",
      voiceMine: "#1FA855",
      viewerBg: "#000000",
      viewerText: "#FFFFFF",
      viewerMuted: "rgba(255,255,255,0.7)",
      viewerChrome: "rgba(0,0,0,0.55)",
    };

/** Grup sohbetinde gönderen adı renkleri (masaüstü NAME_COLORS; koyuda açık tonları). */
const NAME_COLORS = isDark
  ? ["#FB7185", "#C4B5FD", "#7DD3FC", "#6EE7B7", "#FCD34D", "#F0ABFC", "#5EEAD4", "#A5B4FC", "#FDBA74", "#86EFAC"]
  : ["#E11D48", "#7C3AED", "#0284C7", "#059669", "#B45309", "#C026D3", "#0D9488", "#4F46E5", "#C2410C", "#15803D"];

export function senderColor(id: number | string | null | undefined): string {
  const n = Math.abs(Number(id) || String(id ?? "").length);
  return NAME_COLORS[n % NAME_COLORS.length];
}

/** Ek menüsündeki renkli daireler (WhatsApp "+" ızgarası). */
export const attachTones = {
  photo: "#BF59CF",
  camera: "#EC407A",
  video: "#7F66FF",
  doc: "#5157AE",
  poll: "#02A698",
  location: "#1FA855",
  matches: "#0EA5E9",
  signup: "#F59E0B",
  award: "#D97706",
  onTone: "#FFFFFF",
} as const;
