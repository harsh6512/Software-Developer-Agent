import { initChatModel } from "langchain/chat_models/universal";
import { GraphConfig } from "@agentic/shared";
import { LLMTask, TASK_TO_CONFIG_DEFAULTS_MAP } from "@agentic/shared";
import { createLogger } from "../logger.js";

const logger = createLogger("ModelManager");

export const PROVIDER_FALLBACK_ORDER = [
    "google-genai",
    "anthropic",
    "openai",
] as const;

export type Provider = (typeof PROVIDER_FALLBACK_ORDER)[number];

export interface ModelLoadConfig {
    provider: Provider;
    modelName: string;
    temperature?: number;
    maxTokens?: number;
}

export class ModelManager {
    // private fallbackOrder: Provider[] = [...PROVIDER_FALLBACK_ORDER];

    /**
     * Resolves the API key for the requested provider from config or environment variables
     */
    private getApiKey(provider: Provider, graphConfig?: GraphConfig): string | undefined {
        // 1. Check configurable if passed from frontend session
        const apiKeys = (graphConfig?.configurable as any)?.apiKeys;
        if (apiKeys) {
            if (provider === "google-genai" && apiKeys.googleApiKey) return apiKeys.googleApiKey;
            if (provider === "anthropic" && apiKeys.anthropicApiKey) return apiKeys.anthropicApiKey;
            if (provider === "openai" && apiKeys.openaiApiKey) return apiKeys.openaiApiKey;
        }

        // 2. Fall back to environment variables
        if (provider === "google-genai") {
            return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        }
        if (provider === "anthropic") {
            return process.env.ANTHROPIC_API_KEY;
        }
        if (provider === "openai") {
            return process.env.OPENAI_API_KEY;
        }

        return undefined;
    }

    /**
     * Extracts the base config for a task (modelName and temperature)
     */
    public getBaseConfigForTask(
        graphConfig?: GraphConfig,
        task?: LLMTask,
    ): ModelLoadConfig {
        const taskDefaults = task ? TASK_TO_CONFIG_DEFAULTS_MAP[task] : {
            modelName: "google-genai:gemini-1.5-pro",
            temperature: 0,
        };

        const configuredModel =
            (graphConfig?.configurable as any)?.[`${task}ModelName`] ||
            process.env.MODEL_NAME ||
            taskDefaults.modelName;

        const [providerStr, ...modelRest] = configuredModel.split(":");
        const provider = (providerStr as Provider) || "google-genai";
        const modelName = modelRest.join(":") || "gemini-1.5-pro";

        return {
            provider,
            modelName,
            temperature: taskDefaults.temperature,
            maxTokens: 8192,
        };
    }

    /**
     * Initializes the chat model via LangChain universal initChatModel
     */
    public async initializeModel(
        config: ModelLoadConfig,
        graphConfig?: GraphConfig,
    ) {
        const { provider, modelName, temperature, maxTokens } = config;
        const apiKey = this.getApiKey(provider, graphConfig);

        if (!apiKey) {
            throw new Error(
                `No API key found for provider '${provider}'. Please set it in your .env file or configuration.`,
            );
        }

        logger.info(`Initializing model: ${provider}:${modelName}`);

        return await initChatModel(modelName, {
            modelProvider: provider,
            maxTokens,
            temperature,
            apiKey,
            maxRetries: 3,
        });
    }

    /**
     * Loads a model for a specific task
     */
    public async loadModel(graphConfig: GraphConfig, task: LLMTask) {
        const baseConfig = this.getBaseConfigForTask(graphConfig, task);
        return await this.initializeModel(baseConfig, graphConfig);
    }
}

let _modelManagerInstance: ModelManager | null = null;

export function getModelManager(): ModelManager {
    if (!_modelManagerInstance) {
        _modelManagerInstance = new ModelManager();
    }
    return _modelManagerInstance;
}
