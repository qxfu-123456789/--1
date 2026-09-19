/* 纯函数：解析记录、排行。供 sync.mjs 与测试共用（Node ESM）。 */

export const MARKER_RE = /<!--\s*ozone-mystery:(score|comment)\s+v=1\s*-->\s*```json\s*([\s\S]*?)```/;

/** 从 Issue 正文解析结构化记录 */
export function parseRecord(body) {
  if (!body || typeof body !== "string") return null;
  const m = body.match(MARKER_RE);
  if (!m) return null;
  try {
    const data = JSON.parse(m[2]);
    return { kind: m[1], data };
  } catch {
    return null;
  }
}

/**
 * 汇总为排行榜快照。
 * issues: [{number, title, state, user:{login}, body, created_at, closed_at}]
 * 规则：仅 state=open；每个 GitHub 账号保留最高分成绩；同分并列；
 * 评论取最新 20 条。
 */
export function buildSnapshot(issues, nowIso) {
  const records = [];
  for (const iss of issues || []) {
    if (iss.state !== "open" || iss.pull_request) continue;
    const p = parseRecord(iss.body || "");
    if (!p) continue;
    records.push({
      kind: p.kind,
      data: p.data,
      author: iss.user && iss.user.login,
      number: iss.number,
      at: iss.created_at
    });
  }

  const scores = records.filter(r => r.kind === "score" && r.data &&
    Number.isFinite(r.data.score) && typeof r.data.nick === "string");
  const bestByAuthor = new Map();
  for (const r of scores) {
    const key = r.author || `${r.data.nick}#${r.data.ts || r.at}`;
    const prev = bestByAuthor.get(key);
    if (!prev || prev.data.score < r.data.score) bestByAuthor.set(key, r);
  }
  const leaderboard = [...bestByAuthor.values()]
    .map(r => ({
      nick: String(r.data.nick).slice(0, 40),
      author: r.author || null,
      score: Math.max(0, Math.min(100, Math.round(r.data.score))),
      firstTry: r.data.firstTry | 0,
      corrected: r.data.corrected | 0,
      hinted: r.data.hinted | 0,
      at: r.data.ts || r.at || null,
      url: r.number ? `issues/${r.number}` : null
    }))
    .sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)));

  const comments = records
    .filter(r => r.kind === "comment" && r.data && typeof r.data.text === "string")
    .map(r => ({
      nick: String(r.data.nick || "匿名").slice(0, 40),
      author: r.author || null,
      stars: Math.max(0, Math.min(5, r.data.stars | 0)),
      text: String(r.data.text).slice(0, 400),
      at: r.data.ts || r.at || null,
      url: r.number ? `issues/${r.number}` : null
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 20);

  return {
    generatedAt: nowIso,
    totalScores: leaderboard.length,
    totalComments: comments.length,
    leaderboard,
    comments
  };
}

/** 输出写回仓库的 community/scores.json 文件内容（前端读取 leaderboard / comments 两个视图） */
export function snapshotJson(snapshot) {
  return JSON.stringify(snapshot, null, 2) + "\n";
}
