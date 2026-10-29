import { isAIMessage, ToolMessage } from "@langchain/core/messages";
import { GraphConfig, GraphState, GraphUpdate } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { daytonaClient } from "../../../utils/sandbox.js";
import { truncateOutput } from "../../../utils/truncate-outputs.js";
import { createViewTool, createGrepTool, createShellTool } from "../../../tools/index.js";

const logger = createLogger("TakeReviewAction");

export async function takeReviewerActions(
    state: GraphState,
    _config: GraphConfig,
): Promise<GraphUpdate> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        throw new Error("No tool calls found to execute in takeReviewerActions");
    }

    const sandbox = await daytonaClient().get(state.sandboxSessionId);
    const toolsMap: Record<string, any> = {
        view: createViewTool({ sandbox, targetRepository: state.targetRepository }),
        grep: createGrepTool({ sandbox, targetRepository: state.targetRepository }),
        shell: createShellTool(sandbox, state.targetRepository),
        bash: createShellTool(sandbox, state.targetRepository),
    };

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        logger.info(`Reviewer running tool: ${toolCall.name}`);
        const tool = toolsMap[toolCall.name];

        if (!tool) {
            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: `Tool ${toolCall.name} not available in reviewer mode.`,
                }),
            );
            continue;
        }

        try {
            const rawResult = await tool.invoke(toolCall.args);
            const stringResult =
                typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2);

            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: truncateOutput(stringResult),
                }),
            );
        } catch (err: any) {
            toolMessages.push(
                new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    name: toolCall.name,
                    content: `Review tool execution failed: ${err.message}`,
                }),
            );
        }
    }

    return {
        messages: toolMessages,
        internalMessages: toolMessages,
    };
}