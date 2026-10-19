import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import { randomUUID } from "node:crypto";
import { applyPatch } from "diff";
import {
    createApplyPatchToolFields,
    getRepoAbsolutePath,
    TargetRepository,
} from "@agentic/shared";
import { createLogger } from "../utils/logger.js";
import { createShellExecutor } from "../utils/shell-executor.js";
import { readFile, writeFile } from "../utils/read-write.js";

const logger = createLogger("ApplyPatchTool");

export interface ApplyPatchToolOptions {
    sandbox: Sandbox;
    targetRepository: TargetRepository;
}

export function createApplyPatchTool(options: ApplyPatchToolOptions) {
    const repoDir = getRepoAbsolutePath(options.targetRepository);
    const executor = createShellExecutor();

    return tool(
        async (input): Promise<{ result: string; status: "success" | "error" }> => {
            const { diff, file_path } = input as { diff: string; file_path: string };
            const tempPatchFile = `/tmp/patch_${randomUUID().replace(/-/g, "")}.diff`;

            logger.info(`Applying patch to ${file_path}`);

            try {
                // 1. Read existing file to make sure it exists
                const readInitial = await readFile(options.sandbox, file_path, repoDir);
                if (!readInitial.success) {
                    throw new Error(readInitial.output);
                }

                // 2. Write diff to temporary file in sandbox
                const writePatchRes = await executor.executeCommand({
                    command: `cat > "${tempPatchFile}" << 'EOF'\n${diff}\nEOF`,
                    workdir: repoDir,
                    sandbox: options.sandbox,
                    timeout: 15,
                });

                if (writePatchRes.exitCode !== 0) {
                    throw new Error(`Failed to create temp patch file: ${writePatchRes.result}`);
                }

                // 3. Attempt native git apply
                const gitApplyRes = await executor.executeCommand({
                    command: `git apply --verbose "${tempPatchFile}"`,
                    workdir: repoDir,
                    sandbox: options.sandbox,
                    timeout: 30,
                });

                if (gitApplyRes.exitCode === 0) {
                    logger.info(`Successfully applied patch to ${file_path} via git apply`);
                    return {
                        result: `Successfully applied diff to \`${file_path}\` and saved changes.`,
                        status: "success",
                    };
                }

                // 4. Fallback: If git apply fails, try the JS diff library
                logger.warn(
                    `Git apply failed: ${gitApplyRes.result}. Attempting fallback with diff library.`,
                );

                const patchedContent = applyPatch(readInitial.output, diff);
                if (patchedContent === false) {
                    throw new Error(
                        `Git apply failed with:\n${gitApplyRes.result}\n\nFallback diff library could not apply patch to '${file_path}'. Verify the diff context lines match the current file.`,
                    );
                }

                // Write the patched content back
                const writePatchedRes = await writeFile(
                    options.sandbox,
                    file_path,
                    patchedContent,
                    repoDir,
                );

                if (!writePatchedRes.success) {
                    throw new Error(writePatchedRes.output);
                }

                return {
                    result: `Successfully applied diff to \`${file_path}\` using fallback patcher.`,
                    status: "success",
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to apply patch to ${file_path}: ${errorMessage}`);
                return {
                    result: `Error: ${errorMessage}`,
                    status: "error",
                };
            } finally {
                // 5. Clean up temp patch file
                try {
                    await executor.executeCommand({
                        command: `rm -f "${tempPatchFile}"`,
                        workdir: repoDir,
                        sandbox: options.sandbox,
                        timeout: 5,
                    });
                } catch {
                    // ignore cleanup errors
                }
            }
        },
        createApplyPatchToolFields(options.targetRepository),
    );
}
