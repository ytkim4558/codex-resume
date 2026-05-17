import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { detectCodexPaths } from "../infra/codex-paths.js";

export async function runDoctor(): Promise<void> {
  const paths = detectCodexPaths();
  const sessionsReadable = await isReadable(paths.sessionsDir);
  const cacheReadable = await isReadable(paths.cacheDir);

  console.log("codex-resume doctor");
  console.log(`codex home: ${paths.codexHome}`);
  console.log(`sessions dir: ${paths.sessionsDir}`);
  console.log(`cache dir: ${paths.cacheDir}`);
  console.log(`sessions readable: ${sessionsReadable}`);
  console.log(`cache readable: ${cacheReadable}`);
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
