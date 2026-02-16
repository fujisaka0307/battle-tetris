import { AiGameEngine } from './AiGameEngine.js';
import type { AiGameCallbacks } from './AiGameEngine.js';
import { AiDecisionMaker } from './AiDecisionMaker.js';
import { BedrockClient } from './BedrockClient.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger({ module: 'AiPlayer' });

// =============================================================================
// Level Configuration
// =============================================================================

interface LevelConfig {
  /** 配置間隔 (ms) */
  intervalMs: number;
  /** Bedrock 使用率 (0.0 - 1.0) */
  bedrockRate: number;
}

const LEVEL_CONFIG: Record<number, LevelConfig> = {
  1:  { intervalMs: 2500, bedrockRate: 0 },
  2:  { intervalMs: 2000, bedrockRate: 0 },
  3:  { intervalMs: 1700, bedrockRate: 0 },
  4:  { intervalMs: 1400, bedrockRate: 0 },
  5:  { intervalMs: 1100, bedrockRate: 0 },
  6:  { intervalMs: 900,  bedrockRate: 0 },
  7:  { intervalMs: 750,  bedrockRate: 0.25 },
  8:  { intervalMs: 600,  bedrockRate: 0.50 },
  9:  { intervalMs: 450,  bedrockRate: 0.75 },
  10: { intervalMs: 300,  bedrockRate: 1.0 },
};

// =============================================================================
// AiPlayer
// =============================================================================

export class AiPlayer {
  private readonly engine: AiGameEngine;
  private readonly decisionMaker: AiDecisionMaker;
  private readonly bedrockClient: BedrockClient;
  private readonly level: number;
  private readonly config: LevelConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(seed: number, level: number) {
    this.level = Math.max(1, Math.min(10, level));
    this.config = LEVEL_CONFIG[this.level] ?? LEVEL_CONFIG[5];
    this.engine = new AiGameEngine(seed);
    this.decisionMaker = new AiDecisionMaker(this.level);
    this.bedrockClient = new BedrockClient(this.level);
  }

  /**
   * コールバックを設定する。
   */
  setCallbacks(callbacks: AiGameCallbacks): void {
    this.engine.setCallbacks(callbacks);
  }

  /**
   * AIゲームループを開始する。
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.engine.start();
    logger.info({ level: this.level, intervalMs: this.config.intervalMs }, 'AI player started');

    // 初回のフィールド状態を通知
    this.engine.setCallbacks({
      ...this.getCallbacks(),
    });

    this.timer = setInterval(() => {
      this.tick();
    }, this.config.intervalMs);
  }

  /**
   * AIゲームループを停止する。
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info({ level: this.level }, 'AI player stopped');
  }

  /**
   * おじゃまラインを受信する。
   */
  addGarbage(lines: number): void {
    this.engine.addGarbage(lines);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (!this.running) return;
    if (this.engine.state !== 'playing') {
      this.stop();
      return;
    }

    const currentPiece = this.engine.peekCurrentPiece();
    const nextPieces = this.engine.peekNextPieces(3);

    let placement = null;

    // Bedrock を使うかどうか判定
    const useBedrock = this.config.bedrockRate > 0
      && this.bedrockClient.isAvailable()
      && Math.random() < this.config.bedrockRate; // NOSONAR

    if (useBedrock) {
      try {
        placement = await this.bedrockClient.findPlacement(
          this.engine.getBoardAsText(),
          currentPiece,
          nextPieces,
          this.engine.garbage.pending(),
        );
      } catch {
        // フォールバック
      }
    }

    // ヒューリスティックにフォールバック
    if (!placement) {
      placement = this.decisionMaker.findBestPlacement(this.engine.board, currentPiece);
    }

    // 配置実行
    this.engine.executePlacement(placement);
  }
}
