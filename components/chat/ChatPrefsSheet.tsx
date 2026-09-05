/**
 * KİMDEN MESAJ KABUL EDEYİM — üye sohbet tercihleri.
 *
 * Çoklu seçim: herkes / takım yöneticileri / oyuncular / takım arkadaşları.
 * "Herkesten" seçilince diğerleri kapanır; hiçbir seçenek kalmazsa herkese
 * döner. Yönetimden gelen mesaj her koşulda kabul edilir (kilitli satır).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, ListRow, errorMessage, useToast } from "@/components/ui";
import { ACCEPT_FROM_OPTIONS, getChatPreferences, setChatPreferences, type AcceptFrom } from "@/lib/api/chat";
import { colors, space, type } from "@/theme";

const QUERY_KEY = ["chat", "preferences"] as const;

export interface ChatPrefsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ChatPrefsSheet({ visible, onClose }: ChatPrefsSheetProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getChatPreferences, enabled: visible, staleTime: 30_000, retry: false });
  const [selected, setSelected] = useState<AcceptFrom[]>(["everyone"]);

  useEffect(() => {
    if (query.data) setSelected(query.data.accept_from.length ? query.data.accept_from : ["everyone"]);
  }, [query.data]);

  const toggle = (key: AcceptFrom, on: boolean) => {
    setSelected((current) => {
      if (key === "everyone") return on ? ["everyone"] : current.filter((item) => item !== "everyone");
      const rest = current.filter((item) => item !== "everyone" && item !== key);
      const next = on ? [...rest, key] : rest;
      return next.length ? next : ["everyone"];
    });
  };

  const save = useMutation({
    mutationFn: () => setChatPreferences(selected),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      toast.show({ message: data.message ?? "Mesaj tercihlerin kaydedildi.", tone: "success" });
      onClose();
    },
    onError: (error) => toast.show({ message: errorMessage(error), tone: "danger" }),
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Kimden mesaj kabul edeyim?"
      snap="content"
      footer={<Button label="Kaydet" onPress={() => save.mutate()} loading={save.isPending} disabled={query.isLoading} fullWidth />}
    >
      <Text style={styles.hint} accessibilityRole="text">
        Birden fazla seçenek işaretleyebilirsin. Yönetimden gelen mesajlar her durumda ulaşır.
      </Text>
      {query.isError ? <Text style={styles.error}>{errorMessage(query.error)}</Text> : null}
      <View style={styles.group}>
        {ACCEPT_FROM_OPTIONS.map((option, index) => (
          <ListRow
            key={option.key}
            title={option.label}
            subtitle={option.hint}
            position={index === 0 ? "first" : "middle"}
            toggle={{ value: selected.includes(option.key), onValueChange: (on) => toggle(option.key, on), disabled: query.isLoading }}
          />
        ))}
        <ListRow
          title="ElitLig Yönetimi"
          subtitle="Her zaman açık."
          position="last"
          leading={{ icon: "lock-closed", tone: "neutral" }}
          toggle={{ value: true, onValueChange: () => undefined, disabled: true }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.body, color: colors.textSecondary, marginBottom: space.md },
  error: { ...type.caption, color: colors.danger, marginBottom: space.sm },
  group: { marginBottom: space.md },
});
