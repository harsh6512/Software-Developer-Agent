import { tool } from "@langchain/core/tools";
import { Sandbox } from "@daytonaio/sdk";
import {
    createTextEditorToolFields,
    getRepoAbsolutePath,
    TargetRepository,
} from "@agentic/shared";
import { createLogger } from "../utils/logger.js";
import { readFile, writeFile } from "../utils/read-write.js";

const logger = createLogger("TextEditorTool");

export interface TextEditorToolOptions {
    sandbox: Sandbox;
    targetRepository: TargetRepository;
}

export function createTextEditorTool(options: TextEditorToolOptions) {
    const repoDir = getRepoAbsolutePath(options.targetRepository);

    return tool(
        async (input): Promise<{ result: string; status: "success" | "error" }> => {
            try {
                const { command, path, old_str, new_str, file_text, insert_line } = input as {
                    command: "view" | "create" | "str_replace" | "insert";
                    path: string;
                    old_str?: string;
                    new_str?: string;
                    file_text?: string;
                    insert_line?: number;
                    view_range?: [number, number];
                };

                logger.info(`Text editor command: ${command} on ${path}`);

                switch (command) {
                    case "create": {
                        if (file_text === undefined) {
                            throw new Error("The 'create' command requires the 'file_text' parameter.");
                        }

                        // Verify file doesn't already exist
                        const existing = await readFile(options.sandbox, path, repoDir);
                        if (existing.success) {
                            throw new Error(
                                `File '${path}' already exists. Use 'str_replace' to modify existing files.`,
                            );
                        }

                        const writeRes = await writeFile(options.sandbox, path, file_text, repoDir);
                        if (!writeRes.success) {
                            throw new Error(writeRes.output);
                        }

                        return {
                            result: `Successfully created file ${path}.`,
                            status: "success",
                        };
                    }

                    case "str_replace": {
                        if (!old_str || new_str === undefined) {
                            throw new Error(
                                "The 'str_replace' command requires both 'old_str' and 'new_str'.",
                            );
                        }

                        const readRes = await readFile(options.sandbox, path, repoDir);
                        if (!readRes.success) {
                            throw new Error(readRes.output);
                        }

                        const content = readRes.output;
                        // Escape special regex characters to count occurrences
                        const escapedOldStr = old_str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        const occurrences = (content.match(new RegExp(escapedOldStr, "g")) || []).length;

                        if (occurrences === 0) {
                            throw new Error(
                                `No match found for replacement text in ${path}. Please ensure old_str matches exactly.`,
                            );
                        }

                        if (occurrences > 1) {
                            throw new Error(
                                `Found ${occurrences} matches for replacement text in ${path}. Please include more surrounding context in old_str to make it unique.`,
                            );
                        }

                        const updatedContent = content.replace(old_str, new_str);
                        const writeRes = await writeFile(options.sandbox, path, updatedContent, repoDir);
                        if (!writeRes.success) {
                            throw new Error(writeRes.output);
                        }

                        return {
                            result: `Successfully replaced text in ${path} at exactly one location.`,
                            status: "success",
                        };
                    }

                    case "insert": {
                        if (insert_line === undefined || new_str === undefined) {
                            throw new Error(
                                "The 'insert' command requires both 'insert_line' and 'new_str'.",
                            );
                        }

                        const readRes = await readFile(options.sandbox, path, repoDir);
                        if (!readRes.success) {
                            throw new Error(readRes.output);
                        }

                        const lines = readRes.output.split("\n");
                        const insertIndex = Math.max(0, Math.min(lines.length, insert_line));
                        lines.splice(insertIndex, 0, new_str);

                        const updatedContent = lines.join("\n");
                        const writeRes = await writeFile(options.sandbox, path, updatedContent, repoDir);
                        if (!writeRes.success) {
                            throw new Error(writeRes.output);
                        }

                        return {
                            result: `Successfully inserted text into ${path} at line ${insert_line}.`,
                            status: "success",
                        };
                    }

                    case "view": {
                        const readRes = await readFile(options.sandbox, path, repoDir);
                        if (!readRes.success) {
                            throw new Error(readRes.output);
                        }
                        return {
                            result: readRes.output,
                            status: "success",
                        };
                    }

                    default:
                        throw new Error(`Unknown command: ${command}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Text editor command failed: ${errorMessage}`);
                return {
                    result: `Error: ${errorMessage}`,
                    status: "error",
                };
            }
        },
        createTextEditorToolFields(options.targetRepository),
    );
}
