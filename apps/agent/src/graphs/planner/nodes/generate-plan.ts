import {
    GraphState,
    GraphUpdate,
    GraphConfig,
    LLMTask,
    TaskPlan,
    PlanItem,
    createSessionPlanToolFields,
} from "@agentic/shared";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { randomUUID } from "node:crypto";
import { createLogger } from "../../../utils/logger.js";
import { loadModel } from "../../../utils/llms/index.js";

const logger = createLogger("GeneratePlanNode");

export async function generatePlan(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Formulating structured implementation plan...");

    const sessionPlanTool = createSessionPlanToolFields();
    const model = await loadModel(config, LLMTask.PLANNER);

    // Force model to invoke the session_plan schema
    const modelWithPlanTool = model.bindTools([sessionPlanTool], {
        tool_choice: sessionPlanTool.name,
    });

    const systemPrompt = `You have completed exploring the codebase.
Now formulate a concise, high-quality, step-by-step implementation plan to fulfill the user's request.

<guidelines>
1. Each step in the plan must be specific (e.g. mention target file paths, functions, or test commands).
2. The first steps should modify/add code, followed by steps to test and verify changes.
3. Call the 'session_plan' tool with your title and steps.
</guidelines>`;

    const response = await modelWithPlanTool.invoke([
        new SystemMessage(systemPrompt),
        ...state.messages,
    ]);

    const toolCall = response.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("Model failed to output structured session_plan tool call.");
    }

    const { title, plan } = toolCall.args as { title: string; plan: string[] };

    logger.info(`Generated plan: "${title}" with ${plan.length} steps.`);

    const planItems: PlanItem[] = plan.map((stepText, idx) => ({
        index: idx + 1,
        plan: stepText,
        completed: false,
    }));

    const initialTaskPlan: TaskPlan = {
        activeTaskIndex: 0,
        tasks: [
            {
                id: randomUUID(),
                taskIndex: 0,
                request: state.messages[0]?.content?.toString() || "User Task",
                title,
                createdAt: Date.now(),
                completed: false,
                activeRevisionIndex: 0,
                planRevisions: [
                    {
                        revisionIndex: 0,
                        plans: planItems,
                        createdAt: Date.now(),
                        createdBy: "agent",
                    },
                ],
            },
        ],
    };

    const planSummaryMessage = new AIMessage({
        content: `### Proposed Implementation Plan: ${title}\n\n` +
            planItems.map((item) => `${item.index}. ${item.plan}`).join("\n"),
    });

    return {
        taskPlan: initialTaskPlan,
        messages: [planSummaryMessage],
        internalMessages: [planSummaryMessage],
    };
}
