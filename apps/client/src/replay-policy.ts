// Validation workload limits, not combat balance or game rules.
export const replayPolicy = {
  maxBytes: 10 * 1024 * 1024,
  maxFrames: 15000,
  maxCommandsPerFrame: 64,
  maxCommands: 20000,
  maxDefinitions: 32,
  timeoutMs: 30000,
} as const;
