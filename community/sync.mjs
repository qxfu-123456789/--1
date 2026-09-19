/* 社区快照生成器（GitHub Actions 运行）。
 * 读取本仓库 open Issues → 生成 community/scores.json → 提交回 main。
 * 触发：.github/workflows/community.yml。本地调试：node community/sync.mjs（需 GITHUB_TOKEN）。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { buildSnapshot, snapshotJson } from "./lib.mjs";

const REPO = process.env.GITHUB_REPOSITORY; // owner/name
const TOKEN = process.env.GITHUB_TOKEN;
const PUBLISH = process.argv.includes("--publish");

if (!REPO || !TOKEN) {
  console.error("需要 GITHUB_REPOSITORY 与 GITHUB_TOKEN 环境变量。");
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ozone-mystery-community-sync"
    }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

const issues = [];
let page = 1;
for (;;) {
  const batch = await api(`/issues?state=open&per_page=100&page=${page}`);
  if (!batch.length) break;
  issues.push(...batch);
  if (batch.length < 100) break;
  page += 1;
  if (page > 10) break; // 安全上限
}

const snapshot = buildSnapshot(issues, new Date().toISOString());
mkdirSync("community", { recursive: true });
writeFileSync("community/scores.json", snapshotJson(snapshot));
console.log(`快照完成：${snapshot.totalScores} 条成绩，${snapshot.totalComments} 条评论。`);

if (PUBLISH) {
  // 由后续 git 步骤提交（workflow 中处理），这里仅产出文件
  console.log("scores.json 已生成，交由工作流提交。");
}
