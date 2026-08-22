import type { WorkflowStage } from "../../types.ts";

export const WORKFLOW_TONE: Record<
  WorkflowStage,
  "error" | "pending" | "success"
> = {
  idle: "error",
  record: "error",
  cut: "error",
  finish: "error",
  publish: "pending",
  live: "success",
};
