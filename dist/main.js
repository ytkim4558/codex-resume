#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const VERSION = "0.1.0";

async function main() {
  const command = parseArgv(process.argv.slice(2));

  if (command.kind === "version") {
    console.log(`codex-resume ${VERSION}`);
    return;
  }
  if (command.kind === "doctor") {
    await runDoctor();
    return;
  }
  if (command.kind === "index") {
    await runIndex();
    return;
  }
  if (command.kind === "list") {
    await runList(command);
    return;
  }
  if (command.kind === "resume") {
    await runResume(command.sessionId);
    return;
  }
  await runPicker(command);
}

function parseArgv(argv) {
  const [first, ...rest] = argv;
  if (!first) return { kind: "app", query: "" };
  if (first === "--version" || first === "-v") return { kind: "version" };
  if (first === "doctor") return { kind: "doctor" };
  if (first === "index") return { kind: "index" };
  if (first === "resume") {
    const sessionId = rest[0];
    if (!sessionId) throw new Error("Usage: codex-resume resume <session-id>");
    return { kind: "resume", sessionId };
  }
  if (first === "list") {
    return {
      kind: "list",
      json: rest.includes("--json"),
      limit: numberOption(rest, "--limit") ?? 30,
      query: stringOption(rest, "--query") ?? ""
    };
  }
  if (first === "search") {
    return { kind: "app", query: rest.join(" ") };
  }
  return { kind: "app", query: argv.join(" ") };
}

function numberOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function detectCodexPaths() {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  return {
    codexHome,
    sessionsDir: join(codexHome, "sessions"),
    cacheDir: join(codexHome, "codex-resume"),
    indexPath: join(codexHome, "codex-resume", "session-index.json")
  };
}

async function runDoctor() {
  const paths = detectCodexPaths();
  const codex = await commandExists("codex");
  const sessionsReadable = await isReadable(paths.sessionsDir);
  const cacheReadable = await isReadable(paths.cacheDir);

  console.log("codex-resume doctor");
  console.log(`version: ${VERSION}`);
  console.log(`codex command: ${codex ? "found" : "not found"}`);
  console.log(`codex home: ${paths.codexHome}`);
  console.log(`sessions dir: ${paths.sessionsDir}`);
  console.log(`sessions readable: ${sessionsReadable}`);
  console.log(`cache dir: ${paths.cacheDir}`);
  console.log(`cache readable: ${cacheReadable}`);
}

async function runIndex() {
  const paths = detectCodexPaths();
  const sessions = await buildSessionIndex(paths.sessionsDir);
  await mkdir(paths.cacheDir, { recursive: true });
  await writeFile(paths.indexPath, JSON.stringify({ generatedAt: new Date().toISOString(), sessions }, null, 2), "utf8");
  console.log(`indexed sessions: ${sessions.length}`);
  console.log(`index path: ${paths.indexPath}`);
}

async function runList(command) {
  const paths = detectCodexPaths();
  const sessions = searchSessions(await buildSessionIndex(paths.sessionsDir), command.query).slice(0, command.limit);

  if (command.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  for (const [index, session] of sessions.entries()) {
    console.log(formatListLine(index, session));
  }
}

async function runResume(sessionId) {
  const sessions = await buildSessionIndex(detectCodexPaths().sessionsDir);
  const match = findSession(sessions, sessionId);
  if (!match) throw new Error(`Session not found: ${sessionId}`);
  if (!(await commandExists("codex"))) {
    throw new Error("`codex` command was not found in PATH. Run this inside a shell where Codex CLI is available.");
  }
  console.log(`Starting: codex resume ${match.sessionId}`);
  const code = await runCommand("codex", ["resume", match.sessionId]);
  process.exitCode = code;
}

async function runPicker(command) {
  const paths = detectCodexPaths();
  const sessions = await buildSessionIndex(paths.sessionsDir);
  if (sessions.length === 0) {
    console.log(`No Codex sessions found under ${paths.sessionsDir}`);
    return;
  }

  let query = command.query || "";
  let cursor = 0;
  let filtered = searchSessions(sessions, query);

  emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  const cleanup = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\x1b[?25h");
  };

  const render = () => {
    filtered = searchSessions(sessions, query);
    if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
    drawPicker(filtered, cursor, query);
  };

  render();

  await new Promise((resolve, reject) => {
    process.stdin.on("keypress", async (str, key) => {
      try {
        if (key.ctrl && key.name === "c") {
          cleanup();
          resolve();
          return;
        }
        if (key.name === "escape" || key.name === "q") {
          cleanup();
          resolve();
          return;
        }
        if (key.name === "backspace") {
          query = query.slice(0, -1);
          cursor = 0;
          render();
          return;
        }
        if (key.name === "up") {
          cursor = Math.max(0, cursor - 1);
          render();
          return;
        }
        if (key.name === "down") {
          cursor = Math.min(Math.max(0, filtered.length - 1), cursor + 1);
          render();
          return;
        }
        if (key.name === "return") {
          const selected = filtered[cursor];
          cleanup();
          if (!selected) {
            resolve();
            return;
          }
          if (!(await commandExists("codex"))) {
            throw new Error("`codex` command was not found in PATH. Run this inside a shell where Codex CLI is available.");
          }
          console.log(`Starting: codex resume ${selected.sessionId}`);
          const code = await runCommand("codex", ["resume", selected.sessionId]);
          process.exitCode = code;
          resolve();
          return;
        }
        if (str && !key.ctrl && !key.meta && str >= " ") {
          query += str;
          cursor = 0;
          render();
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  });
}

function drawPicker(sessions, cursor, query) {
  const columns = process.stdout.columns || 120;
  const rows = process.stdout.rows || 32;
  const listWidth = Math.max(42, Math.floor(columns * 0.45));
  const previewWidth = Math.max(30, columns - listWidth - 3);
  const selected = sessions[cursor];

  console.log("codex-resume");
  console.log(`Search: ${query || ""}`);
  console.log("Use arrows to move, type to search, Enter to resume, q/Esc to quit");
  console.log(`${"=".repeat(columns)}`);

  const maxRows = Math.max(5, rows - 6);
  const previewLines = selected ? buildPreview(selected, previewWidth).slice(0, maxRows) : ["No matching sessions"];
  const visible = windowAround(sessions, cursor, maxRows);

  for (let i = 0; i < maxRows; i += 1) {
    const item = visible[i];
    const absoluteIndex = sessions.indexOf(item);
    const left = item ? formatPickerLine(item, absoluteIndex === cursor, listWidth) : "";
    const right = previewLines[i] ?? "";
    console.log(`${padRight(left, listWidth)} | ${right}`);
  }
}

function windowAround(items, cursor, size) {
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), items.length - size));
  return items.slice(start, start + size);
}

function formatPickerLine(session, selected, width) {
  const marker = selected ? ">" : " ";
  const date = formatDate(session.updatedAt);
  const title = session.title || session.firstUserMessage || session.sessionId;
  return truncate(`${marker} ${date} ${session.messageCount.toString().padStart(3, " ")} ${title}`, width);
}

function buildPreview(session, width) {
  const lines = [
    `id: ${session.sessionId}`,
    `cwd: ${session.cwd || "(unknown)"}`,
    `updated: ${session.updatedAt || "(unknown)"}`,
    `messages: ${session.messageCount}`,
    `file: ${session.sourcePath}`,
    "",
    "first user:",
    ...(wrap(session.firstUserMessage || "(none)", width)),
    "",
    "last assistant:",
    ...(wrap(session.lastAssistantMessage || "(none)", width))
  ];
  return lines.map((line) => truncate(line, width));
}

async function buildSessionIndex(rootDir) {
  const files = await collectJsonlFiles(rootDir);
  const sessions = [];
  for (const file of files) {
    const parsed = await parseSessionFile(file);
    if (parsed.messageCount > 0 || parsed.cwd || parsed.sessionId) sessions.push(parsed);
  }
  return sessions.sort(compareByUpdatedAtDesc);
}

async function collectJsonlFiles(rootDir) {
  const output = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        output.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return output;
}

async function parseSessionFile(filePath) {
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const messages = [];
  let sessionId = sessionIdFromFilename(filePath);
  let cwd;
  let cliVersion;
  let startedAt;
  let updatedAt;

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = stringValue(record.timestamp);
    if (timestamp) {
      startedAt ??= timestamp;
      updatedAt = timestamp;
    }

    if (record.type === "session_meta" && record.payload) {
      sessionId = stringValue(record.payload.id) || sessionId;
      cwd = stringValue(record.payload.cwd) || cwd;
      cliVersion = stringValue(record.payload.cli_version) || cliVersion;
      startedAt = stringValue(record.payload.timestamp) || startedAt;
      continue;
    }

    if (record.type === "user_message" && record.payload) {
      const text = stringValue(record.payload.message);
      if (text && !isNoiseMessage(text)) messages.push({ role: "user", content: text, timestamp });
      continue;
    }

    if (record.type === "response_item" && record.payload?.type === "message") {
      const role = stringValue(record.payload.role);
      if (role === "user" || role === "assistant") {
        const text = contentToText(record.payload.content);
        if (text && !isNoiseMessage(text)) messages.push({ role, content: text, timestamp });
      }
      continue;
    }

    if (record.type === "event_msg" && record.payload?.type === "task_complete") {
      const text = stringValue(record.payload.last_agent_message);
      if (text && !isNoiseMessage(text)) messages.push({ role: "assistant", content: text, timestamp });
    }
  }

  const firstUser = messages.find((message) => message.role === "user");
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const title = makeTitle(firstUser?.content, filePath);

  return {
    sessionId,
    title,
    cwd,
    cliVersion,
    startedAt,
    updatedAt: updatedAt || startedAt,
    firstUserMessage: firstUser?.content,
    lastAssistantMessage: lastAssistant?.content,
    messageCount: messages.length,
    sourcePath: filePath
  };
}

function sessionIdFromFilename(filePath) {
  const name = basename(filePath).replace(/\.jsonl$/i, "");
  const match = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1] || name;
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      return stringValue(item.text) || stringValue(item.content) || "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function makeTitle(text, filePath) {
  if (!text) return basename(filePath);
  return truncate(oneLine(text), 90);
}

function isNoiseMessage(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("<environment_context>")
    || trimmed.startsWith("<permissions instructions>")
    || trimmed.startsWith("<collaboration_mode>")
    || trimmed.startsWith("<apps_instructions>")
    || trimmed.startsWith("<skills_instructions>")
    || trimmed.startsWith("<plugins_instructions>");
}

function searchSessions(sessions, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sessions;
  return sessions.filter((session) => {
    const haystack = [
      session.sessionId,
      session.title,
      session.cwd,
      session.firstUserMessage,
      session.lastAssistantMessage,
      session.sourcePath
    ].filter(Boolean).join("\n").toLowerCase();
    return haystack.includes(normalized);
  });
}

function findSession(sessions, idOrPrefix) {
  return sessions.find((session) => session.sessionId === idOrPrefix)
    || sessions.find((session) => session.sessionId.startsWith(idOrPrefix));
}

function compareByUpdatedAtDesc(left, right) {
  return (right.updatedAt || "").localeCompare(left.updatedAt || "");
}

async function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const code = await runCommand(probe, [command], { silent: true });
  return code === 0;
}

async function isReadable(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? "ignore" : "inherit",
      shell: false,
      windowsHide: Boolean(options.silent)
    });
    child.on("error", (error) => {
      if (options.silent) resolve(1);
      else reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function formatListLine(index, session) {
  return `${String(index + 1).padStart(2, " ")}  ${formatDate(session.updatedAt)}  ${session.sessionId}  ${session.title || ""}`;
}

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function oneLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value, width) {
  const clean = oneLine(value);
  if (clean.length <= width) return clean;
  return `${clean.slice(0, Math.max(0, width - 1))}…`;
}

function padRight(value, width) {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

function wrap(value, width) {
  const words = oneLine(value).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

main().catch((error) => {
  console.error(`[codex-resume] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
