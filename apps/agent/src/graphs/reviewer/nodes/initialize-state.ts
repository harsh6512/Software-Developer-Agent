import { GraphConfig, GraphState, GraphUpdate, getRepoAbsolutePath } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { daytonaClient } from "../../../utils/sandbox.js";
import { createShellExecutor } from "../../../utils/shell-executor.js";

const logger = createLogger("InitializeReviewerState");

export async function initializeState(
    state: GraphState,
    _config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Initializing reviewer state & diff...");

    const sandbox = await daytonaClient().get(state.sandboxSessionId);
    const repoPath = getRepoAbsolutePath(state.targetRepository);
    const executor = createShellExecutor();

    const statusRes = await executor.executeCommand({
        command: `git -C "${repoPath}" status -s`,
        workdir: repoPath,
        sandbox,
    });

    const diffRes = await executor.executeCommand({
        command: `git -C "${repoPath}" diff HEAD~1 || git -C "${repoPath}" diff`,
        workdir: repoPath,
        sandbox,
    });

    const changedFiles = statusRes.result || "No modified files.";
    const gitDiff = diffRes.result || "No git diff available.";

    return {
        contextGatheringNotes: `=== Changed Files ===\n${changedFiles}\n\n=== Git Diff ===\n${gitDiff.slice(0, 15000)}`,
    };
}