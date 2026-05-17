#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { emitKeypressEvents } from "node:readline";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const VERSION = "0.1.0";
const require = createRequire(import.meta.url);

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

  const blessed = loadBlessed();
  if (blessed) {
    await runBlessedPicker(blessed, sessions, command.query || "");
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

async function runBlessedPicker(blessed, sessions, initialQuery) {
  let query = initialQuery;
  let filtered = searchSessions(sessions, query);

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "codex-resume"
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    padding: { left: 1, right: 1 },
    style: { fg: "white", bg: "blue" }
  });

  const list = blessed.list({
    top: 3,
    left: 0,
    width: "42%",
    height: "100%-4",
    keys: true,
    mouse: true,
    vi: true,
    tags: true,
    border: { type: "line" },
    label: " Sessions ",
    scrollbar: { ch: " ", track: { bg: "black" }, style: { bg: "cyan" } },
    style: {
      border: { fg: "cyan" },
      selected: { bg: "cyan", fg: "black", bold: true },
      item: { fg: "white" }
    }
  });

  const preview = blessed.box({
    top: 3,
    left: "42%",
    width: "58%",
    height: "100%-4",
    keys: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    border: { type: "line" },
    label: " Detail ",
    padding: { left: 1, right: 1 },
    scrollbar: { ch: " ", track: { bg: "black" }, style: { bg: "cyan" } },
    style: { border: { fg: "cyan" }, fg: "white" }
  });

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    content: " Type to search  Backspace delete  ↑/↓ move  Enter resume  Tab detail  q/Esc quit ",
    style: { fg: "black", bg: "white" }
  });

  screen.append(header);
  screen.append(list);
  screen.append(preview);
  screen.append(footer);

  function setHeader(message = "") {
    const status = message ? `  {yellow-fg}${escapeTags(message)}{/}` : "";
    header.setContent(`{bold}codex-resume{/bold}  OpenAI Codex session browser\nSearch: {cyan-fg}${escapeTags(query || "(type to filter)")}{/}${status}`);
  }

  function updateList(keepIndex = 0) {
    filtered = searchSessions(sessions, query);
    const labels = filtered.map((session) => formatBlessedListLine(session));
    list.setItems(labels.length ? labels : [" No matching sessions"]);
    list.select(Math.min(Math.max(0, keepIndex), Math.max(0, labels.length - 1)));
    updatePreview();
    setHeader();
    screen.render();
  }

  function selectedSession() {
    return filtered[list.selected ?? 0];
  }

  function updatePreview() {
    const session = selectedSession();
    if (!session) {
      preview.setContent("{center}No matching sessions{/center}");
      return;
    }
    preview.setContent(buildBlessedPreview(session));
    preview.setScroll(0);
  }

  list.on("select item", async () => {
    const session = selectedSession();
    if (!session) return;
    if (!(await commandExists("codex"))) {
      setHeader("`codex` command not found in PATH");
      screen.render();
      return;
    }
    screen.destroy();
    console.log(`Starting: codex resume ${session.sessionId}`);
    const code = await runCommand("codex", ["resume", session.sessionId]);
    process.exitCode = code;
  });

  list.on("select", updatePreview);

  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
  });

  screen.key(["tab"], () => {
    preview.focus();
    screen.render();
  });

  preview.key(["tab", "escape"], () => {
    list.focus();
    screen.render();
  });

  screen.key(["backspace", "C-h"], () => {
    query = query.slice(0, -1);
    updateList(0);
  });

  screen.on("keypress", (ch, key) => {
    if (!ch || key.ctrl || key.meta) return;
    if (key.name && ["up", "down", "left", "right", "return", "enter", "escape", "tab", "backspace"].includes(key.name)) return;
    if (ch >= " ") {
      query += ch;
      updateList(0);
    }
  });

  updateList(0);
  list.focus();
  await new Promise((resolve) => screen.on("destroy", resolve));
}

function loadBlessed() {
  try {
    return require("blessed");
  } catch {
    return null;
  }
}

function formatBlessedListLine(session) {
  const summary = escapeTags(session.summary || session.title || session.sessionId);
  const date = formatDate(session.updatedAt);
  const count = String(session.messageCount).padStart(3, " ");
  return ` {cyan-fg}${date}{/} {yellow-fg}${count}{/} ${summary}`;
}

function buildBlessedPreview(session) {
  const summary = escapeTags(session.summary || makeSummary(session.firstUserMessage, session.lastAssistantMessage) || "(no summary)");
  const cwd = escapeTags(session.cwd || "(unknown)");
  const id = escapeTags(session.sessionId);
  const updated = escapeTags(formatDate(session.updatedAt));
  const user = escapeTags(cleanForDisplay(session.firstUserMessage || "(none)"));
  const assistant = escapeTags(cleanForDisplay(session.lastAssistantMessage || "(none)"));

  return [
    `{bold}{cyan-fg}Summary{/} ${summary}`,
    "",
    `{bold}Updated{/}  ${updated}`,
    `{bold}Messages{/} ${session.messageCount}`,
    `{bold}ID{/}       ${id}`,
    `{bold}CWD{/}      ${cwd}`,
    "",
    "{bold}{green-fg}User request{/}",
    user,
    "",
    "{bold}{magenta-fg}Latest assistant{/}",
    assistant
  ].join("\n");
}

function escapeTags(value) {
  return String(value).replace(/[{}]/g, "");
}

function drawPicker(sessions, cursor, query) {
  const columns = process.stdout.columns || 120;
  const rows = process.stdout.rows || 32;
  const listWidth = Math.min(Math.max(52, Math.floor(columns * 0.43)), Math.max(52, columns - 64));
  const previewWidth = Math.max(36, columns - listWidth - 3);
  const selected = sessions[cursor];

  console.log(fitLine("codex-resume  OpenAI Codex session browser", columns));
  console.log(fitLine(`Search: ${query || "(type to filter)"}`, columns));
  console.log(fitLine("Up/Down move  Enter resume  q/Esc quit", columns));
  console.log(repeatCell("─", columns));

  const maxRows = Math.max(5, rows - 6);
  const previewLines = selected ? buildPreview(selected, previewWidth).slice(0, maxRows) : ["No matching sessions"];
  const visible = windowAround(sessions, cursor, maxRows);

  for (let i = 0; i < maxRows; i += 1) {
    const item = visible[i];
    const absoluteIndex = sessions.indexOf(item);
    const left = item ? formatPickerLine(item, absoluteIndex === cursor, listWidth) : "";
    const right = previewLines[i] ?? "";
    console.log(`${padRightCells(left, listWidth)} │ ${fitLine(right, previewWidth)}`);
  }
}

function windowAround(items, cursor, size) {
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), items.length - size));
  return items.slice(start, start + size);
}

function formatPickerLine(session, selected, width) {
  const marker = selected ? ">" : " ";
  const date = formatDate(session.updatedAt);
  const title = session.summary || session.title || session.firstUserMessage || session.sessionId;
  return fitLine(`${marker} ${date} ${session.messageCount.toString().padStart(3, " ")} ${title}`, width);
}

function buildPreview(session, width) {
  const summary = session.summary || makeSummary(session.firstUserMessage, session.lastAssistantMessage);
  const lines = [
    "Selected session",
    repeatCell("─", width),
    `Summary  ${summary}`,
    `Time     ${formatDate(session.updatedAt)}    Messages ${session.messageCount}`,
    `ID       ${session.sessionId}`,
    `CWD      ${compactPath(session.cwd || "(unknown)", Math.max(20, width - 9))}`,
    "",
    "User request",
    ...wrapForCells(session.firstUserMessage || "(none)", width),
    "",
    "Latest assistant",
    ...wrapForCells(session.lastAssistantMessage || "(none)", width)
  ];
  return lines.map((line) => fitLine(line, width));
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
  const summary = makeSummary(firstUser?.content, lastAssistant?.content);
  const title = summary || makeTitle(firstUser?.content, filePath);

  return {
    sessionId,
    title,
    summary,
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
  return fitLine(cleanForDisplay(text), 90);
}

function makeSummary(firstUser, lastAssistant) {
  const user = cleanForDisplay(firstUser || "");
  const assistant = cleanForDisplay(lastAssistant || "");
  if (!user && !assistant) return "";

  const userSummary = summarizeText(user);
  const assistantSummary = summarizeText(assistant);
  if (userSummary && assistantSummary && !assistantSummary.includes(userSummary)) {
    return fitLine(`${userSummary} / ${assistantSummary}`, 120);
  }
  return fitLine(userSummary || assistantSummary, 120);
}

function summarizeText(text) {
  const clean = cleanForDisplay(text);
  if (!clean) return "";

  const requestMatch = clean.match(/(?:내 요청|요청|request)[^:：]*[:：]\s*(.+)/i);
  if (requestMatch?.[1]) return fitLine(requestMatch[1], 96);

  const firstSentence = clean.split(/(?<=[.!?。！？])\s+|(?:\s+-\s+)|(?:\s+##\s+)/).find(Boolean) || clean;
  return fitLine(firstSentence, 96);
}

function cleanForDisplay(value) {
  return oneLine(value)
    .replace(/# Files mentioned by the user:\s*/gi, "")
    .replace(/##\s+/g, "")
    .replace(/<image[^>]*>/gi, "[image]")
    .replace(/<\/image>/gi, "")
    .replace(/\bVRChat\b/g, "VR")
    .replace(/[A-Z]:[\\/][^\s]+/g, (path) => compactPath(path, 42))
    .trim();
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
  return `${String(index + 1).padStart(2, " ")}  ${formatDate(session.updatedAt)}  ${session.sessionId}  ${session.summary || session.title || ""}`;
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

function fitLine(value, width) {
  const clean = oneLine(value);
  let output = "";
  for (const char of clean) {
    if (cellWidth(output + char) > Math.max(0, width - 1)) return `${output}…`;
    output += char;
  }
  return output;
}

function padRightCells(value, width) {
  const current = cellWidth(value);
  if (current >= width) return fitLine(value, width);
  return value + " ".repeat(width - current);
}

function wrapForCells(value, width) {
  const words = cleanForDisplay(value).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = (line + " " + word).trim();
    if (cellWidth(candidate) > width) {
      if (line) lines.push(line);
      line = fitLine(word, width);
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function cellWidth(value) {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(code) {
  return (code >= 0x1100 && code <= 0x115f)
    || code === 0x2329
    || code === 0x232a
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6);
}

function repeatCell(char, width) {
  return char.repeat(Math.max(0, Math.floor(width / cellWidth(char))));
}

function compactPath(path, width) {
  const clean = oneLine(path);
  if (cellWidth(clean) <= width) return clean;
  const parts = clean.split(/[\\/]+/);
  if (parts.length <= 2) return fitLine(clean, width);
  const tail = parts.slice(-2).join("\\");
  const root = parts[0] || "";
  return fitLine(`${root}\\...\\${tail}`, width);
}

main().catch((error) => {
  console.error(`[codex-resume] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
