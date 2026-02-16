import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();

// Security: フレームワーク情報を隠蔽
app.disable('x-powered-by');

// セキュリティヘッダー（CSP + X-Frame-Options + その他）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // クリックジャッキング防止
  frameguard: { action: 'deny' },
}));

// テキスト圧縮（gzip / brotli）
app.use(compression());

// CORS
app.use(cors({
  origin: true,
  credentials: true,
}));

// レート制限 — API エンドポイントに適用（WebSocket upgrade は除外）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 本番環境: クライアント静的ファイルを配信
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = process.env.CLIENT_DIST_PATH
    || path.join(__dirname, '../../client/dist');

  // ハッシュ付きアセットは長期キャッシュ
  app.use('/assets', express.static(path.join(clientDist, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // その他の静的ファイル（robots.txt, favicon 等）は短期キャッシュ
  app.use(express.static(clientDist, {
    maxAge: '1h',
  }));

  // SPA フォールバック: 未知のルートは index.html を返す
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
