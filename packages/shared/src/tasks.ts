import { PlanItem, Task, TaskPlan, PlanRevision } from "./types.js";
/**
 * Returns the currently active task from the TaskPlan
 */
export function getActiveTask(taskPlan: TaskPlan): Task {
    if (!taskPlan?.tasks || taskPlan.tasks.length === 0) {
        throw new Error("No tasks available in TaskPlan");
    }
    return taskPlan.tasks[taskPlan.activeTaskIndex] || taskPlan.tasks[0];
}

/**
 * Returns the currently active plan items for the active task
 */
export function getActivePlanItems(taskPlan: TaskPlan): PlanItem[] {
    const activeTask = getActiveTask(taskPlan);
    if (!activeTask.planRevisions || activeTask.planRevisions.length === 0) {
        throw new Error("No plan revisions available for active task");
    }
    const activeRevision = activeTask.planRevisions[activeTask.activeRevisionIndex] || activeTask.planRevisions[0];
    return activeRevision.plans;
}

/**
 * Marks a specific plan item as completed and records a summary
 */
export function completePlanItem(
    taskPlan: TaskPlan,
    taskId: string,
    planItemIndex: number,
    summary?: string,
): TaskPlan {
    const taskIndex = taskPlan.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
        throw new Error(`Task with ID ${taskId} not found in task plan`);
    }

    const originalTask = taskPlan.tasks[taskIndex];
    const activeRevision = originalTask.planRevisions[originalTask.activeRevisionIndex];

    const updatedPlans = activeRevision.plans.map((item) => {
        if (item.index === planItemIndex) {
            return {
                ...item,
                completed: true,
                summary: summary || item.summary,
            };
        }
        return item;
    });

    const updatedRevision: PlanRevision = {
        ...activeRevision,
        plans: updatedPlans,
    };

    const updatedRevisions = [...originalTask.planRevisions];
    updatedRevisions[originalTask.activeRevisionIndex] = updatedRevision;

    const allCompleted = updatedPlans.every((p) => p.completed);

    const updatedTask: Task = {
        ...originalTask,
        completed: allCompleted,
        planRevisions: updatedRevisions,
    };

    const updatedTasks = [...taskPlan.tasks];
    updatedTasks[taskIndex] = updatedTask;

    return {
        ...taskPlan,
        tasks: updatedTasks,
    };
}
