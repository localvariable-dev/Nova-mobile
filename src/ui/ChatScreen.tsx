import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useChat } from "@/state/ChatProvider";
import { getConversation, getMessages } from "@/storage/repository";
import type { Message } from "@/domain/types";
import { MarkdownMessage } from "./MarkdownMessage";
import { colors, radius, space } from "./theme";

export function ChatScreen({ conversationId }: { conversationId: number | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, isPreparing, activeGeneration, settings, initializationError, sendMessage, retryLastTurn, stopGeneration } = useChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(Boolean(conversationId));
  const [error, setError] = useState<string | null>(null);
  const [scrollNearBottom, setScrollNearBottom] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!ready || conversationId === null) {
      setMessages([]);
      setConversationTitle(null);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    Promise.all([getMessages(conversationId), getConversation(conversationId)])
      .then(([items, conversation]) => {
        if (!mounted) return;
        setMessages(items);
        setConversationTitle(conversation?.title ?? null);
      })
      .catch(() => {
        if (mounted) setError("This conversation could not be loaded.");
      })
      .finally(() => {
        if (mounted) setLoadingMessages(false);
      });
    return () => { mounted = false; };
  }, [conversationId, ready]);

  const isGenerating = activeGeneration?.status === "streaming";
  const isBusy = isGenerating || isPreparing;
  const generationHere = isGenerating && activeGeneration?.conversationId === conversationId;
  const displayMessages = useMemo<Message[]>(() => messages.map((message): Message => {
    if (activeGeneration?.messageId !== message.id) return message;
    const status: Message["status"] = activeGeneration.status === "streaming"
      ? "streaming"
      : activeGeneration.status;
    return {
      ...message,
      content: activeGeneration.text,
      status,
    };
  }), [messages, activeGeneration]);

  useEffect(() => {
    if (scrollNearBottom) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [displayMessages.length, displayMessages.at(-1)?.content, scrollNearBottom]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setScrollNearBottom(contentSize.height - layoutMeasurement.height - contentOffset.y < 140);
  }, []);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    try {
      const id = await sendMessage(conversationId, content);
      setDraft("");
      const items = await getMessages(id);
      setMessages(items);
      if (conversationId === null) router.replace(`/chat/${id}`);
      setScrollNearBottom(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your message could not be sent.");
    }
  }, [conversationId, draft, router, sendMessage]);

  const headerTitle = conversationTitle ?? (conversationId === null ? "New conversation" : "Conversation");
  const configured = Boolean(settings.baseUrl.trim() && settings.model.trim());

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
          <View style={styles.brandGroup}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.headerLogo}
              accessibilityLabel="AntiGPT Logo"
            />
            <View style={styles.headerCopy}>
              <Text style={styles.brand}>ANTI / GPT</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <HeaderAction label="History" onPress={() => router.push("/history")} />
            <HeaderAction label="Settings" onPress={() => router.push("/settings")} />
            <HeaderAction label="New" onPress={() => router.replace("/")} />
          </View>
        </View>

        {initializationError ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Local storage is unavailable</Text>
            <Text style={styles.stateCopy}>{initializationError}</Text>
          </View>
        ) : !ready || loadingMessages ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.stateCopy}>Opening conversation</Text>
          </View>
        ) : displayMessages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled">
            <Image
              source={require("../../assets/icon.png")}
              style={styles.emptyLogo}
              accessibilityLabel="AntiGPT Logo"
            />
            <Text style={styles.eyebrow}>ON-DEVICE HISTORY</Text>
            <Text style={styles.emptyTitle}>Start with a question.</Text>
            <Text style={styles.emptyCopy}>
              History is saved on this device. Messages are sent to the gateway you configure.
            </Text>
            <Pressable style={({ pressed }) => [styles.setupLink, pressed && styles.pressed]} onPress={() => router.push("/settings")} accessibilityRole="button">
              <Text style={styles.setupLinkText}>{configured ? "Review gateway settings" : "Set up gateway"}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.messageArea}>
            <FlatList
              ref={listRef}
              data={displayMessages}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item, index }) => (
                <MessageRow
                  message={item}
                  active={item.status === "streaming"}
                  onRetry={index === displayMessages.length - 1 && item.role === "assistant" && ["failed", "cancelled", "interrupted"].includes(item.status)
                    ? () => {
                        if (conversationId === null) return;
                        setError(null);
                        void retryLastTurn(conversationId).catch((cause) => {
                          setError(cause instanceof Error ? cause.message : "The response could not be retried.");
                        });
                      }
                    : undefined}
                />
              )}
              contentContainerStyle={styles.messageList}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              scrollEventThrottle={80}
              onContentSizeChange={() => {
                if (scrollNearBottom) listRef.current?.scrollToEnd({ animated: true });
              }}
              ListFooterComponent={
                activeGeneration?.conversationId === conversationId && activeGeneration.error ? (
                  <Text style={styles.generationError}>{activeGeneration.error}</Text>
                ) : undefined
              }
            />
            {!scrollNearBottom && (
              <Pressable
                style={({ pressed }) => [styles.jumpButton, pressed && styles.pressed]}
                onPress={() => {
                  listRef.current?.scrollToEnd({ animated: true });
                  setScrollNearBottom(true);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.jumpText}>Latest message</Text>
              </Pressable>
            )}
          </View>
        )}

        {error ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
            {error.includes("Settings") || error.includes("gateway URL") || error.includes("model ID") ? (
              <Pressable style={({ pressed }) => [styles.errorActionButton, pressed && styles.pressed]} onPress={() => router.push("/settings")} accessibilityRole="button">
                <Text style={styles.errorAction}>Open Settings</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!configured && displayMessages.length > 0 && !error ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Add a gateway URL and model in Settings before sending.</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.composerWrap,
            { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) },
          ]}
        >
          <TextInput
            accessibilityLabel="Message"
            value={draft}
            onChangeText={setDraft}
            onFocus={() => {
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            }}
            placeholder="Message your model"
            placeholderTextColor={colors.quiet}
            multiline
            editable={ready && !isBusy}
            submitBehavior="newline"
            style={styles.composerInput}
            maxLength={12000}
            textAlignVertical="center"
          />
          {generationHere ? (
            <Pressable style={({ pressed }) => [styles.sendButton, styles.stopButton, pressed && styles.pressed]} onPress={() => stopGeneration(conversationId ?? undefined)} accessibilityRole="button">
              <Text style={styles.sendButtonText}>Stop</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.sendButton, (!draft.trim() || isBusy) && styles.sendDisabled, pressed && !isBusy && draft.trim() ? styles.pressed : null]}
              onPress={() => void handleSend()}
              disabled={!draft.trim() || isBusy || !ready}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Text style={styles.sendButtonText}>{isPreparing ? "Starting" : "Send"}</Text>
            </Pressable>
          )}
        </View>
        {isGenerating && !generationHere ? (
          <Pressable
            style={({ pressed }) => [styles.otherGeneration, pressed && styles.pressed]}
            onPress={() => stopGeneration(activeGeneration?.conversationId)}
            accessibilityRole="button"
          >
            <Text style={styles.otherGenerationText}>A reply is running elsewhere · Stop it</Text>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={styles.headerActionText}>{label}</Text>
    </Pressable>
  );
}

function MessageRow({ message, active, onRetry }: { message: Message; active: boolean; onRetry?: () => void }) {
  const assistant = message.role === "assistant";
  return (
    <View style={[styles.messageRow, assistant ? styles.assistantRow : styles.userRow]}>
      {assistant ? <View style={styles.responseMark} /> : null}
      <View style={[styles.messageBody, !assistant && styles.userBubble]}>
        <Text style={styles.messageLabel}>{assistant ? "MODEL" : "YOU"}</Text>
        {message.content ? (
          <MarkdownMessage content={message.content} />
        ) : active ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.thinking}>Thinking</Text>
          </View>
        ) : (
          <Text style={styles.stateCopy}>No response text was received.</Text>
        )}
        {!active && message.status === "cancelled" ? <Text style={styles.messageStatus}>Stopped</Text> : null}
        {!active && (message.status === "failed" || message.status === "interrupted") ? (
          <View>
            <Text style={styles.messageStatus}>Response did not finish. Your message is saved.</Text>
            {onRetry ? <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.retryText}>Retry response</Text></Pressable> : null}
          </View>
        ) : null}
        {!active && message.status === "cancelled" && onRetry ? (
          <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.retryText}>Continue response</Text></Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  brandGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  headerCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  brand: { color: colors.accent, fontSize: 10, letterSpacing: 2.2, fontWeight: "700", marginBottom: 3 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "600", paddingRight: 8 },
  headerActions: { flexDirection: "row", gap: 2 },
  headerAction: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 5, borderRadius: radius.small },
  headerActionText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  emptyContent: { flexGrow: 1, width: "100%", maxWidth: 760, alignSelf: "center", justifyContent: "center", alignItems: "flex-start", paddingHorizontal: 28, paddingBottom: 24 },
  emptyLogo: { width: 48, height: 48, borderRadius: 12, marginBottom: 20 },
  eyebrow: { color: colors.muted, letterSpacing: 1.4, fontSize: 10, fontWeight: "600", marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 31, lineHeight: 38, fontWeight: "600", letterSpacing: -0.6, maxWidth: 280 },
  emptyCopy: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 12, maxWidth: 330 },
  setupLink: { minHeight: 44, justifyContent: "center", marginTop: 18, borderBottomWidth: 1, borderBottomColor: colors.accent },
  setupLinkText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  centerState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: "600", textAlign: "center" },
  stateCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  messageArea: { flex: 1 },
  messageList: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 18, paddingTop: 22, paddingBottom: 22, flexGrow: 1 },
  messageRow: { flexDirection: "row", marginBottom: 24, alignItems: "flex-start" },
  assistantRow: { paddingRight: 10 },
  userRow: { justifyContent: "flex-end", paddingLeft: 32 },
  responseMark: { width: 2, alignSelf: "stretch", backgroundColor: colors.accent, borderRadius: 2, marginRight: 13, opacity: 0.9 },
  messageBody: { flexShrink: 1, maxWidth: "100%" },
  userBubble: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium, paddingHorizontal: 15, paddingVertical: 12, maxWidth: "100%" },
  messageLabel: { color: colors.quiet, fontSize: 10, letterSpacing: 1.2, fontWeight: "700", marginBottom: 7 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 26 },
  thinking: { color: colors.muted, fontSize: 14 },
  messageStatus: { color: colors.muted, fontSize: 12, marginTop: 8 },
  retryButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 12 },
  retryText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  generationError: { color: colors.danger, fontSize: 13, lineHeight: 19, paddingHorizontal: 28, paddingBottom: 16 },
  jumpButton: { position: "absolute", bottom: 14, alignSelf: "center", minHeight: 44, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large },
  jumpText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  errorBox: { marginHorizontal: 14, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: "#6A3632", borderRadius: radius.small, backgroundColor: "#241716", gap: 5 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  errorAction: { color: colors.accent, fontWeight: "600", paddingVertical: 3 },
  errorActionButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 12 },
  hintBox: { marginHorizontal: 14, marginBottom: 8 },
  hintText: { color: colors.muted, fontSize: 12, textAlign: "center" },
  composerWrap: { width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  composerInput: { flex: 1, minHeight: 48, maxHeight: 128, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium, paddingHorizontal: 15, paddingVertical: 12, color: colors.text, fontSize: 16, lineHeight: 22 },
  sendButton: { minWidth: 62, height: 48, justifyContent: "center", alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.medium, paddingHorizontal: 12 },
  stopButton: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  sendButtonText: { color: colors.accentInk, fontWeight: "700", fontSize: 14 },
  sendDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  otherGeneration: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  otherGenerationText: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
