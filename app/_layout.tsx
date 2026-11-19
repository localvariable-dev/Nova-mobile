import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChatProvider } from "@/state/ChatProvider";
import { colors } from "@/ui/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ChatProvider>
        <StatusBar barStyle="light-content" />
        <Stack screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }} />
      </ChatProvider>
    </SafeAreaProvider>
  );
}
