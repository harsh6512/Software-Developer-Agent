export type TargetRepository = {
    owner: string;
    repo: string;
    branch?: string;
    baseCommit?: string;
};

export type TestingStatus =
    | "not_started"
    | "required"
    | "in_progress"
    | "completed"
    | "failed"
    | "skipped";

export type PlanItem = {
    index: number;
    plan: string;
    completed: boolean;
    summary?: string;
};

export type PlanRevision = {
    revisionIndex: number;
    plans: PlanItem[];
    createdAt: number;
    createdBy: "agent" | "user";
};

export type Task = {
    id: string;
    taskIndex: number;
    request: string;
    planRevisions: PlanRevision[];
    activeRevisionIndex: number;
    parentTaskId?: string;
    pullRequestNumber?: number;
};

export type TaskPlan = {
    tasks: Task[];
    activeTaskIndex: number;
};