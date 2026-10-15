/**
 * Forma rengi paleti — forma renkleri alan verisidir, tasarım tokenı değildir
 * (bkz. scripts/check-tokens.mjs HEX_ALLOWED gerekçesi). Web KitEditor ile
 * aynı varsayılanlar.
 */
export const KIT_DEFAULTS = { primary: "#16a36a", secondary: "#ffffff", accent: "#0f172a" } as const;

export type KitKey = keyof typeof KIT_DEFAULTS;
export type Kit = Partial<Record<KitKey, string>>;

/** Amatör liglerde en sık görülen forma renkleri. */
export const KIT_SWATCHES = [
  "#ffffff", "#0f172a", "#dc2626", "#b91c1c", "#f97316", "#facc15",
  "#16a36a", "#15803d", "#2563eb", "#1e3a8a", "#38bdf8", "#7c3aed",
  "#9f1239", "#78350f", "#6b7280", "#ec4899",
] as const;

export const isHex = (value: unknown): value is string => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value ?? ""));
