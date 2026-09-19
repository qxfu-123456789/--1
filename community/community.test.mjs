import test from "node:test";
import assert from "node:assert/strict";
import { parseRecord, buildSnapshot } from "./lib.mjs";

const body = (kind, data) =>
  `<!-- ozone-mystery:${kind} v=1 -->\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n说明文字`;

test("parseRecord 解析成绩", () => {
  const p = parseRecord(body("score", { nick: "阿黎", score: 87, firstTry: 4, corrected: 1, hinted: 1, ts: "2026-09-19T05:00:00Z" }));
  assert.equal(p.kind, "score");
  assert.equal(p.data.score, 87);
});

test("parseRecord 解析评论", () => {
  const p = parseRecord(body("comment", { nick: "阿黎", stars: 5, text: "ClO 那题设计得很妙", ts: "2026-09-19T05:00:00Z" }));
  assert.equal(p.kind, "comment");
  assert.equal(p.data.stars, 5);
});

test("parseRecord 拒绝坏数据", () => {
  assert.equal(parseRecord("没有标记的普通帖子"), null);
  assert.equal(parseRecord("<!-- ozone-mystery:score v=1 -->\n```json\n{oops}\n```"), null);
  assert.equal(parseRecord(null), null);
});

test("buildSnapshot：同账号保留最高分，忽略已关闭", () => {
  const mk = (login, score, ts, state = "open") => ({
    number: Math.floor(Math.random() * 1e6),
    state,
    user: { login },
    body: body("score", { nick: login, score, firstTry: 6, corrected: 0, hinted: 0, ts }),
    created_at: ts
  });
  const snap = buildSnapshot([
    mk("alice", 80, "2026-09-19T05:00:00Z"),
    mk("alice", 95, "2026-09-19T06:00:00Z"),
    mk("bob", 95, "2026-09-19T04:00:00Z"),
    mk("carol", 100, "2026-09-18T03:00:00Z", "closed"),
    { state: "open", user: { login: "eve" }, body: "无关内容", created_at: "2026-09-19T01:00:00Z" }
  ], "2026-09-19T07:00:00Z");
  assert.equal(snap.totalScores, 2);
  assert.equal(snap.leaderboard[0].score, 95);
  assert.equal(snap.leaderboard[0].author, "bob"); // 同分，先到者（04:00）排前
  assert.equal(snap.leaderboard[1].author, "alice");
  assert.equal(snap.leaderboard[1].nick, "alice");
  assert.equal(snap.totalComments, 0);
});

test("buildSnapshot：评论排序与截断", () => {
  const issues = [];
  for (let i = 0; i < 25; i++) {
    issues.push({
      number: i + 1, state: "open", user: { login: "u" + i },
      body: body("comment", { nick: "u" + i, stars: 3, text: "第" + i + "条", ts: `2026-09-1${i % 10}T00:00:00Z` }),
      created_at: `2026-09-1${i % 10}T00:00:00Z`
    });
  }
  const snap = buildSnapshot(issues, "2026-09-19T07:00:00Z");
  assert.equal(snap.comments.length, 20);
});
