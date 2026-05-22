import { spawn } from "node:child_process";
export async function commandExists(command) {
    const probe = process.platform === "win32" ? "where.exe" : "command";
    const args = process.platform === "win32" ? [command] : ["-v", command];
    return new Promise((resolve) => {
        const child = spawn(probe, args, { stdio: "ignore", shell: process.platform !== "win32" });
        child.on("error", () => resolve(false));
        child.on("exit", (code) => resolve(code === 0));
    });
}
