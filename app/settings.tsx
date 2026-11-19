import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { gatewayOrigin, validateBaseUrl } from "@/gateway/client";
import { useChat } from "@/state/ChatProvider";
import type { GatewaySettings } from "@/domain/types";
import { colors, radius } from "@/ui/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, hasGatewayToken, saveSettings, removeToken } = useChat();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [temperature, setTemperature] = useState(String(settings.temperature));
  const [maxTokens, setMaxTokens] = useState(String(settings.maxTokens));
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tokenWillBeCleared = hasGatewayToken &&
    gatewayOrigin(baseUrl) !== gatewayOrigin(settings.baseUrl) && !token.trim();

  useEffect(() => {
    setBaseUrl(settings.baseUrl);
    setModel(settings.model);
    setTemperature(String(settings.temperature));
    setMaxTokens(String(settings.maxTokens));
  }, [settings]);

  const handleSave = async () => {
    setFeedback(null);
    const parsedTemperature = Number(temperature);
    const parsedMaxTokens = Number(maxTokens);
    if (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2) {
      setFeedback("Temperature must be between 0 and 2.");
      return;
    }
    if (!Number.isSafeInteger(parsedMaxTokens) || parsedMaxTokens < 1) {
      setFeedback("Maximum output tokens must be a positive whole number.");
      return;
    }
    if (token.trim() && /\s/.test(token.trim())) {
      setFeedback("A bearer token cannot contain whitespace.");
      return;
    }
    if (baseUrl.trim()) {
      try {
        validateBaseUrl(baseUrl);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Enter a valid gateway URL.");
        return;
      }
    }
    const next: GatewaySettings = {
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      model: model.trim(),
      temperature: parsedTemperature,
      maxTokens: parsedMaxTokens,
    };
    setSaving(true);
    try {
      await saveSettings(next, token);
      setToken("");
      setFeedback("Settings saved on this device.");
    } catch {
      setFeedback("Settings could not be saved. Check available device storage and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveToken = () => {
    Alert.alert("Remove gateway token?", "The app will no longer send an authorization token.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove token", style: "destructive", onPress: () => {
        void removeToken().then(() => {
          setToken("");
          setFeedback("Gateway token removed.");
        })
          .catch(() => setFeedback("The token could not be removed from secure storage."));
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.eyebrow}>CONNECTION</Text>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.intro}>Connect directly to the gateway you already use. Values stay on this device.</Text>

          <Field label="Gateway base URL" hint="Use the gateway root, with or without a trailing /v1. HTTPS is required except for local loopback and Android emulator development.">
            <TextInput
              accessibilityLabel="Gateway base URL"
              value={baseUrl}
              onChangeText={(value) => { setBaseUrl(value); setFeedback(null); }}
              placeholder="https://"
              placeholderTextColor={colors.quiet}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
          </Field>
          <Field label="Model ID" hint="Enter the exact model ID accepted by your gateway.">
            <TextInput
              accessibilityLabel="Model ID"
              value={model}
              onChangeText={setModel}
              placeholder="Model ID"
              placeholderTextColor={colors.quiet}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </Field>
          <Field label="Bearer token" hint={tokenWillBeCleared
            ? "Changing the gateway host clears the saved token unless you enter a replacement."
            : hasGatewayToken
              ? "A token is saved securely for this gateway. Leave blank to keep it."
              : "Optional. Stored using Android secure storage."}>
            <TextInput
              accessibilityLabel="Gateway bearer token"
              value={token}
              onChangeText={setToken}
              placeholder={hasGatewayToken ? "Saved token" : "Optional token"}
              placeholderTextColor={colors.quiet}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
            {hasGatewayToken ? (
              <Pressable onPress={handleRemoveToken} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.inlineActionText}>Remove saved token</Text>
              </Pressable>
            ) : null}
          </Field>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Generation</Text>
            <Text style={styles.sectionHint}>Defaults are based on the project’s example request.</Text>
          </View>
          <View style={styles.row}>
            <Field label="Temperature" hint="0 to 2">
              <TextInput
                accessibilityLabel="Temperature"
                value={temperature}
                onChangeText={setTemperature}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>
            <Field label="Max output tokens" hint="Positive whole number">
              <TextInput
                accessibilityLabel="Maximum output tokens"
                value={maxTokens}
                onChangeText={setMaxTokens}
                keyboardType="number-pad"
                style={styles.input}
              />
            </Field>
          </View>

          {feedback ? <Text style={styles.feedback} accessibilityLiveRegion="polite">{feedback}</Text> : null}

          <Pressable
            onPress={() => void handleSave()}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, saving && styles.disabled, pressed && !saving && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{saving ? "Saving…" : "Save settings"}</Text>
          </Pressable>

          <View style={styles.privacyNote}>
            <Text style={styles.privacyTitle}>Device-only storage</Text>
            <Text style={styles.privacyCopy}>Conversation history and settings are not included in Android system backup. Removing the app removes its local history.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingBottom: 28 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 16, marginBottom: 14 },
  backText: { color: colors.muted, fontSize: 14 },
  eyebrow: { color: colors.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: "700", marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.4 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 26, maxWidth: 360 },
  field: { flex: 1, marginBottom: 18 },
  label: { color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  input: { minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: radius.small, color: colors.text, paddingHorizontal: 13, fontSize: 15, backgroundColor: colors.surface },
  hint: { color: colors.quiet, fontSize: 12, lineHeight: 17, marginTop: 6 },
  inlineAction: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 10 },
  inlineActionText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  sectionHeading: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 20, marginTop: 3, marginBottom: 16 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "600" },
  sectionHint: { color: colors.quiet, fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: "row", gap: 12 },
  feedback: { color: colors.accent, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  saveButton: { height: 50, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center", borderRadius: radius.medium, marginTop: 3 },
  saveText: { color: colors.accentInk, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
  privacyNote: { padding: 15, borderLeftWidth: 2, borderLeftColor: colors.accent, backgroundColor: colors.surface, marginTop: 22 },
  privacyTitle: { color: colors.text, fontWeight: "600", fontSize: 13 },
  privacyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
