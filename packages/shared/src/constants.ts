export const TIMEOUT_SEC = 60; // 1-minute command timeout
export const SANDBOX_ROOT_DIR = "/home/daytona";

// Daytona image & snapshot identifiers
export const DAYTONA_IMAGE_NAME = "daytonaio/langchain-open-swe:0.1.0";
export const DAYTONA_SNAPSHOT_NAME = "open-swe-vcpu2-mem4-disk5";

// Delimiter used when the Planner pauses for human approval
export const PLAN_INTERRUPT_DELIMITER = ":::";
export const PLAN_INTERRUPT_ACTION_TITLE = "Approve/Edit Plan";

// Cookie & Header Constants (Exact match with reference repo)
export const GITHUB_TOKEN_COOKIE = "x-github-access-token";
export const GITHUB_INSTALLATION_TOKEN_COOKIE = "x-github-installation-token";
export const GITHUB_INSTALLATION_NAME = "x-github-installation-name";
export const GITHUB_PAT = "x-github-pat";
export const GITHUB_INSTALLATION_ID = "x-github-installation-id";
export const GITHUB_AUTH_STATE_COOKIE = "github_auth_state";
export const GITHUB_INSTALLATION_ID_COOKIE = "github_installation_id";
export const GITHUB_TOKEN_TYPE_COOKIE = "github_token_type";

// Graph IDs
export const MANAGER_GRAPH_ID = "manager";
export const PLANNER_GRAPH_ID = "planner";
export const PROGRAMMER_GRAPH_ID = "programmer";
export const REVIEWER_GRAPH_ID = "reviewer";
