export type SessionMessage = {
  role: string;
  content: string;
  timestamp?: string;
};

export type SessionRecord = {
  sessionId: string;
  title?: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
  firstUserMessage?: string;
  lastAssistantMessage?: string;
  messageCount: number;
  sourcePath: string;
};

export type ParsedSessionFile = {
  sessionId: string;
  messages: SessionMessage[];
  sourcePath: string;
  title?: string;
  cwd?: string;
  cliVersion?: string;
  startedAt?: string;
  updatedAt?: string;
};
