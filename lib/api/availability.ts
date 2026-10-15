import { get, put } from "../http";

/**
 * Takım müsaitlik takvimi — routes/teamAvailability.js
 * (services/teamAvailabilityService.js).
 *
 * Her saha için bir TERCİH (yes: oynarız · maybe: zorda kalırsak · no: uymaz)
 * ve oynanabilir sahalarda haftalık SAAT tablosu. Hücre anahtarı
 * "<gün 1..7>:<SS>:<DD>"; işaretsiz hücre "uygun değil" sayılır.
 * `submit: true` takvimi yönetime gönderir (yönetim kutusuna kart düşer).
 */

export type Preference = "yes" | "maybe" | "no";
export type SlotState = "yes" | "maybe";

export interface AvailabilityVenue {
  id: number;
  name: string;
  location: string;
  city: string;
  open_label: string;
  close_label: string;
  preference: Preference | null;
  slots: Record<string, SlotState>;
  submitted_at: string | null;
  weekly: {
    days: { weekday: number; label: string }[];
    times: { hour: number; minute: number; label: string; key: string }[];
  };
}

export interface AvailabilityResponse {
  team: { id: number; name: string } | null;
  venues: AvailabilityVenue[];
  submitted_at: string | null;
}

export const getMyAvailability = () => get<AvailabilityResponse>("/api/team-availability/mine");

export const saveMyAvailability = (body: {
  venues: { venue_id: number; preference: Preference | null; slots: Record<string, SlotState> }[];
  submit?: boolean;
}) => put<{ message: string; submitted_at: string | null }>("/api/team-availability/mine", body);
