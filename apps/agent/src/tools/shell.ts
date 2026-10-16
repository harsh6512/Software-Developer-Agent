import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import { TargetRepository, TIMEOUT_SEC, createShellToolFields } from "@agentic/shared";
import { getSandboxErrorFields } from "../utils/sandbox-error-fields.js";
import { createShellExecutor } from "../utils/shell-executor.js";

const DEFAULT_ENV = {
    // Prevents corepack from showing a download prompt which causes commands to hang
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
};

export function createShellTool(
    sandbox: Sandbox,
    targetRepository: TargetRepository,
) {
    const shellTool = tool(
        async (input): Promise<{ result: string; status: "success" | "error" }> => {
            try {
                const { command, workdir, timeout } = input;

                const executor = createShellExecutor();
                const response = await executor.executeCommand({
                    command,
                    workdir,
                    timeout: timeout ?? TIMEOUT_SEC,
                    env: DEFAULT_ENV,
                    sandbox,
                });

                if (response.exitCode !== 0) {
                    const errorResult = response.result ?? (response as any).artifacts?.stdout;
                    throw new Error(
                        `Command failed. Exit code: ${response.exitCode}\nResult: ${errorResult}`,
                    );
                }

                return {
                    result: response.result ?? `exit code: ${response.exitCode}`,
                    status: "success",
                };
            } catch (error: any) {
                const errorFields = getSandboxErrorFields(error);
                if (errorFields) {
                    return {
                        result: `Error: ${errorFields.result ?? errorFields.artifacts?.stdout}`,
                        status: "error",
                    };
                }

                return {
                    result: `Error: ${error.message || String(error)}`,
                    status: "error",
                };
            }
        },
        createShellToolFields(targetRepository),
    );

    return shellTool;
}
