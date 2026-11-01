import { StateGraph, START, END } from "@langchain/langgraph";
import { ManagerGraphAnnotation } from "@agentic/shared";
import { classifyMessage } from "./nodes/classify-message.js";
import { startPlanner } from "./nodes/start-planner.js";

function routeFromClassify(state: any): "start-planner" | typeof END {
    if (state.nextRoute === "start-planner") {
        return "start-planner";
    }
    return END;
}

const workflow = new StateGraph(ManagerGraphAnnotation)
    .addNode("classify-message", classifyMessage)
    .addNode("start-planner", startPlanner)

    .addEdge(START, "classify-message")
    .addConditionalEdges("classify-message", routeFromClassify, [
        "start-planner",
        END,
    ])
    .addEdge("start-planner", END);

export const managerGraph = workflow.compile();
managerGraph.name = "Agentic Manager";