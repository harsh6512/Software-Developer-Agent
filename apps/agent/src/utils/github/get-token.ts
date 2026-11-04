import { GraphConfig } from "@agentic/shared";
import { getInstallationAccessToken } from "./app-auth.js";

/**
 * Resolves an active GitHub access token for Git and PR operations:
 * 1. Checks if the request provided an `x-github-installation-id` (GitHub App mode)
 * 2. Checks if a PAT was passed in request config or environment variables (PAT mode)
 */
export async function getGitHubAuthToken(config?: GraphConfig): Promise<string> {
    // 1. Check for GitHub App Installation ID in config or headers
    const installationId =
        (config?.configurable as any)?.["x-github-installation-id"] ||
        process.env.GITHUB_INSTALLATION_ID;

    if (installationId && process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
        try {
            // Mint a fresh 1-hour installation token via GitHub App
            const appToken = await getInstallationAccessToken(installationId);
            return appToken;
        } catch (err: any) {
            console.warn("Could not mint GitHub App token, falling back to PAT:", err.message);
        }
    }

    // 2. Check for PAT token in configurable headers (passed from React UI)
    const userPat = (config?.configurable as any)?.["x-github-access-token"];
    if (userPat) {
        return userPat;
    }

    // 3. Fallback to server environment variable (local development)
    const envPat = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    if (envPat) {
        return envPat;
    }

    throw new Error(
        "No GitHub authentication found. Please provide a GitHub Token (PAT) or connect the GitHub App.",
    );
}