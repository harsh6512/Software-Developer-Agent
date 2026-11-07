import { START, END, StateGraph } from "@langchain/langgraph";
import { GraphAnnotation, GraphState } from "@agentic/shared";
import { isAIMessage } from "@langchain/core/messages";
import { prepareState } from "./nodes/prepare-state.js";
import { initializeSandbox } from "./nodes/initialize-sandbox.js";
import { generateMessage } from "./nodes/generate-message.js";
import { takeAction } from "./nodes/take-action.js";
import { generatePlan } from "./nodes/generate-plan.js";
import { interruptProposedPlan } from "./nodes/proposed-plan.js";
import { programmerGraph } from "../programmer/index.js";

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
    .addNode("programmer-subgraph", programmerGraph)

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

    // 3. Connect: After approval, transition straight to Programmer!
    .addEdge("interrupt-proposed-plan", "programmer-subgraph")
    .addEdge("programmer-subgraph", END);

export const plannerGraph = workflow.compile();
plannerGraph.name = "Agentic - Planner";