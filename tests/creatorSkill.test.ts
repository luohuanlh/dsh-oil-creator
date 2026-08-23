import { describe, expect, it, vi } from "vitest";

import { CREATOR_WORKBENCH_SKILL, registerCreatorWorkbenchSkill } from "../src/creatorSkill.ts";

describe("creator-workbench skill", () => {
  it("注册两步页面工作流和草稿安全边界", () => {
    const dispose = vi.fn();
    const register = vi.fn(() => dispose);
    expect(registerCreatorWorkbenchSkill({ skills: { register } })).toBe(dispose);
    expect(register).toHaveBeenCalledWith(CREATOR_WORKBENCH_SKILL);
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("内容管理");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("oil_platform_accounts");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("oil_distribution_source");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("oil_create_platform_drafts");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("contentProfile");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("默认采用最小必要适配");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("正文可以复用");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("Harness AI");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("Ego Browser 只");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("概览只显示");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("各自只有两步");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("25 个平台");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("不得点击最终");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("apply=false");
    expect(CREATOR_WORKBENCH_SKILL.content).not.toContain("publish-package.json 保存已经确认");
  });
});
