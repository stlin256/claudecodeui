import { randomUUID } from 'node:crypto';

import { getConnection } from '@/modules/database/connection.js';
import type { HarmonyPushJob } from '@/shared/index.js';

/** Used by Notifications to persist, retry and expire HarmonyOS push deliveries. */
export const harmonyPushJobsDb = {
  enqueue(userId: number, endpointId: string, payload: string, now = Date.now()): void {
    const db = getConnection();
    db.prepare('DELETE FROM harmony_push_jobs WHERE expires_at <= ?').run(now);
    // Bound disk usage if credentials or connectivity fail for a long time.
    const count = db.prepare('SELECT COUNT(*) AS count FROM harmony_push_jobs').get() as { count: number };
    if (count.count >= 10000) throw new Error('HarmonyOS notification outbox is full');
    db.prepare(`INSERT INTO harmony_push_jobs
      (id, user_id, endpoint_id, payload_json, next_attempt_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), userId, endpointId, payload, now, now + 3600000);
  },
  due(now = Date.now()): HarmonyPushJob[] {
    const db = getConnection();
    db.prepare('DELETE FROM harmony_push_jobs WHERE expires_at <= ?').run(now);
    return db.prepare('SELECT * FROM harmony_push_jobs WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 20')
      .all(now) as HarmonyPushJob[];
  },
  remove(id: string): void {
    getConnection().prepare('DELETE FROM harmony_push_jobs WHERE id = ?').run(id);
  },
  retry(id: string, attempts: number, now = Date.now()): void {
    getConnection().prepare('UPDATE harmony_push_jobs SET attempts = ?, next_attempt_at = ? WHERE id = ?')
      .run(attempts, now + Math.min(300000, 5000 * 2 ** Math.min(attempts, 6)), id);
  },
};
