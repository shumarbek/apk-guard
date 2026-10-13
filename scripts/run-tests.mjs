import { spawn } from "node:child_process";
import { resolve } from "node:path";
const child = spawn(
  process.execPath,
  [resolve("node_modules/vitest/vitest.mjs"), "run", "--hookTimeout", "30000"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: resolve(".wrangler/test-config"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
