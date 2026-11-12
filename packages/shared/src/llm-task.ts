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
}

export const TASK_TO_CONFIG_DEFAULTS_MAP = {
    [LLMTask.PLANNER]: {
        modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        temperature: 0,
    },
    [LLMTask.PROGRAMMER]: {
        modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        temperature: 0,
    },
    [LLMTask.REVIEWER]: {
        modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        temperature: 0,
    },
    [LLMTask.ROUTER]: {
        modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        temperature: 0,
    },
    [LLMTask.SUMMARIZER]: {
        modelName: "nvidia/nemotron-3.5-super-vl-120b-a12b",
        temperature: 0,
    },
};
