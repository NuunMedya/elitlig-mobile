/** Dosya adı: "elitlig-mac-sonucu-11192-story" (Türkçe harfler sadeleşir). */
export function shareFileName(...parts: (string | number | null | undefined)[]): string {
  const fold: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return ["elitlig", ...parts]
    .filter((part) => part != null && String(part).trim() !== "")
    .map((part) =>
      String(part)
        .toLocaleLowerCase("tr-TR")
        .replace(/[çğıİöşü]/g, (ch) => fold[ch] ?? ch)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("-")
    .slice(0, 80);
}
