import { GraphState, GraphUpdate } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getSandboxWithErrorHandling } from "../../../utils/sandbox.js";

const logger = createLogger("InitializeSandboxNode");

export async function initializeSandbox(state: GraphState): Promise<GraphUpdate> {
    const { targetRepository, branchName, sandboxSessionId } = state;
    const repoName = `${targetRepository.owner}/${targetRepository.repo}`;

    logger.info(`Initializing sandbox for repository: ${repoName}`);

    // getSandboxWithErrorHandling creates or retrieves the sandbox, clones the repo, and runs tree.ts
    const { sandbox, codebaseTree } = await getSandboxWithErrorHandling(
        sandboxSessionId,
        targetRepository,
        branchName,
    );

    logger.info(`Sandbox ready with ID: ${sandbox.id}`);

    return {
        sandboxSessionId: sandbox.id,
        codebaseTree: codebaseTree ?? undefined
    };
}
