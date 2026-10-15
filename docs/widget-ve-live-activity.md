# Ana ekran widget'ı ve iOS Live Activity — neden bu fazda yok, ne gerekir

Faz 4'ün bu maddesi yerel (native) kod ister; Expo'nun yönetilen yapısında
JavaScript ile yazılamaz ve bulut ortamında derlenip denenemez.

## iOS widget (sıradaki maç, canlı skor)
- WidgetKit + SwiftUI ile ayrı bir uygulama uzantısı (extension) hedefi.
- Expo'da hedef eklemek için bir config plugin: `@bacons/apple-targets`.
- Uygulama ile widget arasında veri: App Group (ör. `group.com.elitlig.app`)
  ve paylaşılan UserDefaults. Uygulama sıradaki maçı oraya yazar.
- Apple Developer'da App Group ve uzantı için ayrı bundle id
  (`com.elitlig.app.widget`) gerekir.

## iOS Live Activity (canlı maç kilit ekranında)
- ActivityKit; aynı uzantı hedefinde bir Live Activity görünümü.
- Güncelleme için sunucudan APNs "liveactivity" push'u: sunucu tarafında
  `services/expoPush.js` yerine doğrudan APNs (token tabanlı .p8 anahtar).
- Canlı maç olayları zaten socket ile akıyor (`liveMatches`); push tetikleyici
  oradan beslenir.

## Android widget
- `react-native-android-widget` (Expo config plugin'i var) ile JS'ten çizilen
  widget; veri AsyncStorage/SharedPreferences üzerinden.

## Önerilen sıra
1. Android widget (en az yerel kod).
2. iOS widget (App Group + uzantı hedefi).
3. Live Activity (APNs anahtarı ve sunucu push'u gerekir; Faz 1'deki APNs
   kurulumu tamamlanmış olmalı).
