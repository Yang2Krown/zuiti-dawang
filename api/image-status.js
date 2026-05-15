const jobs = require("./jobs.js");

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = url.searchParams.get("id");

  if (!jobId || !jobs.has(jobId)) {
    return sendJson(res, 404, { error: "任务不存在或已过期。" });
  }

  const job = jobs.get(jobId);
  return sendJson(res, 200, {
    status: job.status,
    imageUrl: job.imageUrl || null,
    error: job.error || null,
  });
};
