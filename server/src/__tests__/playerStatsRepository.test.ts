import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

function initTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS player_stats (
      enterprise_id TEXT PRIMARY KEY,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      total_score   INTEGER NOT NULL DEFAULT 0,
      total_lines   INTEGER NOT NULL DEFAULT 0,
      max_score     INTEGER NOT NULL DEFAULT 0,
      max_lines     INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_player_stats_wins ON player_stats(wins DESC);
  `);
  return testDb;
}

function upsertPlayerStats(
  db: Database.Database,
  enterpriseId: string,
  isWin: boolean,
  score: number,
  lines: number,
) {
  const stmt = db.prepare(`
    INSERT INTO player_stats (enterprise_id, wins, losses, total_score, total_lines, max_score, max_lines, updated_at)
    VALUES (@enterpriseId, @wins, @losses, @score, @lines, @score, @lines, datetime('now'))
    ON CONFLICT(enterprise_id) DO UPDATE SET
      wins        = wins + @wins,
      losses      = losses + @losses,
      total_score = total_score + @score,
      total_lines = total_lines + @lines,
      max_score   = MAX(max_score, @score),
      max_lines   = MAX(max_lines, @lines),
      updated_at  = datetime('now')
  `);
  stmt.run({
    enterpriseId,
    wins: isWin ? 1 : 0,
    losses: isWin ? 0 : 1,
    score,
    lines,
  });
}

function getTopRankings(db: Database.Database, limit: number) {
  const stmt = db.prepare(`
    SELECT enterprise_id, wins, losses, total_score, max_score
    FROM player_stats ORDER BY wins DESC LIMIT ?
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

describe('playerStatsRepository', () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('upsertPlayerStats で新規エントリが作成されること', () => {
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 5000, 20);

    const rankings = getTopRankings(testDb, 10);
    expect(rankings).toHaveLength(1);
    expect(rankings[0].enterpriseId).toBe('alice@dxc.com');
    expect(rankings[0].wins).toBe(1);
    expect(rankings[0].losses).toBe(0);
    expect(rankings[0].totalScore).toBe(5000);
    expect(rankings[0].maxScore).toBe(5000);
  });

  it('連続呼び出しで wins/losses が正しくインクリメントされること', () => {
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 5000, 20);
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 3000, 15);
    upsertPlayerStats(testDb, 'alice@dxc.com', false, 1000, 5);

    const rankings = getTopRankings(testDb, 10);
    expect(rankings).toHaveLength(1);
    expect(rankings[0].wins).toBe(2);
    expect(rankings[0].losses).toBe(1);
    expect(rankings[0].totalScore).toBe(9000); // 5000 + 3000 + 1000
    expect(rankings[0].maxScore).toBe(5000); // MAX
  });

  it('getTopRankings が wins 降順ソート + winRate 計算されること', () => {
    // alice: 3 wins
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 5000, 20);
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 4000, 18);
    upsertPlayerStats(testDb, 'alice@dxc.com', true, 3000, 15);

    // bob: 1 win, 2 losses
    upsertPlayerStats(testDb, 'bob@dxc.com', true, 2000, 10);
    upsertPlayerStats(testDb, 'bob@dxc.com', false, 1000, 5);
    upsertPlayerStats(testDb, 'bob@dxc.com', false, 500, 3);

    const rankings = getTopRankings(testDb, 10);
    expect(rankings).toHaveLength(2);

    // alice first (more wins)
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].enterpriseId).toBe('alice@dxc.com');
    expect(rankings[0].wins).toBe(3);
    expect(rankings[0].winRate).toBe(100);

    // bob second
    expect(rankings[1].rank).toBe(2);
    expect(rankings[1].enterpriseId).toBe('bob@dxc.com');
    expect(rankings[1].wins).toBe(1);
    expect(rankings[1].winRate).toBe(33); // Math.round(1/3 * 100)
  });

  it('limit パラメータが動作すること', () => {
    for (let i = 0; i < 5; i++) {
      upsertPlayerStats(testDb, `player${i}@dxc.com`, true, 1000, 10);
    }

    const rankings = getTopRankings(testDb, 3);
    expect(rankings).toHaveLength(3);
  });
});
