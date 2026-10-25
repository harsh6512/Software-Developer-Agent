
import { v4 as uuidv4 } from "uuid";
import {
    isAIMessage,
    ToolMessage,
    SystemMessage,
    HumanMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";

import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    PlanItem,
    getActiveTask,
    getActivePlanItems,
    updateTaskPlanItems,
} from "@agentic/shared";

import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";

const logger = createLogger("UpdatePlanNode");

const structuredPlanSchema = z.object({
    remaining_plan_items: z
        .array(z.string())
        .describe(
            "The list of remaining tasks to complete, in order. Do NOT include already completed tasks.",
        ),
});

type StructuredPlan = z.infer<typeof structuredPlanSchema>;

export async function updatePlan(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Executing update-plan node");

    // 1. Validate the latest internal message and find the update_plan tool call.
    const lastMessage =
        state.internalMessages[state.internalMessages.length - 1];

    if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        throw new Error("Last message was not an AI message with tool calls");
    }

    const updatePlanCall = lastMessage.tool_calls.find(
        (tc) => tc.name === "update_plan",
    );

    if (!updatePlanCall) {
        throw new Error("update_plan tool call not found");
    }

    const reasoning =
        (updatePlanCall.args as { update_plan_reasoning?: string })
            ?.update_plan_reasoning || "Plan needs adjustment.";

    // 2. Validate the existing task plan.
    if (!state.taskPlan) {
        throw new Error("No task plan found in state to update.");
    }

    const activeTask = getActiveTask(state.taskPlan);
    const activePlanItems = getActivePlanItems(state.taskPlan);

    // Preserve completed steps rather than asking the LLM to regenerate them.
    const completedItems = activePlanItems.filter((item) => item.completed);

    // 3. Load the Planner model.
    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.PLANNER);

    // Cast to the common LangChain chat model type to resolve provider-specific
    // withStructuredOutput overload incompatibilities.
    const structuredModel = (
        model as BaseChatModel
    ).withStructuredOutput(structuredPlanSchema);

    // 4. Ask the Planner to generate only the remaining steps.
    const prompt = `You are updating the implementation plan for an ongoing software development task.

The developer agent has determined that the plan needs to be adjusted based on these findings:

<reasoning>
${reasoning}
</reasoning>

<already_completed_steps>
${completedItems
            .map((item) => `- Step ${item.index}: ${item.plan} (Completed)`)
            .join("\n") || "None"
        }
</already_completed_steps>

Generate only the updated list of REMAINING steps that still need to be executed.

Requirements:
- Do not include steps that are already completed.
- Keep the steps in a logical execution order.
- Make each step specific and actionable.
- Return an empty list if no steps remain.`;

    const rawResult: Record<string, any> = await structuredModel.invoke([
        new SystemMessage(prompt),
        new HumanMessage("Please generate the updated remaining steps."),
    ]);

    const result: StructuredPlan = structuredPlanSchema.parse(rawResult);
    const highestCompletedIndex = completedItems.reduce(
        (highest, item) => Math.max(highest, item.index),
        0,
    );

    const newRemainingItems: PlanItem[] = result.remaining_plan_items.map(
        (planText: string, idx: number): PlanItem => ({
            index: highestCompletedIndex + idx + 1,
            plan: planText,
            completed: false,
        }),
    );

    const combinedPlan: PlanItem[] = [
        ...completedItems,
        ...newRemainingItems,
    ];

    // 6. Save the updated plan as an agent-created revision.
    const updatedTaskPlan = updateTaskPlanItems(
        state.taskPlan,
        activeTask.id,
        combinedPlan,
        "agent",
    );

    // 7. Respond to the update_plan tool call.
    const toolMessage = new ToolMessage({
        tool_call_id: updatePlanCall.id ?? uuidv4(),
        name: "update_plan",
        content: `Plan successfully updated. Active plan now has ${combinedPlan.length} total steps (${completedItems.length} completed, ${newRemainingItems.length} remaining).`,
    });

    // Return the updated state and tool result.
    return {
        taskPlan: updatedTaskPlan,
        messages: [toolMessage],
        internalMessages: [toolMessage],
    };
}
