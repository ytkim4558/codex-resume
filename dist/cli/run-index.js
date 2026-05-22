import { detectCodexPaths } from "../infra/codex-paths.js";
import { buildSessionIndex } from "../core/session-indexer.js";
export async function runIndex() {
    const paths = detectCodexPaths();
    const sessions = await buildSessionIndex(paths.sessionsDir);
    console.log(`indexed sessions: ${sessions.length}`);
}
