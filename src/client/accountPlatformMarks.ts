import type { PublishPlatform } from "../types.ts";
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

/**
 * 账号列表中的紧凑平台标识。
 *
 * B站、抖音、小红书和视频号复用已有矢量图；其余可见平台使用从官网核对并
 * 本地内嵌的品牌资源。`glyph` 仅作为图片不可用时的语义回退。
 */
export const ACCOUNT_PLATFORM_MARKS: Record<PublishPlatform, AccountPlatformMarkDefinition> = {
  bilibili: { color: "#00AEEC", glyph: "B", icon: "bilibili" },
  douyin: { color: "#111111", glyph: "抖", icon: "douyin" },
  xiaohongshu: { color: "#FF2442", glyph: "红", icon: "xhs" },
  channels: { color: "#FA9D3B", glyph: "视", icon: "wechat" },
  kuaishou: officialPlatformMark("kuaishou", "#FF4906", "快"),
  toutiao: officialPlatformMark("toutiao", "#F04142", "头"),
  baijiahao: officialPlatformMark("baijiahao", "#2B6BFF", "百"),
  penguin: officialPlatformMark("penguin", "#147AFF", "企"),
  netease: officialPlatformMark("netease", "#E60012", "易"),
  yidian: officialPlatformMark("yidian", "#FF6A00", "一"),
  dayu: officialPlatformMark("dayu", "#FF8A00", "鱼"),
  dingduan: officialPlatformMark("dingduan", "#D62828", "顶"),
  xueqiu: officialPlatformMark("xueqiu", "#1677FF", "雪"),
  eastmoney: officialPlatformMark("eastmoney", "#F05A19", "东"),
  "10jqka": officialPlatformMark("10jqka", "#EF3340", "同"),
  sohu: officialPlatformMark("sohu", "#FFD500", "狐"),
  weibo: officialPlatformMark("weibo", "#E6162D", "微"),
  zhihu: officialPlatformMark("zhihu", "#1772F6", "知"),
  ofweek: officialPlatformMark("ofweek", "#E60012", "维"),
  laohu: officialPlatformMark("laohu", "#FFD400", "虎"),
  futu: officialPlatformMark("futu", "#FF7A00", "富"),
  "wechat-mp": officialPlatformMark("wechat-mp", "#07C160", "微"),
  "netease-music": { color: "#E60026", glyph: "云" },
  ximalaya: { color: "#F86442", glyph: "喜" },
};
