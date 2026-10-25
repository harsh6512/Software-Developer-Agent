import { isAIMessage, ToolMessage } from "@langchain/core/messages";
import { GraphConfig, GraphState, GraphUpdate } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { truncateOutput } from "../../../utils/truncate-outputs.js";
import {
    createTextEditorTool,
    createApplyPatchTool,
    createShellTool,
    createViewTool,
    createGrepTool,
} from "../../../tools/index.js";
import { daytonaClient } from "../../../utils/sandbox.js";

const logger = createLogger("ProgrammerTakeAction");

export async function takeAction(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        throw new Error("No tool calls found on last message to execute");
    }

    const sandbox = await daytonaClient().get(state.sandboxSessionId);
    const toolsMap: Record<string, any> = {
        text_editor: createTextEditorTool({ sandbox, targetRepository: state.targetRepository }),
        apply_patch: createApplyPatchTool({ sandbox, targetRepository: state.targetRepository }),
        shell: createShellTool(sandbox, state.targetRepository),
        bash: createShellTool(sandbox, state.targetRepository),
        view: createViewTool({ sandbox, targetRepository: state.targetRepository }),
        grep: createGrepTool({ sandbox, targetRepository: state.targetRepository }),
    };

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        logger.info(`Executing tool: ${toolCall.name}`, { args: toolCall.args });
        const tool = toolsMap[toolCall.name];

        if (!tool) {
            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: `Error: Tool '${toolCall.name}' is not recognized in programmer mode.`,
                }),
            );
            continue;
        }

        try {
            const rawResult = await tool.invoke(toolCall.args);
            const stringResult =
                typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2);

            const safeResult = truncateOutput(stringResult);

            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: safeResult,
                }),
            );
        } catch (err: any) {
            logger.error(`Error executing ${toolCall.name}`, { error: err.message });
            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: `Tool execution failed: ${err.message}`,
                }),
            );
        }
    }

    return {
        messages: toolMessages,
        internalMessages: toolMessages,
    };
}
