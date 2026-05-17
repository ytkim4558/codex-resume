import type { SessionRecord } from "./models.js";

export function searchSessions(sessions: SessionRecord[], query: string): SessionRecord[] {
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
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalized));
  });
}
