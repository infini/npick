import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const { draws } = JSON.parse(await readFile(new URL("data/lotto-data.json", root), "utf8"));
const latest = Math.max(...draws.map((draw) => draw.draw));
const source = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do";
const samples = [...new Set([1, 260, 520, 780, 1040, latest])].filter((draw) => draw <= latest);
const results = [];
for (const round of samples) {
  const url = new URL(source);
  url.searchParams.set("srchLtEpsd", String(round));
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    assert.equal(body?.data?.list?.length, 1);
    const row = body.data.list[0];
    const date = String(row.ltRflYmd);
    const actual = { draw: Number(row.ltEpsd), date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      numbers: Array.from({ length: 6 }, (_, index) => Number(row[`tm${index + 1}WnNo`])), bonus: Number(row.bnsWnNo) };
    const stored = draws.find((draw) => draw.draw === round);
    assert.deepEqual(actual, { draw: stored.draw, date: stored.date, numbers: stored.numbers, bonus: stored.bonus });
    results.push({ draw: round, status: "matched", official: actual });
    console.log(`Official source matched draw ${round}`);
  } catch (error) {
    results.push({ draw: round, status: "unverified", error: error.message });
    console.log(`Official source verification incomplete for ${round}: ${error.message}`);
  }
}
const report = { checkedAt: new Date().toISOString(), source, latestDraw: latest, samples: results,
  limitation: "Six predetermined historical samples, not a full external audit of all draws." };
await writeFile(new URL("data/deep-source-audit.json", root), `${JSON.stringify(report, null, 2)}\n`);
if (results.some((result) => result.status !== "matched")) process.exitCode = 1;
