import { Sandbox } from "@daytonaio/sdk";
import { TargetRepository, getRepoAbsolutePath } from "@agentic/shared";
import { createLogger } from "../logger.js";
import { withRetry } from "../retry.js";

const logger = createLogger("GitHub-Git");
/**
 * Performs the actual Git clone operation inside the Daytona sandbox.
 */
async function performClone(
    sandbox: Sandbox,
    cloneUrl: string,
    args: {
        branchName: string | undefined;
        targetRepository: TargetRepository;
        absoluteRepoDir: string;
        githubInstallationToken?: string;
    },
): Promise<string> {
    const {
        branchName,
        targetRepository,
        absoluteRepoDir,
        githubInstallationToken,
    } = args;

    // clone the existing upstream base branch (e.g. "main" or "master")
    const baseBranch = targetRepository.branch || "main";

    logger.info("Cloning repository from upstream base branch", {
        repoPath: `${targetRepository.owner}/${targetRepository.repo}`,
        baseBranch,
        absoluteRepoDir,
    });

    const cloneRes = await withRetry(
        async () => {
            await sandbox.git.clone(
                cloneUrl,
                absoluteRepoDir,
                baseBranch,
                targetRepository.baseCommit,
                githubInstallationToken ? "git" : undefined,
                githubInstallationToken,
            );
            return baseBranch;
        },
        { retries: 3, delay: 1000 },
    );

    if (cloneRes instanceof Error) {
        throw cloneRes;
    }

    // 2. Once cloned, create and switch to the new agent working branch!
    if (branchName && branchName !== baseBranch) {
        logger.info(`Creating and checking out working branch: ${branchName}`);
        try {
            if (typeof sandbox.git?.createBranch === "function") {
                await sandbox.git.createBranch(absoluteRepoDir, branchName);
            } else {
                await sandbox.process.executeCommand(
                    `git checkout -b "${branchName}"`,
                    absoluteRepoDir,
                );
            }
        } catch (err) {
            logger.warn(`Could not create branch ${branchName}, attempting checkout:`, { err: String(err) });
            await sandbox.process.executeCommand(
                `git checkout "${branchName}"`,
                absoluteRepoDir,
            );
        }
    }

    logger.info("Successfully set up repository and working branch in sandbox", {
        repoPath: `${targetRepository.owner}/${targetRepository.repo}`,
        activeBranch: branchName || baseBranch,
    });

    return branchName || baseBranch;
}

/**
 * Clones a GitHub repository into the Daytona sandbox using temporary credentials.
 */
export async function cloneRepo(
    sandbox: Sandbox,
    targetRepository: TargetRepository,
    args: {
        githubInstallationToken?: string;
        stateBranchName?: string;
    } = {},
): Promise<string> {
    const absoluteRepoDir = getRepoAbsolutePath(targetRepository);
    const cloneUrl = `https://github.com/${targetRepository.owner}/${targetRepository.repo}.git`;
    const branchName = args.stateBranchName || targetRepository.branch;

    try {
        return await performClone(sandbox, cloneUrl, {
            branchName,
            targetRepository,
            absoluteRepoDir,
            githubInstallationToken: args.githubInstallationToken,
        });
    } catch (error) {
        logger.error("Clone repo failed", { error });
        throw error;
    }
}
