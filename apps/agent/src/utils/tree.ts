import { Sandbox } from "@daytonaio/sdk";
import { TargetRepository, SANDBOX_ROOT_DIR, TIMEOUT_SEC, getRepoAbsolutePath } from "@agentic/shared";
import { createLogger } from "./logger.js";
import { createShellExecutor } from "./shell-executor.js";

const logger = createLogger("Tree");

export const FAILED_TO_GENERATE_TREE_MESSAGE = "Failed to generate tree. Please try again.";

/**
 * Generates a clean directory tree of the repository inside the Daytona sandbox.
 */
export async function getCodebaseTree(
    sandbox: Sandbox,
    targetRepository: TargetRepository,
): Promise<string> {
    const repoDir = getRepoAbsolutePath(targetRepository);
    const executor = createShellExecutor();

    logger.info("Generating codebase tree for repository", { repoDir });

    try {
        // 1. Try git ls-files | tree --fromfile -L 3 (fastest and ignores gitignored files)
        const gitTreeRes = await executor.executeCommand({
            command: "git ls-files | tree --fromfile -L 3",
            workdir: repoDir,
            timeout: TIMEOUT_SEC,
            sandbox,
        });

        if (gitTreeRes.exitCode === 0 && gitTreeRes.result.trim().length > 0) {
            return gitTreeRes.result;
        }

        // 2. Fallback to standard tree command excluding common junk
        const fallbackTreeRes = await executor.executeCommand({
            command: "tree -L 3 -I '.git|node_modules|dist|build|.next|coverage|__pycache__|.venv'",
            workdir: repoDir,
            timeout: TIMEOUT_SEC,
            sandbox,
        });

        if (fallbackTreeRes.exitCode === 0) {
            return fallbackTreeRes.result;
        }

        return FAILED_TO_GENERATE_TREE_MESSAGE;
    } catch (error) {
        logger.error("Failed to generate tree", { error });
        return FAILED_TO_GENERATE_TREE_MESSAGE;
    }
}
