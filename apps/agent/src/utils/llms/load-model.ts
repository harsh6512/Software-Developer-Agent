import { GraphConfig, LLMTask, TASK_TO_CONFIG_DEFAULTS_MAP } from "@agentic/shared";
import { getModelManager } from "./model-manager.js";

export async function loadModel(
    config: GraphConfig,
    task: LLMTask,
) {
    const modelManager = getModelManager();
    const model = await modelManager.loadModel(config, task);
    if (!model) {
        throw new Error(`Model loading returned undefined for task: ${task}`);
    }
    return model;
}

export const MODELS_NO_PARALLEL_TOOL_CALLING = ["openai:o3", "openai:o3-mini"];

export function supportsParallelToolCallsParam(
    config: GraphConfig,
    task: LLMTask,
): boolean {
    const modelStr =
        (config.configurable as any)?.[`${task}ModelName`] ??
        TASK_TO_CONFIG_DEFAULTS_MAP[task]?.modelName ??
        "";

    return !MODELS_NO_PARALLEL_TOOL_CALLING.some((model) => modelStr === model);
}
