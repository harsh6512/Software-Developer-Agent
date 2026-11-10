import jsonwebtoken from "jsonwebtoken";
import { Octokit } from "@octokit/rest";

function convertEscapedNewlines(str: string): string {
    return str.replace(/\\n/g, "\n");
}

/**
 * 1. Generates a signed JWT using your GitHub App ID & Private Key.
 * Valid for 9 minutes (max allowed by GitHub is 10 min).
 */
export function generateAppJWT(): string {
    const appId = process.env.GITHUB_APP_ID;
    const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !rawKey) {
        throw new Error("GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY missing in .env");
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iat: now - 30, // 30s buffer for clock drift
        exp: now + (9 * 60),
        iss: appId,
    };

    return jsonwebtoken.sign(payload, convertEscapedNewlines(rawKey), {
        algorithm: "RS256",
    });
}

/**
 * 2. Mints an ephemeral installation access token (valid for 1 hour)
 * for a specific user's installation_id.
 */
export async function getInstallationAccessToken(installationId: string | number): Promise<string> {
    const jwt = generateAppJWT();

    const response = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "Agentic-SWE-Agent",
            },
        },
    );

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to generate installation token: ${JSON.stringify(errorData)}`);
    }

    const data = (await response.json()) as { token: string };
    return data.token;
}

/**
 * 3. Verifies if an installation ID has access to a target repository.
 */
export async function verifyRepositoryAccess(
    installationId: string | number,
    owner: string,
    repo: string,
): Promise<boolean> {
    try {
        const token = await getInstallationAccessToken(installationId);
        const octokit = new Octokit({ auth: token });
        const { data } = await octokit.rest.repos.get({ owner, repo });
        return !!data;
    } catch {
        return false;
    }
}

/**
 * 4. Verifies a user's OAuth access token and returns their profile.
 */
export async function verifyGithubUser(accessToken: string) {
    if (!accessToken) return null;
    try {
        const octokit = new Octokit({ auth: accessToken });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return user;
    } catch {
        return null;
    }
}