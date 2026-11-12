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

function routeAfterInterrupt(state: GraphState): "programmer-subgraph" | typeof END {
    if (state.taskPlan && state.taskPlan.tasks && state.taskPlan.tasks.length > 0) {
        return "programmer-subgraph";
    }
    return END;
}

const workflow = new StateGraph(GraphAnnotation)
    .addNode("prepare-graph-state", prepareState)
    .addNode("initialize-sandbox", initializeSandbox)
    .addNode("generate-plan-context-action", generateMessage)
    .addNode("take-plan-actions", takeAction)
    .addNode("generate-plan", generatePlan, { ends: ["interrupt-proposed-plan", END] })
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

    // 3. Connect: After approval, transition to Programmer if a plan exists, or END if no code changes
    .addConditionalEdges("interrupt-proposed-plan", routeAfterInterrupt, [
        "programmer-subgraph",
        END,
    ])
    .addEdge("programmer-subgraph", END);

const compiled = workflow.compile();
compiled.name = "Agentic - Planner";
export const plannerGraph = compiled.withConfig({ recursionLimit: 200 });
plannerGraph.name = "Agentic - Planner";