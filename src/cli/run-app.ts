import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import type { AppCommand } from "./parse-argv.js";
import { runResume } from "./run-resume.js";
import { detectCodexPaths } from "../infra/codex-paths.js";
import { buildSessionIndex } from "../core/session-indexer.js";
import { searchSessions } from "../core/session-search.js";

// STOPGAP picker — runs while the blessed TUI is being promoted.
// Provides a minimal numbered prompt so `codex-resume` (no subcommand)
// is usable today. Replace this file when the full TUI ships.
const DEFAULT_LIMIT = 20;

export async function runApp(command: AppCommand): Promise<void> {
  const paths = detectCodexPaths();
  const index = await buildSessionIndex(paths.sessionsDir);
  const sessions = searchSessions(index, command.query).slice(0, DEFAULT_LIMIT);

  if (sessions.length === 0) {
    console.log(`No sessions found in ${paths.sessionsDir}`);
    if (command.query) {
      console.log(`(query: "${command.query}")`);
    }
    return;
  }

  console.log("Recent Codex sessions (stopgap picker — full TUI in progress):");
  console.log("");
  for (const [i, s] of sessions.entries()) {
    const num = String(i + 1).padStart(2, " ");
    const when = (s.updatedAt ?? "unknown").substring(0, 19);
    const title = (s.title ?? "").substring(0, 60).replace(/\s+/g, " ");
    const cwd = s.cwd ? `  [${s.cwd}]` : "";
    console.log(`  ${num}) ${when}  ${title}${cwd}`);
  }
  console.log("");

  if (!stdin.isTTY) {
    console.log("(stdin is not a TTY — run interactively or use `codex-resume resume <id>`.)");
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("Pick number (q to quit): ")).trim();
  rl.close();

  if (!answer || answer.toLowerCase() === "q") {
    return;
  }

  const idx = Number.parseInt(answer, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= sessions.length) {
    console.log(`Invalid selection: ${answer}`);
    return;
  }

  const chosen = sessions[idx];
  if (!chosen) {
    console.log(`Invalid selection: ${answer}`);
    return;
  }
  console.log(`Resuming ${chosen.sessionId} ...`);
  await runResume({ kind: "resume", sessionId: chosen.sessionId, here: false });
}
