import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ARTICLE_DRAFT_SOURCE_FILES } from "./article/manifest.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const articleDir = join(scriptsDir, "article");
const outputPath = join(scriptsDir, "article-draft.mjs");
const sources = await Promise.all(ARTICLE_DRAFT_SOURCE_FILES.map((path) =>
  readFile(join(articleDir, path), "utf8")
));
const bundle = sources.map((source) => source.trim()).join("\n\n") + "\n";
const current = await readFile(outputPath, "utf8").catch(() => "");
if (current !== bundle) await writeFile(outputPath, bundle);
