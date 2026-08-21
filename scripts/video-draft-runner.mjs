#!/usr/bin/env node
// 让一个稳定父进程覆盖 video-publisher 与远端存草稿两阶段，避免中间 PID 退出被误判为中断。
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stdin?.on("error", () => undefined);
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    child.once("error", (error) => resolve({ code: 1, stdout, stderr, error }));
    child.once("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

try {
  const input = JSON.parse(process.env.OIL_VIDEO_DRAFT_RUN || "null");
  if (!input || !input.publisherRunner || !input.packagePath
    || !Array.isArray(input.runnerPlatforms) || input.runnerPlatforms.length === 0) {
    throw new Error("video draft runner input is missing");
  }
  const publisherArgs = [
    input.publisherRunner,
    input.packagePath,
    input.suffix,
    ...input.runnerPlatforms,
    ...(input.confirmOriginalRights === true ? ["--confirm-original-rights"] : []),
  ];
  const publisher = await run("bash", publisherArgs, { cwd: input.publisherCwd });
  if (publisher.code !== 0) {
    const detail = `${publisher.stdout}\n${publisher.stderr}`.trim();
    output({ ok: false, error: detail || `video-publisher exited ${publisher.code}` });
    process.exitCode = publisher.code;
  } else {
    const summary = JSON.parse(publisher.stdout.trim());
    const runnerPlatform = input.runnerPlatforms[0];
    const taskSpace = summary?.platforms?.[runnerPlatform]?.taskSpaceId;
    const savesRemoteDraft = input.platform === "bilibili" || input.platform === "douyin";
    if (!savesRemoteDraft) {
      if (summary?.ready !== true || !Number.isInteger(taskSpace)) {
        throw new Error("video-publisher 未返回页面 READY 任务空间");
      }
      output({ ok: true, platform: input.platform, staged: true, taskSpace: String(taskSpace) });
    } else {
      if (summary?.ready !== true || !Number.isInteger(taskSpace)) {
        throw new Error(`${input.platform} 未返回 READY 任务空间`);
      }
      const source = await readFile(input.saverScript, "utf8");
      const prelude = `var OIL_VIDEO_DRAFT_INPUT = ${JSON.stringify({
        platform: input.platform,
        taskSpace: String(taskSpace),
        expectedTitle: input.expectedTitle,
      })};\n`;
      const saver = await run("ego-browser", ["nodejs"], { stdin: `${prelude}${source}` });
      process.stdout.write(saver.stdout);
      if (saver.stderr) process.stderr.write(saver.stderr);
      if (saver.code !== 0) process.exitCode = saver.code;
    }
  }
} catch (error) {
  output({ ok: false, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
