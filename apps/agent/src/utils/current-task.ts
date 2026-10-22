import { PlanItem } from "@agentic/shared";

/**
 * Gets the first incomplete plan item ordered by index
 */
export function getCurrentPlanItem(plan: PlanItem[]): PlanItem {
    return (
        plan.filter((p) => !p.completed).sort((a, b) => a.index - b.index)?.[0] || {
            plan: "All plan tasks completed.",
            index: -1,
            completed: true,
            summary: "",
        }
    );
}

/**
 * Gets remaining incomplete plan items
 */
export function getRemainingPlanItems(
    plan: PlanItem[],
    includeCurrent = false,
): PlanItem[] {
    const current = getCurrentPlanItem(plan);
    return plan
        .filter((p) => !p.completed && (includeCurrent || p.index !== current.index))
        .sort((a, b) => a.index - b.index);
}