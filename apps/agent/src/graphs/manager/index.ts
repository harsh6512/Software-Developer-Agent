import { StateGraph, START, END } from "@langchain/langgraph";
import { ManagerGraphState, ManagerGraphAnnotation } from "@agentic/shared";
import { classifyMessage } from "./nodes/classify-message.js";
import { plannerGraph } from "../planner/index.js";

function routeFromClassify(state: ManagerGraphState): "start-planner" | typeof END {
    if (state.nextRoute === "start-planner") {
        return "start-planner";
    }
    return END;
}

const workflow = new StateGraph(ManagerGraphAnnotation)
    .addNode("classify-message", classifyMessage)
    .addNode("start-planner", plannerGraph)

    .addEdge(START, "classify-message")
    .addConditionalEdges("classify-message", routeFromClassify, [
        "start-planner",
        END,
    ])
    .addEdge("start-planner", END);

const compiled = workflow.compile();
compiled.name = "Agentic Manager";
export const managerGraph = compiled.withConfig({ recursionLimit: 200 });
managerGraph.name = "Agentic Manager";