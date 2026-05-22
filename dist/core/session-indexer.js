import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseSessionFile } from "./session-parser.js";
export async function buildSessionIndex(rootDir) {
    const files = await collectJsonlFiles(rootDir);
    const parsed = await Promise.all(files.map((file) => parseSessionFile(file)));
    return parsed.map(toSessionRecord).sort(compareByUpdatedAtDesc);
}
async function collectJsonlFiles(rootDir) {
    const results = [];
    await walk(rootDir, results);
    return results;
}
async function walk(currentDir, output) {
    let entries;
    try {
        entries = await readdir(currentDir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
            await walk(fullPath, output);
            continue;
        }
        if (entry.isFile() && fullPath.endsWith(".jsonl")) {
            output.push(fullPath);
        }
    }
}
function toSessionRecord(parsed) {
    const firstUser = parsed.messages.find((message) => message.role === "user");
    const assistantMessages = parsed.messages.filter((message) => message.role === "assistant");
    const lastAssistant = assistantMessages.at(-1);
    return {
        sessionId: parsed.sessionId,
        title: parsed.title ?? firstUser?.content.slice(0, 80),
        cwd: parsed.cwd,
        startedAt: parsed.startedAt,
        updatedAt: parsed.updatedAt ?? parsed.startedAt,
        firstUserMessage: firstUser?.content,
        lastAssistantMessage: lastAssistant?.content,
        messageCount: parsed.messages.length,
        sourcePath: parsed.sourcePath
    };
}
function compareByUpdatedAtDesc(left, right) {
    const leftValue = left.updatedAt ?? "";
    const rightValue = right.updatedAt ?? "";
    return rightValue.localeCompare(leftValue);
}
