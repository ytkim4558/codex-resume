import type { ListCommand } from "./parse-argv.js";
import { detectCodexPaths } from "../infra/codex-paths.js";
import { buildSessionIndex } from "../core/session-indexer.js";
import { searchSessions } from "../core/session-search.js";

export async function runList(command: ListCommand): Promise<void> {
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
