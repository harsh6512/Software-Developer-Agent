import { START, END, StateGraph } from "@langchain/langgraph";
import { GraphAnnotation, GraphState } from "@agentic/shared";
import { isAIMessage } from "@langchain/core/messages";
import { prepareState } from "./nodes/prepare-state.js";
import { initializeSandbox } from "./nodes/initialize-sandbox.js";
import { generateMessage } from "./nodes/generate-message.js";
import { takeAction } from "./nodes/take-action.js";
import { generatePlan } from "./nodes/generate-plan.js";
import { interruptProposedPlan } from "./nodes/proposed-plan.js";

/**
 * Conditional routing: If the model called exploration tools, execute them.
 * Once the model signals it is done (no tool calls), move to plan generation.
 */
function routeActionOrPlan(state: GraphState): "take-plan-actions" | "generate-plan" {
    const lastMessage = state.messages[state.messages.length - 1];
    if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
        return "take-plan-actions";
    }
    return "generate-plan";
}

const workflow = new StateGraph(GraphAnnotation)
    .addNode("prepare-graph-state", prepareState)
    .addNode("initialize-sandbox", initializeSandbox)
    .addNode("generate-plan-context-action", generateMessage)
    .addNode("take-plan-actions", takeAction)
    .addNode("generate-plan", generatePlan)
    .addNode("interrupt-proposed-plan", interruptProposedPlan)

    // Execution Flow
    .addEdge(START, "prepare-graph-state")
    .addEdge("prepare-graph-state", "initialize-sandbox")
    .addEdge("initialize-sandbox", "generate-plan-context-action")
    .addConditionalEdges("generate-plan-context-action", routeActionOrPlan, [
        "take-plan-actions",
        "generate-plan",
    ])
    .addEdge("take-plan-actions", "generate-plan-context-action")
    .addEdge("generate-plan", "interrupt-proposed-plan")
    .addEdge("interrupt-proposed-plan", END);

export const plannerGraph = workflow.compile();
plannerGraph.name = "Agentic - Planner";
