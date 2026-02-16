import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { TetrominoType } from '@battle-tetris/shared';
import { createLogger } from '../lib/logger.js';

const logger = createLogger({ module: 'BedrockClient' });

// =============================================================================
// Types
// =============================================================================

interface BedrockPlacement {
  col: number;
  rotation: number;
}

// テトリミノ名マッピング
const PIECE_NAMES: Record<TetrominoType, string> = {
  [TetrominoType.I]: 'I',
  [TetrominoType.O]: 'O',
  [TetrominoType.T]: 'T',
  [TetrominoType.S]: 'S',
  [TetrominoType.Z]: 'Z',
  [TetrominoType.J]: 'J',
  [TetrominoType.L]: 'L',
};

// =============================================================================
// BedrockClient
// =============================================================================

export class BedrockClient {
  private client: BedrockRuntimeClient | null = null;
  private readonly modelId: string;
  private readonly level: number;

  constructor(level: number) {
    this.level = level;
    this.modelId = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      this.client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      logger.info('BedrockClient initialized');
    } else {
      logger.warn('AWS credentials not configured, Bedrock unavailable');
    }
  }

  /**
   * Bedrock が利用可能かどうかを返す。
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Bedrock (Claude) に最適な配置を問い合わせる。
   * 失敗時は null を返す（呼び出し側でヒューリスティックにフォールバック）。
   */
  async findPlacement(
    boardText: string,
    currentPiece: TetrominoType,
    nextPieces: TetrominoType[],
    pendingGarbage: number,
  ): Promise<BedrockPlacement | null> {
    if (!this.client) return null;

    const pieceName = PIECE_NAMES[currentPiece] ?? '?';
    const nextNames = nextPieces.map((t) => PIECE_NAMES[t] ?? '?').join(', ');

    const prompt = `You are an expert Tetris AI. Analyze the board and decide the best placement.

Board (20 rows x 10 cols, . = empty, X = block, G = garbage):
${boardText}

Current piece: ${pieceName}
Next pieces: ${nextNames}
Pending garbage lines: ${pendingGarbage}

Rules:
- col: the leftmost column of the piece's bounding box (0-based, 0=left, 9=right)
- rotation: 0=spawn, 1=CW 90°, 2=180°, 3=CCW 90°
- The piece will hard-drop from the top
- Minimize holes and height, maximize line clears

Respond with ONLY a JSON object: {"col": <number>, "rotation": <number>}`;

    try {
      const temperature = this.level >= 10 ? 0 : 0.3;

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 100,
          temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const response = await this.client.send(command);
      const bodyStr = new TextDecoder().decode(response.body);
      const body = JSON.parse(bodyStr);

      // Claude の応答からテキストを取得
      const text = body.content?.[0]?.text ?? '';

      // JSON を抽出
      const match = text.match(/\{[^}]*"col"\s*:\s*(\d+)[^}]*"rotation"\s*:\s*(\d+)[^}]*\}/);
      if (match) {
        const col = parseInt(match[1], 10);
        const rotation = parseInt(match[2], 10);
        if (col >= 0 && col <= 9 && rotation >= 0 && rotation <= 3) {
          return { col, rotation };
        }
      }

      logger.warn({ text }, 'Bedrock response could not be parsed');
      return null;
    } catch (err) {
      logger.warn({ err }, 'Bedrock invocation failed');
      return null;
    }
  }
}
