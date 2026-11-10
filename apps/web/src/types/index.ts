export type {
    TargetRepository,
    TaskPlan,
    Task,
    PlanItem,
    PlanRevision,
    TestingStatus,
    GraphState,
} from "@agentic/shared";

export type AgentStatus =
    | "idle"
    | "starting"
    | "planning"
    | "awaiting_approval"
    | "programming"
    | "reviewing"
    | "completed"
    | "error";

export interface ToolLog {
    id: string;
    node: string;
    name: string;
    args: Record<string, any>;
    result?: string;
    timestamp: number;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    node?: string;
    toolCalls?: {
        name: string;
        args: Record<string, any>;
    }[];
}

export interface PlanInterruptPayload {
    type: "plan_approval";
    title: string;
    plan: { index: number; plan: string; completed?: boolean }[];
}

export interface GitHubUser {
    login: string;
    avatar_url?: string;
    name?: string;
    email?: string;
}

export interface GitHubInstallation {
    id: number | string;
    accountName: string;
    accountType: "User" | "Organization" | string;
    avatarUrl?: string;
}

export interface GitHubRepoItem {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    defaultBranch: string;
    private: boolean;
}
