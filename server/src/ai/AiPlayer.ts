import { TetrominoType } from '@battle-tetris/shared';
import { AiGameEngine } from './AiGameEngine.js';
import type { AiGameCallbacks } from './AiGameEngine.js';
import { AiDecisionMaker } from './AiDecisionMaker.js';
import { BedrockClient, resolveModelId } from './BedrockClient.js';
import type { ModelTier } from './BedrockClient.js';
import { createLogger } from '../lib/logger.js';

const PIECE_NAMES: Record<TetrominoType, string> = {
  [TetrominoType.I]: 'I',
  [TetrominoType.O]: 'O',
  [TetrominoType.T]: 'T',
  [TetrominoType.S]: 'S',
  [TetrominoType.Z]: 'Z',
  [TetrominoType.J]: 'J',
  [TetrominoType.L]: 'L',
};

const logger = createLogger({ module: 'AiPlayer' });

const MODEL_TIER_DISPLAY: Record<ModelTier | 'heuristic', string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  claude: 'Claude (Opus)',
  heuristic: 'Heuristic',
};

// =============================================================================
// Level Configuration
// =============================================================================

interface LevelConfig {
  /** 配置間隔 (ms) */
  intervalMs: number;
  /** 使用するモデル */
  model: ModelTier;
  /** temperature (0=決定的, 1=ランダム) */
  temperature: number;
}

const LEVEL_CONFIG: Record<number, LevelConfig> = {
  1:  { intervalMs: 2500, model: 'haiku',  temperature: 1.0 },
  2:  { intervalMs: 2200, model: 'haiku',  temperature: 0.8 },
  3:  { intervalMs: 1900, model: 'haiku',  temperature: 0.5 },
  4:  { intervalMs: 1600, model: 'sonnet', temperature: 0.8 },
  5:  { intervalMs: 1400, model: 'sonnet', temperature: 0.5 },
  6:  { intervalMs: 1200, model: 'sonnet', temperature: 0.3 },
  7:  { intervalMs: 1000, model: 'sonnet', temperature: 0.1 },
  8:  { intervalMs: 800,  model: 'claude', temperature: 0.3 },
  9:  { intervalMs: 600,  model: 'claude', temperature: 0.1 },
  10: { intervalMs: 400,  model: 'claude', temperature: 0 },
};

/** AIレベルに対応する表示名を返す (例: "Haiku Lv.1", "Sonnet Lv.5", "Opus Lv.10") */
export function getAiDisplayName(level: number): string {
  const clamped = Math.max(1, Math.min(10, level));
  const config = LEVEL_CONFIG[clamped] ?? LEVEL_CONFIG[5];
  const tierName: Record<ModelTier, string> = {
    haiku: 'Haiku',
    sonnet: 'Sonnet',
    claude: 'Opus',
  };
  return `${tierName[config.model]} Lv.${clamped}`;
}

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
  private tickSeq = 0;

  constructor(seed: number, level: number) {
    this.level = Math.max(1, Math.min(10, level));
    this.config = LEVEL_CONFIG[this.level] ?? LEVEL_CONFIG[5];
    this.engine = new AiGameEngine(seed);
    this.decisionMaker = new AiDecisionMaker(this.level);

    const modelId = resolveModelId(this.config.model);
    this.bedrockClient = new BedrockClient(modelId);
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
    logger.info({
      level: this.level,
      intervalMs: this.config.intervalMs,
      model: this.config.model,
      temperature: this.config.temperature,
    }, 'AI player started');

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

    // LLM で配置決定を試みる
    if (this.bedrockClient.isAvailable()) {
      try {
        const result = await this.bedrockClient.findPlacement(
          this.engine.getBoardAsText(),
          currentPiece,
          nextPieces,
          this.engine.garbage.pending(),
          this.config.temperature,
        );
        if (result) {
          placement = result.placement;
          this.tickSeq++;
          this.engine.callbacks.onAiThinking?.(
            result.prompt, result.response, result.model,
            MODEL_TIER_DISPLAY[this.config.model], this.config.temperature, this.tickSeq,
          );
        }
      } catch {
        // フォールバック
      }
    }

    // ヒューリスティックにフォールバック
    if (!placement) {
      placement = this.decisionMaker.findBestPlacement(this.engine.board, currentPiece);

      // ヒューリスティック使用時もボード状態と決定結果を送信
      const boardText = this.engine.getBoardAsText();
      const pieceName = PIECE_NAMES[currentPiece] ?? '?';
      const nextNames = nextPieces.map((t) => PIECE_NAMES[t] ?? '?').join(', ');
      const prompt = `[Heuristic] Board:\n${boardText}\nCurrent: ${pieceName} | Next: ${nextNames}`;
      const response = `{"col": ${placement.col}, "rotation": ${placement.rotation}}`;
      this.tickSeq++;
      this.engine.callbacks.onAiThinking?.(
        prompt, response, `heuristic (Lv.${this.level})`,
        MODEL_TIER_DISPLAY.heuristic, this.config.temperature, this.tickSeq,
      );
    }

    // 配置実行
    this.engine.executePlacement(placement);
  }
}
