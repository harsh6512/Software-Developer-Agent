import { z } from "zod";
import { TargetRepository } from "./types.js";
import { getRepoAbsolutePath } from "./git.js";
import { TIMEOUT_SEC } from "./constants.js";

export function createShellToolFields(targetRepository: TargetRepository) {
    const repoRoot = getRepoAbsolutePath(targetRepository);

    const shellToolSchema = z.object({
        command: z
            .array(z.string())
            .describe(
                "The command to run. Ensure the command is properly formatted, with arguments in the correct order, and including any wrapping strings, quotes, etc. By default, this command will be executed in the root of the repository, unless a custom workdir is specified.",
            ),
        workdir: z
            .string()
            .default(repoRoot)
            .describe(
                `The working directory for the command. Defaults to the root of the repository (${repoRoot}). You should only specify this if the command you're running can not be executed from the root of the repository.`,
            ),
        timeout: z
            .number()
            .optional()
            .default(TIMEOUT_SEC)
            .describe(
                "The maximum time to wait for the command to complete in seconds. For commands which may require a long time to complete, such as running tests, you should increase this value.",
            ),
    });

    return {
        name: "shell",
        description: "Runs a shell command, and returns its output.",
        schema: shellToolSchema,
    };
}
