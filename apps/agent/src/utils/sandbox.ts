import { Daytona, Sandbox, SandboxState } from "@daytonaio/sdk";
import { TargetRepository } from "@agentic/shared";
import { createLogger } from "./logger.js";
import { DEFAULT_SANDBOX_CREATE_PARAMS, DEFAULT_SANDBOX_IMAGE_PARAMS } from "../constants.js"
import { cloneRepo } from "./github/git.js";
import { getCodebaseTree, FAILED_TO_GENERATE_TREE_MESSAGE } from "./tree.js";

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

/**
 * Full agent lifecycle sandbox manager:
 * - Reconnects if the sandbox is already started
 * - Starts the sandbox if it was stopped/asleep
 * - Transparently re-provisions and re-clones the repo if missing or unrecoverable
 */
export async function getSandboxWithErrorHandling(
  sandboxSessionId: string | undefined,
  targetRepository: TargetRepository,
  branchName: string = "main",
  options: { githubInstallationToken?: string } = {},
): Promise<{
  sandbox: Sandbox;
  codebaseTree: string | null;
  dependenciesInstalled: boolean;
}> {
  try {
    if (!sandboxSessionId) {
      throw new Error("No sandbox ID provided.");
    }

    logger.info("Getting existing sandbox session...", { sandboxSessionId });
    const sandbox = await daytonaClient().get(sandboxSessionId);
    const state = sandbox.state;

    if (state === "started") {
      return {
        sandbox,
        codebaseTree: null,
        dependenciesInstalled: false,
      };
    }

    if (state === "stopped" || state === "archived") {
      logger.info(`Sandbox ${sandboxSessionId} is ${state}. Starting it...`);
      await sandbox.start();
      await waitForSandboxReady(sandbox);
      return {
        sandbox,
        codebaseTree: null,
        dependenciesInstalled: false,
      };
    }

    throw new Error(`Sandbox in unrecoverable state: ${state}`);
  } catch (error) {
    logger.info("Provisioning fresh sandbox (due to missing ID, unrecoverable state, or error)...");

    let sandbox: Sandbox | null = null;
    let attempts = 0;
    while (!sandbox && attempts < 3) {
      try {
        sandbox = await createSandbox();
      } catch (err) {
        attempts++;
        logger.warn(`Sandbox creation attempt ${attempts} failed. Retrying...`);
      }
    }

    if (!sandbox) {
      throw new Error("Failed to create sandbox after 3 attempts");
    }

    // Clone the target repository into /home/daytona
    await cloneRepo(sandbox, targetRepository, {
      githubInstallationToken: options.githubInstallationToken,
      stateBranchName: branchName,
    });

    // Generate the initial directory file tree
    const tree = await getCodebaseTree(sandbox, targetRepository);
    const codebaseTree = tree === FAILED_TO_GENERATE_TREE_MESSAGE ? null : tree;

    logger.info("Sandbox and repository setup completed successfully", {
      sandboxId: sandbox.id,
      hasTree: !!codebaseTree,
    });

    return {
      sandbox,
      codebaseTree,
      dependenciesInstalled: false,
    };
  }
}