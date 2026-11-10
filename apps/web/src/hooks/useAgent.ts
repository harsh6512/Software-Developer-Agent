import { useState, useCallback } from "react";
import type {
    AgentStatus,
    ChatMessage,
    PlanInterruptPayload,
    TargetRepository,
    TaskPlan,
    ToolLog,
} from "../types/index.js";
import { createLangGraphClient } from "../lib/langgraph.js";

function formatRawMessage(msg: any, nodeName?: string): ChatMessage | null {
    if (!msg) return null;
    const content =
        typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
                ? msg.content.map((c: any) => (typeof c === "string" ? c : c?.text || JSON.stringify(c))).join("\n")
                : typeof msg.content === "object" && msg.content !== null
                    ? JSON.stringify(msg.content)
                    : "";

    if (!content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
        return null;
    }

    const role =
        msg.role === "human" || msg.type === "human"
            ? "user"
            : msg.role === "ai" || msg.type === "ai"
                ? "assistant"
                : "system";

    return {
        id: msg.id || `${Date.now()}-${Math.random()}`,
        role,
        content,
        timestamp: Date.now(),
        node: nodeName,
        toolCalls: msg.tool_calls || undefined,
    };
}

export function useAgent() {
    const [status, setStatus] = useState<AgentStatus>("idle");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null);
    const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
    const [activeInterrupt, setActiveInterrupt] = useState<PlanInterruptPayload | null>(null);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /**
     * Helper to process stream chunks and update UI state.
     */
    const processStream = useCallback(
        async (client: any, curThreadId: string, runId: string) => {
            const stream = client.runs.joinStream(curThreadId, runId, {
                streamMode: ["updates", "values"],
            });

            for await (const chunk of stream) {
                // 1. Process Updates Event
                if (chunk.event === "updates" && chunk.data) {
                    const entries = Object.entries(chunk.data);
                    for (const [nodeName, nodeUpdate] of entries as [string, any][]) {
                        if (!nodeUpdate || typeof nodeUpdate !== "object") continue;

                        // Track status based on node
                        if (nodeName.includes("plan")) {
                            setStatus("planning");
                        } else if (nodeName.includes("reviewer")) {
                            setStatus("reviewing");
                        } else if (nodeName.includes("action") || nodeName.includes("programmer")) {
                            setStatus("programming");
                        }

                        // Task plan update
                        if (nodeUpdate?.taskPlan) {
                            setTaskPlan(nodeUpdate.taskPlan);
                        }

                        // Check for messages
                        if (Array.isArray(nodeUpdate?.messages)) {
                            for (const rawMsg of nodeUpdate.messages) {
                                const formatted = formatRawMessage(rawMsg, nodeName);
                                if (formatted) {
                                    setMessages((prev) => {
                                        if (prev.some((m) => m.id === formatted.id)) return prev;
                                        return [...prev, formatted];
                                    });
                                }

                                // Capture tool logs
                                if (rawMsg.tool_calls && Array.isArray(rawMsg.tool_calls)) {
                                    for (const tc of rawMsg.tool_calls) {
                                        setToolLogs((prev) => [
                                            ...prev,
                                            {
                                                id: tc.id || `${Date.now()}-${Math.random()}`,
                                                node: nodeName,
                                                name: tc.name,
                                                args: tc.args || {},
                                                timestamp: Date.now(),
                                            },
                                        ]);
                                    }
                                }
                            }
                        }

                        // Check if open-pr generated a PR link
                        if (nodeName === "open-pr" || nodeUpdate?.conclusion) {
                            const text = typeof nodeUpdate?.conclusion === "string" ? nodeUpdate.conclusion : "";
                            const prMatch = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
                            if (prMatch) {
                                setPullRequestUrl(prMatch[0]);
                            }
                        }
                    }
                }

                // 2. Process Values Event (Sync state snapshot)
                if (chunk.event === "values" && chunk.data) {
                    if (chunk.data.taskPlan) {
                        setTaskPlan(chunk.data.taskPlan);
                    }
                    if (Array.isArray(chunk.data.messages) && chunk.data.messages.length > 0) {
                        const formattedList = (chunk.data.messages as any[])
                            .map((m) => formatRawMessage(m))
                            .filter(Boolean) as ChatMessage[];
                        if (formattedList.length > 0) {
                            setMessages(formattedList);
                        }
                    }
                }
            }

            // Check thread state for human-in-the-loop interrupts and final synchronization
            const threadState = await client.threads.getState(curThreadId);

            // Sync any final messages
            if (Array.isArray(threadState?.values?.messages) && threadState.values.messages.length > 0) {
                const finalMessages = (threadState.values.messages as any[])
                    .map((m) => formatRawMessage(m))
                    .filter(Boolean) as ChatMessage[];
                if (finalMessages.length > 0) {
                    setMessages(finalMessages);
                }
            }

            const tasksWithInterrupts = threadState?.tasks?.filter(
                (t: any) => t.interrupts && t.interrupts.length > 0
            );
            const interrupts = tasksWithInterrupts?.flatMap((t: any) => t.interrupts) || [];

            if (interrupts.length > 0) {
                const rawInterrupt = interrupts[0]?.value;
                if (rawInterrupt?.type === "plan_approval" || rawInterrupt?.plan) {
                    setActiveInterrupt({
                        type: "plan_approval",
                        title: rawInterrupt.title || "Proposed Implementation Plan",
                        plan: Array.isArray(rawInterrupt.plan) ? rawInterrupt.plan : [],
                    });
                    setStatus("awaiting_approval");
                    return;
                }
            }

            // If not interrupted and finished
            if (threadState?.values?.taskPlan) {
                setTaskPlan(threadState.values.taskPlan);
            }
            setStatus("completed");
        },
        [],
    );

    /**
     * Start a new agent task.
     */
    const startTask = useCallback(
        async (targetRepo: TargetRepository, userPrompt: string, autoAccept: boolean = false) => {
            try {
                setError(null);
                setStatus("starting");
                setPullRequestUrl(null);
                setToolLogs([]);
                setActiveInterrupt(null);

                const client = createLangGraphClient();
                const thread = await client.threads.create();
                setThreadId(thread.thread_id);

                // Add user message to chat feed
                setMessages([
                    {
                        id: `user-${Date.now()}`,
                        role: "user",
                        content: userPrompt,
                        timestamp: Date.now(),
                    },
                ]);

                // Create run on manager graph with streamMode configured
                const run = await client.runs.create(thread.thread_id, "manager", {
                    input: {
                        messages: [{ role: "user", content: userPrompt }],
                        targetRepository: targetRepo,
                        autoAcceptPlan: autoAccept,
                    },
                    config: {
                        configurable: {
                            thread_id: thread.thread_id,
                        },
                    },
                    streamMode: ["updates", "values"],
                });

                await processStream(client, thread.thread_id, run.run_id);
            } catch (err: any) {
                console.error("Agent run failed:", err);
                setError(err.message || "Failed to communicate with LangGraph server");
                setStatus("error");
            }
        },
        [processStream],
    );

    /**
     * Approve or edit the proposed plan (resumes the interrupt).
     */
    const approvePlan = useCallback(
        async (editedPlan?: string[]) => {
            if (!threadId) return;
            try {
                setStatus("programming");
                setActiveInterrupt(null);

                const client = createLangGraphClient();
                const resumePayload = editedPlan && editedPlan.length > 0
                    ? { action: "edit", editedPlan }
                    : { action: "approve" };

                const run = await client.runs.create(threadId, "manager", {
                    command: {
                        resume: resumePayload,
                    },
                    streamMode: ["updates", "values"],
                });

                await processStream(client, threadId, run.run_id);
            } catch (err: any) {
                console.error("Failed to approve plan:", err);
                setError(err.message || "Failed to resume plan approval");
                setStatus("error");
            }
        },
        [threadId, processStream],
    );

    /**
     * Reject proposed plan.
     */
    const rejectPlan = useCallback(async () => {
        if (!threadId) return;
        try {
            setActiveInterrupt(null);
            setStatus("idle");
            const client = createLangGraphClient();
            await client.runs.create(threadId, "manager", {
                command: {
                    resume: { action: "reject" },
                },
            });
        } catch (err: any) {
            console.error("Failed to reject plan:", err);
            setStatus("idle");
        }
    }, [threadId]);

    const resetSession = useCallback(() => {
        setStatus("idle");
        setMessages([]);
        setTaskPlan(null);
        setToolLogs([]);
        setActiveInterrupt(null);
        setThreadId(null);
        setPullRequestUrl(null);
        setError(null);
    }, []);

    return {
        status,
        messages,
        taskPlan,
        toolLogs,
        activeInterrupt,
        threadId,
        pullRequestUrl,
        error,
        startTask,
        approvePlan,
        rejectPlan,
        resetSession,
    };
}
