import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameState } from '@battle-tetris/shared';
import { GameEngine } from '../game/GameEngine';
import { Renderer } from '../game/Renderer';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';
import { useBattleStore } from '../stores/useBattleStore';

export default function BattlePage() {
  const navigate = useNavigate();
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const nickname = usePlayerStore((s) => s.nickname);
  const seed = useGameStore((s) => s.seed);
  const score = useGameStore((s) => s.score);
  const level = useGameStore((s) => s.level);
  const lines = useGameStore((s) => s.lines);
  const opponentField = useBattleStore((s) => s.opponentField);
  const opponentScore = useBattleStore((s) => s.opponentScore);
  const opponentLines = useBattleStore((s) => s.opponentLines);
  const opponentLevel = useBattleStore((s) => s.opponentLevel);
  const pendingGarbage = useBattleStore((s) => s.pendingGarbage);

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

  // Redirect if no nickname or seed
  useEffect(() => {
    if (!nickname) {
      navigate('/', { replace: true });
    }
  }, [nickname, navigate]);

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

  if (!nickname) return null;

  return (
    <div className="battle-container">
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        {/* Left sidebar: HOLD + STATS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '120px' }}>
          {/* HOLD panel */}
          <div className="game-panel">
            <div className="game-panel-label">Hold</div>
            <canvas
              ref={holdCanvasRef}
              width={Renderer.holdWidth}
              height={Renderer.holdHeight}
              style={{ display: 'block', margin: '0 auto' }}
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
        <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
          {/* Garbage bar */}
          <div className="garbage-bar" data-testid="garbage-bar" style={{ height: Renderer.fieldHeight + 4 }}>
            {pendingGarbage > 0 && (
              <div
                className="garbage-bar-fill"
                style={{ height: `${Math.min(pendingGarbage / 20, 1) * 100}%` }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '120px' }}>
          <div className="game-panel">
            <div className="game-panel-label">Next</div>
            <canvas
              ref={nextCanvasRef}
              width={Renderer.nextQueueWidth}
              height={Renderer.nextQueueHeight}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </div>
        </div>

        {/* Opponent area */}
        <div className="opponent-panel" style={{ marginLeft: '16px' }}>
          <p className="opponent-name">
            {usePlayerStore.getState().opponentNickname ?? 'Opponent'}
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
      </div>
    </div>
  );
}
