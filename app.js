const claimInput = document.querySelector("#claimInput");
const submitBtn = document.querySelector("#submitBtn");
const errorText = document.querySelector("#errorText");
const result = document.querySelector("#result");
const verdictLabel = document.querySelector("#verdictLabel");
const analysisText = document.querySelector("#analysisText");
const replyText = document.querySelector("#replyText");
const copyBtn = document.querySelector("#copyBtn");
const regenerateBtn = document.querySelector("#regenerateBtn");
const resetBtn = document.querySelector("#resetBtn");
const examplesToggle = document.querySelector("#examplesToggle");
const examplesPanel = document.querySelector("#examplesPanel");
const styleOfficialBtn = document.querySelector("#styleOfficialBtn");
const styleMarketingBtn = document.querySelector("#styleMarketingBtn");
const generateImageBtn = document.querySelector("#generateImageBtn");
const imageError = document.querySelector("#imageError");
const imageResult = document.querySelector("#imageResult");
const generatedImage = document.querySelector("#generatedImage");
const saveImageBtn = document.querySelector("#saveImageBtn");
let isGenerating = false;

const inMP =
  /miniProgram/i.test(navigator.userAgent) ||
  window.__wxjs_environment === "miniprogram";

// 提前加载 JSSDK，减少点击时的等待
let jssdkReady = null;
function ensureJSSDK() {
  if (jssdkReady) return jssdkReady;
  if (typeof wx !== "undefined" && wx.miniProgram) {
    jssdkReady = Promise.resolve();
    return jssdkReady;
  }
  jssdkReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return jssdkReady;
}
if (inMP) ensureJSSDK(); // 页面加载时就开始预加载

function navigateMP(url) {
  ensureJSSDK().then(() => {
    wx.miniProgram.navigateTo({ url });
  }).catch(() => alert("JSSDK 加载失败，请检查网络"));
}

// 保存按钮：跳转到小程序保存页
saveImageBtn.addEventListener("click", function (e) {
  if (!inMP) return;
  e.preventDefault();
  const fullUrl = new URL(saveImageBtn.href, window.location.href).href;
  navigateMP(`/pages/save-image/index?url=${encodeURIComponent(fullUrl)}`);
});

// 图片点击：跳转到小程序预览页（支持全屏查看 + 保存）
generatedImage.addEventListener("click", function () {
  if (!inMP) return;
  const fullUrl = new URL(saveImageBtn.href, window.location.href).href;
  navigateMP(`/pages/save-image/index?url=${encodeURIComponent(fullUrl)}&mode=preview`);
});
let isGeneratingImage = false;
let lastParsed = null;

const verdictClassMap = {
  谣言: "",
  半真半假: "is-half",
  基本靠谱: "is-ok",
};

function getSelectedTone() {
  return document.querySelector("input[name='tone']:checked").value;
}

function setError(message = "") {
  errorText.textContent = message;
  errorText.hidden = !message;
}

function updateSubmitState() {
  const isEmpty = claimInput.value.trim().length === 0;
  submitBtn.disabled = isGenerating || isEmpty;
  regenerateBtn.disabled = isGenerating || isEmpty;
}

function parseGeneratedText(text) {
  const clean = text.trim();
  const verdict = clean.match(/【鉴定结果】\s*(谣言|半真半假|基本靠谱)/)?.[1] || "半真半假";
  const analysis =
    clean.match(/【问题在哪】\s*([\s\S]*?)(?=\n\s*【群里这么回】|$)/)?.[1]?.trim() ||
    "这个说法需要补充更准确的背景，别直接照单全收。";
  const reply =
    clean.match(/【群里这么回】\s*([\s\S]*)/)?.[1]?.trim() ||
    "这个我查了一下，别太担心。类似说法常把小风险说得很吓人，咱们按正规医生和权威机构的建议来就好。";

  return { verdict, analysis, reply };
}

function renderResult(data) {
  verdictLabel.className = "verdict-label";
  const className = verdictClassMap[data.verdict];
  if (className) verdictLabel.classList.add(className);
  verdictLabel.textContent = `鉴定结果：${data.verdict}`;
  analysisText.textContent = data.analysis;
  replyText.textContent = data.reply;

  lastParsed = { ...data, claim: claimInput.value.trim() };
  imageResult.hidden = true;
  imageError.hidden = true;
  generatedImage.src = "";

  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSelectedImageStyle() {
  return styleMarketingBtn.classList.contains("is-active") ? "marketing" : "official";
}

async function generateImage() {
  if (!lastParsed || isGeneratingImage) return;

  imageError.hidden = true;
  imageResult.hidden = true;
  isGeneratingImage = true;
  generateImageBtn.disabled = true;

  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed += 1;
    generateImageBtn.textContent = `正在生成图片... ${elapsed}s`;
  }, 1000);

  function finishImageGen() {
    clearInterval(timer);
    generateImageBtn.disabled = false;
    generateImageBtn.textContent = "生成图片";
    isGeneratingImage = false;
  }

  // 第一步：提交任务，拿 jobId
  let jobId;
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim: lastParsed.claim,
        verdict: lastParsed.verdict,
        analysis: lastParsed.analysis,
        reply: lastParsed.reply,
        style: getSelectedImageStyle(),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "提交任务失败，稍后再试。");
    jobId = payload.jobId;
  } catch (error) {
    imageError.textContent = error.message || "提交任务失败，稍后再试。";
    imageError.hidden = false;
    finishImageGen();
    return;
  }

  // 第二步：轮询状态，最多 240 秒（80 次 × 3s）
  let attempts = 0;
  const MAX_ATTEMPTS = 80;

  function poll() {
    if (attempts >= MAX_ATTEMPTS) {
      imageError.textContent = "图片生成超时，请再试一次。";
      imageError.hidden = false;
      finishImageGen();
      return;
    }
    attempts += 1;

    fetch(`/api/image-status?id=${jobId}`)
      .then((r) => r.json())
      .then((payload) => {
        if (payload.status === "done") {
          generatedImage.src = payload.imageUrl;
          saveImageBtn.href = payload.imageUrl;
          imageResult.hidden = false;
          imageResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
          finishImageGen();
        } else if (payload.status === "error") {
          imageError.textContent = payload.error || "图片生成失败，稍后再试。";
          imageError.hidden = false;
          finishImageGen();
        } else {
          setTimeout(poll, 3000);
        }
      })
      .catch(() => {
        setTimeout(poll, 3000);
      });
  }

  setTimeout(poll, 3000);
}

async function generateReply(source = "submit") {
  const claim = claimInput.value.trim();
  if (!claim || isGenerating) return;

  setError("");
  isGenerating = true;
  updateSubmitState();
  const activeButton = source === "regenerate" ? regenerateBtn : submitBtn;
  activeButton.textContent = source === "regenerate" ? "正在换个说法..." : "正在帮你组织语言...";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, tone: getSelectedTone() }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "生成失败，稍后再试一次。");
    }

    renderResult(parseGeneratedText(payload.text || ""));
  } catch (error) {
    if (error.name === "AbortError") {
      setError("接口响应有点慢，已经停止等待了。请再点一次试试。");
    } else {
      setError(error.message || "生成失败，稍后再试一次。");
    }
  } finally {
    clearTimeout(timeoutId);
    submitBtn.textContent = "帮我怼回去";
    regenerateBtn.textContent = "换个说法";
    isGenerating = false;
    updateSubmitState();
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

claimInput.addEventListener("input", updateSubmitState);
submitBtn.addEventListener("click", () => generateReply("submit"));
regenerateBtn.addEventListener("click", () => generateReply("regenerate"));

examplesToggle.addEventListener("click", () => {
  examplesPanel.hidden = !examplesPanel.hidden;
});

examplesPanel.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLButtonElement)) return;
  claimInput.value = event.target.textContent.trim();
  examplesPanel.hidden = true;
  setError("");
  updateSubmitState();
  claimInput.focus();
});

copyBtn.addEventListener("click", async () => {
  await copyToClipboard(replyText.textContent.trim());
  copyBtn.textContent = "已复制";
  setTimeout(() => {
    copyBtn.textContent = "复制话术";
  }, 2000);
});

resetBtn.addEventListener("click", () => {
  claimInput.value = "";
  result.hidden = true;
  imageResult.hidden = true;
  imageError.hidden = true;
  generatedImage.src = "";
  lastParsed = null;
  setError("");
  updateSubmitState();
  claimInput.focus();
});

styleOfficialBtn.addEventListener("click", () => {
  styleOfficialBtn.classList.add("is-active");
  styleMarketingBtn.classList.remove("is-active");
});

styleMarketingBtn.addEventListener("click", () => {
  styleMarketingBtn.classList.add("is-active");
  styleOfficialBtn.classList.remove("is-active");
});

generateImageBtn.addEventListener("click", generateImage);

updateSubmitState();
