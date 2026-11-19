import React from "react";
import { useLocalSearchParams } from "expo-router";
import { ChatScreen } from "@/ui/ChatScreen";

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  return <ChatScreen conversationId={Number.isSafeInteger(conversationId) ? conversationId : null} />;
}
