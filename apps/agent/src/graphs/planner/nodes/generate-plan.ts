import {
    GraphState,
    GraphConfig,
    LLMTask,
    TaskPlan,
    PlanItem,
    createSessionPlanToolFields,
} from "@agentic/shared";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import { Command, END } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createLogger } from "../../../utils/logger.js";
import { loadModel } from "../../../utils/llms/index.js";
import { deleteSandbox } from "../../../utils/sandbox.js";

const logger = createLogger("GeneratePlanNode");

const NEXT_NODE = "interrupt-proposed-plan"; // use your real node name

const sessionPlanArgs = z.object({
    title: z.string(),
    requires_code_changes: z.boolean().optional(),
    plan: z.array(z.string()).default([]),
    answer: z.string().optional(),
});

export async function generatePlan(
    state: GraphState,
    config: GraphConfig,
): Promise<Command> {
    logger.info("Deciding whether code changes are needed and drafting the plan...");

    const sessionPlanTool = createSessionPlanToolFields();
    const model = await loadModel(config, LLMTask.PLANNER);

    // Force model to invoke the session_plan schema
    const modelWithPlanTool = model.bindTools([sessionPlanTool], {
        tool_choice: sessionPlanTool.name,
    });

    const systemPrompt = `You have completed exploring the codebase.
Decide what the user's request needs, then call the 'session_plan' tool exactly once.

<decision_rules>
1. requires_code_changes = true if the user wants anything modified, added, fixed, refactored or removed, even if combined with a question ("find why X fails and fix it"). Provide a step-by-step plan.
2. requires_code_changes = false ONLY if:
   a. the user asked a question or for an explanation or review and asked for no changes, or
   b. the EXACT requested behavior already exists on the current branch. Similar or related code does not count. Verify by reading the implementation, not by matching names.
3. If only part of the request already exists, use true and plan only the missing parts.
4. If unsure, use true.
</decision_rules>

<when_requires_code_changes_is_true>
1. Each step must be specific (target file paths, functions, or test commands).
2. The first steps modify/add code, followed by steps to test and verify changes.
</when_requires_code_changes_is_true>

<when_requires_code_changes_is_false>
Leave plan empty and put the full findings in 'answer'. If the work already exists, name the files that show it and say "on the current branch".
</when_requires_code_changes_is_false>`;

    const response = await modelWithPlanTool.invoke([
        new SystemMessage(systemPrompt),
        ...state.messages,
    ]);

    const toolCall = response.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("Model failed to output structured session_plan tool call.");
    }

    const parsed = sessionPlanArgs.safeParse(toolCall.args);
    if (!parsed.success) {
        throw new Error(`Invalid session_plan output: ${parsed.error.message}`);
    }
    const { title, plan, requires_code_changes, answer } = parsed.data;

    // ---- No code changes needed: answer, delete the sandbox, end the run ----
    if (requires_code_changes === false && answer?.trim()) {
        logger.info("No code changes required. Ending run with the answer.");

        try {
            await deleteSandbox(state.sandboxSessionId);
            logger.info("Sandbox removed successfully.");
        } catch (err: any) {
            logger.warn("Could not delete sandbox:", { error: err.message });
        }

        const finalMsg = new AIMessage({ content: answer.trim() });
        return new Command({
            update: {
                messages: [finalMsg],
                internalMessages: [finalMsg],
                taskPlan: null,
                sandboxSessionId: "",
            },
            goto: END,
        });
    }

    // ---- Code changes needed (also the fallback when the model's output is inconsistent) ----
    if (plan.length === 0) {
        throw new Error("session_plan contained no steps and no answer.");
    }

    logger.info(`Generated plan: "${title}" with ${plan.length} steps.`);

    const planItems: PlanItem[] = plan.map((stepText, idx) => ({
        index: idx + 1,
        plan: stepText,
        completed: false,
    }));

    const initialTaskPlan: TaskPlan = {
        activeTaskIndex: 0,
        tasks: [
            {
                id: randomUUID(),
                taskIndex: 0,
                request: state.messages[0]?.content?.toString() || "User Task",
                title,
                createdAt: Date.now(),
                completed: false,
                activeRevisionIndex: 0,
                planRevisions: [
                    {
                        revisionIndex: 0,
                        plans: planItems,
                        createdAt: Date.now(),
                        createdBy: "agent",
                    },
                ],
            },
        ],
    };

    const planSummaryMessage = new AIMessage({
        content: `### Proposed Implementation Plan: ${title}\n\n` +
            planItems.map((item) => `${item.index}. ${item.plan}`).join("\n"),
    });

    return new Command({
        update: {
            taskPlan: initialTaskPlan,
            messages: [planSummaryMessage],
            internalMessages: [planSummaryMessage],
        },
        goto: NEXT_NODE,
    });
}