import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("sidebar brand", () => {
  it("恢复 DeepSeek 完整字标与收起态鱼形图标", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/sidebar/OilBrand.tsx"),
      "utf8",
    );

    expect(implementation).toContain("BrandWordmark");
    expect(implementation).toContain("FishLogo");
    expect(implementation).not.toContain("Oil Creator");
    expect(implementation).not.toContain("OIL_ICON_SRC");
  });
});
