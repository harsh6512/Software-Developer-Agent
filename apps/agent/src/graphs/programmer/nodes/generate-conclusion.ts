// apps/agent/src/graphs/programmer/nodes/generate-conclusion.ts
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    getActivePlanItems,
    getRepoAbsolutePath,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";
import { createShellExecutor } from "../../../utils/shell-executor.js";
import { daytonaClient } from "../../../utils/sandbox.js";

const logger = createLogger("GenerateConclusion");

export async function generateConclusion(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Generating final work conclusion");

    let gitDiff = "No git diff available";
    try {
        const sandbox = await daytonaClient().get(state.sandboxSessionId);
        const repoPath = getRepoAbsolutePath(state.targetRepository);
        const executor = createShellExecutor();
        const diffResult = await executor.executeCommand({
            command: `git -C "${repoPath}" diff HEAD~1 || git -C "${repoPath}" status -s`,
            workdir: repoPath,
            sandbox,
        });
        gitDiff = diffResult.result || "No modifications detected.";
    } catch (err: any) {
        logger.warn("Could not retrieve git diff for conclusion", {
            error: err.message,
        });
    }
    if (!state.taskPlan) {
        throw new Error("Cannot generate conclusion without an active task plan.");
    }

    const planSummary = getActivePlanItems(state.taskPlan)
        .filter((item) => item.completed)
        .map(
            (item) =>
                `- Step ${item.index}: ${item.plan} (${item.summary || "Completed"})`
        )
        .join("\n");

    const prompt = `<identity>
You are an expert software developer summarizing all completed work for a Pull Request.
</identity>

<completed_tasks>
${planSummary}
</completed_tasks>

<git_diff>
${gitDiff.slice(0, 10000)}
</git_diff>

Please write a comprehensive, professional summary of the solution implemented:
1. Overview of the problem and the implemented fix/feature.
2. List of key files modified or added.
3. Verification and tests performed.`;

    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.SUMMARIZER);

    const response = (await model.invoke([new SystemMessage(prompt)])) as AIMessage;

    return {
        messages: [response],
        internalMessages: [response],
    };
}
