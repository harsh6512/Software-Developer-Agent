import { StateGraph, START, END } from "@langchain/langgraph";
import { isAIMessage } from "@langchain/core/messages";
import { GraphAnnotation, GraphState } from "@agentic/shared";
import { initializeState } from "./nodes/initialize-state.js";
import { generateReviewActions } from "./nodes/generate-review-actions.js";
import { takeReviewerActions } from "./nodes/take-review-action.js";
import { finalReview } from "./nodes/final-review.js";

function takeReviewActionsOrFinalReview(
    state: GraphState,
): "take-review-actions" | "final-review" {
    const lastMessage = state.internalMessages[state.internalMessages.length - 1];

    if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
        return "take-review-actions";
    }

    return "final-review";
}

const workflow = new StateGraph(GraphAnnotation)
    .addNode("initialize-state", initializeState)
    .addNode("generate-review-actions", generateReviewActions)
    .addNode("take-review-actions", takeReviewerActions)
    .addNode("final-review", finalReview)

    .addEdge(START, "initialize-state")
    .addEdge("initialize-state", "generate-review-actions")
    .addConditionalEdges(
        "generate-review-actions",
        takeReviewActionsOrFinalReview,
        ["take-review-actions", "final-review"],
    )
    .addEdge("take-review-actions", "generate-review-actions")
    .addEdge("final-review", END);

export const reviewerGraph = workflow.compile();
reviewerGraph.name = "Agentic Reviewer";