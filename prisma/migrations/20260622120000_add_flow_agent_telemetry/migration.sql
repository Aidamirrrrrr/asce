CREATE TABLE "FlowAgentRun" (
    "id"             TEXT NOT NULL,
    "projectId"      TEXT,
    "mode"           TEXT NOT NULL,
    "instruction"    TEXT NOT NULL,
    "exitReason"     TEXT NOT NULL,
    "totalSteps"     INTEGER NOT NULL,
    "nodeCountStart" INTEGER NOT NULL,
    "nodeCountEnd"   INTEGER NOT NULL,
    "durationMs"     INTEGER NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowAgentStep" (
    "id"          TEXT NOT NULL,
    "runId"       TEXT NOT NULL,
    "stepIndex"   INTEGER NOT NULL,
    "toolName"    TEXT NOT NULL,
    "outcome"     TEXT NOT NULL,
    "errorText"   TEXT,
    "iterDurMs"   INTEGER NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowAgentStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlowAgentRun_createdAt_idx" ON "FlowAgentRun"("createdAt");
CREATE INDEX "FlowAgentRun_exitReason_createdAt_idx" ON "FlowAgentRun"("exitReason", "createdAt");
CREATE INDEX "FlowAgentRun_projectId_createdAt_idx" ON "FlowAgentRun"("projectId", "createdAt");
CREATE INDEX "FlowAgentStep_runId_idx" ON "FlowAgentStep"("runId");
CREATE INDEX "FlowAgentStep_toolName_outcome_idx" ON "FlowAgentStep"("toolName", "outcome");

ALTER TABLE "FlowAgentStep" ADD CONSTRAINT "FlowAgentStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "FlowAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
