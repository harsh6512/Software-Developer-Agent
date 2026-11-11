import { GraphConfig, ManagerGraphState, ManagerGraphUpdate } from "@agentic/shared";
import { createLogger } from "../../../utils/logger.js";
import { plannerGraph } from "../../planner/index.js";

const logger = createLogger("StartPlanner");

export async function startPlanner(
    state: ManagerGraphState,
    _config: GraphConfig,
): Promise<ManagerGraphUpdate> {
    logger.info("Starting Planner Graph from Web Request...");

    const plannerOutput = await plannerGraph.invoke(
        {
            messages: state.messages,
            internalMessages: state.messages,
            targetRepository: state.targetRepository,
            branchName: state.branchName,
            taskPlan: state.taskPlan,
            autoAcceptPlan: state.autoAcceptPlan,
        },
        {
            ..._config,
            recursionLimit: 200,
        },
    );

    return {
        messages: plannerOutput.messages,
        taskPlan: plannerOutput.taskPlan,
        branchName: plannerOutput.branchName,
    };
}
