import {
    GraphState,
    GraphUpdate,
    GraphConfig,
} from "@agentic/shared";
import { interrupt } from "@langchain/langgraph";
import { createLogger } from "../../../utils/logger.js";

const logger = createLogger("ProposedPlanNode");

export async function interruptProposedPlan(
    state: GraphState,
    _config: GraphConfig,
): Promise<GraphUpdate> {
    const taskPlan = state.taskPlan;

    if (!taskPlan || !taskPlan.tasks || taskPlan.tasks.length === 0) {
        logger.info("No task plan found in graph state. Skipping plan approval interrupt.");
        return {};
    }

    const currentTask =
        taskPlan.tasks[taskPlan.activeTaskIndex] || taskPlan.tasks[0];

    if (!currentTask) {
        logger.info("No active task found in task plan. Skipping plan approval interrupt.");
        return {};
    }

    const activeRevision =
        currentTask.planRevisions?.[
        currentTask.activeRevisionIndex
        ] || currentTask.planRevisions?.[0];

    if (!activeRevision) {
        logger.info("No active plan revision found. Skipping plan approval interrupt.");
        return {};
    }

    if ((state as any).autoAcceptPlan) {
        logger.info("autoAcceptPlan is true, automatically approving plan without interrupt.");
        return {};
    }

    logger.info(
        "Interrupting execution for Human-in-the-Loop plan approval...",
    );

    // Pause graph execution and wait for human input.
    const humanResponse = interrupt({
        type: "plan_approval",
        title: currentTask.title,
        plan: activeRevision.plans,
    }) as
        | { action: "approve" | "edit"; editedPlan?: string[] }
        | undefined;

    logger.info("Human response received", {
        action: humanResponse?.action,
    });

    // If the user edits the plan, create a new revision.
    if (
        humanResponse?.action === "edit" &&
        humanResponse.editedPlan
    ) {
        const updatedPlans = humanResponse.editedPlan.map(
            (text, idx) => ({
                index: idx + 1,
                plan: text,
                completed: false,
            }),
        );

        const nextRevisionIndex =
            activeRevision.revisionIndex + 1;

        const newRevision = {
            revisionIndex: nextRevisionIndex,
            plans: updatedPlans,
            createdAt: Date.now(),
            createdBy: "user" as const,
        };

        // Create a new task with the updated revision history.
        const updatedTask = {
            ...currentTask,
            planRevisions: [
                ...currentTask.planRevisions,
                newRevision,
            ],
            activeRevisionIndex: nextRevisionIndex,
        };

        // Replace the active task without mutating existing state.
        const updatedTasks = taskPlan.tasks.map(
            (task, index) =>
                index === taskPlan.activeTaskIndex
                    ? updatedTask
                    : task,
        );

        return {
            taskPlan: {
                ...taskPlan,
                tasks: updatedTasks,
            },
        };
    }

    // If approved, continue with the existing plan.
    if (humanResponse?.action === "approve") {
        return {};
    }

    throw new Error(
        "Invalid plan approval response. Expected 'approve' or 'edit'.",
    );
}