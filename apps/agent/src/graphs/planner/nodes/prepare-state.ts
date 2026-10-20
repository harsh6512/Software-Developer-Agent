import { GraphState, GraphUpdate } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";

const logger = createLogger("PreparePlannerState");

export async function prepareState(state: GraphState): Promise<GraphUpdate> {
    logger.info("Preparing initial state for planner");

    const updates: GraphUpdate = {};

    // If no working branch name exists, generate a clean one
    if (!state.branchName) {
        const timestamp = Date.now();
        const cleanRepo = state.targetRepository.repo.replace(/[^a-zA-Z0-9_-]/g, "");
        updates.branchName = `agentic/${cleanRepo}-${timestamp}`;
        logger.info(`Generated working branch: ${updates.branchName}`);
    }

    return updates;
}
