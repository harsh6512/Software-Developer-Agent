import { StateGraph, START, END } from "@langchain/langgraph";
import { isAIMessage } from "@langchain/core/messages";
import {
    GraphAnnotation,
    GraphState,
    getActivePlanItems,
} from "@agentic/shared";
import { generateAction } from "./nodes/generate-action.js";
import { takeAction } from "./nodes/take-action.js";
import { handleCompletedTask } from "./nodes/handle-completed-task.js";
import { updatePlan } from "./nodes/update-plan.js";
import { generateConclusion } from "./nodes/generate-conclusion.js";

function routeProgrammerAction(state: GraphState): string {
    const lastMessage = state.internalMessages[state.internalMessages.length - 1];

    if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
        const toolCall = lastMessage.tool_calls[0];

        // If task is completed
        if (toolCall.name === "mark_task_completed") {
            return "handle-completed-task";
        }

        if (toolCall.name === "update_plan") {
            return "update-plan";
        }

        return "take-action";
    }

    if (!state.taskPlan) {
        return "generate-action";
    }

    const activePlanItems = getActivePlanItems(state.taskPlan);
    const allCompleted = activePlanItems.every((item) => item.completed);

    if (allCompleted) {
        return "generate-conclusion";
    }

    return "generate-action";
}

function routeAfterCompletedTask(state: GraphState): string {
    if (!state.taskPlan) {
        return "generate-action";
    }

    const activePlanItems = getActivePlanItems(state.taskPlan);
    const allCompleted = activePlanItems.every((item) => item.completed);

    if (allCompleted) {
        return "generate-conclusion";
    }
    return "generate-action";
}

const workflow = new StateGraph(GraphAnnotation)
    .addNode("generate-action", generateAction)
    .addNode("take-action", takeAction)
    .addNode("handle-completed-task", handleCompletedTask)
    .addNode("update-plan", updatePlan) // <-- 3. Add node
    .addNode("generate-conclusion", generateConclusion)

    .addEdge(START, "generate-action")
    .addConditionalEdges("generate-action", routeProgrammerAction, [
        "take-action",
        "handle-completed-task",
        "update-plan", // <-- 4. Add conditional edge destination
        "generate-conclusion",
    ])
    .addEdge("take-action", "generate-action")
    .addEdge("update-plan", "generate-action") // <-- 5. Loop back to generate-action after plan is updated
    .addConditionalEdges("handle-completed-task", routeAfterCompletedTask, [
        "generate-action",
        "generate-conclusion",
    ])
    .addEdge("generate-conclusion", END);

export const programmerGraph = workflow.compile();
programmerGraph.name = "Agentic Programmer";
