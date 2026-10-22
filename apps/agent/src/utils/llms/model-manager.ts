import { initChatModel } from "langchain/chat_models/universal";
import { GraphConfig } from "@agentic/shared";
import { LLMTask, TASK_TO_CONFIG_DEFAULTS_MAP } from "@agentic/shared";
import { createLogger } from "../logger.js";

const logger = createLogger("ModelManager");

export const PROVIDER_FALLBACK_ORDER = [
    "openrouter",
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
            if (provider === "openrouter" && (apiKeys.openrouterApiKey || apiKeys.openRouterApiKey)) {
                return apiKeys.openrouterApiKey || apiKeys.openRouterApiKey;
            }
            if (provider === "google-genai" && apiKeys.googleApiKey) return apiKeys.googleApiKey;
            if (provider === "anthropic" && apiKeys.anthropicApiKey) return apiKeys.anthropicApiKey;
            if (provider === "openai" && apiKeys.openaiApiKey) return apiKeys.openaiApiKey;
        }

        // 2. Fall back to environment variables
        if (provider === "openrouter") {
            return process.env.OPENROUTER_API_KEY;
        }
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
        const defaultModel =
            process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY
                ? "openrouter:openrouter/free"
                : "google-genai:gemini-3.8-flash";

        const taskDefaults = task ? TASK_TO_CONFIG_DEFAULTS_MAP[task] : {
            modelName: defaultModel,
            temperature: 0,
        };

        const envModel =
            process.env.MODEL_NAME ||
            (process.env.OPENROUTER_MODEL
                ? (process.env.OPENROUTER_MODEL.includes(":")
                    ? process.env.OPENROUTER_MODEL.trim()
                    : `openrouter:${process.env.OPENROUTER_MODEL.trim()}`)
                : undefined) ||
            (process.env.GEMINI_MODEL ? `google-genai:${process.env.GEMINI_MODEL.trim()}` : undefined);

        const rawConfiguredModel =
            (graphConfig?.configurable as any)?.[`${task}ModelName`] ||
            envModel ||
            taskDefaults.modelName;

        let provider: Provider = "openrouter";
        let modelName = "openrouter/free";

        if (rawConfiguredModel.includes(":")) {
            const [providerStr, ...modelRest] = rawConfiguredModel.split(":");
            provider = (providerStr as Provider) || "openrouter";
            modelName = modelRest.join(":") || "openrouter/free";
        } else if (rawConfiguredModel.startsWith("openrouter/")) {
            provider = "openrouter";
            modelName = rawConfiguredModel;
        } else if (rawConfiguredModel.startsWith("gemini")) {
            provider = "google-genai";
            modelName = rawConfiguredModel;
        } else if (rawConfiguredModel.startsWith("claude")) {
            provider = "anthropic";
            modelName = rawConfiguredModel;
        } else if (
            rawConfiguredModel.startsWith("gpt") ||
            rawConfiguredModel.startsWith("o3") ||
            rawConfiguredModel.startsWith("o1")
        ) {
            provider = "openai";
            modelName = rawConfiguredModel;
        } else {
            modelName = rawConfiguredModel;
        }

        return {
            provider,
            modelName,
            temperature: taskDefaults.temperature,
            maxTokens: 8192,
        };
    }

    /**
     * Initializes the chat model via LangChain universal initChatModel or ChatOpenAI for OpenRouter
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

        if (provider === "openrouter") {
            const { ChatOpenAI } = await import("@langchain/openai");
            return new ChatOpenAI({
                model: modelName,
                apiKey,
                temperature,
                maxTokens,
                maxRetries: 3,
                configuration: {
                    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
                    defaultHeaders: {
                        "HTTP-Referer": "https://github.com/agentic/agent",
                        "X-Title": "Agentic Software Developer",
                    },
                },
            });
        }

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
