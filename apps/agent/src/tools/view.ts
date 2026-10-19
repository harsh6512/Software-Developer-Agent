import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import {
    createViewToolFields,
    getRepoAbsolutePath,
    TargetRepository,
    TIMEOUT_SEC
} from "@agentic/shared";
import { createLogger } from "../utils/logger.js";
import { createShellExecutor } from "../utils/shell-executor.js";
import { getSandboxErrorFields } from "../utils/sandbox-error-fields.js";

const logger = createLogger("ViewTool");

export interface ViewToolOptions {
    sandbox: Sandbox;
    targetRepository: TargetRepository;
}

export function createViewTool(options: ViewToolOptions) {
    const repoDir = getRepoAbsolutePath(options.targetRepository);
    const executor = createShellExecutor();

    return tool(
        async (input): Promise<{ result: string; status: "success" | "error" }> => {
            try {
                const { command, path, view_range } = input as {
                    command: "view";
                    path: string;
                    view_range?: [number, number];
                };

                if (command !== "view") {
                    throw new Error(`Unknown command: ${command}`);
                }

                logger.info(`Inspecting path: ${path}`, { view_range });

                // 1. Check if path is a directory
                const statOutput = await executor.executeCommand({
                    command: `stat -c %F "${path}"`,
                    workdir: repoDir,
                    sandbox: options.sandbox,
                    timeout: TIMEOUT_SEC,
                });

                if (statOutput.exitCode === 0 && statOutput.result?.includes("directory")) {
                    // List directory contents
                    const lsOutput = await executor.executeCommand({
                        command: `ls -la "${path}"`,
                        workdir: repoDir,
                        sandbox: options.sandbox,
                        timeout: TIMEOUT_SEC,
                    });

                    if (lsOutput.exitCode !== 0) {
                        throw new Error(`Failed to list directory: ${lsOutput.result}`);
                    }

                    return {
                        result: `Directory listing for ${path}:\n${lsOutput.result}`,
                        status: "success",
                    };
                }

                // 2. Read file contents using cat
                const catOutput = await executor.executeCommand({
                    command: `cat "${path}"`,
                    workdir: repoDir,
                    sandbox: options.sandbox,
                    timeout: TIMEOUT_SEC,
                });

                if (catOutput.exitCode !== 0) {
                    throw new Error(`Failed to read file: ${catOutput.result}`);
                }

                const lines = catOutput.result.split("\n");

                // 3. Apply line range if provided
                if (view_range && view_range.length === 2) {
                    const [start, end] = view_range;
                    const startIndex = Math.max(0, start - 1);
                    const endIndex = end === -1 ? lines.length : Math.min(lines.length, end);

                    const selectedLines = lines.slice(startIndex, endIndex);
                    const numberedLines = selectedLines.map(
                        (line, idx) => `${startIndex + idx + 1}: ${line}`,
                    );

                    return {
                        result: numberedLines.join("\n"),
                        status: "success",
                    };
                }

                // 4. Return full file with 1-based line numbers
                const numberedLines = lines.map((line, idx) => `${idx + 1}: ${line}`);
                return {
                    result: numberedLines.join("\n"),
                    status: "success",
                };
            } catch (error) {
                const errorFields = getSandboxErrorFields(error);
                if (errorFields) {
                    return {
                        result: `Error: ${errorFields.result}`,
                        status: "error",
                    };
                }

                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`View command failed: ${errorMessage}`);
                return {
                    result: `Error: ${errorMessage}`,
                    status: "error",
                };
            }
        },
        createViewToolFields(options.targetRepository),
    );
}
