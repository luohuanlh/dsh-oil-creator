import type { PublishPlatform } from "../types.ts";
import {
  CREBEE_PLATFORM_ICONS,
  type CreBeePlatformIconId,
} from "./assets/platforms/crebeePlatformIcons.ts";
import {
  OFFICIAL_PLATFORM_ICONS,
  type OfficialPlatformIconId,
} from "./assets/platforms/officialPlatformIcons.ts";
import type { PlatformId } from "./PlatformMark.tsx";

export interface AccountPlatformMarkDefinition {
  color: string;
  glyph: string;
  icon?: PlatformId;
  src?: string;
}

function officialPlatformMark(
  id: OfficialPlatformIconId,
  color: string,
  glyph: string,
): AccountPlatformMarkDefinition {
  return { color, glyph, src: OFFICIAL_PLATFORM_ICONS[id] };
}

function crebeePlatformMark(
  id: CreBeePlatformIconId,
  color: string,
  glyph: string,
): AccountPlatformMarkDefinition {
  return { color, glyph, src: CREBEE_PLATFORM_ICONS[id] };
}

/**
 * 账号列表中的紧凑平台标识。
 *
 * CreBee 首页已有的同名平台统一使用其 SVG 图标快照；未覆盖的平台继续使用
 * 从各平台官网核对并本地内嵌的品牌资源。`glyph` 仅作为图片不可用时的语义回退。
 */
export const ACCOUNT_PLATFORM_MARKS: Record<PublishPlatform, AccountPlatformMarkDefinition> = {
  bilibili: crebeePlatformMark("bilibili", "#F16C8D", "B"),
  douyin: crebeePlatformMark("douyin", "#170B1A", "抖"),
  xiaohongshu: crebeePlatformMark("xiaohongshu", "#FF2442", "红"),
  "xiaohongshu-note": crebeePlatformMark("xiaohongshu", "#FF2442", "红"),
  channels: crebeePlatformMark("channels", "#FA9D3B", "视"),
  kuaishou: crebeePlatformMark("kuaishou", "#FF4A08", "快"),
  toutiao: crebeePlatformMark("toutiao", "#E62318", "头"),
  baijiahao: crebeePlatformMark("baijiahao", "#2932E1", "百"),
  penguin: crebeePlatformMark("penguin", "#ECC23A", "企"),
  netease: crebeePlatformMark("netease", "#F30B40", "易"),
  yidian: officialPlatformMark("yidian", "#FF6A00", "一"),
  dayu: crebeePlatformMark("dayu", "#FF9103", "鱼"),
  dingduan: officialPlatformMark("dingduan", "#D62828", "顶"),
  xueqiu: officialPlatformMark("xueqiu", "#1677FF", "雪"),
  eastmoney: officialPlatformMark("eastmoney", "#F05A19", "东"),
  "10jqka": officialPlatformMark("10jqka", "#EF3340", "同"),
  sohu: crebeePlatformMark("sohu", "#FDD000", "狐"),
  weibo: crebeePlatformMark("weibo", "#F44336", "微"),
  zhihu: crebeePlatformMark("zhihu", "#0066FF", "知"),
  ofweek: officialPlatformMark("ofweek", "#E60012", "维"),
  laohu: officialPlatformMark("laohu", "#FFD400", "虎"),
  futu: officialPlatformMark("futu", "#FF7A00", "富"),
  "wechat-mp": crebeePlatformMark("wechat-mp", "#01CC7A", "微"),
  "netease-music": { color: "#E60026", glyph: "云" },
  ximalaya: { color: "#F86442", glyph: "喜" },
};
