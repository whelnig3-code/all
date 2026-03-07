import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the logger module
describe("logger", () => {
  it("exports a default logger instance", async () => {
    const { logger } = await import("../logger");
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("createModuleLogger creates child logger with module name", async () => {
    const { createModuleLogger } = await import("../logger");
    const moduleLogger = createModuleLogger("agent-router");
    expect(moduleLogger).toBeDefined();
    expect(typeof moduleLogger.info).toBe("function");
    expect(typeof moduleLogger.error).toBe("function");
  });

  it("createAgentLogger creates child logger with module and agentId", async () => {
    const { createAgentLogger } = await import("../logger");
    const agentLogger = createAgentLogger("agent-manager", "developer");
    expect(agentLogger).toBeDefined();
    expect(typeof agentLogger.info).toBe("function");
  });
});
