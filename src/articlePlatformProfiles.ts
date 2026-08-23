export interface PlatformContentProfile {
  audience: string;
  objective: string;
  tone: string;
  titleApproach: string;
  summaryApproach: string;
  structure: readonly string[];
  formatting: string;
  tagApproach: string;
  safeguards: readonly string[];
}

function profile(value: PlatformContentProfile): PlatformContentProfile {
  return Object.freeze({
    ...value,
    structure: Object.freeze([...value.structure]),
    safeguards: Object.freeze([...value.safeguards]),
  });
}

/**
 * 图文平台的内容适配规则。这里描述写作决策，不包含页面选择器或发布动作；
 * 后者继续由 scripts/article/platforms 下的 Adapter 负责。
 */
export const ARTICLE_PLATFORM_CONTENT_PROFILES = Object.freeze({
  toutiao: profile({
    audience: "在信息流中快速浏览热点、科技和财经内容的泛读者",
    objective: "快速交代发生了什么、为何重要，并提供可独立理解的信息增量",
    tone: "直接、清楚、信息密度高",
    titleApproach: "用核心对象加变化或结论构成完整标题，不制造悬念",
    summaryApproach: "用一到两句概括事件、关键变化和读者价值",
    structure: ["结论或新闻点前置", "补充关键事实与背景", "说明影响、条件和边界"],
    formatting: "使用短段落和信息型小标题，避免关键词堆砌",
    tagApproach: "优先选择主题实体、所属行业和事件类型",
    safeguards: ["不要使用夸张或误导性标题", "明确区分已经发生的事实与预测"],
  }),
  baijiahao: profile({
    audience: "通过搜索和推荐获取实用信息的大众读者",
    objective: "让文章脱离原始上下文后仍能完整回答一个明确问题",
    tone: "通俗、完整、解释充分",
    titleApproach: "包含核心主题词和明确结论，避免空泛代词",
    summaryApproach: "概括问题、主要判断和文章覆盖范围",
    structure: ["说明问题和适用对象", "分点解释原因或步骤", "收束结论与注意事项"],
    formatting: "段落简短，小标题使用读者可搜索的自然表达",
    tagApproach: "选择主题词、应用场景和受众需求，不重复同义词",
    safeguards: ["不为搜索效果重复堆砌关键词", "不把经验性建议包装成确定结论"],
  }),
  penguin: profile({
    audience: "腾讯内容生态中的新闻和兴趣阅读用户",
    objective: "用编辑稿式结构提供清晰摘要、背景和影响",
    tone: "克制、客观、易读",
    titleApproach: "突出主体和最新进展，保持新闻标题的完整语义",
    summaryApproach: "交代核心事实、背景和直接影响",
    structure: ["导语概括主要信息", "按重要性展开事实", "补充背景与后续观察点"],
    formatting: "采用编辑稿式短段落，减少口号和自我指涉",
    tagApproach: "围绕人物、机构、行业和事件分类选择标签",
    safeguards: ["评论性判断要与事实分开", "没有来源的细节不要补写"],
  }),
  netease: profile({
    audience: "关注新闻背景、观点和讨论价值的门户读者",
    objective: "在事实基础上给出有上下文的解释和可讨论观点",
    tone: "鲜明但不过度煽动，兼顾事实和分析",
    titleApproach: "体现事件核心与分析角度，不使用对立式诱导",
    summaryApproach: "概括事实基础和文章提供的主要观察",
    structure: ["先交代事实与判断", "展开原因和上下文", "呈现不同影响或可能走向"],
    formatting: "保持自然段节奏，观点转折处使用描述性小标题",
    tagApproach: "选择事件、行业和核心议题标签",
    safeguards: ["不要为制造讨论而放大冲突", "推断必须标明条件和不确定性"],
  }),
  yidian: profile({
    audience: "按兴趣主题订阅和浏览内容的读者",
    objective: "围绕一个清晰兴趣点持续提供相关、可理解的信息",
    tone: "聚焦、亲和、少绕弯",
    titleApproach: "直接点明主题、对象和内容收益",
    summaryApproach: "说明本文解决什么问题以及适合谁阅读",
    structure: ["从具体兴趣点切入", "给出核心信息或方法", "补充适用条件与延伸方向"],
    formatting: "使用短段落和主题明确的小标题，避免跨主题发散",
    tagApproach: "选择兴趣领域、具体对象和使用场景",
    safeguards: ["不根据兴趣标签虚构用户画像", "不扩写原文未覆盖的专业结论"],
  }),
  dayu: profile({
    audience: "通过综合内容平台获取趋势解读和实用知识的读者",
    objective: "把原文转成有明确因果和实际价值的完整解读",
    tone: "务实、顺畅、有解释性",
    titleApproach: "表达主题、关键变化和实际影响",
    summaryApproach: "概括核心结论及其对读者的意义",
    structure: ["提出变化或问题", "解释成因和关键机制", "给出影响、应用或注意点"],
    formatting: "用小标题组织因果链，避免大段背景铺陈",
    tagApproach: "选择行业、趋势和应用方向标签",
    safeguards: ["不把相关性写成因果关系", "不补写原文没有依据的趋势预测"],
  }),
  dingduan: profile({
    audience: "关注本地与公共议题、追求事实脉络的新闻读者",
    objective: "按新闻要素清楚呈现事件、背景和公共影响",
    tone: "准确、克制、新闻化",
    titleApproach: "优先呈现主体、动作和结果，弱化评价性词语",
    summaryApproach: "交代时间、主体、事件和重要影响",
    structure: ["导语呈现核心新闻点", "补全关键事实和背景", "说明影响及待确认事项"],
    formatting: "遵循新闻稿段落节奏，小标题只用于清晰分层",
    tagApproach: "选择地域、事件类型、相关机构和公共议题",
    safeguards: ["缺失的新闻要素保持缺失，不自行补全", "传闻、观点和已确认事实必须区分"],
  }),
  xueqiu: profile({
    audience: "关注公司、行业和资产定价逻辑的投资者",
    objective: "形成可检查的投资论点，同时完整呈现证据、反例和风险",
    tone: "专业、克制、数据导向",
    titleApproach: "点明研究对象和核心变量，不直接给出买卖号召",
    summaryApproach: "概括核心论点、主要依据和最大不确定性",
    structure: ["先给出研究结论和前提", "展开数据、逻辑与催化因素", "列出反例、风险和验证条件"],
    formatting: "数据与观点分段呈现，保留日期、单位和统计口径",
    tagApproach: "优先使用公司、指数、行业和研究主题",
    safeguards: ["不得承诺收益或使用确定性买卖建议", "不得省略数据日期、单位和适用口径"],
  }),
  eastmoney: profile({
    audience: "关注市场动态、公司信息和交易相关资讯的投资者",
    objective: "把信息放入市场背景中，解释可能影响及其条件",
    tone: "审慎、清晰、市场信息导向",
    titleApproach: "突出市场主体、关键数据或事件影响，避免荐股措辞",
    summaryApproach: "概括事件、市场含义和主要风险变量",
    structure: ["呈现事件和关键数据", "补充市场与行业背景", "分析潜在影响并列出风险"],
    formatting: "关键数据单独成段，保留时间、币种、单位和比较基准",
    tagApproach: "选择公司、板块、指数和事件类型",
    safeguards: ["事实、市场观点和预测必须分别表述", "不得承诺收益或暗示确定性行情"],
  }),
  "10jqka": profile({
    audience: "希望快速理解公司、板块和市场变量的个人投资者",
    objective: "提炼与投资判断相关的事实、催化因素和风险条件",
    tone: "简明、理性、决策信息导向",
    titleApproach: "点明标的或板块与核心变化，不使用确定性涨跌判断",
    summaryApproach: "概括关键变量、潜在影响和需要继续验证的条件",
    structure: ["列出核心事实和变化", "解释传导逻辑与催化因素", "呈现风险、反向情形和观察指标"],
    formatting: "优先使用短段落和清晰分点，数据注明日期与口径",
    tagApproach: "选择公司、概念、行业和核心变量",
    safeguards: ["不得给出无依据的目标价或收益预测", "不要把行业事件直接等同于个股结果"],
  }),
  sohu: profile({
    audience: "在综合门户阅读新闻、生活和行业内容的大众用户",
    objective: "用易读的门户文章结构完整传递核心信息和背景",
    tone: "清楚、自然、面向大众",
    titleApproach: "主体明确、信息完整，突出内容价值而非情绪刺激",
    summaryApproach: "概括文章主题、主要发现和阅读价值",
    structure: ["开头给出核心信息", "按主题展开事实与解释", "总结影响或可执行要点"],
    formatting: "使用通俗小标题和中短段落，专业术语首次出现时解释",
    tagApproach: "选择主题、行业和内容类型标签",
    safeguards: ["不要使用与正文不一致的标题", "不要为了通俗化改变专业概念含义"],
  }),
  weibo: profile({
    audience: "在社交信息流中关注即时观点和公共讨论的用户",
    objective: "迅速表达核心观点，并留下足够事实让读者理解和讨论",
    tone: "自然、凝练、有交流感",
    titleApproach: "用一句可独立传播的判断或问题抓住核心",
    summaryApproach: "压缩为核心观点加一个最重要依据",
    structure: ["首段直接给结论或观察", "用短段落补充两到三个依据", "以边界、问题或讨论点收束"],
    formatting: "短句短段，避免把长文机械切碎或连续使用感叹号",
    tagApproach: "只选择高度相关的话题词，标签正文不重复堆放",
    safeguards: ["不得用情绪化措辞替代事实", "引用和转述必须保持原意"],
  }),
  zhihu: profile({
    audience: "希望理解问题机制、证据和不同观点的知识型读者",
    objective: "围绕一个明确问题给出可推演、可质疑的完整回答",
    tone: "诚实、分析性、解释充分",
    titleApproach: "使用自然问题或明确论题，避免营销式承诺",
    summaryApproach: "先给简短结论，再说明论证将覆盖哪些关键点",
    structure: ["界定问题和结论适用范围", "逐步展开证据与推理", "处理反例、限制和常见误解"],
    formatting: "使用论证型小标题、列表和必要术语解释，不写广告式结尾",
    tagApproach: "选择问题领域、关键概念和适用场景",
    safeguards: ["不要伪造来源、经历或第一手体验", "结论强度不得超过原文证据"],
  }),
  ofweek: profile({
    audience: "关注科技产业、工程应用和供应链变化的专业读者",
    objective: "准确解释技术、产业位置、应用条件和商业影响",
    tone: "专业、具体、避免概念炒作",
    titleApproach: "包含技术或行业对象、关键进展及实际意义",
    summaryApproach: "概括技术变化、应用方向和成熟度边界",
    structure: ["说明技术或产业变化", "解释原理、指标和产业链位置", "分析应用、限制与商业影响"],
    formatting: "术语首次出现时解释，指标保留单位、条件和比较对象",
    tagApproach: "选择技术类别、应用行业和产业链环节",
    safeguards: ["不得混淆原型、量产和商业化阶段", "不要把厂商口径写成独立验证结论"],
  }),
  laohu: profile({
    audience: "关注全球股票、宏观事件和跨市场机会的投资者",
    objective: "结合全球市场语境解释事件、估值变量、催化与风险",
    tone: "专业、国际市场导向、审慎",
    titleApproach: "点明市场或公司、核心变量和观察角度，避免交易号召",
    summaryApproach: "概括事件、全球市场含义和关键风险",
    structure: ["交代事件与市场反应", "分析基本面、估值或宏观传导", "列出催化因素、风险与验证指标"],
    formatting: "注明市场、交易时段、币种、单位和数据日期",
    tagApproach: "选择股票、市场、行业和宏观主题",
    safeguards: ["不得承诺回报或伪造持仓经历", "跨市场比较必须保留币种、时区和口径"],
  }),
  futu: profile({
    audience: "参与公司研究和市场讨论的投资者社区用户",
    objective: "用社区可讨论的方式呈现观点、证据、催化因素和反方情形",
    tone: "专业但有交流感，观点清晰而不武断",
    titleApproach: "突出研究对象和争议点，不使用无条件涨跌结论",
    summaryApproach: "概括核心观点、主要证据和最值得关注的风险",
    structure: ["先陈述观点及成立条件", "展开证据和催化因素", "给出反方情形、风险与后续观察点"],
    formatting: "短段落配合数据分点，证券名称和市场信息保持准确",
    tagApproach: "选择证券、行业、市场和研究主题",
    safeguards: ["不得将个人观点表述为投资建议", "不得承诺收益或隐去关键风险"],
  }),
  "wechat-mp": profile({
    audience: "主动订阅作者、愿意连续阅读长文的公众号读者",
    objective: "保留作者声音，把材料组织成连贯、有记忆点的完整文章",
    tone: "有人格但不表演，清晰、自然、有节奏",
    titleApproach: "提炼真实核心冲突或收益，不使用与正文脱节的爆款承诺",
    summaryApproach: "用简洁导语说明主题、核心判断和阅读价值",
    structure: ["用具体事实、场景或判断开篇", "用小标题推进主线和因果", "回扣核心判断并给出余味或行动线索"],
    formatting: "使用 Markdown 小标题、短段落和必要列表，避免过密层级与 SEO 堆词",
    tagApproach: "选择主题和栏目型标签，保持少而稳定",
    safeguards: ["保留原文作者立场和语气边界", "不得虚构亲历、对话或读者反馈"],
  }),
});

export type ProfiledArticlePlatform = keyof typeof ARTICLE_PLATFORM_CONTENT_PROFILES;

export function articlePlatformContentProfile(
  platform: string,
): PlatformContentProfile | undefined {
  return (ARTICLE_PLATFORM_CONTENT_PROFILES as Record<string, PlatformContentProfile>)[platform];
}
