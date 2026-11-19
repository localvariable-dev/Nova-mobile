import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "gateway-user-token";

export async function loadGatewayToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveGatewayToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (trimmed) {
    await SecureStore.setItemAsync(TOKEN_KEY, trimmed);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function clearGatewayToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
