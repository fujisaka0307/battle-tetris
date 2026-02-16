import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const enterpriseId = usePlayerStore((s) => s.enterpriseId);
  const opponentEnterpriseId = usePlayerStore((s) => s.opponentEnterpriseId);
  const setOpponentEnterpriseId = usePlayerStore((s) => s.setOpponentEnterpriseId);

  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if no enterpriseId
  useEffect(() => {
    if (!enterpriseId) {
      navigate('/', { replace: true });
    }
  }, [enterpriseId, navigate]);

  // Register SignalR handlers for lobby
  useEffect(() => {
    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setOpponentEnterpriseId(payload.enterpriseId);
      },
      onBothReady: (payload) => {
        useGameStore.getState().setSeed(payload.seed);
        startCountdown(payload.countdown);
      },
      onOpponentDisconnected: () => {
        setOpponentEnterpriseId(null);
        setIsReady(false);
        setCountdown(null);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      },
      onError: () => {},
    });

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [setOpponentEnterpriseId]);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          navigate(`/battle/${roomId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [navigate, roomId]);

  const handleReady = useCallback(() => {
    setIsReady(true);
    signalRClient.sendPlayerReady();
  }, []);

  const handleCopyRoomId = useCallback(async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }, [roomId]);

  const handleLeave = useCallback(() => {
    signalRClient.sendLeaveRoom();
    usePlayerStore.getState().setRoomId(null);
    usePlayerStore.getState().setOpponentEnterpriseId(null);
    navigate('/');
  }, [navigate]);

  if (!enterpriseId) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-3xl font-bold mb-6 text-cyan-400">ロビー</h2>

      {/* Room ID */}
      <div className="mb-6 text-center">
        <p className="text-sm text-gray-400 mb-1">ルームID</p>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-mono font-bold tracking-widest" data-testid="room-id">
            {roomId}
          </span>
          <button
            onClick={handleCopyRoomId}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            data-testid="copy-btn"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Players */}
      <div className="w-full max-w-sm mb-6">
        <div className="flex justify-between items-center py-2 px-4 bg-gray-800 rounded mb-2">
          <span>{enterpriseId} (あなた)</span>
          {isReady && <span className="text-green-400 text-sm">READY</span>}
        </div>
        <div className="flex justify-between items-center py-2 px-4 bg-gray-800 rounded">
          {opponentEnterpriseId ? (
            <span data-testid="opponent-name">{opponentEnterpriseId}</span>
          ) : (
            <span className="text-gray-500" data-testid="waiting-text">対戦相手を待っています...</span>
          )}
        </div>
      </div>

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div className="text-6xl font-bold text-yellow-400 mb-6" data-testid="countdown">
          {countdown}
        </div>
      )}
      {countdown === 0 && (
        <div className="text-6xl font-bold text-green-400 mb-6" data-testid="countdown-go">
          GO!
        </div>
      )}

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        {opponentEnterpriseId && !isReady && countdown === null && (
          <button
            onClick={handleReady}
            className="w-full py-3 bg-green-600 hover:bg-green-500 rounded font-bold transition-colors"
            data-testid="ready-btn"
          >
            Ready
          </button>
        )}
        {isReady && countdown === null && (
          <p className="text-center text-gray-400">相手の準備を待っています...</p>
        )}
        <button
          onClick={handleLeave}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          data-testid="leave-btn"
        >
          退出する
        </button>
      </div>
    </div>
  );
}
