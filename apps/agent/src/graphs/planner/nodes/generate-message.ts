import {
    GraphState,
    GraphUpdate,
    GraphConfig,
    LLMTask,
    getRepoAbsolutePath,
} from "@agentic/shared";
import { SystemMessage } from "@langchain/core/messages";
import { createLogger } from "../../../utils/logger.js";
import { loadModel } from "../../../utils/llms/index.js";
import {
    createShellTool,
    createViewTool,
    createGrepTool,
} from "../../../tools/index.js"
import { daytonaClient } from "../../../utils/sandbox.js";

const logger = createLogger("GeneratePlannerMessage");

export async function generateMessage(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Generating planning context action...");

    const repoDir = getRepoAbsolutePath(state.targetRepository);
    const sandbox = await daytonaClient().get(state.sandboxSessionId);

    // 1. Instantiate the read-only exploration tools
    const tools = [
        createViewTool({ sandbox, targetRepository: state.targetRepository }),
        createGrepTool({ sandbox, targetRepository: state.targetRepository }),
        createShellTool(sandbox, state.targetRepository),
    ];

    // 2. Load the LLM (Gemini by default) and bind the tools
    const model = await loadModel(config, LLMTask.PLANNER);
    const modelWithTools = model.bindTools(tools, { tool_choice: "auto" });

    // 3. Construct System Prompt with Codebase Tree
    const systemPrompt = `You are an expert Autonomous Software Developer Agent.
Your current role: **Context Gathering (Read-Only)**.

<objective>
Inspect the codebase to gather all necessary context before creating an implementation plan.
Focus on understanding project structure, dependencies, relevant functions, and types.
</objective>

<codebase_tree>
${state.codebaseTree || "No codebase tree available."}
</codebase_tree>

<guidelines>
1. Working directory is \`${repoDir}\`.
2. Use 'grep' to search for symbols, function names, classes, or keywords.
3. Use 'view' to inspect specific files or list directories.
4. Use 'shell' to check package.json, configs, or test commands.
5. Do NOT edit any files in this phase.
6. When you have gathered sufficient context to formulate a complete plan, reply with "done" without calling any tools.
</guidelines>`;

    const messagesToSend = [
        new SystemMessage(systemPrompt),
        ...state.messages,
    ];

    // 4. Invoke the model
    const response = await modelWithTools.invoke(messagesToSend);

    logger.info("Model responded", {
        hasToolCalls: !!response.tool_calls?.length,
        toolCallsCount: response.tool_calls?.length ?? 0,
    });

    return {
        messages: [response],
        internalMessages: [response],
    };
}