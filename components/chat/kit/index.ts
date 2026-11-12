/**
 * SOHBET UI KİTİ — mesajlar bölümünün WhatsApp renkli yapı taşları.
 *
 * Ortak kitaplığın (`@/components/ui`) renkleri tema paletinden (mor) gelir ve
 * API'si bu bölüm için değiştirilemez. Burada aynı bileşenlerin sohbet
 * paletiyle (`@/lib/chatPalette`) çalışan kopyaları durur; adlar ve prop'lar
 * AYNIDIR. Sohbet dosyaları renk taşıyan bileşeni buradan, renksiz yardımcıları
 * (useToast, errorMessage, useReduceMotion, useFabAutoHide…) ortak
 * kitaplıktan alır.
 */

export { Touchable, fireHaptic } from "./Pressable";
export type { TouchableProps, PressFeedback, HapticKind } from "./Pressable";
export { Avatar } from "./Avatar";
export { BottomSheet } from "./BottomSheet";
export { Button } from "./Button";
export { Chip, ChipGroup } from "./Chip";
export { EmptyState } from "./EmptyState";
export { ErrorState, errorMessage } from "./ErrorState";
export { useRefresh } from "./Refresh";
export { Input } from "./Input";
export { ListRow } from "./ListRow";
export { SegmentedControl } from "./SegmentedControl";
export { Skeleton, SkeletonListRow } from "./Skeleton";
export { Toggle } from "./Toggle";
export { ChatStatusBar, WaHeader } from "./Header";
export { toneColors, withAlpha } from "./tones";
