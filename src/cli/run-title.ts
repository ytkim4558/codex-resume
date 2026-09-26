import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TitleCommand } from "./parse-argv.js";

const ACTION_ID = "User.renameTab.Codex";
const HOTKEY = "ctrl+alt+shift+t";
const SENDKEYS = "^%+t";

type TerminalSettings = {
  actions?: unknown[];
  keybindings?: unknown[];
  [key: string]: unknown;
};

type TerminalAction = {
  id?: unknown;
  command?: unknown;
  [key: string]: unknown;
};

type TerminalKeybinding = {
  id?: unknown;
  keys?: unknown;
  [key: string]: unknown;
};

export async function runTitle(command: TitleCommand): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("codex-resume title is only supported on Windows Terminal.");
  }

  const settingsPath = findWindowsTerminalSettingsPath();
  const changed = upsertRenameTabAction(settingsPath, command.title, command.dryRun);
  if (command.dryRun) {
    console.log(`Would update: ${settingsPath}`);
    console.log(`Title: ${command.title}`);
    console.log(`Target: ${command.target ?? "(newest WindowsTerminal window)"}`);
    console.log(`Settings changed: ${changed}`);
    return;
  }

  const result = sendRenameHotkey(command.target);
  console.log(`settings: ${settingsPath}`);
  console.log(`settings changed: ${changed}`);
  console.log(result);
}

function findWindowsTerminalSettingsPath(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is not set.");
  }

  const candidates = [
    join(localAppData, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
    join(localAppData, "Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json"),
    join(localAppData, "Microsoft", "Windows Terminal", "settings.json")
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Windows Terminal settings.json was not found.");
  }
  return found;
}

function upsertRenameTabAction(settingsPath: string, title: string, dryRun: boolean): boolean {
  const original = readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(original) as TerminalSettings;
  const actions = Array.isArray(settings.actions) ? settings.actions as TerminalAction[] : [];
  const keybindings = Array.isArray(settings.keybindings) ? settings.keybindings as TerminalKeybinding[] : [];

  const action = actions.find((item) => item.id === ACTION_ID);
  if (action) {
    action.command = { action: "renameTab", title };
  } else {
    actions.push({ id: ACTION_ID, command: { action: "renameTab", title } });
  }

  const keybinding = keybindings.find((item) => item.id === ACTION_ID);
  if (keybinding) {
    keybinding.keys = HOTKEY;
  } else {
    keybindings.push({ id: ACTION_ID, keys: HOTKEY });
  }

  settings.actions = actions;
  settings.keybindings = keybindings;
  const next = `${JSON.stringify(settings, null, 2)}\n`;
  if (next === original) {
    return false;
  }
  if (dryRun) {
    return true;
  }
  writeFileSync(settingsPath, next, "utf8");
  return true;
}

function sendRenameHotkey(target?: string): string {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'
$target = $env:CODEX_RESUME_TITLE_TARGET
$windows = Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }
if ($target) {
  $matches = @($windows | Where-Object { $_.MainWindowTitle -like "*$target*" })
  if ($matches.Count -eq 0) { throw "No Windows Terminal window matched target: $target" }
  if ($matches.Count -gt 1) {
    $titles = ($matches | ForEach-Object { "$($_.Id): $($_.MainWindowTitle)" }) -join '; '
    throw "Multiple Windows Terminal windows matched target: $titles"
  }
  $window = $matches[0]
} else {
  $window = $windows | Sort-Object Id -Descending | Select-Object -First 1
  if (-not $window) { throw 'No Windows Terminal window found.' }
}
$ok = [Win32]::SetForegroundWindow($window.MainWindowHandle)
Start-Sleep -Milliseconds 700
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys('${SENDKEYS}')
Start-Sleep -Milliseconds 700
$window.Refresh()
"foreground=$ok id=$($window.Id) title=$($window.MainWindowTitle)"
`;

  return execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, CODEX_RESUME_TITLE_TARGET: target ?? "" },
    windowsHide: true
  }).trim();
}
