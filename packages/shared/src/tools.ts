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

// Helper to escape arguments safely for shell execution
function escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function createGrepToolFields(targetRepository: TargetRepository) {
    const repoRoot = getRepoAbsolutePath(targetRepository);
    const searchSchema = z.object({
        query: z
            .string()
            .describe(
                "The string or regex to search the codebase for. If passing a plain string, ensure to also set the 'match_string' field to true. If passing a regex, ensure to also set the 'match_string' field to false.",
            ),
        match_string: z
            .boolean()
            .optional()
            .default(false)
            .describe(
                "Whether or not to treat the query as a fixed string to search for. If true, it will search for results which match the query exactly. If false, the query will be treated as a regex. Defaults to false.",
            ),
        case_sensitive: z
            .boolean()
            .optional()
            .default(false)
            .describe(
                "Whether or not to make the search case sensitive. Defaults to false.",
            ),
        context_lines: z
            .number()
            .optional()
            .default(0)
            .describe("Number of lines of context to include before/after matches."),
        exclude_files: z
            .string()
            .optional()
            .describe("Glob pattern of files to exclude"),
        include_files: z
            .string()
            .optional()
            .describe("Glob pattern of files to include"),
        max_results: z
            .number()
            .optional()
            .default(0)
            .describe(
                "Maximum number of results to return. Defaults to 0, which returns all results.",
            ),
        file_types: z
            .array(z.string())
            .optional()
            .describe("Restrict to certain file extensions (e.g., ['.js', '.ts'])."),
        follow_symlinks: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether or not to follow symlinks. Defaults to false."),
    });
    return {
        name: "grep",
        schema: searchSchema,
        description: `Execute a grep (ripgrep) search in the repository. Should be used to search for content via string matching or regex in the codebase. The working directory this command will be executed in is \`${repoRoot}\`.`,
    };
}

const _tmpSearchToolSchema = createGrepToolFields({
    owner: "x",
    repo: "x",
}).schema;

export type GrepCommand = z.infer<typeof _tmpSearchToolSchema>;

export function formatGrepCommand(
    cmd: GrepCommand,
    options?: {
        excludeRequiredFlags?: boolean;
    },
): string[] {
    const args = ["rg"];
    // Required flags to keep formatting and output consistent
    const requiredFlags = ["--color=never", "--line-number", "--heading"];
    if (!options?.excludeRequiredFlags) {
        args.push(...requiredFlags);
    }
    // Case sensitivity
    if (!cmd.case_sensitive) {
        args.push("-i");
    }
    // Regex vs fixed string
    if (cmd.match_string) {
        args.push("--fixed-strings");
    }
    // Context lines
    if (cmd.context_lines && cmd.context_lines > 0) {
        args.push("-C", String(cmd.context_lines));
    }
    // File globs
    if (cmd.include_files) {
        args.push("--glob", escapeShellArg(cmd.include_files));
    }
    if (cmd.exclude_files) {
        args.push("--glob", escapeShellArg(`!${cmd.exclude_files}`));
    }
    // File types
    if (cmd.file_types && cmd.file_types.length > 0) {
        for (const ext of cmd.file_types) {
            const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
            args.push("--glob", escapeShellArg(`**/*${normalizedExt}`));
        }
    }
    // Follow symlinks
    if (cmd.follow_symlinks) {
        args.push("-L");
    }
    // Max results (0 = unlimited)
    if (cmd.max_results && cmd.max_results > 0) {
        args.push("--max-count", String(cmd.max_results));
    }
    // The query pattern
    if (cmd.query) {
        args.push(escapeShellArg(cmd.query));
    }
    return args;
}

export function createViewToolFields(targetRepository: TargetRepository) {
    const repoRoot = getRepoAbsolutePath(targetRepository);

    const viewSchema = z.object({
        command: z.enum(["view"]).describe("The command to execute: view"),
        path: z
            .string()
            .describe("The relative or absolute path to the file or directory to inspect"),

        view_range: z
            .tuple([
                z.number().int().min(1),
                z.number().int(),
            ])
            .refine(
                ([start, end]) => end === -1 || end >= start,
                {
                    message:
                        "End must be -1 (read to end of file) or greater than or equal to start.",
                },
            )
            .optional()
            .describe(
                "Optional [start, end] line range using 1-based line numbers. Start must be at least 1. End must be -1 to read to the end of the file, or greater than or equal to start.",
            ),
    });

    return {
        name: "view",
        description:
            "A text editor tool that can view files or list directory contents. " +
            `The working directory is \`${repoRoot}\`. ` +
            "Always use this tool to inspect file contents before editing them.",
        schema: viewSchema,
    };
}
