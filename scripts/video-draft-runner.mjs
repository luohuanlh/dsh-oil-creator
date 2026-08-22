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

function parseJsonOutput(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  return undefined;
}

function publisherPlatformError(platformInput, platformState, fallback) {
  if (platformState?.blocker) {
    return JSON.stringify({
      blocker: platformState.blocker,
      missing: platformState.missing || [],
      evidencePath: platformState.evidencePath || null,
    }, null, 2);
  }
  return fallback || `${platformInput.platform} 未返回 READY 结果`;
}

try {
  const input = JSON.parse(process.env.OIL_VIDEO_DRAFT_RUN || "null");
  if (!input || !input.publisherRunner || !input.packagePath
    || !Array.isArray(input.runnerPlatforms) || input.runnerPlatforms.length === 0) {
    throw new Error("video draft runner input is missing");
  }
  const legacyOutput = !Array.isArray(input.platforms);
  const platformInputs = legacyOutput
    ? [{
        platform: input.platform,
        runnerPlatform: input.runnerPlatforms[0],
        expectedTitle: input.expectedTitle,
        expectedCaption: input.expectedCaption,
        expectedFileName: input.expectedFileName,
      }]
    : input.platforms;
  if (!platformInputs.length || platformInputs.some(item => !item?.platform || !item?.runnerPlatform)) {
    throw new Error("video draft runner platform inputs are missing");
  }
  const publisherArgs = [
    input.publisherRunner,
    input.packagePath,
    input.suffix,
    ...input.runnerPlatforms,
    ...(input.confirmOriginalRights === true ? ["--confirm-original-rights"] : []),
  ];
  const publisher = await run("bash", publisherArgs, { cwd: input.publisherCwd });
  const detail = `${publisher.stdout}\n${publisher.stderr}`.trim();
  const summary = parseJsonOutput(publisher.stdout);
  if (!summary?.platforms) {
    output({ ok: false, error: detail || `video-publisher exited ${publisher.code}` });
    process.exitCode = publisher.code || 1;
  } else {
    const results = {};
    const userControlled = platformInputs.find((platformInput) => {
      const state = summary.platforms?.[platformInput.runnerPlatform];
      return state?.blocker?.code === "USER_CONTROL" || state?.blocker?.requiresUser === true;
    });
    if (userControlled) {
      const controlledState = summary.platforms[userControlled.runnerPlatform];
      for (const platformInput of platformInputs) {
        const state = summary.platforms[platformInput.runnerPlatform];
        results[platformInput.platform] = {
          ok: false,
          error: platformInput === userControlled
            ? publisherPlatformError(platformInput, state, detail)
            : JSON.stringify({
                blocker: {
                  code: "USER_CONTROL",
                  message: `发布作业因${userControlled.platform}任务空间由用户接管而暂停`,
                  retryable: false,
                  requiresUser: true,
                  evidence: { controlledPlatform: userControlled.platform },
                },
                evidencePath: controlledState?.evidencePath || null,
              }, null, 2),
        };
      }
    } else {
      const source = await readFile(input.saverScript, "utf8");
      for (const platformInput of platformInputs) {
        const state = summary.platforms[platformInput.runnerPlatform];
        const taskSpace = state?.taskSpaceId;
        const platformReady = state?.ready === true || (legacyOutput && summary.ready === true);
        if (!platformReady || !Number.isInteger(taskSpace)) {
          results[platformInput.platform] = {
            ok: false,
            error: publisherPlatformError(platformInput, state, detail),
          };
          continue;
        }
        const savesRemoteDraft = platformInput.platform === "bilibili"
          || platformInput.platform === "douyin"
          || platformInput.platform === "kuaishou";
        if (!savesRemoteDraft) {
          results[platformInput.platform] = {
            ok: true,
            staged: true,
            taskSpace: String(taskSpace),
          };
          continue;
        }
        const prelude = `var OIL_VIDEO_DRAFT_INPUT = ${JSON.stringify({
          platform: platformInput.platform,
          taskSpace: String(taskSpace),
          expectedTitle: platformInput.expectedTitle,
          expectedCaption: platformInput.expectedCaption,
          expectedFileName: platformInput.expectedFileName,
        })};\n`;
        const saver = await run("ego-browser", ["nodejs"], { stdin: `${prelude}${source}` });
        if (saver.stderr) process.stderr.write(saver.stderr);
        const saved = parseJsonOutput(saver.stdout);
        if (saver.code === 0 && saved?.ok === true
          && typeof saved.remoteId === "string"
          && typeof saved.draftUrl === "string"
          && typeof saved.taskSpace === "string") {
          results[platformInput.platform] = {
            ok: true,
            platform: platformInput.platform,
            verified: true,
            url: saved.draftUrl,
            remoteId: saved.remoteId,
            taskSpace: saved.taskSpace,
          };
        } else {
          results[platformInput.platform] = {
            ok: false,
            error: `${saver.stdout}\n${saver.stderr}`.trim() || `${platformInput.platform} 远端草稿保存失败`,
          };
        }
      }
    }
    output(legacyOutput ? results[platformInputs[0].platform] : { ok: true, results });
  }
} catch (error) {
  output({ ok: false, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
