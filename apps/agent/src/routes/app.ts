import { Hono } from "hono";
import { cors } from "hono/cors";
import { getInstallationAccessToken, verifyRepositoryAccess } from "../utils/github/app-auth.js";

export const app = new Hono();

// Enable CORS for your React + Vite frontend (typically localhost:5173 in dev)
app.use(
    "*",
    cors({
        origin: ["http://localhost:5173", "http://localhost:3000"],
        credentials: true,
    }),
);

/**
 * Route 1: GitHub App Installation Callback
 * GitHub redirects user here after they install the App on their repo:
 * GET /api/github/installation-callback?installation_id=123456&setup_action=install
 */
app.get("/api/github/installation-callback", (c) => {
    const installationId = c.req.query("installation_id");
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    if (!installationId) {
        return c.redirect(`${frontendUrl}?error=missing_installation_id`);
    }

    // Redirect user back to React frontend with installation_id in URL query
    return c.redirect(`${frontendUrl}/auth/callback?installation_id=${installationId}`);
});

/**
 * Route 2: Validate Repository Access
 * React frontend calls this to check if user has installed the App on a specific repo:
 * GET /api/github/check-repo?owner=octocat&repo=Hello-World&installation_id=123456
 */
app.get("/api/github/check-repo", async (c) => {
    const owner = c.req.query("owner");
    const repo = c.req.query("repo");
    const installationId = c.req.query("installation_id");

    if (!owner || !repo || !installationId) {
        return c.json({ error: "Missing required parameters (owner, repo, installation_id)" }, 400);
    }

    const hasAccess = await verifyRepositoryAccess(installationId, owner, repo);
    return c.json({ hasAccess });
});

/**
 * Route 3: Test Health endpoint
 */
app.get("/api/health", (c) => {
    return c.json({ status: "healthy", timestamp: Date.now() });
});