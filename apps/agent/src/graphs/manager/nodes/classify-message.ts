import { AIMessage, isHumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { GraphConfig, ManagerGraphState, ManagerGraphUpdate, LLMTask } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";

const logger = createLogger("ClassifyMessage");

const classificationSchema = z.object({
    action: z
        .enum(["plan", "reply"])
        .describe("'plan' if this is a software development, bugfix, or feature request. 'reply' if it is a general question or greeting."),
    response: z
        .string()
        .describe("The conversational response to send to the user. For 'reply', answer the question. For 'plan', explain that you are starting the planning phase."),
});

type ClassificationOutput = z.infer<typeof classificationSchema>;

export async function classifyMessage(
    state: ManagerGraphState,
    config: GraphConfig,
): Promise<ManagerGraphUpdate & { nextRoute: "start-planner" | "reply" }> {
    const lastUserMessage = [...state.messages].reverse().find(isHumanMessage);

    if (!lastUserMessage) {
        throw new Error("No user message found to classify.");
    }

    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, LLMTask.ROUTER);
    const structuredModel = (model as BaseChatModel).withStructuredOutput(classificationSchema);

    const prompt = `<identity>
You are the Supervisor Router for an Autonomous Software Developer Agent.
Classify the user's message:
- 'plan': If the user asks to write code, fix a bug, build a feature, inspect a repo, or implement changes.
- 'reply': If the user is saying hello, asking a general programming question, or needs clarification without repository changes.
</identity>`;

    const rawResult = await structuredModel.invoke([
        new SystemMessage(prompt),
        lastUserMessage,
    ]);
    const result: ClassificationOutput = classificationSchema.parse(rawResult);

    logger.info("Message classified", { action: result.action });

    const replyMsg = new AIMessage(result.response);

    if (result.action === "reply") {
        return {
            messages: [replyMsg],
            nextRoute: "reply",
        };
    }

    return {
        messages: [replyMsg],
        nextRoute: "start-planner",
    };
}
