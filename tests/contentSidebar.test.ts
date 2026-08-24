import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKFLOW_TONE } from "../src/client/sidebar/workflowStatus.ts";

describe("content sidebar status", () => {
  it("以红、橙、绿圆点表示三个展示状态", () => {
    expect(WORKFLOW_TONE).toEqual({
      idle: "error",
      record: "error",
      cut: "error",
      finish: "error",
      publish: "pending",
      live: "success",
    });

    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/sidebar/ContentSidebarPanel.tsx"),
      "utf8",
    );
    expect(implementation).toContain("<WorkflowStatusDot");
    expect(implementation).not.toContain("<StatusPill tone={WORKFLOW_TONE[item.workflow]}");
  });

  it("内容条目提供带确认弹窗的可恢复删除入口", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/sidebar/ContentSidebarPanel.tsx"),
      "utf8",
    );

    expect(implementation).toContain("rowDeleteButton");
    expect(implementation).toContain("deleteContent(deletedId)");
    expect(implementation).toContain('t("delete.confirm")');
    expect(implementation).toContain('t("delete.trashHint")');
  });
});
