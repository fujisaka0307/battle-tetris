import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GameState, FIELD_ROWS, FIELD_COLS, FIELD_ROWS_BUFFER } from '@battle-tetris/shared';
import { GameEngine } from '../game/GameEngine';
import { Renderer } from '../game/Renderer';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';
import { useBattleStore } from '../stores/useBattleStore';

export default function BattlePage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opponentCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
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
    const canvas = canvasRef.current;
    const opponentCanvas = opponentCanvasRef.current;
    if (!canvas || !opponentCanvas) return;

    const ctx = canvas.getContext('2d');
    const opCtx = opponentCanvas.getContext('2d');
    if (!ctx || !opCtx) return;

    const renderer = new Renderer(ctx);
    rendererRef.current = renderer;
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
      renderer.drawField({
        grid: engine.board.grid,
        currentPiece: piece,
        ghostRow: engine.getGhostRow(),
        nextPieces,
        holdPiece: engine.holdPiece,
      });

      // Draw next queue
      const nextX = Renderer.fieldWidth + 20;
      renderer.drawNextQueue(nextPieces, nextX, 30);

      // Draw hold
      renderer.drawHold(engine.holdPiece, nextX, 280);

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
    renderer.drawOpponentField({ grid: opponentField }, 0, 0);
  }, [opponentField]);

  if (!nickname) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="flex gap-8 items-start">
        {/* Main game area */}
        <div>
          <canvas
            ref={canvasRef}
            width={Renderer.fieldWidth + 150}
            height={Renderer.fieldHeight}
            className="border border-gray-700"
            data-testid="game-canvas"
          />
          {/* Score board */}
          <div className="mt-4 grid grid-cols-3 gap-4 text-center" data-testid="scoreboard">
            <div>
              <p className="text-sm text-gray-400">Score</p>
              <p className="text-xl font-bold" data-testid="score">{score}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Level</p>
              <p className="text-xl font-bold" data-testid="level">{level}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Lines</p>
              <p className="text-xl font-bold" data-testid="lines">{lines}</p>
            </div>
          </div>
          {/* Garbage indicator */}
          {pendingGarbage > 0 && (
            <div className="mt-2 text-center">
              <span className="text-red-400 text-sm">Garbage: {pendingGarbage}</span>
            </div>
          )}
        </div>

        {/* Opponent area */}
        <div>
          <p className="text-sm text-gray-400 mb-2 text-center">
            {usePlayerStore.getState().opponentNickname ?? 'Opponent'}
          </p>
          <canvas
            ref={opponentCanvasRef}
            width={Renderer.miniFieldWidth}
            height={Renderer.miniFieldHeight}
            className="border border-gray-700"
            data-testid="opponent-canvas"
          />
          <div className="mt-2 text-center text-xs text-gray-500">
            <p data-testid="opponent-score">Score: {opponentScore}</p>
            <p data-testid="opponent-lines">Lines: {opponentLines}</p>
            <p data-testid="opponent-level">Lv: {opponentLevel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
