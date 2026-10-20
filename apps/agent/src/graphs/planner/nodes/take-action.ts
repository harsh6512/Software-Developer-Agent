import { GraphState, GraphUpdate, GraphConfig } from "@agentic/shared";
import { isAIMessage, ToolMessage } from "@langchain/core/messages";
import { createLogger } from "../../../utils/logger.js";
import { createViewTool } from "../../../tools/view.js";
import { createGrepTool } from "../../../tools/grep.js";
import { createShellTool } from "../../../tools/shell.js";
import { daytonaClient } from "../../../utils/sandbox.js";
import { truncateOutput } from "../../../utils/truncate-outputs.js";

const logger = createLogger("TakePlannerAction");

export async function takeAction(
    state: GraphState,
    _config: GraphConfig,
): Promise<GraphUpdate> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
        throw new Error("takeAction called but last message has no tool calls.");
    }

    logger.info(`Executing ${lastMessage.tool_calls.length} tool calls...`);

    const sandbox = await daytonaClient().get(state.sandboxSessionId);

    // Tools mapping
    const toolsByName: Record<string, any> = {
        view: createViewTool({ sandbox, targetRepository: state.targetRepository }),
        grep: createGrepTool({ sandbox, targetRepository: state.targetRepository }),
        bash: createShellTool(sandbox, state.targetRepository),
        shell: createShellTool(sandbox, state.targetRepository),
    };

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
        const { name, args, id } = toolCall;
        const toolInstance = toolsByName[name];

        logger.info(`Executing tool: ${name}`, { args });

        let rawResult: string;
        try {
            if (!toolInstance) {
                throw new Error(`Tool '${name}' is not recognized.`);
            }

            const res = await toolInstance.invoke(args);
            rawResult = typeof res === "string" ? res : (res?.result ?? JSON.stringify(res));
        } catch (err: any) {
            logger.error(`Tool execution error for ${name}:`, err);
            rawResult = `Error executing ${name}: ${err?.message || String(err)}`;
        }

        // Protect context window from giant outputs
        const safeResult = truncateOutput(rawResult);

        toolMessages.push(
            new ToolMessage({
                tool_call_id: id || name,
                name,
                content: safeResult,
            }),
        );
    }

    return {
        messages: toolMessages,
        internalMessages: toolMessages,
    };
}
