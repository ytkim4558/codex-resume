import { buildSessionIndex } from "../core/session-indexer.js";
import { buildResumeCommand } from "../core/session-resumer.js";
import { detectCodexPaths } from "../infra/codex-paths.js";
import { runCommand } from "../infra/process-runner.js";
import { existsSync } from "node:fs";
export async function runResume(command) {
    const sessions = await buildSessionIndex(detectCodexPaths().sessionsDir);
    const session = sessions.find((item) => item.sessionId === command.sessionId || item.sessionId.startsWith(command.sessionId));
    if (!session) {
        throw new Error(`Session not found: ${command.sessionId}`);
    }
    const [binary, ...args] = buildResumeCommand(session);
    const targetCwd = command.here ? undefined : command.cwd ?? session.cwd;
    const cwd = targetCwd && existsSync(targetCwd) ? targetCwd : undefined;
    if (command.dryRun) {
        if (targetCwd && !cwd) {
            console.log(`Target cwd no longer exists; would use current directory: ${targetCwd}`);
        }
        console.log(`Would run: ${formatCommand([binary, ...args])}`);
        console.log(`CWD: ${cwd ?? process.cwd()}`);
        return;
    }
    if (targetCwd && !cwd) {
        console.log(`Target cwd no longer exists; resuming from current directory: ${targetCwd}`);
    }
    else if (cwd) {
        console.log(`Opening Codex in ${cwd}`);
    }
    const code = await runCommand(binary, args, { cwd });
    process.exitCode = code;
}
function formatCommand(parts) {
    return parts.map((part) => part.includes(" ") ? `"${part}"` : part).join(" ");
}
