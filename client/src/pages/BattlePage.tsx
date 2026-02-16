import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameState } from '@battle-tetris/shared';
import { GameEngine } from '../game/GameEngine';
import { Renderer } from '../game/Renderer';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';
import { useBattleStore } from '../stores/useBattleStore';
import type { AiThinkingEntry } from '../stores/useBattleStore';
import { trackFps } from '../lib/gameMetrics';

export default function BattlePage() {
  const navigate = useNavigate();
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const enterpriseId = usePlayerStore((s) => s.enterpriseId);
  const seed = useGameStore((s) => s.seed);
  const score = useGameStore((s) => s.score);
  const level = useGameStore((s) => s.level);
  const lines = useGameStore((s) => s.lines);
  const opponentField = useBattleStore((s) => s.opponentField);
  const opponentScore = useBattleStore((s) => s.opponentScore);
  const opponentLines = useBattleStore((s) => s.opponentLines);
  const opponentLevel = useBattleStore((s) => s.opponentLevel);
  const pendingGarbage = useBattleStore((s) => s.pendingGarbage);
  const aiThinkingLog = useBattleStore((s) => s.aiThinkingLog);

  const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement>(null);
  const opponentCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const fieldRendererRef = useRef<Renderer | null>(null);
  const nextRendererRef = useRef<Renderer | null>(null);
  const holdRendererRef = useRef<Renderer | null>(null);
  const opponentRendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const aiThinkingEndRef = useRef<HTMLDivElement>(null);

  // Redirect if no enterpriseId or seed
  useEffect(() => {
    if (!enterpriseId) {
      navigate('/', { replace: true });
    }
  }, [enterpriseId, navigate]);

  // Set up SignalR handlers for battle
  useEffect(() => {
    signalRClient.setHandlers({
      onOpponentFieldUpdate: (payload) => {
        useBattleStore.getState().setOpponentField(
          payload.field,
          payload.score,
          payload.lines,
          payload.level,
        );
      },
      onReceiveGarbage: (payload) => {
        useBattleStore.getState().addPendingGarbage(payload.lines);
        if (engineRef.current) {
          engineRef.current.garbage.add(payload.lines);
        }
      },
      onGameResult: (payload) => {
        useBattleStore.getState().setResult(payload);
        navigate(`/result`);
      },
      onAiThinking: (payload) => {
        useBattleStore.getState().addAiThinking({
          prompt: payload.prompt,
          response: payload.response,
          model: payload.model,
          timestamp: Date.now(),
        });
      },
      onOpponentDisconnected: () => {
        // Opponent disconnected during game — wait for server to resolve
      },
      onOpponentReconnected: () => {},
    });
  }, [navigate]);

  // Initialize engine and start game loop
  useEffect(() => {
    const fieldCanvas = fieldCanvasRef.current;
    const nextCanvas = nextCanvasRef.current;
    const holdCanvas = holdCanvasRef.current;
    const opponentCanvas = opponentCanvasRef.current;
    if (!fieldCanvas || !nextCanvas || !holdCanvas || !opponentCanvas) return;

    const fieldCtx = fieldCanvas.getContext('2d');
    const nextCtx = nextCanvas.getContext('2d');
    const holdCtx = holdCanvas.getContext('2d');
    const opCtx = opponentCanvas.getContext('2d');
    if (!fieldCtx || !nextCtx || !holdCtx || !opCtx) return;

    const fieldRenderer = new Renderer(fieldCtx);
    const nextRenderer = new Renderer(nextCtx);
    const holdRenderer = new Renderer(holdCtx);
    fieldRendererRef.current = fieldRenderer;
    nextRendererRef.current = nextRenderer;
    holdRendererRef.current = holdRenderer;
    opponentRendererRef.current = new Renderer(opCtx);

    const engine = new GameEngine(seed ?? 0);
    engineRef.current = engine;

    engine.setCallbacks({
      onLinesCleared: (count) => {
        signalRClient.sendLinesCleared(count);
      },
      onGameOver: () => {
        useGameStore.getState().setGameState(GameState.GameOver);
        signalRClient.sendGameOver();
      },
      onFieldUpdate: () => {
        const store = useGameStore.getState();
        store.setScore(engine.score);
        store.setLevel(engine.level);
        store.setLines(engine.lines);

        // Send field to opponent
        const grid = engine.board.getVisibleGrid();
        signalRClient.sendFieldUpdate({
          field: grid,
          score: engine.score,
          lines: engine.lines,
          level: engine.level,
        });
      },
    });

    engine.start(seed ?? undefined);
    useGameStore.getState().setGameState(GameState.Playing);
    engine.input.attach(window);

    // Game loop
    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      engine.update(dt);

      // Track FPS every 60 frames
      frameCountRef.current++;
      if (frameCountRef.current % 60 === 0 && dt > 0) {
        trackFps(Math.round(1000 / dt));
      }

      // Draw main field
      const piece = engine.currentPiece;
      const nextPieces = engine.bag.peek(3);
      fieldRenderer.drawField({
        grid: engine.board.grid,
        currentPiece: piece,
        ghostRow: engine.getGhostRow(),
        nextPieces,
        holdPiece: engine.holdPiece,
      });

      // Draw next queue (dedicated canvas)
      nextRenderer.drawNextQueue(nextPieces);

      // Draw hold (dedicated canvas)
      holdRenderer.drawHold(engine.holdPiece);

      if (engine.state === GameState.Playing) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.input.detach();
    };
  }, [seed]);

  // Draw opponent field when it updates
  useEffect(() => {
    const opponentCanvas = opponentCanvasRef.current;
    if (!opponentCanvas || !opponentField) return;
    const ctx = opponentCanvas.getContext('2d');
    if (!ctx) return;

    const renderer = new Renderer(ctx);
    renderer.drawOpponentField({ grid: opponentField });
  }, [opponentField]);

  // Auto-scroll AI thinking panel
  useEffect(() => {
    if (aiThinkingLog.length > 0) {
      aiThinkingEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [aiThinkingLog]);

  if (!enterpriseId) return null;

  return (
    <div className="battle-container">
      <div className="battle-layout">
        {/* Left sidebar: HOLD + STATS */}
        <div className="battle-sidebar">
          {/* HOLD panel */}
          <div className="game-panel">
            <div className="game-panel-label">Hold</div>
            <canvas
              ref={holdCanvasRef}
              width={Renderer.holdWidth}
              height={Renderer.holdHeight}
              className="panel-canvas"
            />
          </div>

          {/* Stats panel */}
          <div className="game-panel stats-panel" data-testid="scoreboard">
            <div className="stat-row">
              <span className="stat-label">Score</span>
              <span className="stat-value" data-testid="score">{score}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Level</span>
              <span className="stat-value" data-testid="level">{level}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Lines</span>
              <span className="stat-value" data-testid="lines">{lines}</span>
            </div>
          </div>
        </div>

        {/* Center: Garbage bar + Main field */}
        <div className="battle-center">
          {/* Garbage bar */}
          <div
            className="garbage-bar"
            data-testid="garbage-bar"
            style={{ '--garbage-bar-h': `${Renderer.fieldHeight + 4}px` } as React.CSSProperties}
          >
            {pendingGarbage > 0 && (
              <div
                className="garbage-bar-fill"
                style={{ '--garbage-fill': `${Math.min(pendingGarbage / 20, 1) * 100}%` } as React.CSSProperties}
              />
            )}
          </div>

          {/* Main field */}
          <div className="field-frame">
            <canvas
              ref={fieldCanvasRef}
              width={Renderer.fieldWidth}
              height={Renderer.fieldHeight}
              data-testid="game-canvas"
            />
          </div>
        </div>

        {/* Right sidebar: NEXT */}
        <div className="battle-sidebar">
          <div className="game-panel">
            <div className="game-panel-label">Next</div>
            <canvas
              ref={nextCanvasRef}
              width={Renderer.nextQueueWidth}
              height={Renderer.nextQueueHeight}
              className="panel-canvas"
            />
          </div>
        </div>

        {/* Opponent area + AI thinking */}
        <div>
          <div className="opponent-panel">
            <p className="opponent-name">
              {usePlayerStore.getState().opponentEnterpriseId ?? 'Opponent'}
            </p>
            <div className="opponent-frame">
              <canvas
                ref={opponentCanvasRef}
                width={Renderer.miniFieldWidth}
                height={Renderer.miniFieldHeight}
                data-testid="opponent-canvas"
              />
            </div>
            <div className="opponent-stats">
              <span data-testid="opponent-score">Score: {opponentScore}</span>
              <span data-testid="opponent-lines">Lines: {opponentLines}</span>
              <span data-testid="opponent-level">Lv: {opponentLevel}</span>
            </div>
          </div>

          {aiThinkingLog.length > 0 && (
            <div className="ai-thinking-panel" data-testid="ai-thinking-panel">
              {aiThinkingLog.map((entry: AiThinkingEntry, idx: number) => (
                <div key={`${entry.timestamp}-${idx}`} className="ai-thinking-entry">
                  <span className="ai-thinking-model">{entry.model.split('.').pop()}</span>
                  <details className="ai-thinking-prompt">
                    <summary>Prompt</summary>
                    <pre>{entry.prompt}</pre>
                  </details>
                  <div className="ai-thinking-response">{entry.response}</div>
                </div>
              ))}
              <div ref={aiThinkingEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
