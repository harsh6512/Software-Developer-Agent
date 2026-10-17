import { randomUUID } from "node:crypto";

export function wrapScript(command: string): string {
    const makeDelim = () => `AGENTIC_${randomUUID().replace(/-/g, "")}`;

    let delim = makeDelim();
    const containsStandalone = (d: string) =>
        command === d ||
        command.startsWith(`${d}\n`) ||
        command.endsWith(`\n${d}`) ||
        command.includes(`\n${d}\n`);

    while (containsStandalone(delim)) {
        delim = makeDelim();
    }

    return `script --return --quiet -c "$(cat <<'${delim}'
${command}
${delim}
)" /dev/null`;
}