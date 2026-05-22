#!/usr/bin/env node
import { parseArgv } from "./cli/parse-argv.js";
import { runApp } from "./cli/run-app.js";
import { runDoctor } from "./cli/run-doctor.js";
import { runIndex } from "./cli/run-index.js";
import { runList } from "./cli/run-list.js";
import { runResume } from "./cli/run-resume.js";
const VERSION = "0.1.0";
async function main() {
    const command = parseArgv(process.argv.slice(2));
    switch (command.kind) {
        case "app":
            await runApp(command);
            return;
        case "doctor":
            await runDoctor();
            return;
        case "index":
            await runIndex();
            return;
        case "list":
            await runList(command);
            return;
        case "resume":
            await runResume(command);
            return;
        case "version":
            console.log(`codex-resume ${VERSION}`);
            return;
        default: {
            const exhaustiveCheck = command;
            throw new Error(`Unhandled command: ${JSON.stringify(exhaustiveCheck)}`);
        }
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex-resume] ${message}`);
    process.exitCode = 1;
});
