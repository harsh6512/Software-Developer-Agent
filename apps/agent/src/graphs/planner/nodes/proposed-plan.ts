
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

    if (!taskPlan) {
        throw new Error("No task plan found in graph state.");
    }

    const currentTask =
        taskPlan.tasks[taskPlan.activeTaskIndex];

    if (!currentTask) {
        throw new Error("No active task found in task plan.");
    }

    const activeRevision =
        currentTask.planRevisions[
        currentTask.activeRevisionIndex
        ];

    if (!activeRevision) {
        throw new Error("No active plan revision found.");
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