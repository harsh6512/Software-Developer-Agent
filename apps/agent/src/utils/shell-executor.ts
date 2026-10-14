import { Sandbox } from "@daytonaio/sdk";
import { TIMEOUT_SEC, SANDBOX_ROOT_DIR } from "@agentic/shared";
import { createLogger } from "./logger.js";

const logger = createLogger("ShellExecutor");

export interface ExecuteCommandOptions {
    command: string | string[];
    workdir?: string;
    env?: Record<string, string>;
    timeout?: number;
    sandbox: Sandbox;
}

export interface ShellExecuteResponse {
    exitCode: number;
    result: string;
}

export class ShellExecutor {
    async executeCommand(options: ExecuteCommandOptions): Promise<ShellExecuteResponse> {
        const {
            command,
            workdir = SANDBOX_ROOT_DIR,
            env = {},
            timeout = TIMEOUT_SEC,
            sandbox,
        } = options;

        const commandString = Array.isArray(command) ? command.join(" ") : command;

        logger.info("Executing command in sandbox", {
            command: commandString,
            workdir,
        });

        const response = await sandbox.process.executeCommand(
            commandString,
            workdir,
            env,
            timeout
        );

        return {
            exitCode: response.exitCode,
            result: response.result,
        };
    }
}

export function createShellExecutor(): ShellExecutor {
    return new ShellExecutor();
}