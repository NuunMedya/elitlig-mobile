import { get, post } from "../http";
import type { AuthUser, LoginResponse } from "../types";

/**
 * Oturum uçları — routes/User.js
 *
 * Sunucu hem httpOnly çerez hem de gövdede jeton döndürür. Mobilde çerez
 * taşınmadığı için jeton güvenli depoya yazılır ve her istekte Authorization
 * başlığıyla gönderilir.
 */

export const login = (username: string, password: string) =>
  post<LoginResponse>("/api/users/login", { username, password });

/** Açılışta saklı jetonun hâlâ geçerli olduğunu doğrular. */
export const verifySession = () =>
  get<{ user: AuthUser }>("/api/users/verify", undefined, { retry: false }).then((data) => data.user);

export const logout = () => post<{ message: string }>("/api/users/logout");
