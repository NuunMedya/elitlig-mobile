/**
 * app.json'ın üstüne yalnız derleme anında bilinen alanları ekler.
 *
 * ANDROID PUSH İÇİN google-services.json ZORUNLU. expo-notifications Android'de
 * Expo push token'ını Firebase Cloud Messaging üzerinden alır; derlemede
 * `android.googleServicesFile` yoksa uygulama Firebase'i başlatamaz ve
 * `getExpoPushTokenAsync` "Default FirebaseApp is not initialized" hatasıyla
 * düşer. Token alınamayınca sunucuya cihaz yazılmaz, telefona hiç push gitmez;
 * bildirimler yalnız uygulama açıkken yerel köprüyle (hooks/useNotificationBridge.ts)
 * görünür — "bildirimler ancak uygulamaya girince düşüyor" şikâyetinin kökü.
 *
 * Dosya iki yoldan verilebilir:
 *   1. EAS "file" ortam değişkeni GOOGLE_SERVICES_JSON (önerilen; dosya repoya girmez):
 *        eas env:create --name GOOGLE_SERVICES_JSON --type file \
 *          --value ./google-services.json --environment production --visibility secret
 *   2. Proje köküne konmuş ./google-services.json.
 * İkisi de yoksa alan eklenmez ve derleme eskisi gibi sürer (push Android'de çalışmaz).
 */
const fs = require("node:fs");
const path = require("node:path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? "./google-services.json" : undefined);

  if (!googleServicesFile) return config;

  return {
    ...config,
    android: { ...config.android, googleServicesFile },
  };
};
