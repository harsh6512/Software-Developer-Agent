import { randomUUID } from "node:crypto";
import { Sandbox } from "@daytonaio/sdk";
import { createShellExecutor } from "./shell-executor.js";
import { getSandboxErrorFields } from "./sandbox-error-fields.js";
import { TIMEOUT_SEC } from "@agentic/shared";

export async function readFile(
    sandbox: Sandbox,
    filePath: string,
    workDir: string,
): Promise<{ success: boolean; output: string }> {
    const executor = createShellExecutor();
    try {
        const response = await executor.executeCommand({
            command: `cat "${filePath}"`,
            workdir: workDir,
            sandbox,
            timeout: TIMEOUT_SEC,
        });

        if (response.exitCode !== 0) {
            return {
                success: false,
                output: `Failed to read file '${filePath}': ${response.result}`,
            };
        }

        return {
            success: true,
            output: response.result,
        };
    } catch (error) {
        const err = getSandboxErrorFields(error);
        return {
            success: false,
            output: `Error reading '${filePath}': ${err ? err.result : String(error)}`,
        };
    }
}

export async function writeFile(
    sandbox: Sandbox,
    filePath: string,
    content: string,
    workDir: string,
): Promise<{ success: boolean; output: string }> {
    const executor = createShellExecutor();
    const delimiter = `EOF_${randomUUID().replace(/-/g, "")}`;
    const writeCommand = `cat > "${filePath}" << '${delimiter}'\n${content}\n${delimiter}`;

    try {
        const response = await executor.executeCommand({
            command: writeCommand,
            workdir: workDir,
            sandbox,
            timeout: TIMEOUT_SEC,
        });

        if (response.exitCode !== 0) {
            return {
                success: false,
                output: `Failed to write file '${filePath}': ${response.result}`,
            };
        }

        return {
            success: true,
            output: `Successfully wrote file '${filePath}'.`,
        };
    } catch (error) {
        const err = getSandboxErrorFields(error);
        return {
            success: false,
            output: `Error writing to '${filePath}': ${err ? err.result : String(error)}`,
        };
    }
}
