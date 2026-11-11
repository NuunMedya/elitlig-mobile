/**
 * ARAÇLAR → REHBER (web /yonetim/araclar/rehber — Contacts.js + RehberTeams.js)
 *
 * Üç bölüm, tek ekran:
 *   TAKIMLAR  : takım bazlı rehber; takım adı öne çıkar, başkana tek dokunuşla
 *               ulaşılır. Takım kartı ayrı ekranda (takim/[id]).
 *   ÜYELER    : siteye kayıtlı üyeler (users.view + il kapsamı), sunucu
 *               süzgeçli ve sayfalı. Üye kartı ayrı ekranda (uye/[id]).
 *   KİŞİLERİM : kişisel kişi / cari kartları (CRUD) ve üyelere eklenen notlar.
 *
 * NEDEN ÜYELER AYRI SEKME: web üyeleri ve manuel kayıtları tek listede
 * birleştiriyor; telefonda iki kaynağın sayfalanması ve sayaçları karışık
 * görünüyordu. Ayrı sekme her listeyi kendi süzgeciyle sade tutar.
 *
 * Takımlar ve Üyeler "Üyeleri görüntüleme" yetkisi ister; yetkisi olmayan
 * doğrudan Kişilerim'i görür, diğer sekmeler kilit açıklaması gösterir.
 * Bölüm tercihi cihazda saklanır (web localStorage karşılığı).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ActionSheet, AdminScreen } from "@/components/admin";
import { ToolFab } from "@/components/admin/tools/ToolApp";
import { MembersTab, type MembersTabHandle } from "@/components/admin/contacts/MembersTab";
import { MyContactsTab, type MyContactsTabHandle } from "@/components/admin/contacts/MyContactsTab";
import { TeamsTab } from "@/components/admin/contacts/TeamsTab";
import { useContactActions } from "@/components/admin/contacts/useContactActions";
import { EmptyState, SegmentedControl, type SegmentedItem } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { listContacts, type PersonalContact } from "@/lib/api/admin/contacts";
import { useAuth } from "@/providers/AuthProvider";
import { layout, space } from "@/theme";

type View3 = "takimlar" | "uyeler" | "kisiler";
const VIEW_KEY = "elitlig:rehber-view";

const VIEWS: SegmentedItem<View3>[] = [
  { key: "takimlar", label: "Takımlar", icon: "shield-half-outline" },
  { key: "uyeler", label: "Üyeler", icon: "people-outline" },
  { key: "kisiler", label: "Kişilerim", icon: "person-outline" },
];

export default function ContactsScreen() {
  const auth = useAuth();
  const actions = useContactActions();
  const memberAccess = hasAnyPermission(auth.user, ["users.view"]);
  const [view, setView] = useState<View3>(memberAccess ? "takimlar" : "kisiler");
  const [exportOpen, setExportOpen] = useState(false);
  const membersRef = useRef<MembersTabHandle>(null);
  const mineRef = useRef<MyContactsTabHandle>(null);

  useEffect(() => {
    void AsyncStorage.getItem(VIEW_KEY)
      .then((saved) => {
        if (saved === "takimlar" || saved === "uyeler" || saved === "kisiler") setView(saved);
      })
      .catch(() => undefined);
  }, []);

  const changeView = (next: View3) => {
    setView(next);
    void AsyncStorage.setItem(VIEW_KEY, next).catch(() => undefined);
  };

  // Kişisel kartlar her sekmede gerekir (üye satırındaki favori, Kişilerim).
  const contacts = useQuery({ queryKey: ["admin", "contacts", "mine"], queryFn: listContacts });
  const cards = useMemo(() => {
    const map = new Map<number, PersonalContact>();
    (contacts.data?.items ?? []).forEach((c) => {
      if (c.member_user_id) map.set(Number(c.member_user_id), c);
    });
    return map;
  }, [contacts.data]);

  const runExport = (kind: "csv" | "vcf" | "phones" | "emails") => {
    if (view === "uyeler") void membersRef.current?.exportAs(kind);
    else void mineRef.current?.exportAs(kind);
  };

  const locked = !memberAccess && view !== "kisiler";

  return (
    <AdminScreen
      app="rehber"
      title="Rehber"
      subtitle="Takımlar, üyeler ve kişilerin"
      scroll={false}
      actions={
        view !== "takimlar" && !locked
          ? [{ icon: "share-outline", onPress: () => setExportOpen(true), accessibilityLabel: "Dışa aktar" }]
          : undefined
      }
      bottom={
        <View style={styles.segment}>
          <SegmentedControl items={VIEWS} value={view} onChange={changeView} size="sm" />
        </View>
      }
      overlay={
        view === "kisiler" ? (
          <ToolFab app="rehber" icon="person-add" label="Yeni kişi" onPress={() => mineRef.current?.create()} accessibilityLabel="Yeni kişi" />
        ) : null
      }
    >
      {locked ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Üye rehberi için yetki gerekir"
          body={'Takımları ve site üyelerini rehberde görmek için "Üyeleri görüntüleme" yetkisi gerekir. Şimdilik yalnız kendi kişilerin görünüyor.'}
          action={{ label: "Kişilerime git", onPress: () => changeView("kisiler") }}
        />
      ) : view === "takimlar" ? (
        <TeamsTab actions={actions} />
      ) : view === "uyeler" ? (
        <MembersTab ref={membersRef} actions={actions} cards={cards} />
      ) : (
        <MyContactsTab ref={mineRef} actions={actions} query={contacts} memberAccess={memberAccess} />
      )}

      <ActionSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        title={view === "uyeler" ? "Süzgece uyan üyeler" : "Kişilerim"}
        actions={[
          { label: "CSV olarak paylaş", icon: "document-text-outline", hint: "Excel ile açılır", onPress: () => runExport("csv") },
          { label: "Telefon rehberi (vCard)", icon: "id-card-outline", onPress: () => runExport("vcf") },
          { label: "Telefonları kopyala", icon: "call-outline", onPress: () => runExport("phones") },
          { label: "E-postaları kopyala", icon: "mail-outline", onPress: () => runExport("emails") },
        ]}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
});
