import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { z } from "zod";
import {
    GraphConfig,
    GraphState,
    GraphUpdate,
    LLMTask,
    getActivePlanItems,
    getRepoAbsolutePath,
    createOpenPrToolFields,
} from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { getModelManager } from "../../../utils/llms/model-manager.js";
import { daytonaClient, deleteSandbox } from "../../../utils/sandbox.js";
import { createShellExecutor } from "../../../utils/shell-executor.js";
import { getGitHubAuthToken } from "../../../utils/github/get-token.js";

const logger = createLogger("OpenPR");

const GIT_IDENTITY = `-c user.name="agentic-bot" -c user.email="agentic-bot@users.noreply.github.com"`;

const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const githubHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
});

async function safeDeleteSandbox(sandboxId: string) {
    try {
        await deleteSandbox(sandboxId);
        logger.info("Sandbox removed successfully.");
    } catch (err: any) {
        logger.warn("Could not delete sandbox:", { error: err.message });
    }
}

async function getDefaultBranch(owner: string, repo: string, token: string): Promise<string> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: githubHeaders(token),
    });
    if (!res.ok) throw new Error(`Could not read default branch (${res.status})`);
    const data = (await res.json()) as { default_branch: string };
    return data.default_branch;
}

export async function openPullRequest(
    state: GraphState,
    config: GraphConfig,
): Promise<GraphUpdate> {
    logger.info("Preparing Pull Request...");
    if (!state.taskPlan) {
        throw new Error("Cannot open Pull Request without an active task plan.");
    }
    if (!state.sandboxSessionId) {
        throw new Error("Cannot open Pull Request without a sandbox session.");
    }

    const sandboxId = state.sandboxSessionId;
    const sandbox = await daytonaClient().get(sandboxId);
    const repoPath = getRepoAbsolutePath(state.targetRepository);
    const { owner, repo } = state.targetRepository;
    const executor = createShellExecutor();

    // 1. Resolve authentication token (supports PAT, GitHub App, or Request Header)
    let githubToken: string | undefined;
    try {
        githubToken = await getGitHubAuthToken(config);
    } catch (err: any) {
        logger.warn("No GitHub token resolved:", { message: err.message });
    }

    /** Runs a command in the repo and throws on non-zero exit with token masking */
    const run = async (command: string, env: Record<string, string> = {}) => {
        const res = await executor.executeCommand({ command, workdir: repoPath, env, sandbox });
        if (res.exitCode !== 0) {
            const out = githubToken ? res.result.split(githubToken).join("***") : res.result;
            throw new Error(`Command failed (exit ${res.exitCode}): ${out.slice(0, 500)}`);
        }
        return res.result;
    };

    // 2. Verify whether there are any changed files compared to base branch
    const baseBranch = state.targetRepository.branch || "main";
    let gitDiffNames = "";
    try {
        gitDiffNames = await run(`git diff --name-only ${shQuote(baseBranch)}`);
    } catch {
        // Fallback if baseBranch isn't checked out locally
        gitDiffNames = "";
    }
    const status = await run("git status --porcelain");

    // If both git diff against base branch and git status are empty, skip PR
    if (!gitDiffNames.trim() && !status.trim()) {
        logger.info("No modifications or diff detected compared to base branch. Skipping PR creation.");
        await safeDeleteSandbox(sandboxId);

        const noChangesMsg = new AIMessage({
            content: `The requested task is already satisfied in the repository. No code modifications were needed, so no Pull Request was opened.`,
        });

        return {
            messages: [noChangesMsg],
            internalMessages: [noChangesMsg],
            sandboxSessionId: undefined,
        };
    }

    // 3. Stage changes and collect diff statistics
    await run("git add -A");
    const diffStat = (await run("git diff --cached --stat")).slice(0, 4000);

    const activePlan = getActivePlanItems(state.taskPlan);
    const planSummary = activePlan
        .filter((t) => t.completed)
        .map((t) => `- ${t.plan}: ${t.summary || "Done"}`)
        .join("\n");

    // 4. Generate PR Title & Body using LLM Router
    const openPrTool = createOpenPrToolFields();
    let prContent: { title: string; body: string };
    try {
        const model = (await getModelManager().loadModel(config, LLMTask.ROUTER)) as BaseChatModel;
        const structuredModel = model.withStructuredOutput(openPrTool.schema);
        prContent = (await structuredModel.invoke([
            new SystemMessage(`You are generating the title and description for a GitHub Pull Request.

Tasks completed:
${planSummary}

Files changed:
${diffStat}

Generate a professional, accurate Pull Request title and markdown body.`),
        ])) as z.infer<typeof openPrTool.schema>;
    } catch (err: any) {
        logger.warn("PR text generation failed, using fallback:", { error: err.message });
        prContent = {
            title: "Automated changes by agent",
            body: planSummary || "Automated changes.",
        };
    }

    // 5. Commit changes locally in sandbox
    const branch = state.branchName || "agentic/patch";
    const messageB64 = Buffer.from(prContent.title, "utf8").toString("base64");
    await run(`git checkout -B ${shQuote(branch)}`);
    await run(`printf %s ${shQuote(messageB64)} | base64 -d | git ${GIT_IDENTITY} commit -F -`);

    let prUrl = `Branch: ${branch} (not pushed)`;
    let pushed = false;

    // 6. Push to GitHub and create Pull Request if token is present
    if (githubToken && owner !== "local") {
        try {
            await run(
                `git push "https://x-access-token:$GITHUB_TOKEN@github.com/${owner}/${repo}.git" ${shQuote(branch)} --force`,
                { GITHUB_TOKEN: githubToken },
            );
            pushed = true;
            prUrl = `Branch pushed: ${branch} (PR not created)`;

            const base =
                state.targetRepository.branch ||
                (await getDefaultBranch(owner, repo, githubToken));

            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
                method: "POST",
                headers: githubHeaders(githubToken),
                body: JSON.stringify({
                    title: prContent.title,
                    body: prContent.body,
                    head: branch,
                    base,
                }),
            });

            if (response.ok) {
                const prData = (await response.json()) as { html_url: string };
                prUrl = prData.html_url;
                logger.info(`Pull Request opened successfully: ${prUrl}`);
            } else {
                logger.warn("GitHub PR creation failed", {
                    status: response.status,
                    body: (await response.text()).slice(0, 500),
                });
            }
        } catch (err: any) {
            logger.warn("Could not push/open PR on GitHub:", { error: err.message });
        }
    }

    // 7. Cleanup sandbox on successful push
    if (pushed) {
        await safeDeleteSandbox(sandboxId);
    } else {
        logger.warn("Keeping sandbox because changes were not pushed.", { sandboxId });
    }

    const finalMsg = new AIMessage({
        content: `🎉 **Task Complete!**\n\n**Pull Request:** ${prUrl}\n\n**Title:** ${prContent.title}\n\n${prContent.body}`,
    });

    return {
        messages: [finalMsg],
        internalMessages: [finalMsg],
        sandboxSessionId: pushed ? undefined : sandboxId,
    };
}