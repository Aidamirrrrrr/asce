const PREFIX = "[flow-agent]";

export function isFlowAgentLogEnabled(): boolean {
  return (
    process.env.FLOW_AGENT_DEBUG === "1" ||
    (process.env.FLOW_AGENT_DEBUG !== "0" && process.env.NODE_ENV === "development")
  );
}

export function flowAgentLog(message: string, data?: Record<string, unknown>): void {
  if (!isFlowAgentLogEnabled()) {
    return;
  }

  if (data) {
    console.log(PREFIX, message, data);
  } else {
    console.log(PREFIX, message);
  }
}

export function flowAgentWarn(message: string, data?: Record<string, unknown>): void {
  if (!isFlowAgentLogEnabled()) {
    return;
  }

  if (data) {
    console.warn(PREFIX, message, data);
  } else {
    console.warn(PREFIX, message);
  }
}
