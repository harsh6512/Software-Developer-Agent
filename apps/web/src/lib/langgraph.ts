import { Client } from "@langchain/langgraph-sdk";

const DEFAULT_SERVER_URL = "http://localhost:2024";

export function getStoredPat(): string {
    return localStorage.getItem("github_pat") || "";
}

export function setStoredPat(pat: string): void {
    localStorage.setItem("github_pat", pat);
}

export function getStoredApiUrl(): string {
    return localStorage.getItem("langgraph_api_url") || DEFAULT_SERVER_URL;
}

export function setStoredApiUrl(url: string): void {
    localStorage.setItem("langgraph_api_url", url);
}

export function createLangGraphClient(): Client {
    const pat = getStoredPat();
    const apiUrl = getStoredApiUrl();

    return new Client({
        apiUrl,
        defaultHeaders: pat ? { "x-github-pat": pat } : undefined,
    });
}
