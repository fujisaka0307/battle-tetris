import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LoserReason } from '@battle-tetris/shared';

// テスト用にインメモリDBを使用するため、database.ts をモックする
let testDb: Database.Database;

function initTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS match_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id       TEXT    NOT NULL,
      winner_id     TEXT    NOT NULL,
      loser_id      TEXT    NOT NULL,
      winner_score  INTEGER NOT NULL DEFAULT 0,
      winner_lines  INTEGER NOT NULL DEFAULT 0,
      winner_level  INTEGER NOT NULL DEFAULT 0,
      loser_score   INTEGER NOT NULL DEFAULT 0,
      loser_lines   INTEGER NOT NULL DEFAULT 0,
      loser_level   INTEGER NOT NULL DEFAULT 0,
      loser_reason  TEXT    NOT NULL,
      duration_ms   INTEGER NOT NULL DEFAULT 0,
      played_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      is_ai_match   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_match_results_played_at ON match_results(played_at DESC);
  `);
  return testDb;
}

function insertMatchResult(db: Database.Database, params: {
  roomId: string;
  winnerId: string;
  loserId: string;
  winnerScore: number;
  winnerLines: number;
  winnerLevel: number;
  loserScore: number;
  loserLines: number;
  loserLevel: number;
  loserReason: string;
  durationMs: number;
  isAiMatch: boolean;
}) {
  const stmt = db.prepare(`
    INSERT INTO match_results (
      room_id, winner_id, loser_id,
      winner_score, winner_lines, winner_level,
      loser_score, loser_lines, loser_level,
      loser_reason, duration_ms, is_ai_match
    ) VALUES (
      @roomId, @winnerId, @loserId,
      @winnerScore, @winnerLines, @winnerLevel,
      @loserScore, @loserLines, @loserLevel,
      @loserReason, @durationMs, @isAiMatch
    )
  `);
  stmt.run({ ...params, isAiMatch: params.isAiMatch ? 1 : 0 });
}

function getRecentMatches(db: Database.Database, limit: number) {
  const stmt = db.prepare(`
    SELECT id, room_id, winner_id, loser_id,
      winner_score, loser_score, winner_lines, loser_lines,
      loser_reason, duration_ms, played_at, is_ai_match
    FROM match_results ORDER BY played_at DESC LIMIT ?
  `);
  return stmt.all(limit) as Array<Record<string, unknown>>;
}

describe('matchResultRepository', () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('insertMatchResult → getRecentMatches で取得できること', () => {
    insertMatchResult(testDb, {
      roomId: 'ROOM01',
      winnerId: 'alice@dxc.com',
      loserId: 'bob@dxc.com',
      winnerScore: 5000,
      winnerLines: 20,
      winnerLevel: 3,
      loserScore: 2000,
      loserLines: 10,
      loserLevel: 2,
      loserReason: LoserReason.GameOver,
      durationMs: 120000,
      isAiMatch: false,
    });

    const results = getRecentMatches(testDb, 10);
    expect(results).toHaveLength(1);
    expect(results[0].winner_id).toBe('alice@dxc.com');
    expect(results[0].loser_id).toBe('bob@dxc.com');
    expect(results[0].winner_score).toBe(5000);
    expect(results[0].loser_score).toBe(2000);
    expect(results[0].loser_reason).toBe('gameover');
    expect(results[0].is_ai_match).toBe(0);
  });

  it('getRecentMatches が降順ソートされること', () => {
    // 1件目
    testDb.prepare(`
      INSERT INTO match_results (room_id, winner_id, loser_id, loser_reason, played_at)
      VALUES ('ROOM01', 'alice', 'bob', 'gameover', '2024-01-01 00:00:00')
    `).run();

    // 2件目（新しい）
    testDb.prepare(`
      INSERT INTO match_results (room_id, winner_id, loser_id, loser_reason, played_at)
      VALUES ('ROOM02', 'carol', 'dave', 'disconnect', '2024-01-02 00:00:00')
    `).run();

    const results = getRecentMatches(testDb, 10);
    expect(results).toHaveLength(2);
    expect(results[0].room_id).toBe('ROOM02'); // 新しい方が先
    expect(results[1].room_id).toBe('ROOM01');
  });

  it('limit パラメータが動作すること', () => {
    for (let i = 0; i < 5; i++) {
      insertMatchResult(testDb, {
        roomId: `ROOM0${i}`,
        winnerId: 'alice',
        loserId: 'bob',
        winnerScore: 1000 * i,
        winnerLines: 10 * i,
        winnerLevel: i,
        loserScore: 500 * i,
        loserLines: 5 * i,
        loserLevel: i,
        loserReason: LoserReason.GameOver,
        durationMs: 60000,
        isAiMatch: false,
      });
    }

    const results = getRecentMatches(testDb, 3);
    expect(results).toHaveLength(3);
  });
});
