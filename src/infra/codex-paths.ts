import { homedir } from "node:os";
import { join } from "node:path";

export type CodexPaths = {
  codexHome: string;
  sessionsDir: string;
  cacheDir: string;
};

export function detectCodexPaths(): CodexPaths {
  const home = homedir();
  const codexHome = join(home, ".codex");

  return {
    codexHome,
    sessionsDir: join(codexHome, "sessions"),
    cacheDir: join(codexHome, "codex-resume")
  };
}
