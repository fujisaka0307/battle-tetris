import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';
import { useBattleStore } from '../stores/useBattleStore';

export default function ResultPage() {
  const navigate = useNavigate();
  const _nickname = usePlayerStore((s) => s.nickname);
  const score = useGameStore((s) => s.score);
  const level = useGameStore((s) => s.level);
  const lines = useGameStore((s) => s.lines);
  const _result = useBattleStore((s) => s.result);
  const opponentRematchRequested = useBattleStore((s) => s.opponentRematchRequested);

  // Determine win/lose based on connectionId not available client-side,
  // so we use the fact that if we sent GameOver, we lost.
  // The result.winner is a connectionId, which we don't have on client.
  // For now, we check GameStore gameState — if GameOver, we lost.
  const gameState = useGameStore((s) => s.gameState);
  const isWinner = gameState !== 'gameover';

  const handleRematch = useCallback(() => {
    signalRClient.sendRequestRematch();
    useBattleStore.getState().setOpponentRematchRequested(false);
  }, []);

  const handleGoTop = useCallback(() => {
    signalRClient.sendLeaveRoom();
    usePlayerStore.getState().reset();
    useGameStore.getState().reset();
    useBattleStore.getState().reset();
    navigate('/');
  }, [navigate]);

  // Listen for opponent rematch
  useEffect(() => {
    signalRClient.setHandlers({
      onOpponentRematch: () => {
        useBattleStore.getState().setOpponentRematchRequested(true);
      },
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      {/* Result */}
      <h1
        className={`text-7xl font-bold mb-6 ${isWinner ? 'text-yellow-400' : 'text-red-400'}`}
        data-testid="result-text"
      >
        {isWinner ? 'WIN' : 'LOSE'}
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-8 mb-8 text-center" data-testid="result-stats">
        <div>
          <p className="text-sm text-gray-400">Score</p>
          <p className="text-2xl font-bold" data-testid="result-score">{score}</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Lines</p>
          <p className="text-2xl font-bold" data-testid="result-lines">{lines}</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Level</p>
          <p className="text-2xl font-bold" data-testid="result-level">{level}</p>
        </div>
      </div>

      {/* Opponent rematch notification */}
      {opponentRematchRequested && (
        <p className="text-cyan-400 mb-4" data-testid="opponent-rematch">
          相手が再戦を要求しています！
        </p>
      )}

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleRematch}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded font-bold transition-colors"
          data-testid="rematch-btn"
        >
          再戦する
        </button>
        <button
          onClick={handleGoTop}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded font-bold transition-colors"
          data-testid="go-top-btn"
        >
          トップへ戻る
        </button>
      </div>
    </div>
  );
}
