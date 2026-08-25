import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const startScript = join(repositoryRoot, "scripts", "start-standalone.mjs");
const processes = new Set();

afterEach(() => {
  for (const processToStop of processes) processToStop.kill("SIGKILL");
  processes.clear();
});

describe.skipIf(process.platform === "win32")("standalone process signals", () => {
  it("forwards SIGTERM and exits with the child's termination signal", async () => {
    const root = await mkdtemp(join(tmpdir(), "marketvalley-standalone-"));
    const standalone = join(root, ".next", "standalone");
    await mkdir(join(root, "public"), { recursive: true });
    await mkdir(join(root, ".next", "static"), { recursive: true });
    await mkdir(standalone, { recursive: true });
    await writeFile(join(standalone, "server.js"), [
      "require('node:fs').writeFileSync('child.pid', String(process.pid));",
      "process.stdout.write('ready\\n');",
      "setInterval(() => {}, 1_000);",
    ].join("\n"));

    const parent = spawn(process.execPath, [startScript, "3199"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    processes.add(parent);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("standalone child did not start")), 5_000);
      parent.once("error", reject);
      parent.stdout.on("data", (chunk) => {
        if (!String(chunk).includes("ready")) return;
        clearTimeout(timeout);
        resolve();
      });
    });
    const childPid = Number(await readFile(join(standalone, "child.pid"), "utf8"));

    parent.kill("SIGTERM");
    const exit = await new Promise((resolve) => {
      parent.once("exit", (code, signal) => resolve({ code, signal }));
    });
    processes.delete(parent);

    expect(exit).toEqual({ code: null, signal: "SIGTERM" });
    expect(() => process.kill(childPid, 0)).toThrow();
  }, 10_000);
});
