import type { MatchHistoryEntry, LoserReason } from '@battle-tetris/shared';
import { getDb } from './database.js';

export interface InsertMatchResultParams {
  roomId: string;
  winnerId: string;
  loserId: string;
  winnerScore: number;
  winnerLines: number;
  winnerLevel: number;
  loserScore: number;
  loserLines: number;
  loserLevel: number;
  loserReason: LoserReason;
  durationMs: number;
  isAiMatch: boolean;
}

export function insertMatchResult(params: InsertMatchResultParams): void {
  const db = getDb();
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
  stmt.run({
    ...params,
    isAiMatch: params.isAiMatch ? 1 : 0,
  });
}

export function getRecentMatches(limit: number = 20): MatchHistoryEntry[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      id, room_id, winner_id, loser_id,
      winner_score, loser_score,
      winner_lines, loser_lines,
      loser_reason, duration_ms, played_at, is_ai_match
    FROM match_results
    ORDER BY played_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<{
    id: number;
    room_id: string;
    winner_id: string;
    loser_id: string;
    winner_score: number;
    loser_score: number;
    winner_lines: number;
    loser_lines: number;
    loser_reason: string;
    duration_ms: number;
    played_at: string;
    is_ai_match: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    winnerId: row.winner_id,
    loserId: row.loser_id,
    winnerScore: row.winner_score,
    loserScore: row.loser_score,
    winnerLines: row.winner_lines,
    loserLines: row.loser_lines,
    loserReason: row.loser_reason as LoserReason,
    durationMs: row.duration_ms,
    playedAt: row.played_at,
    isAiMatch: row.is_ai_match === 1,
  }));
}
