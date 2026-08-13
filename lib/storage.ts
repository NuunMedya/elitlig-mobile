import * as SecureStore from "expo-secure-store";

/**
 * Oturum jetonu cihazın güvenli deposunda (iOS Keychain / Android Keystore)
 * tutulur. Web'de SecureStore yoktur; Expo Go'nun web hedefi için sessizce
 * bellekte tutmaya düşülür, böylece `expo start --web` çalışmaya devam eder.
 */

const TOKEN_KEY = "elitlig.authToken";

let memoryFallback: string | null = null;

const available = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

export async function saveToken(token: string): Promise<void> {
  if (await available()) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return;
  }
  memoryFallback = token;
}

export async function loadToken(): Promise<string | null> {
  if (await available()) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return memoryFallback;
}

export async function clearToken(): Promise<void> {
  if (await available()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  memoryFallback = null;
}
