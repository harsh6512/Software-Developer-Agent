import { Daytona, Sandbox, SandboxState } from "@daytonaio/sdk";
import { createLogger } from "./logger.js";
import { DEFAULT_SANDBOX_CREATE_PARAMS, DEFAULT_SANDBOX_IMAGE_PARAMS } from "../constants.js"

const logger = createLogger("Sandbox");

// Singleton instance of the Daytona client
let daytonaInstance: Daytona | null = null;

export function daytonaClient(): Daytona {
  if (!daytonaInstance) {
    daytonaInstance = new Daytona();
  }
  return daytonaInstance;
}

/**
 * Creates a new Daytona sandbox workspace.
 * Tries the snapshot first, with graceful fallback to standard image.
 */
export async function createSandbox(): Promise<Sandbox> {
  logger.info("Creating new Daytona sandbox...");
  let sandbox: Sandbox;
  try {
    sandbox = await daytonaClient().create(DEFAULT_SANDBOX_CREATE_PARAMS, { timeout: 100 });
  } catch (err) {
    logger.warn("Failed with snapshot params, falling back to base image params...", { err });
    sandbox = await daytonaClient().create(DEFAULT_SANDBOX_IMAGE_PARAMS, { timeout: 120 });
  }

  // Dynamically wait until live (usually 2-4 seconds, zero wasted time)
  await waitForSandboxReady(sandbox);

  return sandbox;
}
/**
 * Retrieves an existing sandbox by ID or reconnects if stopped.
 */
export async function getSandbox(sandboxSessionId: string): Promise<Sandbox> {
  const sandbox = await daytonaClient().get(sandboxSessionId);
  if (sandbox.state === "stopped" || sandbox.state === "archived") {
    logger.info(`Sandbox ${sandboxSessionId} is stopped. Starting it...`);
    await sandbox.start();
  }
  return sandbox;
}

/**
 * Deletes the Daytona sandbox workspace to free cloud resources.
 */
export async function deleteSandbox(sandboxSessionId: string): Promise<boolean> {
  try {
    logger.info(`Deleting sandbox ${sandboxSessionId}...`);
    const sandbox = await daytonaClient().get(sandboxSessionId);
    await daytonaClient().delete(sandbox);
    logger.info(`Successfully deleted sandbox ${sandboxSessionId}.`);
    return true;
  } catch (error) {
    logger.error("Failed to delete sandbox", { sandboxSessionId, error });
    return false;
  }
}

/**
 * Dynamically waits until the sandbox daemon is responsive.
 * Resolves as soon as the daemon replies (no wasted seconds).
 */
export async function waitForSandboxReady(sandbox: Sandbox, maxTimeoutMs = 30000): Promise<void> {
  // If SDK has built-in event-driven waitUntilStarted, use it
  if (typeof (sandbox as any).waitUntilStarted === "function") {
    await (sandbox as any).waitUntilStarted(Math.floor(maxTimeoutMs / 1000));
    return;
  }

  // Otherwise, probe with a fast ping every 500ms
  const start = Date.now();
  while (Date.now() - start < maxTimeoutMs) {
    try {
      const res = await sandbox.process.executeCommand("true", "/home/daytona");
      if (res.exitCode === 0) {
        return; // Daemon is live! Proceed immediately.
      }
    } catch {
      // Daemon still booting, wait 500ms before probing again
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Sandbox daemon failed to initialize within ${maxTimeoutMs / 1000}s`);
}

