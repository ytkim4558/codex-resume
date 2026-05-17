import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { detectCodexPaths } from "../infra/codex-paths.js";
import { resolveCodexCommand } from "../core/session-resumer.js";
import { commandExists } from "../infra/command-exists.js";

export async function runDoctor(): Promise<void> {
  const paths = detectCodexPaths();
  const sessionsReadable = await isReadable(paths.sessionsDir);
  const cacheReadable = await isReadable(paths.cacheDir);
  const codexCommand = resolveCodexCommand();
  const codexAvailable = await commandExists(codexCommand);

  console.log("codex-resume doctor");
  console.log(`codex home: ${paths.codexHome}`);
  console.log(`sessions dir: ${paths.sessionsDir}`);
  console.log(`cache dir: ${paths.cacheDir}`);
  console.log(`sessions readable: ${sessionsReadable}`);
  console.log(`cache readable: ${cacheReadable}`);
  console.log(`codex command: ${codexCommand}`);
  console.log(`codex available: ${codexAvailable}`);
  if (!codexAvailable) {
    console.log("hint: install Codex CLI with `npm install -g @openai/codex` or set CODEX_RESUME_CODEX_BIN.");
  }
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
