import { spawn } from "node:child_process";
// Windows + Node 20+ rejects spawning shell scripts (.cmd/.bat/.ps1) when
// shell:false due to CVE-2024-27980 hardening, returning EINVAL.
// npm-installed CLIs such as `codex` resolve to `codex.cmd` on Windows,
// so we must let cmd.exe handle the resolution by passing shell:true there.
// Session IDs are UUIDs so no shell-metachar injection risk for our case.
const isWindows = process.platform === "win32";
export async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: "inherit",
            shell: isWindows,
            windowsHide: true,
        });
        child.on("error", (error) => {
            if (error.code === "ENOENT") {
                reject(new Error([
                    `Command not found: ${command}`,
                    "Install OpenAI Codex CLI or set CODEX_RESUME_CODEX_BIN to the full executable path.",
                    "Windows example: npm install -g @openai/codex",
                ].join("\n")));
                return;
            }
            reject(error);
        });
        child.on("exit", (code) => resolve(code ?? 1));
    });
}
