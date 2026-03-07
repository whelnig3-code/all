import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// Base logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
});

/**
 * Create a child logger scoped to a specific module.
 * Analogy: Like giving each department in an office its own labeled desk --
 * all logs from that module carry the module name automatically.
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}

/**
 * Create a child logger scoped to a specific module AND agent.
 * Analogy: Like giving each employee (agent) within a department (module)
 * their own named inbox -- logs carry both module and agentId context.
 */
export function createAgentLogger(module: string, agentId: string) {
  return logger.child({ module, agentId });
}
