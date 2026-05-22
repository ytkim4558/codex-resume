import { homedir } from "node:os";
import { join } from "node:path";
export function detectCodexPaths() {
    const home = homedir();
    const codexHome = join(home, ".codex");
    return {
        codexHome,
        sessionsDir: join(codexHome, "sessions"),
        cacheDir: join(codexHome, "codex-resume")
    };
}
