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

    const branch = branchName || targetRepository.branch || "main";

    logger.info("Cloning repository into Daytona sandbox", {
        repoPath: `${targetRepository.owner}/${targetRepository.repo}`,
        branch,
        baseCommit: targetRepository.baseCommit,
        absoluteRepoDir,
    });

    const cloneRes = await withRetry(
        async () => {
            await sandbox.git.clone(
                cloneUrl,
                absoluteRepoDir,
                branch,
                targetRepository.baseCommit,
                githubInstallationToken ? "git" : undefined,
                githubInstallationToken,
            );
            return branch;
        },
        { retries: 3, delay: 1000 },
    );

    if (cloneRes instanceof Error) {
        throw cloneRes;
    }

    logger.info("Successfully cloned repository into Daytona sandbox", {
        repoPath: `${targetRepository.owner}/${targetRepository.repo}`,
        branch,
    });

    return branch;
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
