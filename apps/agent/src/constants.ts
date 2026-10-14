import { DAYTONA_IMAGE_NAME, DAYTONA_SNAPSHOT_NAME } from "@agentic/shared";
import { CreateSandboxFromSnapshotParams } from "@daytonaio/sdk";

// Default parameters: Snapshot (fast boot)
export const DEFAULT_SANDBOX_CREATE_PARAMS: CreateSandboxFromSnapshotParams = {
    user: "daytona",
    snapshot: DAYTONA_SNAPSHOT_NAME,
    autoDeleteInterval: 30,
};

// Fallback parameters: Clean Docker Image
export const DEFAULT_SANDBOX_IMAGE_PARAMS = {
    language: "typescript",
    image: DAYTONA_IMAGE_NAME, // <-- USE the imported constant here!
    user: "daytona",
    autoDeleteInterval: 30,
};
