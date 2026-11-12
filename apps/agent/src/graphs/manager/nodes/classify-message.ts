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
        .describe(
            "'plan' if this requires repository changes, bugfixes, or feature implementation. 'reply' for greetings, general questions, or chat."
        ),
    response: z
        .string()
        .optional()
        .nullable()
        .describe(
            "Only populated for 'reply': Direct, helpful conversational response to the user. Do NOT populate for 'plan'."
        ),
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
You are the Router for an Autonomous Software Developer Agent.
Determine whether the user's message requires inspecting and modifying a code repository, or if it is purely conversational / general QA.

- 'plan': User wants to implement a feature, fix a bug, write tests, refactor, or make changes to the repository. (Do not write any plan or code here; the planner will inspect the real repository).
- 'reply': User is saying hello, asking a standalone conceptual question, or chatting without requiring repository work. Provide a direct, helpful response in 'response'.
</identity>`;

    const rawResult = await structuredModel.invoke([
        new SystemMessage(prompt),
        lastUserMessage,
    ]);
    const result: ClassificationOutput = classificationSchema.parse(rawResult);

    logger.info("Message classified", { action: result.action });

    if (result.action === "reply") {
        const replyText = result.response || "How can I help you with your repository today?";
        return {
            messages: [new AIMessage(replyText)],
            nextRoute: "reply",
        };
    }

    // For 'plan', do NOT emit hallucinated pre-inspection messages.
    // The planner will clone the repository, explore actual files, and build the real plan.
    return {
        nextRoute: "start-planner",
    };
}
