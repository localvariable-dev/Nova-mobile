import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useChat } from "@/state/ChatProvider";
import { deleteConversation, listConversations } from "@/storage/repository";
import type { Conversation } from "@/domain/types";
import { colors, radius, space } from "@/ui/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const { stopGeneration } = useChat();
  const [items, setItems] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listConversations().then(setItems).catch(() => setError("Conversation history could not be loaded."));
  }, []);
  useFocusEffect(refresh);

  const confirmDelete = (conversation: Conversation) => {
    Alert.alert("Delete conversation?", "This removes the conversation from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          stopGeneration(conversation.id);
          void deleteConversation(conversation.id).then(refresh).catch(() => setError("The conversation could not be deleted."));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>YOUR DEVICE</Text>
        <Text style={styles.title}>Conversations</Text>
        <Text style={styles.subtitle}>Saved only on this device.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.rule} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyCopy}>When you start a chat, it will appear here.</Text>
          <Pressable style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => router.replace("/")} accessibilityRole="button">
            <Text style={styles.actionText}>Start a conversation</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                style={({ pressed }) => [styles.openRow, pressed && styles.pressed]}
                onPress={() => router.push(`/chat/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.rowDate}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(item)}
                style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      <Pressable style={({ pressed }) => [styles.bottomAction, pressed && styles.pressed]} onPress={() => router.replace("/")} accessibilityRole="button">
        <Text style={styles.bottomActionText}>New conversation</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingRight: 16, marginBottom: 14 },
  backText: { color: colors.muted, fontSize: 14 },
  eyebrow: { color: colors.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: "700", marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },
  list: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 18, paddingBottom: 24 },
  listFlex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  openRow: { flex: 1, paddingVertical: 18, paddingRight: 12 },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  rowDate: { color: colors.quiet, fontSize: 12, marginTop: 7 },
  delete: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 10, borderRadius: radius.small },
  deleteText: { color: colors.muted, fontSize: 12 },
  empty: { flex: 1, justifyContent: "center", paddingHorizontal: 26, paddingBottom: 50 },
  rule: { width: 32, height: 3, backgroundColor: colors.accent, borderRadius: 2, marginBottom: 22 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "600" },
  emptyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  action: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.accent },
  actionText: { color: colors.accent, fontWeight: "600" },
  bottomAction: { width: "100%", maxWidth: 720, minHeight: 48, alignSelf: "center", marginHorizontal: 16, marginBottom: 10, paddingVertical: 12, borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium, alignItems: "center", justifyContent: "center" },
  bottomActionText: { color: colors.text, fontWeight: "600" },
  error: { color: colors.danger, padding: space.md },
  pressed: { opacity: 0.72 },
});
