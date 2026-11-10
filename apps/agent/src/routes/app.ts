import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
    GITHUB_TOKEN_COOKIE,
    GITHUB_TOKEN_TYPE_COOKIE,
    GITHUB_INSTALLATION_ID_COOKIE,
    GITHUB_AUTH_STATE_COOKIE,
} from "@agentic/shared";
import {
    verifyRepositoryAccess,
    verifyGithubUser,
    getInstallationAccessToken,
} from "../utils/github/app-auth.js";

export const app = new Hono();

const isProduction = process.env.NODE_ENV === "production";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

// Configure CORS for the React frontend.
app.use(
    "*",
    cors({
        origin: ["http://localhost:5173", "http://localhost:3000"],
        credentials: true,
    }),
);

const sessionCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
};

const clientCookieOptions = {
    httpOnly: false,
    secure: isProduction,
    sameSite: "Lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
};

// Initiate GitHub OAuth login.
app.get("/api/auth/github/login", (c) => {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const redirectUri =
        process.env.GITHUB_APP_REDIRECT_URI ||
        "http://localhost:2024/api/auth/github/callback";

    if (!clientId) {
        return c.json({ error: "GITHUB_APP_CLIENT_ID missing in .env" }, 500);
    }

    const state = crypto.randomUUID();

    // Store OAuth state to prevent CSRF attacks.
    setCookie(c, GITHUB_AUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "Lax",
        maxAge: 60 * 10,
        path: "/",
    });

    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    return c.redirect(authUrl.toString());
});

// Handle GitHub OAuth callback and exchange the authorization code.
app.get("/api/auth/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const installationId = c.req.query("installation_id");

    if (error) {
        return c.redirect(`${frontendUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return c.redirect(`${frontendUrl}?error=missing_code_parameter`);
    }

    // Verify the OAuth state to prevent CSRF attacks.
    const storedState = getCookie(c, GITHUB_AUTH_STATE_COOKIE);

    if (!storedState || state !== storedState) {
        return c.redirect(`${frontendUrl}?error=invalid_state`);
    }

    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    const redirectUri =
        process.env.GITHUB_APP_REDIRECT_URI ||
        "http://localhost:2024/api/auth/github/callback";

    const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            }),
        },
    );

    const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        token_type?: string;
        error?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
        return c.redirect(
            `${frontendUrl}?error=${encodeURIComponent(
                tokenData.error || "token_exchange_failed",
            )}`,
        );
    }

    deleteCookie(c, GITHUB_AUTH_STATE_COOKIE, { path: "/" });

    setCookie(c, GITHUB_TOKEN_COOKIE, tokenData.access_token, sessionCookieOptions);
    setCookie(
        c,
        GITHUB_TOKEN_TYPE_COOKIE,
        tokenData.token_type || "bearer",
        sessionCookieOptions,
    );

    if (installationId) {
        setCookie(c, GITHUB_INSTALLATION_ID_COOKIE, installationId, clientCookieOptions);
    }

    return c.redirect(`${frontendUrl}/`);
});

// Handle GitHub App installation callback.
app.get("/api/github/installation-callback", (c) => {
    const installationId = c.req.query("installation_id");

    if (installationId) {
        setCookie(c, GITHUB_INSTALLATION_ID_COOKIE, installationId, clientCookieOptions);
    }

    return c.redirect(`${frontendUrl}/`);
});

// Return the authenticated GitHub user profile.
app.get("/api/auth/user", async (c) => {
    const accessToken = getCookie(c, GITHUB_TOKEN_COOKIE);

    if (!accessToken) {
        return c.json({ error: "Not authenticated" }, 401);
    }

    const user = await verifyGithubUser(accessToken);

    if (!user) {
        return c.json({ error: "Invalid GitHub token" }, 401);
    }

    const activeInstallationId = getCookie(c, GITHUB_INSTALLATION_ID_COOKIE);

    return c.json({
        user: {
            login: user.login,
            avatar_url: user.avatar_url,
            name: user.name,
            email: user.email,
        },
        activeInstallationId: activeInstallationId || null,
    });
});

// Return all GitHub App installations for the authenticated user.
app.get("/api/github/installations", async (c) => {
    const accessToken = getCookie(c, GITHUB_TOKEN_COOKIE);
    const tokenType = getCookie(c, GITHUB_TOKEN_TYPE_COOKIE) || "Bearer";

    if (!accessToken) {
        return c.json({ error: "GitHub access token not found" }, 401);
    }

    const response = await fetch("https://api.github.com/user/installations", {
        headers: {
            Authorization: `${tokenType} ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Agentic-SWE-Agent",
        },
    });

    if (!response.ok) {
        return c.json(
            { error: "Failed to fetch installations from GitHub" },
            response.status as any,
        );
    }

    const data = (await response.json()) as { installations: any[] };

    const installations = data.installations.map((inst) => ({
        id: inst.id,
        accountName: inst.account?.login || inst.account?.name || "Unknown",
        accountType: inst.target_type,
        avatarUrl: inst.account?.avatar_url,
    }));

    return c.json({ installations });
});

// Return GitHub App metadata and direct install link.
app.get("/api/github/app-info", (c) => {
    return c.json({
        appSlug: "software-developer-agent",
        installUrl: "https://github.com/apps/software-developer-agent/installations/new",
    });
});

// Return all repositories accessible for a specific installation.
app.get("/api/github/installations/:id/repos", async (c) => {
    const accessToken = getCookie(c, GITHUB_TOKEN_COOKIE);
    const tokenType = getCookie(c, GITHUB_TOKEN_TYPE_COOKIE) || "Bearer";
    const installationId = c.req.param("id");

    try {
        let repositories: any[] = [];

        // 1. Try with user's OAuth access token first
        if (accessToken) {
            const response = await fetch(
                `https://api.github.com/user/installations/${installationId}/repositories?per_page=100`,
                {
                    headers: {
                        Authorization: `${tokenType} ${accessToken}`,
                        Accept: "application/vnd.github.v3+json",
                        "User-Agent": "Agentic-SWE-Agent",
                    },
                },
            );

            if (response.ok) {
                const data = (await response.json()) as { repositories?: any[] };
                repositories = data.repositories || [];
            }
        }

        // 2. Fallback: Query directly with GitHub App installation access token
        if (repositories.length === 0 && installationId) {
            try {
                const appToken = await getInstallationAccessToken(installationId);
                const response = await fetch(
                    `https://api.github.com/installation/repositories?per_page=100`,
                    {
                        headers: {
                            Authorization: `Bearer ${appToken}`,
                            Accept: "application/vnd.github.v3+json",
                            "User-Agent": "Agentic-SWE-Agent",
                        },
                    },
                );
                if (response.ok) {
                    const data = (await response.json()) as { repositories?: any[] };
                    repositories = data.repositories || [];
                }
            } catch (err: any) {
                console.warn("Fallback to installation token failed:", err.message);
            }
        }

        const formatted = repositories.map((r: any) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            owner: r.owner?.login || "",
            defaultBranch: r.default_branch || "main",
            private: !!r.private,
        }));

        return c.json({ repositories: formatted });
    } catch (err: any) {
        return c.json({ error: err.message || "Failed to fetch repositories" }, 500);
    }
});

// Switch the active GitHub App installation.
app.post("/api/github/switch-installation", async (c) => {
    const body = await c.req.json();
    const { installationId } = body;

    if (!installationId) {
        return c.json({ error: "Installation ID is required" }, 400);
    }

    setCookie(
        c,
        GITHUB_INSTALLATION_ID_COOKIE,
        String(installationId),
        clientCookieOptions,
    );

    return c.json({ success: true, installationId });
});

// Handle installation access token generation for Git and Daytona.

// Log out the user and clear authentication cookies.
app.post("/api/auth/logout", (c) => {
    deleteCookie(c, GITHUB_TOKEN_COOKIE, { path: "/" });
    deleteCookie(c, GITHUB_TOKEN_TYPE_COOKIE, { path: "/" });
    deleteCookie(c, GITHUB_INSTALLATION_ID_COOKIE, { path: "/" });

    return c.json({ success: true });
});

// Verify repository access for a GitHub App installation.
app.get("/api/github/check-repo", async (c) => {
    const owner = c.req.query("owner");
    const repo = c.req.query("repo");
    const installationId =
        c.req.query("installation_id") ||
        getCookie(c, GITHUB_INSTALLATION_ID_COOKIE);

    if (!owner || !repo || !installationId) {
        return c.json(
            { error: "Missing owner, repo, or installation_id" },
            400,
        );
    }

    const hasAccess = await verifyRepositoryAccess(installationId, owner, repo);

    return c.json({ hasAccess });
});

// Check backend health.
app.get("/api/health", (c) => {
    return c.json({ status: "healthy", timestamp: Date.now() });
});
