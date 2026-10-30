import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    getActiveTask,
    getActivePlanItems,
    updateTaskPlanItems,
    PlanItem,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";

const logger = createLogger("FinalReview");

const finalReviewSchema = z.object({
    approved: z
        .boolean()
        .describe("Set to true if all tasks are completed correctly with no bugs. Set to false if changes or fixes are needed."),
    feedback: z
        .string()
        .describe("Detailed explanation of the review verdict."),
    additional_tasks: z
        .array(z.string())
        .optional()
        .describe("If not approved, list the specific tasks the programmer needs to execute to fix the issues."),
});

type FinalReviewOutput = z.infer<typeof finalReviewSchema>;

export async function finalReview(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Reviewer generating final verdict...");

    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.REVIEWER);
    const structuredModel = (model as BaseChatModel).withStructuredOutput(finalReviewSchema);

    if (!state.taskPlan) {
        throw new Error("Cannot execute final review without an active task plan.");
    }

    const activePlan = getActivePlanItems(state.taskPlan);
    const planSummary = activePlan
        .filter((item) => item.completed)
        .map((item) => `- Step ${item.index}: ${item.plan} (${item.summary || "Done"})`)
        .join("\n");

    const prompt = `You are providing the final code review verdict for the completed tasks.

<completed_tasks>
${planSummary}
</completed_tasks>

<diff_and_context>
${state.contextGatheringNotes}
</diff_and_context>

Determine whether:
1. All changes correctly and robustly fulfill the user's requirements (approved = true).
OR
2. The changes are incomplete, introduce bugs, or need revisions (approved = false with additional_tasks).`;

    const rawVerdict = await structuredModel.invoke([new SystemMessage(prompt)]);
    const verdict: FinalReviewOutput = finalReviewSchema.parse(rawVerdict);

    logger.info(`Verdict: ${verdict.approved ? "APPROVED ✅" : "CHANGES REQUESTED ⚠️"}`, {
        feedback: verdict.feedback,
    });

    const responseMessage = new AIMessage({
        content: `### Code Review Verdict: ${verdict.approved ? "APPROVED ✅" : "CHANGES REQUESTED ⚠️"}\n\n${verdict.feedback}`,
    });

    const updates: GraphUpdate = {
        reviewApproved: verdict.approved,
        reviewFeedback: verdict.feedback,
        reviewsCount: (state.reviewsCount || 0) + 1,
        messages: [responseMessage],
        internalMessages: [responseMessage],
    };

    if (!verdict.approved && verdict.additional_tasks?.length && state.taskPlan) {
        const activeTask = getActiveTask(state.taskPlan);
        const currentPlans = getActivePlanItems(state.taskPlan);

        const newTasks: PlanItem[] = verdict.additional_tasks.map((taskText: string, idx: number): PlanItem => ({
            index: currentPlans.length + idx + 1,
            plan: `[Fix from Review] ${taskText}`,
            completed: false,
        }));

        updates.taskPlan = updateTaskPlanItems(
            state.taskPlan,
            activeTask.id,
            [...currentPlans, ...newTasks],
            "agent",
        );
    }

    return updates;
}