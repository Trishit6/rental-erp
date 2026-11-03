import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";

async function findAvailablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate an API port");
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

let child: ChildProcess | undefined;

afterEach(async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const processToStop = child;
  child = undefined;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      processToStop.kill("SIGKILL");
      resolve();
    }, 3_000);
    processToStop.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    processToStop.kill("SIGTERM");
  });
});

describe("API startup readiness", () => {
  it("loads every mounted route and opens a listener before the dev proxy is used", async () => {
    const output: string[] = [];
    const port = await findAvailablePort();
    child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, API_PORT: String(port), NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const started = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`API did not become ready within 15 seconds.\n${output.join("")}`));
      }, 15_000);
      const inspect = (chunk: Buffer) => {
        const text = chunk.toString();
        output.push(text);
        if (text.includes("Revaro API listening on")) {
          clearTimeout(timeout);
          resolve(output.join(""));
        }
      };
      child?.stdout?.on("data", inspect);
      child?.stderr?.on("data", inspect);
      child?.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child?.once("exit", (code, signal) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `API exited before listening (code ${code}, signal ${signal}).\n${output.join("")}`,
          ),
        );
      });
    });

    const log = await started;
    expect(log).toContain(`Revaro API listening on http://localhost:${port}`);

    // Call the API directly rather than through Vite: this catches module-load
    // and route-mount failures before they surface as browser proxy errors, while
    // /auth/csrf remains independent of MariaDB availability.
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-csrf-token")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await response.json()).toMatchObject({ success: true, data: { csrf: true } });
    expect(child.exitCode).toBeNull();
  }, 20_000);
});
