export enum LLMTask {
    /**
     * Used for planning tasks: generating plans, context gathering actions, etc.
     */
    PLANNER = "planner",
    /**
     * Used for programming tasks: writing code, editing files, applying diffs.
     */
    PROGRAMMER = "programmer",
    /**
     * Used for routing user requests to subgraphs.
     */
    ROUTER = "router",
    /**
     * Used for reviewing code changes against git diff.
     */
    REVIEWER = "reviewer",
    /**
     * Used for summarizing conversation history.
     */
    SUMMARIZER = "summarizer",
    /**
     * Used for running tests and verifying regressions.
     */
    TESTING = "testing",
}

export const TASK_TO_CONFIG_DEFAULTS_MAP = {
    [LLMTask.PLANNER]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
    [LLMTask.PROGRAMMER]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
    [LLMTask.REVIEWER]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
    [LLMTask.ROUTER]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
    [LLMTask.SUMMARIZER]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
    [LLMTask.TESTING]: {
        modelName: "openrouter:openrouter/free",
        temperature: 0,
    },
};
