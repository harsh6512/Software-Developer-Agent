import { Client } from "@langchain/langgraph-sdk";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:2024";

/**
 * Read a cookie value by name from document.cookie.
 */
export function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Creates a configured LangGraph SDK Client.
 * All credentials (OAuth tokens, session cookies) are stored in HTTP cookies.
 * The active GitHub installation ID is retrieved from the cookie or passed explicitly.
 */
export function createLangGraphClient(installationId?: string | number): Client {
    const activeInstallationId = installationId || getCookie("github_installation_id");

    const headers: Record<string, string> = {};
    if (activeInstallationId) {
        headers["x-github-installation-id"] = String(activeInstallationId);
    }

    return new Client({
        apiUrl: API_URL,
        defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    });
}
