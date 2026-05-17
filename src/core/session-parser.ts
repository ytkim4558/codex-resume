import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ParsedSessionFile, SessionMessage } from "./models.js";

type JsonRecord = Record<string, unknown>;

export async function parseSessionFile(filePath: string): Promise<ParsedSessionFile> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const messages: SessionMessage[] = [];

  let sessionId = sessionIdFromFilename(filePath);
  let title: string | undefined;
  let cwd: string | undefined;
  let cliVersion: string | undefined;
  let startedAt: string | undefined;
  let updatedAt: string | undefined;

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as JsonRecord;
      const timestamp = stringField(record, "timestamp");
      if (timestamp) {
        startedAt ??= timestamp;
        updatedAt = timestamp;
      }

      if (record.type === "session_meta" && isRecord(record.payload)) {
        sessionId = stringField(record.payload, "id") ?? sessionId;
        cwd = stringField(record.payload, "cwd") ?? cwd;
        cliVersion = stringField(record.payload, "cli_version") ?? cliVersion;
        startedAt = stringField(record.payload, "timestamp") ?? startedAt;
        continue;
      }

      if (record.type === "user_message" && isRecord(record.payload)) {
        const contentField = stringField(record.payload, "message");
        if (contentField && !isNoiseMessage(contentField)) {
          messages.push({ role: "user", content: contentField, timestamp });
        }
        continue;
      }

      if (record.type === "response_item" && isRecord(record.payload) && record.payload.type === "message") {
        const role = stringField(record.payload, "role");
        const contentField = contentToText(record.payload.content);
        if ((role === "user" || role === "assistant") && contentField && !isNoiseMessage(contentField)) {
          messages.push({ role, content: contentField, timestamp });
        }
      }

      if (record.type === "event_msg" && isRecord(record.payload) && record.payload.type === "task_complete") {
        const contentField = stringField(record.payload, "last_agent_message");
        if (contentField && !isNoiseMessage(contentField)) {
          messages.push({ role: "assistant", content: contentField, timestamp });
        }
      }
    } catch {
      continue;
    }
  }

  const firstUser = messages.find((message) => message.role === "user");
  title = firstUser?.content.slice(0, 90) ?? basename(filePath);

  return {
    sessionId,
    messages,
    sourcePath: filePath,
    title,
    cwd,
    cliVersion,
    startedAt,
    updatedAt: updatedAt ?? startedAt
  };
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function contentToText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const text = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!isRecord(item)) return "";
      return stringField(item, "text") ?? stringField(item, "content") ?? "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || undefined;
}

function isNoiseMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<environment_context>")
    || trimmed.startsWith("<permissions instructions>")
    || trimmed.startsWith("<collaboration_mode>")
    || trimmed.startsWith("<apps_instructions>")
    || trimmed.startsWith("<skills_instructions>")
    || trimmed.startsWith("<plugins_instructions>");
}

function sessionIdFromFilename(filePath: string): string {
  const name = basename(filePath).replace(/\.jsonl$/i, "");
  const match = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1] ?? name;
}
