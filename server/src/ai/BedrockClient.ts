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

export interface BedrockPlacement {
  col: number;
  rotation: number;
}

export interface BedrockResult {
  placement: BedrockPlacement;
  prompt: string;
  response: string;
  model: string;
}

export type ModelTier = 'haiku' | 'sonnet' | 'claude';

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

// モデルIDのデフォルト値
const DEFAULT_MODELS: Record<ModelTier, string> = {
  haiku:  'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  sonnet: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  claude: 'us.anthropic.claude-3-opus-20240229-v1:0',
};

/**
 * 環境変数またはデフォルトからモデルIDを解決する。
 */
export function resolveModelId(tier: ModelTier): string {
  const envKey = `BEDROCK_MODEL_${tier.toUpperCase()}`;
  return process.env[envKey] ?? DEFAULT_MODELS[tier];
}

// =============================================================================
// BedrockClient
// =============================================================================

export class BedrockClient {
  private client: BedrockRuntimeClient | null = null;
  private readonly modelId: string;
  private readonly region: string;
  private readonly bearerToken: string | undefined;
  private _available = true;

  constructor(modelId: string) {
    this.modelId = modelId;
    this.region = process.env.AWS_REGION ?? 'ap-northeast-1';
    this.bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;

    if (this.bearerToken) {
      // ベアラートークン認証 — AWS SDK 不要
      logger.info({ region: this.region, modelId, auth: 'bearer' }, 'BedrockClient initialized (bearer token)');
    } else {
      // 標準 AWS SDK クレデンシャルチェーン
      try {
        this.client = new BedrockRuntimeClient({ region: this.region });
        logger.info({ region: this.region, modelId, auth: 'sdk' }, 'BedrockClient initialized (AWS SDK)');
      } catch (err) {
        logger.warn({ err }, 'BedrockClient initialization failed');
        this._available = false;
      }
    }
  }

  /**
   * Bedrock が利用可能かどうかを返す。
   */
  isAvailable(): boolean {
    if (this.bearerToken) return this._available;
    return this.client !== null && this._available;
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
    temperature: number,
  ): Promise<BedrockResult | null> {
    const pieceName = PIECE_NAMES[currentPiece] ?? '?';
    const nextNames = nextPieces.map((t) => PIECE_NAMES[t] ?? '?').join(', ');

    const systemPrompt = `You are a Tetris grandmaster AI — the kind that makes humans weep.
Your pieces fall with purpose. Every placement is a move in a high-stakes battle.
Think fast, stack clean, clear lines, and leave no holes behind.
You live for the perfect T-spin and the satisfying quad clear.
Respond with ONLY a JSON object: {"col": <number>, "rotation": <number>}`;

    const prompt = `Board (20 rows x 10 cols, . = empty, X = block, G = garbage):
${boardText}

Current piece: ${pieceName}
Next pieces: ${nextNames}
Pending garbage lines: ${pendingGarbage}

Rules:
- col: the leftmost column of the piece's bounding box (0-based, 0=left, 9=right)
- rotation: 0=spawn, 1=CW 90°, 2=180°, 3=CCW 90°
- The piece will hard-drop from the top
- Minimize holes and height, maximize line clears`;

    const requestBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    try {
      const text = this.bearerToken
        ? await this.invokeWithBearer(requestBody)
        : await this.invokeWithSdk(requestBody);

      if (text === null) return null;

      // JSON を抽出
      const match = text.match(/\{[^}]*"col"\s*:\s*(\d+)[^}]*"rotation"\s*:\s*(\d+)[^}]*\}/);
      if (match) {
        const col = parseInt(match[1], 10);
        const rotation = parseInt(match[2], 10);
        if (col >= 0 && col <= 9 && rotation >= 0 && rotation <= 3) {
          return {
            placement: { col, rotation },
            prompt,
            response: text,
            model: this.modelId,
          };
        }
      }

      logger.warn({ text }, 'Bedrock response could not be parsed');
      return null;
    } catch (err) {
      logger.warn({ err }, 'Bedrock invocation failed');
      this._available = false;
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — AWS SDK ベース
  // ---------------------------------------------------------------------------

  private async invokeWithSdk(requestBody: string): Promise<string | null> {
    if (!this.client) return null;

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: requestBody,
    });

    const response = await this.client.send(command);
    const bodyStr = new TextDecoder().decode(response.body);
    const body = JSON.parse(bodyStr);
    return body.content?.[0]?.text ?? '';
  }

  // ---------------------------------------------------------------------------
  // Private — ベアラートークンベース (fetch)
  // ---------------------------------------------------------------------------

  private async invokeWithBearer(requestBody: string): Promise<string | null> {
    const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(this.modelId)}/invoke`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn({ status: response.status, errorText }, 'Bedrock bearer invocation failed');
      throw new Error(`Bedrock API returned ${response.status}: ${errorText}`);
    }

    const body = await response.json();
    return body.content?.[0]?.text ?? '';
  }
}
