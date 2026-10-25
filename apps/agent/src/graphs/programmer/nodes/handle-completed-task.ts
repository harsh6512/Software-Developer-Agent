import { isAIMessage, ToolMessage } from "@langchain/core/messages";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    getActiveTask,
    getActivePlanItems,
    completePlanItem,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getCurrentPlanItem } from "../../../utils/current-task.js";

const logger = createLogger("HandleCompletedTask");

export async function handleCompletedTask(
    state: GraphState,
    _config: GraphConfig,
): Promise<GraphUpdate> {
    const lastMessage = state.internalMessages[state.internalMessages.length - 1];

    if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        throw new Error("Last message did not contain mark_task_completed tool call");
    }

    const toolCall = lastMessage.tool_calls.find(
        (tc) => tc.name === "mark_task_completed",
    );

    if (!toolCall) {
        throw new Error("mark_task_completed tool call not found");
    }

    if (!state.taskPlan) {
        throw new Error("No task plan found in state to mark as completed.");
    }

    const activeTask = getActiveTask(state.taskPlan);
    const activePlanItems = getActivePlanItems(state.taskPlan);
    const currentItem = getCurrentPlanItem(activePlanItems);

    const summary =
        (toolCall.args as { completed_task_summary?: string })
            ?.completed_task_summary || "Task marked as completed.";

    logger.info(`Completed Step ${currentItem.index}: ${currentItem.plan}`, {
        summary,
    });

    const updatedPlan = completePlanItem(
        state.taskPlan,
        activeTask.id,
        currentItem.index,
        summary,
    );

    const toolMessage = new ToolMessage({
        tool_call_id: toolCall.id ?? "",
        name: toolCall.name,
        content: `Successfully marked Step ${currentItem.index} as completed.`,
    });

    return {
        taskPlan: updatedPlan,
        internalMessages: [toolMessage],
    };
}
