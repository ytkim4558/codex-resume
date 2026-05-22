export type AppCommand = {
  kind: "app";
  query: string;
};

export type DoctorCommand = {
  kind: "doctor";
};

export type IndexCommand = {
  kind: "index";
};

export type ListCommand = {
  kind: "list";
  json: boolean;
  limit: number;
  query: string;
};

export type ResumeCommand = {
  kind: "resume";
  sessionId: string;
  cwd?: string;
  here: boolean;
};

export type VersionCommand = {
  kind: "version";
};

export type Command = AppCommand | DoctorCommand | IndexCommand | ListCommand | ResumeCommand | VersionCommand;

export function parseArgv(argv: string[]): Command {
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
      throw new Error("Usage: codex-resume resume <session-id> [--cwd <path>] [--here]");
    }
    return {
      kind: "resume",
      sessionId,
      cwd: stringOption(rest, "--cwd"),
      here: rest.includes("--here")
    };
  }

  if (first === "search") {
    return { kind: "app", query: rest.join(" ") };
  }

  return { kind: "app", query: [first, ...rest].join(" ") };
}

function numberOption(argv: string[], name: string): number | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
