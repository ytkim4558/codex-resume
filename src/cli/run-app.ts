import type { AppCommand } from "./parse-argv.js";

export async function runApp(_command: AppCommand): Promise<void> {
  console.log("The dependency-free picker is implemented in dist/main.js.");
  console.log("Run `node .\\dist\\main.js` while the TypeScript source is being promoted.");
}
