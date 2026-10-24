// apps/agent/src/graphs/programmer/nodes/generate-action.ts
import { AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    getActivePlanItems,
    createMarkTaskCompletedToolFields,
    getRepoAbsolutePath,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";
import { getCurrentPlanItem } from "../../../utils/current-task.js";
import {
    createTextEditorTool,
    createApplyPatchTool,
    createShellTool,
    createViewTool,
    createGrepTool,
} from "../../../tools/index.js"
import { daytonaClient } from "../../../utils/sandbox.js";

const logger = createLogger("ProgrammerGenerateAction");

function formatProgrammerSystemPrompt(state: GraphState): string {
    if (!state.taskPlan) {
        throw new Error("Cannot generate programmer prompt without a task plan.");
    }

    const activePlanItems = getActivePlanItems(state.taskPlan);
    const currentItem = getCurrentPlanItem(activePlanItems);
    const repoPath = getRepoAbsolutePath(state.targetRepository);

    const planChecklist = activePlanItems
        .map(
            (item) =>
                `[${item.completed ? "x" : " "}] Step ${item.index}: ${item.plan}${item.summary ? `\n    Summary: ${item.summary}` : ""
                }`,
        )
        .join("\n");

    return `<identity>
You are an expert autonomous software engineer working in a sandboxed development environment.
Your goal is to complete the active step of the implementation plan accurately and safely.
</identity>

<repository_location>${repoPath}</repository_location>
<current_working_directory>${repoPath}</current_working_directory>

<implementation_plan>
${planChecklist}
</implementation_plan>

<current_active_task>
Step ${currentItem.index}: ${currentItem.plan}
</current_active_task>

<context_notes>
${state.contextGatheringNotes || "No preliminary notes."}
</context_notes>

<guidelines>
1. Always view or grep files before making edits.
2. Use text_editor (str_replace) for surgical changes, or apply_patch for multi-line / multi-file diffs.
3. Use shell to run builds, linters, or tests to verify your changes.
4. When you have fully completed and verified the current task, call the mark_task_completed tool with a concise summary of the work done.
5. Do NOT call mark_task_completed in parallel with other tools. Run your edits/tests first, verify, then call mark_task_completed in a subsequent step.
</guidelines>`;
}

export async function generateAction(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Programmer generating next action");

    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.PROGRAMMER);

    // Bind execution tools
    const sandbox = await daytonaClient().get(state.sandboxSessionId);
    const textEditor = createTextEditorTool({ sandbox, targetRepository: state.targetRepository });
    const applyPatch = createApplyPatchTool({ sandbox, targetRepository: state.targetRepository });
    const shell = createShellTool(sandbox, state.targetRepository);
    const view = createViewTool({ sandbox, targetRepository: state.targetRepository });
    const grep = createGrepTool({ sandbox, targetRepository: state.targetRepository });
    const markCompleted = createMarkTaskCompletedToolFields();

    const modelWithTools = model.bindTools([
        textEditor,
        applyPatch,
        shell,
        view,
        grep,
        markCompleted,
    ]);

    const systemMessage = new SystemMessage(formatProgrammerSystemPrompt(state));
    const messages: BaseMessage[] = [systemMessage, ...state.internalMessages];

    const response = (await modelWithTools.invoke(messages)) as AIMessage;

    logger.info("Programmer action received", {
        toolCalls: response.tool_calls?.map((t) => t.name) || [],
    });

    return {
        internalMessages: [response],
    };
}