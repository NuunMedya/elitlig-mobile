/**
 * ESKİ KAPI — durum gösterimleri artık `components/ui` karşılıklarına devredildi.
 *
 * NEDEN DURUYOR: `Loading` / `EmptyState` / `ErrorState` adları geçiş öncesi
 * yazılmış ekranlarda hâlâ içe aktarılıyor. Bu dosya kendi görselini ÇİZMEZ;
 * eski (dar) prop imzalarını korur ve işi yeni bileşenlere aktarır.
 *
 * İMZALAR BİLEREK DAR TUTULDU: yeni `EmptyState`/`ErrorState` eylem düğmesi,
 * varyant ve çevrimdışı metni gibi ekler sunar. Bunları eski kapıdan açmıyoruz
 * ki yeni özellik isteyen ekran doğru adresi — `@/components/ui` — kullansın.
 *
 * `Loading` ARTIK ÇARK DEĞİL: dönen bir çember "bilmiyorum, bekle" der ve veri
 * düşünce ekran zıplar. Yerine içeriğin şeklini taklit eden iskelet konur
 * (§5.6). Liste dışı bir yerde bekleniyorsa çağıran doğrudan `SkeletonMatchRow`,
 * `SkeletonTable` gibi daha uygun bir şablon seçmelidir.
 *
 * YENİ KOD BU DOSYAYI KULLANMAZ:
 *   import { EmptyState, ErrorState, SkeletonListRow } from "@/components/ui";
 * Son çağıran da geçtiğinde bu dosya silinecek.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import {
  EmptyState as UIEmptyState,
  ErrorState as UIErrorState,
  SkeletonListRow,
} from "@/components/ui";
import { layout, space } from "@/theme";

/** Yükleniyor — iskelet satırlar. `label` yalnız ekran okuyucuya verilir. */
export function Loading({ label }: { label?: string }) {
  return (
    <View
      style={styles.loading}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "İçerik yükleniyor"}
    >
      <SkeletonListRow count={6} />
    </View>
  );
}

/** Veri yok — eski imza; içi `components/ui` EmptyState. */
export function EmptyState({
  icon = "calendar-outline",
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  return <UIEmptyState icon={icon} title={title} body={body} />;
}

/** Hata — eski imza; içi `components/ui` ErrorState (mesaj `ApiError`den gelir). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <UIErrorState error={error} onRetry={onRetry} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
});
