export const TIMEOUT_SEC = 60; // 1-minute command timeout
export const SANDBOX_ROOT_DIR = "/home/daytona";

// Daytona image & snapshot identifiers
export const DAYTONA_IMAGE_NAME = "daytonaio/langchain-open-swe:0.1.0";
export const DAYTONA_SNAPSHOT_NAME = "open-swe-vcpu2-mem4-disk5";

// Delimiter used when the Planner pauses for human approval
export const PLAN_INTERRUPT_DELIMITER = ":::";
export const PLAN_INTERRUPT_ACTION_TITLE = "Approve/Edit Plan";

// Graph IDs
export const MANAGER_GRAPH_ID = "manager";
export const PLANNER_GRAPH_ID = "planner";
export const PROGRAMMER_GRAPH_ID = "programmer";
