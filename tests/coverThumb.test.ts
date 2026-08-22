import { describe, expect, it } from "vitest";

import { coverThumbRevision } from "../src/client/CoverThumb.tsx";

describe("coverThumbRevision", () => {
  it("普通封面变化时触发侧栏缩略图重载", () => {
    const before = coverThumbRevision({}, []);
    const after = coverThumbRevision({}, [{ name: "cover.jpg", path: "/content/cover.jpg" }]);

    expect(after).not.toBe(before);
    expect(after).toContain("/content/cover.jpg");
  });
});
