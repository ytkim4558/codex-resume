export function searchSessions(sessions, query) {
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
            .filter((value) => Boolean(value))
            .some((value) => value.toLowerCase().includes(normalized));
    });
}
