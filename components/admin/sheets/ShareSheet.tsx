/**
 * ShareSheet — tablo paylaşımı (web ShareDialog.js).
 *
 * Dosya sahibi yönetim kullanıcılarını arar, "Görüntüleyebilir" ya da
 * "Düzenleyebilir" olarak ekler, yetkiyi değiştirir veya kaldırır. Liste
 * bütünüyle PUT /shares ile kaydedilir; eklenen kişiye Yapılacaklar kartı
 * düşer (sunucu).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { Avatar, BottomSheet, Button, Input, SegmentedControl, Touchable } from "@/components/ui";
import { setSheetShares, shareCandidates, SHARE_ROLES, type SheetShare, type ShareRole } from "@/lib/api/admin/sheets";
import { colors, hairline, space, textScale, type } from "@/theme";

export interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  sheetId: number;
  title: string;
  initialShares: SheetShare[];
  onSaved?: (shares: SheetShare[]) => void;
}

const ROLE_ITEMS = SHARE_ROLES.map((r) => ({ key: r.key, label: r.label }));

export function ShareSheet({ visible, onClose, sheetId, title, initialShares, onSaved }: ShareSheetProps) {
  const [shares, setShares] = useState<SheetShare[]>(initialShares);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [newRole, setNewRole] = useState<ShareRole>("editor");

  useEffect(() => {
    if (visible) {
      setShares(initialShares.map((s) => ({ ...s })));
      setText("");
      setQ("");
    }
    // Yalnız açılışta: üst ekranın yeniden çizimi seçimleri silmesin.
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const candidates = useQuery({
    queryKey: ["admin", "sheets", "share-candidates", q],
    queryFn: () => shareCandidates(q),
    enabled: visible,
    staleTime: 30_000,
  });

  const chosen = useMemo(() => new Set(shares.map((s) => Number(s.user_id))), [shares]);
  const available = (candidates.data?.items ?? []).filter((c) => !chosen.has(Number(c.id))).slice(0, 12);
  const changed =
    JSON.stringify(shares.map((s) => [s.user_id, s.role])) !== JSON.stringify(initialShares.map((s) => [s.user_id, s.role]));

  const save = useAdminMutation(() => setSheetShares(sheetId, shares.map((s) => ({ user_id: s.user_id, role: s.role }))), {
    success: (res) => (res.notified ? `Paylaşım kaydedildi; ${res.notified} kişiye bildirim gitti.` : "Paylaşım kaydedildi."),
    invalidate: [["admin", "sheets"]],
    onSuccess: (res) => {
      onSaved?.(res.shares || []);
      onClose();
    },
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`"${title}" paylaş`}
      snap="full"
      footer={
        <View style={styles.footer}>
          <Text style={styles.footNote} {...textScale.dense}>
            {shares.length ? `${shares.length} kişiyle paylaşılıyor` : "Yalnız sen erişebilirsin"}
          </Text>
          <Button label="Paylaşımı kaydet" onPress={() => save.mutate(undefined)} disabled={!changed} loading={save.isPending} />
        </View>
      }
    >
      <View style={styles.body}>
        <Input variant="search" leadingIcon="search" value={text} onChangeText={setText} placeholder="Yönetim kullanıcısı ara (ad ya da kullanıcı adı)" autoCapitalize="none" autoCorrect={false} />
        <View style={styles.roleRow}>
          <Text style={styles.roleLabel} {...textScale.dense}>
            Eklenen kişi:
          </Text>
          <SegmentedControl items={ROLE_ITEMS} value={newRole} onChange={setNewRole} size="sm" style={styles.flex} />
        </View>

        {candidates.isLoading ? (
          <ActivityIndicator color={colors.textTertiary} />
        ) : available.length === 0 ? (
          <Text style={styles.muted} {...textScale.dense}>
            {q ? "Eşleşen yönetim kullanıcısı yok." : "Eklenecek başka yönetim kullanıcısı yok."}
          </Text>
        ) : (
          <View>
            {available.map((u, i) => (
              <Touchable
                key={u.id}
                onPress={() =>
                  setShares((list) => [...list, { user_id: u.id, name: u.name, username: u.username, user_role: u.role, city: u.city, role: newRole }])
                }
                style={[styles.person, i ? styles.border : null]}
                accessibilityLabel={`${u.name} ekle`}
              >
                <Avatar name={u.name} size={32} />
                <View style={styles.main}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                    {u.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                    {[`@${u.username}`, u.city].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.brandAccent} />
              </Touchable>
            ))}
          </View>
        )}

        <Text style={styles.section} {...textScale.dense}>
          ERİŞİMİ OLANLAR
        </Text>
        {shares.length === 0 ? (
          <Text style={styles.muted} {...textScale.dense}>
            Henüz kimseyle paylaşılmadı.
          </Text>
        ) : (
          shares.map((s, i) => (
            <View key={s.user_id} style={[styles.shareRow, i ? styles.border : null]}>
              <View style={styles.person}>
                <Avatar name={s.name} size={32} />
                <View style={styles.main}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                    {s.name}
                  </Text>
                  {s.username ? (
                    <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                      @{s.username}
                    </Text>
                  ) : null}
                </View>
                <Touchable
                  onPress={() => setShares((list) => list.filter((x) => Number(x.user_id) !== Number(s.user_id)))}
                  hitSlop={8}
                  feedback="icon"
                  accessibilityLabel={`${s.name} paylaşımını kaldır`}
                >
                  <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                </Touchable>
              </View>
              <SegmentedControl
                items={ROLE_ITEMS}
                value={s.role}
                onChange={(role) => setShares((list) => list.map((x) => (Number(x.user_id) === Number(s.user_id) ? { ...x, role } : x)))}
                size="sm"
              />
            </View>
          ))
        )}
        <Text style={styles.muted} {...textScale.dense}>
          Düzenleyiciler aynı anda çalışabilir; değişiklikler hücre bazında birleştirilir. Silme ve paylaşım yalnız sende kalır.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.lg },
  roleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  roleLabel: { ...type.bodySm, color: colors.textSecondary },
  flex: { flex: 1 },
  muted: { ...type.caption, color: colors.textTertiary },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  shareRow: { gap: space.xs, paddingBottom: space.sm },
  border: { borderTopWidth: hairline, borderTopColor: colors.separator },
  main: { flex: 1, gap: 2 },
  name: { ...type.label, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },
  footer: { gap: space.sm },
  footNote: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
});
