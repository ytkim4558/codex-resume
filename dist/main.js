// src/cli/parse-argv.ts
function parseArgv(argv) {
  const [first, ...rest] = argv;
  if (!first) {
    return { kind: "app", query: "" };
  }
  if (first === "--version" || first === "-v") {
    return { kind: "version" };
  }
  if (first === "doctor") {
    return { kind: "doctor" };
  }
  if (first === "index") {
    return { kind: "index" };
  }
  if (first === "list") {
    return {
      kind: "list",
      json: rest.includes("--json"),
      limit: numberOption(rest, "--limit") ?? 30,
      query: stringOption(rest, "--query") ?? ""
    };
  }
  if (first === "resume") {
    const sessionId = rest[0];
    if (!sessionId) {
      throw new Error("Usage: codex-resume resume <session-id>");
    }
    return { kind: "resume", sessionId };
  }
  if (first === "search") {
    return { kind: "app", query: rest.join(" ") };
  }
  return { kind: "app", query: [first, ...rest].join(" ") };
}
function numberOption(argv, name) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : void 0;
  if (!value) return void 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function stringOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : void 0;
}

// src/cli/run-app.ts
async function runApp(_command) {
  console.log("The dependency-free picker is implemented in dist/main.js.");
  console.log("Run `node .\\dist\\main.js` while the TypeScript source is being promoted.");
}

// src/cli/run-doctor.ts
import { access } from "node:fs/promises";
import { constants } from "node:fs";

// src/infra/codex-paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
function detectCodexPaths() {
  const home = homedir();
  const codexHome = join(home, ".codex");
  return {
    codexHome,
    sessionsDir: join(codexHome, "sessions"),
    cacheDir: join(codexHome, "codex-resume")
  };
}

// src/core/session-resumer.ts
import { existsSync } from "node:fs";
import { join as join2 } from "node:path";
function buildResumeCommand(session) {
  return [resolveCodexCommand(), "resume", session.sessionId];
}
function resolveCodexCommand() {
  const override = process.env.CODEX_RESUME_CODEX_BIN?.trim();
  if (override) return override;
  if (process.platform !== "win32") return "codex";
  const candidates = [
    process.env.APPDATA ? join2(process.env.APPDATA, "npm", "codex.cmd") : void 0,
    process.env.USERPROFILE ? join2(process.env.USERPROFILE, "AppData", "Roaming", "npm", "codex.cmd") : void 0
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return "codex.cmd";
}

// src/infra/command-exists.ts
import { spawn } from "node:child_process";
async function commandExists(command) {
  const probe = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  return new Promise((resolve) => {
    const child = spawn(probe, args, { stdio: "ignore", shell: process.platform !== "win32" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

// src/cli/run-doctor.ts
async function runDoctor() {
  const paths = detectCodexPaths();
  const sessionsReadable = await isReadable(paths.sessionsDir);
  const cacheReadable = await isReadable(paths.cacheDir);
  const codexCommand = resolveCodexCommand();
  const codexAvailable = await commandExists(codexCommand);
  console.log("codex-resume doctor");
  console.log(`codex home: ${paths.codexHome}`);
  console.log(`sessions dir: ${paths.sessionsDir}`);
  console.log(`cache dir: ${paths.cacheDir}`);
  console.log(`sessions readable: ${sessionsReadable}`);
  console.log(`cache readable: ${cacheReadable}`);
  console.log(`codex command: ${codexCommand}`);
  console.log(`codex available: ${codexAvailable}`);
  if (!codexAvailable) {
    console.log("hint: install Codex CLI with `npm install -g @openai/codex` or set CODEX_RESUME_CODEX_BIN.");
  }
}
async function isReadable(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// src/core/session-indexer.ts
import { readdir } from "node:fs/promises";
import { join as join3 } from "node:path";

// src/core/session-parser.ts
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
async function parseSessionFile(filePath) {
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const messages = [];
  let sessionId = sessionIdFromFilename(filePath);
  let title;
  let cwd;
  let cliVersion;
  let startedAt;
  let updatedAt;
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
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
function stringField(record, key) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function contentToText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return void 0;
  const text = value.map((item) => {
    if (typeof item === "string") return item;
    if (!isRecord(item)) return "";
    return stringField(item, "text") ?? stringField(item, "content") ?? "";
  }).filter(Boolean).join("\n").trim();
  return text || void 0;
}
function isNoiseMessage(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("<environment_context>") || trimmed.startsWith("<permissions instructions>") || trimmed.startsWith("<collaboration_mode>") || trimmed.startsWith("<apps_instructions>") || trimmed.startsWith("<skills_instructions>") || trimmed.startsWith("<plugins_instructions>");
}
function sessionIdFromFilename(filePath) {
  const name = basename(filePath).replace(/\.jsonl$/i, "");
  const match = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match?.[1] ?? name;
}

// src/core/session-indexer.ts
async function buildSessionIndex(rootDir) {
  const files = await collectJsonlFiles(rootDir);
  const parsed = await Promise.all(files.map((file) => parseSessionFile(file)));
  return parsed.map(toSessionRecord).sort(compareByUpdatedAtDesc);
}
async function collectJsonlFiles(rootDir) {
  const results = [];
  await walk(rootDir, results);
  return results;
}
async function walk(currentDir, output) {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join3(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, output);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".jsonl")) {
      output.push(fullPath);
    }
  }
}
function toSessionRecord(parsed) {
  const firstUser = parsed.messages.find((message) => message.role === "user");
  const assistantMessages = parsed.messages.filter((message) => message.role === "assistant");
  const lastAssistant = assistantMessages.at(-1);
  return {
    sessionId: parsed.sessionId,
    title: parsed.title ?? firstUser?.content.slice(0, 80),
    cwd: parsed.cwd,
    startedAt: parsed.startedAt,
    updatedAt: parsed.updatedAt ?? parsed.startedAt,
    firstUserMessage: firstUser?.content,
    lastAssistantMessage: lastAssistant?.content,
    messageCount: parsed.messages.length,
    sourcePath: parsed.sourcePath
  };
}
function compareByUpdatedAtDesc(left, right) {
  const leftValue = left.updatedAt ?? "";
  const rightValue = right.updatedAt ?? "";
  return rightValue.localeCompare(leftValue);
}

// src/cli/run-index.ts
async function runIndex() {
  const paths = detectCodexPaths();
  const sessions = await buildSessionIndex(paths.sessionsDir);
  console.log(`indexed sessions: ${sessions.length}`);
}

// src/core/session-search.ts
function searchSessions(sessions, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return sessions;
  }
  return sessions.filter((session) => {
    return [
      session.sessionId,
      session.title,
      session.cwd,
      session.firstUserMessage,
      session.lastAssistantMessage
    ].filter((value) => Boolean(value)).some((value) => value.toLowerCase().includes(normalized));
  });
}

// src/cli/run-list.ts
async function runList(command) {
  const paths = detectCodexPaths();
  const sessions = searchSessions(await buildSessionIndex(paths.sessionsDir), command.query).slice(0, command.limit);
  if (command.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  for (const [index, session] of sessions.entries()) {
    console.log(`${String(index + 1).padStart(2, " ")} ${session.updatedAt ?? "unknown"} ${session.sessionId} ${session.title ?? ""}`.trim());
  }
}

// src/infra/process-runner.ts
import { spawn as spawn2 } from "node:child_process";
var isWindows = process.platform === "win32";
async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn2(command, args, {
      stdio: "inherit",
      shell: isWindows,
      windowsHide: true
    });
    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            [
              `Command not found: ${command}`,
              "Install OpenAI Codex CLI or set CODEX_RESUME_CODEX_BIN to the full executable path.",
              "Windows example: npm install -g @openai/codex"
            ].join("\n")
          )
        );
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// src/cli/run-resume.ts
async function runResume(command) {
  const sessions = await buildSessionIndex(detectCodexPaths().sessionsDir);
  const session = sessions.find((item) => item.sessionId === command.sessionId || item.sessionId.startsWith(command.sessionId));
  if (!session) {
    throw new Error(`Session not found: ${command.sessionId}`);
  }
  const [binary, ...args] = buildResumeCommand(session);
  const code = await runCommand(binary, args);
  process.exitCode = code;
}

// src/main.ts
var VERSION = "0.1.0";
async function main() {
  const command = parseArgv(process.argv.slice(2));
  switch (command.kind) {
    case "app":
      await runApp(command);
      return;
    case "doctor":
      await runDoctor();
      return;
    case "index":
      await runIndex();
      return;
    case "list":
      await runList(command);
      return;
    case "resume":
      await runResume(command);
      return;
    case "version":
      console.log(`codex-resume ${VERSION}`);
      return;
    default: {
      const exhaustiveCheck = command;
      throw new Error(`Unhandled command: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[codex-resume] ${message}`);
  process.exitCode = 1;
});
