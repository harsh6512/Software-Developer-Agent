import { initChatModel } from "langchain/chat_models/universal";
import { GraphConfig } from "@agentic/shared";
import { LLMTask, TASK_TO_CONFIG_DEFAULTS_MAP } from "@agentic/shared";
import { createLogger } from "../logger.js";

const logger = createLogger("ModelManager");

export const PROVIDER_FALLBACK_ORDER = [
    "groq",
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
            if (provider === "groq" && (apiKeys.groqApiKey || apiKeys.groq_api_key)) {
                return apiKeys.groqApiKey || apiKeys.groq_api_key;
            }
            if (provider === "openrouter" && (apiKeys.openrouterApiKey || apiKeys.openRouterApiKey)) {
                return apiKeys.openrouterApiKey || apiKeys.openRouterApiKey;
            }
            if (provider === "google-genai" && apiKeys.googleApiKey) return apiKeys.googleApiKey;
            if (provider === "anthropic" && apiKeys.anthropicApiKey) return apiKeys.anthropicApiKey;
            if (provider === "openai" && apiKeys.openaiApiKey) return apiKeys.openaiApiKey;
        }

        // 2. Fall back to environment variables
        if (provider === "groq") {
            return process.env.GROQ_API_KEY;
        }
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

        const taskEnvModel =
            (task ? process.env[`${task.toUpperCase()}_MODEL_NAME`] : undefined) ||
            (task ? process.env[`${task.toUpperCase()}_MODEL`] : undefined);

        const envModel =
            taskEnvModel ||
            process.env.MODEL_NAME ||
            (process.env.OPENROUTER_MODEL
                ? (process.env.OPENROUTER_MODEL.includes(":")
                    ? process.env.OPENROUTER_MODEL.trim()
                    : `openrouter:${process.env.OPENROUTER_MODEL.trim()}`)
                : undefined) ||
            (process.env.GEMINI_MODEL ? `google-genai:${process.env.GEMINI_MODEL.trim()}` : undefined) ||
            (process.env.GROQ_MODEL ? `groq:${process.env.GROQ_MODEL.trim()}` : undefined);

        const rawConfiguredModel =
            (graphConfig?.configurable as any)?.[`${task}ModelName`] ||
            envModel ||
            taskDefaults.modelName;

        let provider: Provider = "openrouter";
        let modelName = "openrouter/free";

        if (rawConfiguredModel.includes(":")) {
            const [providerStr, ...modelRest] = rawConfiguredModel.split(":");
            provider = (providerStr as Provider) || "groq";
            modelName = modelRest.join(":") || "llama-3.3-70b-versatile";
        } else if (rawConfiguredModel.startsWith("llama")) {
            provider = "groq";
            modelName = rawConfiguredModel;
        } else if (rawConfiguredModel.startsWith("groq/")) {
            provider = "groq";
            modelName = rawConfiguredModel.replace("groq/", "");
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
     * Initializes the chat model via LangChain universal initChatModel, ChatOpenAI for Groq & OpenRouter
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

        if (provider === "groq") {
            const { ChatOpenAI } = await import("@langchain/openai");
            const primary = new ChatOpenAI({
                model: modelName,
                apiKey,
                temperature,
                maxTokens,
                maxRetries: 0,
                configuration: {
                    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
                },
            });

            // Groq fallbacks in case developer-tier accounts encounter decommission/404 on llama-3.3-70b-versatile
            const fallbackQwen = new ChatOpenAI({
                model: "qwen/qwen3.8-27b",
                apiKey,
                temperature,
                maxTokens,
                maxRetries: 1,
                configuration: {
                    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
                },
            });

            const fallback120b = new ChatOpenAI({
                model: process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-120b",
                apiKey,
                temperature,
                maxTokens,
                maxRetries: 1,
                configuration: {
                    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
                },
            });

            return new Proxy(primary, {
                get(target: any, prop: string | symbol, receiver: any) {
                    if (prop === "bindTools") {
                        return (tools: any[], fields?: any) => {
                            const boundPrimary = target.bindTools(tools, fields);
                            const boundQwen = fallbackQwen.bindTools(tools, fields);
                            const bound120b = fallback120b.bindTools(tools, fields);
                            return boundPrimary.withFallbacks({ fallbacks: [boundQwen, bound120b] });
                        };
                    }
                    if (prop === "invoke") {
                        return (input: any, options?: any) => {
                            return target.withFallbacks({ fallbacks: [fallbackQwen, fallback120b] }).invoke(input, options);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
            });
        }

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
