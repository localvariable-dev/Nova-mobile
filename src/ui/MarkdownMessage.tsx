import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "./theme";

type InlinePart = { text: string; kind: "plain" | "bold" | "italic" | "code" };

function inlineParts(value: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: value.slice(cursor, index), kind: "plain" });
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push({ text: token.slice(2, -2), kind: "bold" });
    } else if (token.startsWith("`")) {
      parts.push({ text: token.slice(1, -1), kind: "code" });
    } else {
      parts.push({ text: token.slice(1, -1), kind: "italic" });
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), kind: "plain" });
  return parts;
}

function InlineText({ value, codeBlock = false }: { value: string; codeBlock?: boolean }) {
  return (
    <Text selectable style={[styles.body, codeBlock && styles.codeText]}>
      {inlineParts(value).map((part, index) => (
        <Text
          key={`${index}-${part.text}`}
          style={[
            part.kind === "bold" && styles.bold,
            part.kind === "italic" && styles.italic,
            part.kind === "code" && styles.inlineCode,
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <View key={`p-${blocks.length}`} style={styles.paragraph}>
          <InlineText value={paragraph.join("\n")} />
        </View>,
      );
      paragraph = [];
    }
  };

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      if (codeLines === null) {
        flushParagraph();
        codeLines = [];
      } else {
        blocks.push(
          <ScrollView
            key={`code-${index}`}
            horizontal
            showsHorizontalScrollIndicator
            style={styles.codeBlock}
            contentContainerStyle={styles.codeContent}
          >
            <InlineText value={codeLines.join("\n")} codeBlock />
          </ScrollView>,
        );
        codeLines = null;
      }
      return;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const list = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push(
        <View key={`h-${index}`} style={styles.paragraph}>
          <Text selectable style={[styles.heading, heading[1].length > 1 && styles.subheading]}>{heading[2]}</Text>
        </View>,
      );
    } else if (list) {
      flushParagraph();
      blocks.push(
        <View key={`li-${index}`} style={styles.listRow}>
          <Text style={styles.bullet} accessibilityElementsHidden={!list[2]}>{list[2] ? `${list[2]}.` : "·"}</Text>
          <View style={styles.listText}><InlineText value={list[3]} /></View>
        </View>,
      );
    } else if (quote) {
      flushParagraph();
      blocks.push(
        <View key={`q-${index}`} style={styles.quote}>
          <InlineText value={quote[1]} />
        </View>,
      );
    } else {
      paragraph.push(line);
    }
  });

  const unfinishedCode = codeLines as string[] | null;
  if (unfinishedCode) {
    blocks.push(
      <ScrollView
        key="code-open"
        horizontal
        showsHorizontalScrollIndicator
        style={styles.codeBlock}
        contentContainerStyle={styles.codeContent}
      >
        <InlineText value={unfinishedCode.join("\n")} codeBlock />
      </ScrollView>,
    );
  }
  flushParagraph();

  return <View style={styles.container}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: { gap: 3 },
  paragraph: { marginBottom: 8 },
  body: { color: colors.text, fontSize: 16, lineHeight: 25 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  inlineCode: {
    color: colors.accent,
    backgroundColor: colors.surfaceRaised,
    fontFamily: "monospace",
    fontSize: 14,
  },
  heading: { color: colors.text, fontSize: 19, lineHeight: 27, fontWeight: "700" },
  subheading: { fontSize: 17, lineHeight: 25 },
  listRow: { flexDirection: "row", gap: 10, paddingLeft: 2, marginBottom: 6 },
  bullet: { color: colors.accent, fontSize: 20, lineHeight: 24 },
  listText: { flex: 1 },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12, marginVertical: 4 },
  codeBlock: {
    maxWidth: "100%",
    backgroundColor: colors.code,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.small,
    marginVertical: 7,
  },
  codeContent: { padding: space.md },
  codeText: { fontFamily: "monospace", fontSize: 13, lineHeight: 21, color: "#D4E2DE" },
});
