import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SessionRecord } from "./models.js";

export function buildResumeCommand(session: SessionRecord): string[] {
  return [resolveCodexCommand(), "resume", session.sessionId];
}

export function resolveCodexCommand(): string {
  const override = process.env.CODEX_RESUME_CODEX_BIN?.trim();
  if (override) return override;

  if (process.platform !== "win32") return "codex";

  const candidates = [
    process.env.APPDATA ? join(process.env.APPDATA, "npm", "codex.cmd") : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Roaming", "npm", "codex.cmd") : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  return "codex.cmd";
}
