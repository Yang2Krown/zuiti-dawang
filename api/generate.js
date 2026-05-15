const toneInstructions = {
  gentle:
    '温柔模式：语气温柔体贴，像懂事的孩子在跟父母耐心解释。开头用"妈/爸，这个我帮你查了一下"这种口吻。不要用任何让父母觉得被嘲笑的措辞。结尾加一句关心的话。',
  funny:
    "幽默模式：用轻松幽默的方式化解，带一点调皮但不冒犯。目标是让群里的人看了会心一笑，同时把正确信息传达了。不要变成嘲讽。",
  science:
    "科学模式：摆事实讲道理，引用权威机构的说法。用简单直白的语言解释，不要用专业术语。给出具体的权威来源。语气平和客观。",
};

const systemPrompt = `你是"嘴替大王"，专门帮年轻人回复家族群里长辈转发的不靠谱养生文章和营销号视频。
你的任务：

判断用户描述的内容是否属于谣言、不准确信息、营销号套路
如果是谣言或不准确信息，生成一段适合直接粘贴到家族群的回复，既纠正信息又不伤感情
如果内容基本靠谱，告诉用户"这个说法大致没问题"，并补充更准确的表述

输出格式要求严格遵守：
第一行：【鉴定结果】谣言/半真半假/基本靠谱
空行
【问题在哪】简短解释，引用你确实知道的权威机构观点（如世界卫生组织、中国卫健委、《柳叶刀》等），只写你有把握的结论，不要编造具体数字或论文名
空行
【群里这么回】直接可粘贴的回复内容，把最有说服力的1-2个权威来源自然嵌入，如"世界卫生组织明确表示……""中国营养学会的建议是……"，让话术看起来有据可查

额外约束：
群里的回复控制在180字以内
不要用markdown格式
用口语化中文，像真人在微信群里打字
不要说"根据我的了解"这种AI腔
回复里不要提到AI、人工智能等词
只引用你确定存在的机构立场，不要捏造具体年份数字或论文标题`;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "只支持 POST 请求。" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "服务端还没有配置 DEEPSEEK_API_KEY。" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return sendJson(res, 400, { error: "请求内容格式不正确。" });
  }

  const { claim, tone = "gentle" } = body;
  if (!claim || typeof claim !== "string" || claim.trim().length === 0) {
    return sendJson(res, 400, { error: "请先输入要辟谣的内容。" });
  }

  const endpoint = process.env.DEEPSEEK_API_ENDPOINT || "https://api.deepseek.com/chat/completions";
  const selectedTone = toneInstructions[tone] || toneInstructions.gentle;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.7,
        messages: [
          { role: "system", content: `${systemPrompt}\n\n${selectedTone}` },
          { role: "user", content: claim.trim().slice(0, 500) },
        ],
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || "上游接口暂时没回好。";
      return sendJson(res, response.status, { error: message });
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return sendJson(res, 502, { error: "没有拿到可用回复。" });
    }

    return sendJson(res, 200, { text });
  } catch (error) {
    if (error.name === "AbortError") {
      return sendJson(res, 504, { error: "DeepSeek 响应超时，请稍后再试。" });
    }

    return sendJson(res, 500, { error: "请求接口失败，请稍后再试。" });
  } finally {
    clearTimeout(timeoutId);
  }
};
