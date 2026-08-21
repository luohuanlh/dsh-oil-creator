import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as plugin from "../src/index.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe("DSH Host 入口", () => {
  it("显式等待 rc.7 宿主服务，并在同一插件作用域注册所有能力", async () => {
    expect(plugin.inject).toEqual(["settings", "tools", "systemPrompt", "skills"]);

    const root = await mkdtemp(join(tmpdir(), "oil-host-entry-"));
    temporaryDirectories.push(root);
    const tools: unknown[] = [];
    const settingsRegister = vi.fn(() => () => {});
    const promptSection = vi.fn(() => () => {});
    const skillRegister = vi.fn(() => () => {});
    const ctx = new Context();

    ctx.provide("settings", { register: settingsRegister });
    ctx.provide("tools", { register: (tool: unknown) => {
      tools.push(tool);
      return () => {};
    } });
    ctx.provide("systemPrompt", { section: promptSection });
    ctx.provide("skills", { register: skillRegister });

    await ctx.plugin(plugin, { libraryRoot: root, dataDir: join(root, ".state") });

    expect(settingsRegister).toHaveBeenCalledOnce();
    expect(promptSection).toHaveBeenCalledOnce();
    expect(skillRegister).toHaveBeenCalledOnce();
    expect(tools).toHaveLength(8);
  });
});
