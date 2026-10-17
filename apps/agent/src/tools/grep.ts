import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import {
    createGrepToolFields,
    formatGrepCommand,
    getRepoAbsolutePath,
    TargetRepository,
} from "@agentic/shared";
import { getSandboxErrorFields } from "../utils/sandbox-error-fields.js";
import { createLogger } from "../utils/logger.js";
import { TIMEOUT_SEC } from "../constants.js";
import { createShellExecutor } from "../utils/shell-executor.js";
import { wrapScript } from "../utils/wrap-script.js";

const logger = createLogger("GrepTool");

export interface GrepToolOptions {
    sandbox: Sandbox;
    targetRepository: TargetRepository;
}

export function createGrepTool(options: GrepToolOptions) {
    const grepTool = tool(
        async (input): Promise<{ result: string; status: "success" | "error" }> => {
            try {
                const command = formatGrepCommand(input);
                const workDir = getRepoAbsolutePath(options.targetRepository);

                logger.info("Running grep search command", {
                    command: command.join(" "),
                    workDir,
                });

                const executor = createShellExecutor();
                const response = await executor.executeCommand({
                    command: wrapScript(command.join(" ")),
                    workdir: workDir,
                    timeout: TIMEOUT_SEC,
                    sandbox: options.sandbox,
                });

                let successResult = response.result;

                // Ripgrep returns exitCode 1 when no matches are found, which is a valid query result
                if (
                    response.exitCode === 1 ||
                    (response.exitCode === 127 && response.result.startsWith("sh: 1: "))
                ) {
                    const errorResult = response.result;
                    successResult = `Exit code 1. No results found.\n\n${errorResult}`;
                } else if (response.exitCode > 1) {
                    const errorResult = response.result;
                    throw new Error(
                        `Failed to run grep search command. Exit code: ${response.exitCode}\nError: ${errorResult}`,
                    );
                }

                return {
                    result: successResult,
                    status: "success",
                };
            } catch (e) {
                const errorFields = getSandboxErrorFields(e);
                if (errorFields) {
                    const errorResult = errorFields.result;
                    return {
                        result: `Failed to run search command. Exit code: ${errorFields.exitCode}\nError: ${errorResult}`,
                        status: "error" as const,
                    };
                }

                const errorMessage = e instanceof Error ? e.message : String(e);
                return {
                    result: `Failed to run grep search command: ${errorMessage}`,
                    status: "error" as const,
                };
            }
        },
        createGrepToolFields(options.targetRepository),
    );

    return grepTool;
}
