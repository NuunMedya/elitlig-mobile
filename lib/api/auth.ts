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

/** Kayıt gövdesi — routes/User.js POST /register. Telefon isteğe bağlıdır. */
export interface RegisterInput {
  username: string;
  password: string;
  fullName: string;
  email: string;
  phone?: string;
  city: string;
}

/**
 * Üye kaydı. Sunucu hesabı onay beklemeden açar ve giriş yanıtıyla aynı
 * biçimde jeton + kullanıcı döndürür; bu yüzden kayıt biter bitmez oturum
 * kurulur (App Store 4: kayıt uygulama içinde, tarayıcıya yönlendirme yok).
 */
export const register = (input: RegisterInput) =>
  post<LoginResponse & { message?: string }>("/api/users/register", input);

/** Açılışta saklı jetonun hâlâ geçerli olduğunu doğrular. */
export const verifySession = () =>
  get<{ user: AuthUser }>("/api/users/verify", undefined, { retry: false }).then((data) => data.user);

export const logout = () => post<{ message: string }>("/api/users/logout");
