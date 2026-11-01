import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { TargetRepository, TaskPlan } from "./types.js";

export interface AgentSession {
    threadId: string;
    runId?: string;
}

export const ManagerGraphAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),

    targetRepository: Annotation<TargetRepository>({
        reducer: (_prev, next) => next,
    }),

    taskPlan: Annotation<TaskPlan | null>({
        reducer: (_prev, next) => next,
        default: () => null,
    }),

    branchName: Annotation<string | undefined>({
        reducer: (_prev, next) => next,
    }),

    // Planner and Programmer session IDs (for LangGraph thread tracking)
    plannerSession: Annotation<AgentSession | undefined>({
        reducer: (_prev, next) => next,
    }),
    programmerSession: Annotation<AgentSession | undefined>({
        reducer: (_prev, next) => next,
    }),

    // Whether to auto-accept the plan (skip human-in-the-loop approval)
    autoAcceptPlan: Annotation<boolean | undefined>({
        reducer: (_prev, next) => next,
        default: () => false,
    }),
});

export type ManagerGraphState = typeof ManagerGraphAnnotation.State;
export type ManagerGraphUpdate = typeof ManagerGraphAnnotation.Update;
