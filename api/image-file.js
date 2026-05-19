const jobs = require("./jobs.js");

module.exports = function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = url.searchParams.get("id");

  if (!jobId || !jobs.has(jobId)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const job = jobs.get(jobId);
  if (!job.imageData) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const match = job.imageData.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) {
    res.statusCode = 500;
    res.end("Invalid image data");
    return;
  }

  const [, ext, b64] = match;
  const buffer = Buffer.from(b64, "base64");
  res.writeHead(200, {
    "Content-Type": `image/${ext}`,
    "Cache-Control": "public, max-age=900",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buffer);
};
