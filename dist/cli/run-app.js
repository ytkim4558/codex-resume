import { emitKeypressEvents } from "node:readline";
import { createRequire } from "node:module";
import { stdin, stdout } from "node:process";
import { runResume } from "./run-resume.js";
import { detectCodexPaths } from "../infra/codex-paths.js";
import { buildSessionIndex } from "../core/session-indexer.js";
import { searchSessions } from "../core/session-search.js";
const require = createRequire(import.meta.url);
const DEFAULT_LIMIT = 20;
export async function runApp(command) {
    const paths = detectCodexPaths();
    const index = await buildSessionIndex(paths.sessionsDir);
    const sessions = searchSessions(index, command.query);
    if (sessions.length === 0) {
        console.log(`No sessions found in ${paths.sessionsDir}`);
        if (command.query) {
            console.log(`(query: "${command.query}")`);
        }
        return;
    }
    if (!stdin.isTTY || !stdout.isTTY) {
        printSessionList(sessions.slice(0, DEFAULT_LIMIT));
        console.log("(stdin/stdout is not a TTY; run interactively or use `codex-resume resume <id>`.)");
        return;
    }
    const blessed = loadBlessed();
    if (blessed) {
        await runBlessedPicker(blessed, sessions, command.query);
        return;
    }
    await runRawPicker(sessions, command.query);
}
async function runBlessedPicker(blessed, sessions, initialQuery) {
    let query = initialQuery;
    let filtered = searchSessions(sessions, query);
    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        title: "codex-resume"
    });
    const header = blessed.box({
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        tags: true,
        padding: { left: 1, right: 1 },
        style: { fg: "white", bg: "blue" }
    });
    const list = blessed.list({
        top: 3,
        left: 0,
        width: "42%",
        height: "100%-4",
        keys: true,
        mouse: true,
        vi: true,
        tags: true,
        border: { type: "line" },
        label: " Sessions ",
        scrollbar: { ch: " ", track: { bg: "black" }, style: { bg: "cyan" } },
        style: {
            border: { fg: "cyan" },
            selected: { bg: "cyan", fg: "black", bold: true },
            item: { fg: "white" }
        }
    });
    const preview = blessed.box({
        top: 3,
        left: "42%",
        width: "58%",
        height: "100%-4",
        keys: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        tags: true,
        border: { type: "line" },
        label: " Detail ",
        padding: { left: 1, right: 1 },
        scrollbar: { ch: " ", track: { bg: "black" }, style: { bg: "cyan" } },
        style: { border: { fg: "cyan" }, fg: "white" }
    });
    const footer = blessed.box({
        bottom: 0,
        left: 0,
        width: "100%",
        height: 1,
        tags: true,
        content: " Type to search  Backspace delete  Up/Down move  Enter resume  Tab detail  q/Esc quit ",
        style: { fg: "black", bg: "white" }
    });
    screen.append?.(header);
    screen.append?.(list);
    screen.append?.(preview);
    screen.append?.(footer);
    function selectedSession() {
        return filtered[list.selected ?? 0];
    }
    function setHeader(message = "") {
        const status = message ? `  {yellow-fg}${escapeTags(message)}{/}` : "";
        header.setContent(`{bold}codex-resume{/bold}  OpenAI Codex session browser\nSearch: {cyan-fg}${escapeTags(query || "(type to filter)")}{/}${status}`);
    }
    function updatePreview() {
        const session = selectedSession();
        if (!session) {
            preview.setContent("{center}No matching sessions{/center}");
            return;
        }
        preview.setContent(buildBlessedPreview(session));
        preview.setScroll?.(0);
    }
    function updateList(keepIndex = 0) {
        filtered = searchSessions(sessions, query);
        const labels = filtered.map(formatBlessedListLine);
        list.setItems(labels.length ? labels : [" No matching sessions"]);
        list.select(Math.min(Math.max(0, keepIndex), Math.max(0, labels.length - 1)));
        updatePreview();
        setHeader();
        screen.render?.();
    }
    list.on("select item", () => {
        const session = selectedSession();
        if (!session)
            return;
        screen.destroy?.();
        void runResume({ kind: "resume", sessionId: session.sessionId, here: false });
    });
    list.on("select", updatePreview);
    screen.key(["escape", "q", "C-c"], () => {
        screen.destroy?.();
    });
    screen.key(["tab"], () => {
        preview.focus?.();
        screen.render?.();
    });
    preview.key(["tab", "escape"], () => {
        list.focus?.();
        screen.render?.();
    });
    screen.key(["backspace", "C-h"], () => {
        query = query.slice(0, -1);
        updateList(0);
    });
    screen.on("keypress", (ch, key) => {
        if (typeof ch !== "string")
            return;
        if (isKeyRecord(key) && (key.ctrl || key.meta))
            return;
        if (isKeyRecord(key) && key.name && ["up", "down", "left", "right", "return", "enter", "escape", "tab", "backspace"].includes(key.name))
            return;
        if (ch >= " ") {
            query += ch;
            updateList(0);
        }
    });
    updateList(0);
    list.focus?.();
    await new Promise((resolve) => screen.on("destroy", () => resolve()));
}
async function runRawPicker(sessions, initialQuery) {
    let query = initialQuery;
    let cursor = 0;
    let filtered = searchSessions(sessions, query);
    emitKeypressEvents(stdin);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const cleanup = () => {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdout.write("\x1b[?25h");
    };
    const render = () => {
        filtered = searchSessions(sessions, query);
        if (cursor >= filtered.length)
            cursor = Math.max(0, filtered.length - 1);
        stdout.write("\x1b[?25l\x1b[2J\x1b[H");
        printRawPicker(filtered, cursor, query);
    };
    render();
    await new Promise((resolve, reject) => {
        stdin.on("keypress", (str, key) => {
            void (async () => {
                try {
                    if (key.ctrl && key.name === "c") {
                        cleanup();
                        resolve();
                        return;
                    }
                    if (key.name === "escape" || key.name === "q") {
                        cleanup();
                        resolve();
                        return;
                    }
                    if (key.name === "backspace") {
                        query = query.slice(0, -1);
                        cursor = 0;
                        render();
                        return;
                    }
                    if (key.name === "up") {
                        cursor = Math.max(0, cursor - 1);
                        render();
                        return;
                    }
                    if (key.name === "down") {
                        cursor = Math.min(Math.max(0, filtered.length - 1), cursor + 1);
                        render();
                        return;
                    }
                    if (key.name === "return") {
                        const selected = filtered[cursor];
                        cleanup();
                        if (selected) {
                            await runResume({ kind: "resume", sessionId: selected.sessionId, here: false });
                        }
                        resolve();
                        return;
                    }
                    if (str && !key.ctrl && !key.meta && str >= " ") {
                        query += str;
                        cursor = 0;
                        render();
                    }
                }
                catch (error) {
                    cleanup();
                    reject(error);
                }
            })();
        });
    });
}
function loadBlessed() {
    try {
        return require("blessed");
    }
    catch {
        return undefined;
    }
}
function printSessionList(sessions) {
    for (const [i, session] of sessions.entries()) {
        console.log(`${String(i + 1).padStart(2, " ")} ${formatDate(session.updatedAt)} ${session.sessionId} ${oneLine(session.title ?? "")}`);
    }
}
function printRawPicker(sessions, cursor, query) {
    const rows = stdout.rows || 32;
    const columns = stdout.columns || 120;
    const listWidth = Math.min(Math.max(52, Math.floor(columns * 0.43)), Math.max(52, columns - 64));
    const previewWidth = Math.max(36, columns - listWidth - 3);
    const maxRows = Math.max(5, rows - 6);
    const visible = sessions.slice(0, maxRows);
    const selected = sessions[cursor];
    const preview = selected ? buildPreviewLines(selected, previewWidth).slice(0, maxRows) : ["No matching sessions"];
    console.log(fitLine("codex-resume  OpenAI Codex session browser", columns));
    console.log(fitLine(`Search: ${query || "(type to filter)"}`, columns));
    console.log(fitLine("Up/Down move  Enter resume  q/Esc quit", columns));
    console.log("-".repeat(columns));
    for (let i = 0; i < maxRows; i += 1) {
        const session = visible[i];
        const left = session ? formatRawListLine(session, i === cursor, listWidth) : "";
        const right = preview[i] ?? "";
        console.log(`${padRight(left, listWidth)} | ${fitLine(right, previewWidth)}`);
    }
}
function formatBlessedListLine(session) {
    const title = escapeTags(oneLine(session.title ?? session.sessionId));
    return ` {cyan-fg}${formatDate(session.updatedAt)}{/} {yellow-fg}${String(session.messageCount).padStart(3, " ")}{/} ${title}`;
}
function buildBlessedPreview(session) {
    return [
        `{bold}{cyan-fg}Title{/}    ${escapeTags(oneLine(session.title ?? "(untitled)"))}`,
        "",
        `{bold}Updated{/}  ${escapeTags(formatDate(session.updatedAt))}`,
        `{bold}Messages{/} ${session.messageCount}`,
        `{bold}ID{/}       ${escapeTags(session.sessionId)}`,
        `{bold}CWD{/}      ${escapeTags(session.cwd ?? "(unknown)")}`,
        "",
        "{bold}{green-fg}User request{/}",
        escapeTags(cleanForDisplay(session.firstUserMessage ?? "(none)")),
        "",
        "{bold}{magenta-fg}Latest assistant{/}",
        escapeTags(cleanForDisplay(session.lastAssistantMessage ?? "(none)"))
    ].join("\n");
}
function formatRawListLine(session, selected, width) {
    const marker = selected ? ">" : " ";
    return fitLine(`${marker} ${formatDate(session.updatedAt)} ${String(session.messageCount).padStart(3, " ")} ${oneLine(session.title ?? session.sessionId)}`, width);
}
function buildPreviewLines(session, width) {
    return [
        "Selected session",
        "-".repeat(width),
        `Title    ${oneLine(session.title ?? "(untitled)")}`,
        `Updated  ${formatDate(session.updatedAt)}`,
        `Messages ${session.messageCount}`,
        `ID       ${session.sessionId}`,
        `CWD      ${session.cwd ?? "(unknown)"}`,
        "",
        "User request",
        cleanForDisplay(session.firstUserMessage ?? "(none)"),
        "",
        "Latest assistant",
        cleanForDisplay(session.lastAssistantMessage ?? "(none)")
    ].map((line) => fitLine(line, width));
}
function isKeyRecord(value) {
    return typeof value === "object" && value !== null;
}
function escapeTags(value) {
    return value.replace(/[{}]/g, "");
}
function cleanForDisplay(value) {
    return oneLine(value)
        .replace(/<image[^>]*>/gi, "[image]")
        .replace(/<\/image>/gi, "")
        .trim();
}
function oneLine(value) {
    return value.replace(/\s+/g, " ").trim();
}
function formatDate(value) {
    if (!value)
        return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value.slice(0, 16);
    return date.toISOString().replace("T", " ").slice(0, 16);
}
function fitLine(value, width) {
    const clean = oneLine(value);
    return clean.length > width ? `${clean.slice(0, Math.max(0, width - 1))}...` : clean;
}
function padRight(value, width) {
    return value.length >= width ? fitLine(value, width) : value + " ".repeat(width - value.length);
}
