import { describe, expect, it } from "vitest";

import { formatContentRef } from "../src/contentRef.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import type { ContentDetail } from "../src/types.ts";

function detail(patch: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: "2026-08-13_demo",
    folderPath: "/tmp/demo",
    title: "Demo",
    recordedAt: 1,
    createdMs: 1,
    covers: {},
    subtitles: {},
    assets: { videos: [], subtitles: [], articles: [], covers: [] },
    hasPublishPackage: false,
    hasDistributionPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: [],
    pipeline: "raw",
    workflow: "publish",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
    publishCopy: "",
    topicNote: "",
    script: "",
    article: "",
    ...patch,
  };
}

describe("formatContentRef", () => {
  it("把内容文件夹明确标记为目录，避免下游按文件读取", () => {
    const reference = formatContentRef(detail({
      folderPath: "/Users/example/Movies/视频项目/2026-08-10_示例标题",
      topicNote: "不该出现",
      script: "不该出现",
      tags: ["AI工具"],
      article: "# 不该出现",
    }));

    expect(reference).toContain("内容文件夹（目录）");
    expect(reference).toContain("/Users/example/Movies/视频项目/2026-08-10_示例标题");
    expect(reference).toContain("不要把目录当作文件读取");
    expect(reference).not.toContain("不该出现");
  });
});
