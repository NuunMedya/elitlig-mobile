/**
 * ContactFormSheet — kişisel kişi / cari kartı ekle-düzenle.
 *
 * İki kip (web ContactForm ile aynı):
 *   · Manuel kişi: ad, kurum, görev, telefon, e-posta, şehir, etiket, not, favori.
 *   · Üyeye bağlı kart (`member` verilir): iletişim üye kaydından canlı
 *     gelir; burada yalnız kişisel not, etiket ve favori tutulur.
 * Etiketler virgülle yazılır ("kaleci, hakem"); sunucu tekilleştirir.
 */

import React from "react";

import { FormSheet, confirmAction, useAdminMutation, type FieldDef, type FormValues } from "@/components/admin";
import {
  createContact,
  deleteContact,
  updateContact,
  type ContactInput,
  type PersonalContact,
} from "@/lib/api/admin/contacts";

export interface ContactFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Düzenlenen kart; yoksa yeni. */
  contact: PersonalContact | null;
  /** Üyeye bağlı kart için üye. */
  member?: { id: number; name: string } | null;
  /** Etiket önerisi için mevcut etiketler. */
  knownTags?: string[];
  onSaved?: (item: PersonalContact) => void;
  onDeleted?: () => void;
}

const splitTags = (value: unknown) =>
  String(value ?? "")
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, i, list) => list.indexOf(t) === i)
    .slice(0, 20);

export function ContactFormSheet({ visible, onClose, contact, member, knownTags, onSaved, onDeleted }: ContactFormSheetProps) {
  const linked = Boolean(member);
  const editing = Boolean(contact?.id);

  const save = useAdminMutation(
    (values: FormValues) => {
      const tags = splitTags(values.tags);
      const payload: ContactInput = linked
        ? { name: member!.name, tags, note: String(values.note ?? ""), favorite: Boolean(values.favorite), member_user_id: member!.id }
        : {
            name: String(values.name ?? "").trim(),
            company: String(values.company ?? ""),
            title: String(values.title ?? ""),
            phone: String(values.phone ?? ""),
            email: String(values.email ?? ""),
            city: String(values.city ?? ""),
            tags,
            note: String(values.note ?? ""),
            favorite: Boolean(values.favorite),
          };
      return editing ? updateContact(contact!.id, payload) : createContact(payload);
    },
    {
      success: () => (editing ? "Kaydedildi." : linked ? "Not kaydedildi." : "Kişi eklendi."),
      invalidate: [["admin", "contacts"]],
      onSuccess: (res) => onSaved?.(res.item),
      silentError: true,
    }
  );

  const remove = useAdminMutation((id: number) => deleteContact(id), {
    success: "Silindi.",
    invalidate: [["admin", "contacts"]],
    onSuccess: () => {
      onClose();
      onDeleted?.();
    },
  });

  const askDelete = async () => {
    if (!contact) return;
    const ok = await confirmAction({
      title: linked ? "Not silinsin mi?" : "Kişi silinsin mi?",
      message: linked ? "Bu üyeye eklediğin not, etiket ve favori silinir." : `${contact.name} rehberden silinir.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(contact.id);
  };

  const tagHint = knownTags?.length ? `Virgülle ayır. Kullandıkların: ${knownTags.slice(0, 8).join(", ")}` : "Virgülle ayır: kaleci, hakem, sponsor";

  const fields: FieldDef[] = linked
    ? [
        { key: "tags", label: "Etiketler", kind: "text", hint: tagHint, placeholder: "Kaleci, hakem…" },
        { key: "note", label: "Kişisel not", kind: "multiline", placeholder: "Ör. Pazar maçlarına gelemiyor, aidatı eksik…" },
        { key: "favorite", label: "Favori", kind: "toggle", hint: "Favoriler Kişilerim'de üstte görünür." },
      ]
    : [
        { key: "name", label: "Ad soyad", kind: "text", required: true, maxLength: 120 },
        { key: "company", label: "Kurum / takım", kind: "text", maxLength: 120 },
        { key: "title", label: "Görevi", kind: "text", placeholder: "Ör. Saha müdürü, sponsor", maxLength: 120 },
        { key: "phone", label: "Telefon", kind: "phone", placeholder: "0555 123 45 67", maxLength: 40 },
        { key: "email", label: "E-posta", kind: "email", maxLength: 160 },
        { key: "city", label: "Şehir", kind: "text", maxLength: 60 },
        { key: "tags", label: "Etiketler", kind: "text", hint: tagHint, placeholder: "Kaleci, hakem…" },
        { key: "note", label: "Not", kind: "multiline" },
        { key: "favorite", label: "Favori", kind: "toggle" },
      ];

  const initial: FormValues = contact
    ? { ...contact, tags: (contact.tags || []).join(", "), note: contact.note ?? "" }
    : { name: member?.name ?? "", favorite: false };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={linked ? `${member!.name} · kişisel not` : editing ? "Kişiyi düzenle" : "Yeni kişi"}
      intro={linked ? "İletişim bilgileri üye kaydından canlı gelir. Buraya yalnız sana özel not, etiket ve favori kaydedilir." : undefined}
      fields={fields}
      initial={initial}
      onSubmit={(values) => save.mutateAsync(values)}
      secondary={editing ? { label: linked ? "Notu sil" : "Sil", onPress: askDelete, danger: true } : undefined}
      snap="full"
    />
  );
}
