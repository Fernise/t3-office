/**
 * Daily clean-up (Cron Trigger): removes rows that can no longer be used and old activity that no longer needs to be
 * kept. Every statement only touches expired or long-stale rows, with margins, so nothing a person can still use is
 * removed. Logs counts only (no identifiers).
 */
const DAY = 86_400_000;
export async function cleanup(db: D1Database, now = Date.now()): Promise<Record<string, number>> {
  const steps: [string, string, (string | number)[]][] = [
    ['sessions', 'DELETE FROM sessions WHERE expires<=?', [now]],
    // Alerts are bound to the session that enabled them; delivery already ignores them once the session ends.
    ['push_subscriptions', 'DELETE FROM push_subscriptions WHERE session NOT IN(SELECT token FROM sessions)', []],
    ['invites', 'DELETE FROM invites WHERE expires<=?', [now]],
    ['publisher_tokens', 'DELETE FROM publisher_tokens WHERE expires<=?', [now]],
    ['auth_limits', 'DELETE FROM auth_limits WHERE expires<=?', [now]],
    ['github_challenges', 'DELETE FROM github_challenges WHERE expires<=?', [now]],
    ['github_flows', 'DELETE FROM github_flows WHERE expires<=?', [now]],
    ['auth_contexts', 'DELETE FROM auth_contexts WHERE expires<=? AND NOT EXISTS(SELECT 1 FROM github_flows WHERE context=auth_contexts.id)', [now]],
    ['human_requests', 'DELETE FROM human_requests WHERE expires<=?', [now - DAY]],
    ['human_cooldown', 'DELETE FROM human_cooldown WHERE last<?', [now - DAY]],
    ['human_receipts', 'DELETE FROM human_receipts WHERE created<?', [now - DAY]],
    ['human_presence', 'DELETE FROM human_presence WHERE updated<?', [now - DAY]],
    ['doorbell_cooldown', 'DELETE FROM doorbell_cooldown WHERE last<?', [now - DAY]],
    ['publish_rate', 'DELETE FROM publish_rate WHERE window<?', [Math.floor(now / 1000) - 3600]],
    ['push_log', 'DELETE FROM push_log WHERE at<?', [now - 90 * DAY]],
    // Data minimisation: a published snapshot is hidden after 45 s; after a day the agent list itself is dropped
    // (the "last update" time stays for Sharing → Home computer).
    ['stale_snapshots', "UPDATE offices SET agents='[]' WHERE agents<>'[]' AND (updated IS NULL OR updated<?)", [now - DAY]],
  ];
  const results = await db.batch(steps.map(([, sql, values]) => db.prepare(sql).bind(...values)));
  const counts = Object.fromEntries(steps.map(([name], i) => [name, results[i].meta.changes ?? 0]));
  console.log(JSON.stringify({ event: 'cleanup', ...counts }));
  return counts;
}
