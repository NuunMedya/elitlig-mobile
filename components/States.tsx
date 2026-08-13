import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "@/constants/theme";
import { ApiError } from "@/lib/http";

/** Yükleniyor, boş ve hata durumları için ortak gösterimler. */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.turf} size="large" />
      {label ? <Text style={styles.body}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = "calendar-outline",
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={40} color={colors.faint} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.userMessage : "Beklenmeyen bir hata oluştu.";

  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.faint} />
      <Text style={styles.title}>Yüklenemedi</Text>
      <Text style={styles.body}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    ...type.subtitle,
    color: colors.line,
    marginTop: spacing.xs,
  },
  body: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
  },
  retry: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.turf,
  },
  retryPressed: {
    opacity: 0.75,
  },
  retryText: {
    ...type.body,
    color: colors.pitch,
    fontWeight: "700",
  },
});
