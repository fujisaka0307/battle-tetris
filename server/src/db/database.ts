import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * SQLite データベースを初期化・取得する（シングルトン）。
 * WAL モード有効化、マイグレーション実行。
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/battle-tetris.db');
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  logger.info({ dbPath }, 'SQLite database initialized');
  return db;
}

/**
 * データベース接続を閉じる（graceful shutdown 用）。
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('SQLite database closed');
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_match_results_played_at ON match_results(played_at DESC);
    CREATE INDEX IF NOT EXISTS idx_player_stats_wins ON player_stats(wins DESC);
  `);
}
