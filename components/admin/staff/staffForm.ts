/**
 * Personel ekle / düzenle formu — liste ve ayrıntı ekranı ortak kullanır.
 * Alanlar web StaffManagement.js formuyla aynıdır.
 */

import type { FieldDef, FormValues } from "@/components/admin";
import type { StaffPayload } from "@/lib/api/admin/staff";

/** Ekle / düzenle formunun alanları — ayrıntı ekranı da kullanır. */
export function staffFields({
  duties,
  linkable,
  cities,
  editing,
}: {
  duties: { key: string; label: string }[];
  linkable: { id: number; name: string; city: string | null }[];
  cities: { id: number; label: string }[] | null;
  editing: boolean;
}): FieldDef[] {
  const fields: FieldDef[] = [
    { key: "fullName", label: "Ad soyad", kind: "text", required: true, placeholder: "Örn. Berke Yazıcı" },
    {
      key: "duties",
      label: "Görevler",
      kind: "multiselect",
      hint: "Bir kişi birden fazla görev yapabilir: hem spiker hem reji gibi.",
      options: duties.map((d) => ({ value: d.key, label: d.label })),
    },
    { key: "phone", label: "Telefon", kind: "phone", placeholder: "05xx xxx xx xx" },
    { key: "email", label: "E-posta", kind: "email" },
    { key: "notes", label: "Not", kind: "multiline", placeholder: "Ör. hafta içi akşamları müsait" },
  ];
  if (cities) {
    fields.push({
      key: "cityId",
      label: "İl",
      kind: "select",
      clearable: true,
      placeholder: "İl seçilmedi",
      hint: "Görevlendirme ekranlarında kişi yalnız kendi ilinin maçlarında listelenir.",
      options: cities.map((c) => ({ value: c.id, label: c.label })),
    });
  }
  fields.push({
    key: "userId",
    label: "Yönetim hesabı",
    kind: "select",
    clearable: true,
    placeholder: "Otomatik (ad soyad eşleşmesi)",
    hint: "Kişinin zaten bir panel hesabı varsa buradan bağla.",
    options: linkable.map((u) => ({ value: u.id, label: u.name, hint: u.city })),
  });
  if (editing) {
    fields.push({ key: "passive", label: "Pasif", kind: "toggle", hint: "Pasif personel görevlendirme listelerinde görünmez." });
  }
  return fields;
}

export function payloadFrom(v: FormValues, nationwide: boolean): StaffPayload {
  const body: StaffPayload = {
    fullName: String(v.fullName ?? "").trim(),
    duties: Array.isArray(v.duties) ? (v.duties as string[]) : [],
    phone: String(v.phone ?? ""),
    email: String(v.email ?? ""),
    notes: String(v.notes ?? ""),
    userId: v.userId ? Number(v.userId) : null,
  };
  if ("passive" in v) body.status = v.passive ? "passive" : "active";
  // İl yalnız Türkiye geneli yöneticide seçilir; il kısıtlı yönetici kendi iline yazar.
  if (nationwide) body.cityId = v.cityId ? Number(v.cityId) : null;
  return body;
}

