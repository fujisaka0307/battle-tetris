import type { RankingEntry } from '@battle-tetris/shared';
import { getDb } from './database.js';

export function upsertPlayerStats(
  enterpriseId: string,
  isWin: boolean,
  score: number,
  lines: number,
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO player_stats (enterprise_id, wins, losses, total_score, total_lines, max_score, max_lines, updated_at)
    VALUES (@enterpriseId, @wins, @losses, @score, @lines, @score, @lines, datetime('now'))
    ON CONFLICT(enterprise_id) DO UPDATE SET
      wins       = wins + @wins,
      losses     = losses + @losses,
      total_score = total_score + @score,
      total_lines = total_lines + @lines,
      max_score  = MAX(max_score, @score),
      max_lines  = MAX(max_lines, @lines),
      updated_at = datetime('now')
  `);
  stmt.run({
    enterpriseId,
    wins: isWin ? 1 : 0,
    losses: isWin ? 0 : 1,
    score,
    lines,
  });
}

export function getTopRankings(limit: number = 20): RankingEntry[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      enterprise_id, wins, losses, total_score, max_score
    FROM player_stats
    ORDER BY wins DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<{
    enterprise_id: string;
    wins: number;
    losses: number;
    total_score: number;
    max_score: number;
  }>;
  return rows.map((row, index) => {
    const total = row.wins + row.losses;
    return {
      rank: index + 1,
      enterpriseId: row.enterprise_id,
      wins: row.wins,
      losses: row.losses,
      totalScore: row.total_score,
      maxScore: row.max_score,
      winRate: total > 0 ? Math.round((row.wins / total) * 100) : 0,
    };
  });
}
