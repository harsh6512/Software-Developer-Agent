import { createLogger } from "./logger.js";

const logger = createLogger("TruncateOutputs");

export function truncateOutput(
    output: string,
    options?: {
        numStartCharacters?: number;
        numEndCharacters?: number;
    },
): string {
    const { numStartCharacters = 2500, numEndCharacters = 2500 } = options ?? {};

    if (output.length <= numStartCharacters + numEndCharacters) {
        return output;
    }

    logger.warn(
        `Truncating output: received ${output.length} characters, keeping first ${numStartCharacters} and last ${numEndCharacters}.`,
    );

    return (
        `The following output was truncated due to length (${output.length} characters):\n\n` +
        output.slice(0, numStartCharacters) +
        `\n\n... [content truncated: ${output.length - (numStartCharacters + numEndCharacters)} characters omitted] ...\n\n` +
        output.slice(-numEndCharacters)
    );
}
