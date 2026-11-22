// ElitligLive config plugin
// app.json → "plugins": [ ..., "./modules/elitlig-live/app.plugin.js" ]
// İsteğe bağlı: ["./modules/elitlig-live/app.plugin.js", { "cameraPermission": "...", "microphonePermission": "...", "exposeRecordings": true }]
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  withPodfile,
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
  // Stüdyo ön kontrolü: Wi-Fi / mobil veri ayrımı (getDeviceStatus). Normal izin, kullanıcıya sorulmaz.
  "android.permission.ACCESS_NETWORK_STATE",
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

// Xcode 26 Swift derleyicisi HaishinKit 1.9.x'i -O ile derlerken çöküyor
// ("Found a leaked owned value that was never consumed", MixerNode.format).
// Yalnız bu pod için iyileştirmeyi kapat; uygulamanın geri kalanı etkilenmez.
const HAISHIN_MARK = "# ElitligLive: HaishinKit -Onone";
const HAISHIN_SNIPPET = `
    ${HAISHIN_MARK}
    installer.pods_project.targets.each do |t|
      next unless t.name == 'HaishinKit'
      t.build_configurations.each do |bc|
        bc.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
        bc.build_settings['SWIFT_COMPILATION_MODE'] = 'singlefile'
      end
    end`;

function addHaishinFix(src) {
  if (src.includes(HAISHIN_MARK)) return src;
  const re = /post_install do \|installer\|/;
  if (!re.test(src)) {
    throw new Error("ElitligLive: Podfile'da post_install bloğu bulunamadı");
  }
  return src.replace(re, (m) => `${m}${HAISHIN_SNIPPET}`);
}

const withElitligLiveIos = (config, props) => {
  config = withPodfile(config, (cfg) => {
    cfg.modResults.contents = addHaishinFix(cfg.modResults.contents);
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    const camera = props.cameraPermission || DEFAULT_CAMERA;
    const mic = props.microphonePermission || DEFAULT_MICROPHONE;
    // Kamera metni bu modülün asıl amacı: her zaman yayın metnini yaz (prop ile değiştirilebilir).
    // Mikrofon metni başka özelliklerce (sesli arama) zaten tanımlıysa ezilmez.
    cfg.modResults.NSCameraUsageDescription = camera;
    if (!cfg.modResults.NSMicrophoneUsageDescription) {
      cfg.modResults.NSMicrophoneUsageDescription = mic;
    }
    // Yerel yayın kaydı uygulamanın Belgeler klasörüne yazılır; kullanıcı dosyayı
    // Dosyalar uygulamasında ("iPhone'umda ▸ ElitLig") bulabilsin.
    // Kapatmak için: { "exposeRecordings": false }.
    if (props.exposeRecordings !== false) {
      cfg.modResults.UIFileSharingEnabled = true;
      cfg.modResults.LSSupportsOpeningDocumentsInPlace = true;
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
