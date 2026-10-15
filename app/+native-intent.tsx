/**
 * Sistemden gelen bağlantıların ilk durağı (expo-router "native intent").
 * elitlig.com adresleri uygulama rotalarına çevrilir: lib/webPaths.ts.
 */
import { webPathToAppPath } from "@/lib/webPaths";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return webPathToAppPath(path);
}
