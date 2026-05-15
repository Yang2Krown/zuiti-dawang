const { randomUUID } = require("node:crypto");
const jobs = require("./jobs.js");

function buildOfficialPrompt(claim, verdict, analysis, reply) {
  const verdictColor =
    verdict === "谣言" ? "red (#CC2200)" : verdict === "半真半假" ? "amber (#D08000)" : "green (#1A8A4A)";

  return `Create a professional Chinese health fact-checking poster in official government bulletin style.

LAYOUT (portrait, white background):
- Top full-width header band in royal blue (#1565C0)
  - Large centered white bold text: "权威辟谣"
  - Small white text below: "科学求证 · 理性辨别"
- Verdict pill badge below header, ${verdictColor} fill, white text: "${verdict}"
- Section: dark navy bold label "【科学解读】"
  - Body text in dark gray: "${analysis.slice(0, 220)}"
- Section: dark navy bold label "【正确说法】"
  - Rounded light blue-gray box containing: "${reply.slice(0, 220)}"
- Thin horizontal rule
- Footer small gray text: "来源：国家卫生健康委员会 · 世界卫生组织"

STYLE RULES: Clean white space. No clipart or photos. Professional sans-serif font. Looks exactly like an official Chinese government health bulletin.`;
}

function buildMarketingPrompt(claim, verdict, analysis, reply) {
  return `Create a viral Chinese WeChat health infographic in sensationalist marketing style.

LAYOUT (portrait):
- Vivid red background (#CC0000)
- Top section: huge yellow (#FFD700) bold text "🔥 震惊！！🔥"
- White bold subheading: "99%的人都被骗了！医生看完都沉默了！"
- Yellow jagged horizontal divider band
- White bold text: "关于「${claim.slice(0, 50)}」的真相👇"
- Dark red (#880000) rounded box, white bold text (verdict): "真相：${verdict}！！！"
- White bold body text on red: "${analysis.slice(0, 180)}"
- Yellow (#FFD700) highlight box with red bold text: "✅ 正确做法：${reply.slice(0, 140)}"
- Bottom banner: "❤️ 为了家人健康，转发出去！💯"

STYLE RULES: Maximum visual intensity. Mixed large/small font sizes. Exactly like viral Chinese health posts on WeChat. The content is factual even though the style is sensationalist.`;
}

function parseImageUrl(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  if (typeof content === "string") {
    const mdMatch = content.match(/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    if (content.startsWith("data:image") || content.startsWith("http")) return content.trim();
    return null;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      const url = part?.image_url?.url || part?.url;
      if (url) return url;
    }
  }

  return null;
}

async function callHiAPI(prompt, apiKey) {
  const response = await fetch("https://api.hiapi.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      stream: false,
      messages: [{ role: "user", content: prompt }],
      size: "1024x1024",
      n: 1,
      output_format: "png",
    }),
  });

  const data = await response.json().catch(() => ({}));
  console.log("[generate-image] HTTP status:", response.status);

  if (!response.ok) {
    const err = new Error(data.error?.message || "图片生成接口暂时没回好。");
    err.status = response.status;
    throw err;
  }

  return data;
}

async function runImageJob(jobId, prompt, apiKey) {
  console.log("\n=== [generate-image] job:", jobId, "===");
  console.log("prompt:\n" + prompt);

  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[generate-image] attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      const data = await callHiAPI(prompt, apiKey);

      const rawContent = data?.choices?.[0]?.message?.content;
      console.log(
        "[generate-image] raw content:",
        typeof rawContent === "string"
          ? rawContent.slice(0, 120) + "..."
          : JSON.stringify(rawContent)?.slice(0, 120)
      );

      const imageUrl = parseImageUrl(data);
      if (!imageUrl) {
        throw new Error("图片接口没有返回可用图片。");
      }

      console.log("[generate-image] image URL prefix:", imageUrl.slice(0, 60));
      jobs.set(jobId, { ...jobs.get(jobId), status: "done", imageUrl });
      console.log("=== [generate-image] job:", jobId, "done ===\n");
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[generate-image] attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`[generate-image] retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error("[generate-image] all attempts failed:", lastError.message);
  jobs.set(jobId, { ...jobs.get(jobId), status: "error", error: lastError.message });
  console.log("=== [generate-image] job:", jobId, "done ===\n");
}

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

  const apiKey = process.env.HIAPI_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "服务端还没有配置 HIAPI_KEY。" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return sendJson(res, 400, { error: "请求内容格式不正确。" });
  }

  const { claim = "", verdict = "", analysis = "", reply = "", style = "official" } = body;
  if (!analysis || !reply) {
    return sendJson(res, 400, { error: "缺少辟谣内容，请先生成文字再生成图片。" });
  }

  const prompt =
    style === "marketing"
      ? buildMarketingPrompt(claim, verdict, analysis, reply)
      : buildOfficialPrompt(claim, verdict, analysis, reply);

  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", createdAt: Date.now() });
  console.log("[generate-image] created job:", jobId, "style:", style);

  // 后台异步跑，不阻塞请求
  runImageJob(jobId, prompt, apiKey).catch(() => {});

  return sendJson(res, 202, { jobId });
};
