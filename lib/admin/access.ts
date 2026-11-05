import type { AuthUser } from "../types";

/**
 * YETKİ YARDIMCILARI — web ProtectedRoute / hasAnyPermission ile aynı kural.
 *
 * Süzme yalnız GÖRÜNÜRLÜK içindir; asıl denetim sunucudadır (403). Admin
 * rolü her şeyi görür; `permissions` dizisinden birine sahip olmak yeterlidir.
 */

export function hasAnyPermission(user: AuthUser | null | undefined, permissions?: readonly string[] | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!permissions || permissions.length === 0) return true;
  const granted = new Set(user.permissions ?? []);
  return permissions.some((key) => granted.has(key));
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  return hasAnyPermission(user, [permission]);
}

export function hasRole(user: AuthUser | null | undefined, roles: readonly string[]): boolean {
  return Boolean(user && roles.includes(user.role));
}
