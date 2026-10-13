export function createLogger(moduleName: string) {
    return {
        info: (msg: string, meta?: Record<string, unknown>) => {
            console.log(`[INFO] [${moduleName}] ${msg}`, meta ? JSON.stringify(meta) : "");
        },
        warn: (msg: string, meta?: Record<string, unknown>) => {
            console.warn(`[WARN] [${moduleName}] ${msg}`, meta ? JSON.stringify(meta) : "");
        },
        error: (msg: string, meta?: Record<string, unknown>) => {
            console.error(`[ERROR] [${moduleName}] ${msg}`, meta ? JSON.stringify(meta) : "");
        },
    };
}
