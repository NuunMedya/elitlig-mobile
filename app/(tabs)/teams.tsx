import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, type } from "@/constants/theme";

export default function Screen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.center}>
        <Text style={styles.title}>Takımlar</Text>
        <Text style={styles.body}>Bu ekran bir sonraki adımda geliştirilecek.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  title: { ...type.title, color: colors.line },
  body: { ...type.body, color: colors.muted },
});
