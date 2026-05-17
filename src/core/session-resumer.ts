import type { SessionRecord } from "./models.js";

export function buildResumeCommand(session: SessionRecord): string[] {
  return ["codex", "resume", session.sessionId];
}
