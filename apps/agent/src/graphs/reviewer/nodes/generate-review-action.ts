import { AIMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    getActivePlanItems,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";
import { daytonaClient } from "../../../utils/sandbox.js";
import { createViewTool, createGrepTool, createShellTool } from "../../../tools/index.js";

const logger = createLogger("GenerateReviewActions");

export async function generateReviewActions(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Generating reviewer exploration actions...");

    const sandbox = await daytonaClient().get(state.sandboxSessionId);
    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.REVIEWER);

    const viewTool = createViewTool({ sandbox, targetRepository: state.targetRepository });
    const grepTool = createGrepTool({ sandbox, targetRepository: state.targetRepository });
    const shellTool = createShellTool(sandbox, state.targetRepository);

    const modelWithTools = model.bindTools([viewTool, grepTool, shellTool], {
        tool_choice: "auto",
    });

    if (!state.taskPlan) {
        throw new Error("Cannot generate review actions without an active task plan.");
    }

    const activePlan = getActivePlanItems(state.taskPlan);
    const planSummary = activePlan
        .map((item) => `- Step ${item.index}: ${item.plan} (${item.summary || "Done"})`)
        .join("\n");

    const prompt = `<identity>
You are an expert Code Reviewer assessing changes made by an autonomous developer agent.
</identity>

<task_plan>
${planSummary}
</task_plan>

<changes_and_diff>
${state.contextGatheringNotes}
</changes_and_diff>

<instructions>
1. Carefully inspect the git diff.
2. If you need to view complete file context or search for references, call 'view', 'grep', or 'shell'.
3. Once you have gathered sufficient context to formulate your review verdict, simply output your findings without calling any more tools.
</instructions>`;

    const response = (await modelWithTools.invoke([
        new SystemMessage(prompt),
        ...state.internalMessages,
    ])) as AIMessage;

    return {
        messages: [response],
        internalMessages: [response],
    };
}
