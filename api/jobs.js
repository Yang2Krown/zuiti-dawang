const jobs = new Map();

// 每 5 分钟清一次超过 15 分钟的旧任务，防止内存泄漏
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

module.exports = jobs;
