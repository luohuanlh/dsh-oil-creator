import { describe, expect, it } from "vitest";

import { PUBLISH_PLATFORMS } from "../src/platforms.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import { contentSummarySchema } from "../src/schemas.ts";

describe("内容远程契约", () => {
  it("兼容旧 Host 缺少后来新增的平台状态", () => {
    const legacyPublish = { ...emptyPublish() } as Partial<ReturnType<typeof emptyPublish>>;
    delete legacyPublish["xiaohongshu-note"];

    const parsed = contentSummarySchema.safeParse({
      id: "legacy-host",
      folderPath: "/tmp/legacy-host",
      title: "旧 Host 内容",
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
      workflow: "idle",
      publish: legacyPublish,
      burn: emptyBurn(),
      subtitleJob: emptyBurn(),
      coverJob: emptyBurn(),
    });

    expect(PUBLISH_PLATFORMS).toContain("xiaohongshu-note");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.publish["xiaohongshu-note"]).toEqual({
        status: "unpublished",
        source: "none",
      });
    }
  });
});
