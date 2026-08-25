import { cpSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const port = process.argv[2] ?? "3000";
if (!/^[1-9][0-9]{0,4}$/u.test(port) || Number(port) > 65_535) {
  throw new Error("A valid standalone server port is required");
}

const root = process.cwd();
const standaloneDirectory = join(root, ".next", "standalone");
const serverPath = join(standaloneDirectory, "server.js");
if (!existsSync(serverPath)) {
  throw new Error("Run next build before starting the standalone server");
}

for (const [source, destination] of [
  [join(root, "public"), join(standaloneDirectory, "public")],
  [join(root, ".next", "static"), join(standaloneDirectory, ".next", "static")],
]) {
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

const child = spawn(process.execPath, [serverPath], {
  cwd: standaloneDirectory,
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: port,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
