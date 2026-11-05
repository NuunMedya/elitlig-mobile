// ElitligLive config plugin
// app.json → "plugins": [ ..., "./modules/elitlig-live/app.plugin.js" ]
// İsteğe bağlı: ["./modules/elitlig-live/app.plugin.js", { "cameraPermission": "...", "microphonePermission": "..." }]
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  withProjectBuildGradle,
} = require("expo/config-plugins");

const pkg = require("./package.json");

const DEFAULT_CAMERA = "Maçı canlı yayınlamak için kamera kullanılır.";
const DEFAULT_MICROPHONE = "Maçın sesini canlı yayına aktarmak için mikrofon kullanılır.";

const ANDROID_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.INTERNET",
  "android.permission.WAKE_LOCK",
];

const JITPACK_LINE = "maven { url 'https://jitpack.io' }";

/** android/build.gradle → allprojects { repositories { ... jitpack } } (zaten varsa dokunmaz). */
function addJitpack(src) {
  if (/jitpack\.io/.test(src)) return src;
  const re = /allprojects\s*\{\s*repositories\s*\{/;
  if (re.test(src)) {
    return src.replace(re, (m) => `${m}\n    ${JITPACK_LINE}`);
  }
  return `${src}\nallprojects {\n  repositories {\n    ${JITPACK_LINE}\n  }\n}\n`;
}

const withElitligLiveAndroid = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    // expo-image-picker { cameraPermission: false } CAMERA'yı tools:node="remove" ile
    // engeller; bu, kütüphane manifest'indeki CAMERA'yı da siler ve yayın kamerası
    // açılamaz. Engeli kaldır. (Mod sırası: bu eklenti app.json'da expo-image-picker'dan
    // ÖNCE listelenmeli ki modu ondan SONRA çalışsın.)
    if (Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = manifest["uses-permission"].filter(
        (p) =>
          !(
            p?.$?.["tools:node"] === "remove" &&
            ANDROID_PERMISSIONS.includes(p?.$?.["android:name"])
          ),
      );
    }
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, ANDROID_PERMISSIONS);
    return cfg;
  });
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy") {
      cfg.modResults.contents = addJitpack(cfg.modResults.contents);
    }
    return cfg;
  });
  return config;
};

const withElitligLiveIos = (config, props) => {
  return withInfoPlist(config, (cfg) => {
    const camera = props.cameraPermission || DEFAULT_CAMERA;
    const mic = props.microphonePermission || DEFAULT_MICROPHONE;
    // Kamera metni bu modülün asıl amacı: her zaman yayın metnini yaz (prop ile değiştirilebilir).
    // Mikrofon metni başka özelliklerce (sesli arama) zaten tanımlıysa ezilmez.
    cfg.modResults.NSCameraUsageDescription = camera;
    if (!cfg.modResults.NSMicrophoneUsageDescription) {
      cfg.modResults.NSMicrophoneUsageDescription = mic;
    }
    // UIBackgroundModes'e bilinçli olarak dokunulmuyor.
    return cfg;
  });
};

const withElitligLive = (config, props = {}) => {
  config = withElitligLiveAndroid(config);
  config = withElitligLiveIos(config, props || {});
  return config;
};

module.exports = createRunOncePlugin(withElitligLive, pkg.name, pkg.version);
