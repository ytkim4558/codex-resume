import { spawn } from "node:child_process";

export async function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });

    child.on("error", (error: Error & { code?: string }) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            [
              `Command not found: ${command}`,
              "Install OpenAI Codex CLI or set CODEX_RESUME_CODEX_BIN to the full executable path.",
              "Windows example: npm install -g @openai/codex",
            ].join("\n"),
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
