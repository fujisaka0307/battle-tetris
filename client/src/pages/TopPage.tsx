import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH, ROOM_ID_LENGTH } from '@battle-tetris/shared';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';

export default function TopPage() {
  const navigate = useNavigate();
  const { setNickname: storeNickname, setRoomId } = usePlayerStore();

  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId_] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const nicknameValid =
    nickname.trim().length >= NICKNAME_MIN_LENGTH &&
    nickname.trim().length <= NICKNAME_MAX_LENGTH;

  const roomIdValid = /^[A-Za-z0-9]{6}$/.test(roomId);

  const nicknameError =
    nickname.length > NICKNAME_MAX_LENGTH
      ? `ニックネームは${NICKNAME_MAX_LENGTH}文字以内で入力してください`
      : '';

  const ensureConnected = useCallback(async () => {
    if (signalRClient.state === 'connected') return true;
    setIsConnecting(true);
    try {
      const url = import.meta.env.VITE_SIGNALR_URL || '/hub';
      await signalRClient.connect(url);
      return true;
    } catch {
      setError('サーバーに接続できませんでした');
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!nicknameValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onRoomCreated: (payload) => {
        setRoomId(payload.roomId);
        navigate(`/lobby/${payload.roomId}`);
      },
      onError: (payload) => setError(payload.message),
    });

    signalRClient.sendCreateRoom(trimmed);
  }, [nickname, nicknameValid, storeNickname, ensureConnected, setRoomId, navigate]);

  const handleJoinRoom = useCallback(async () => {
    if (!nicknameValid || !roomIdValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(roomId.toUpperCase());
        usePlayerStore.getState().setOpponentNickname(payload.nickname);
        navigate(`/lobby/${roomId.toUpperCase()}`);
      },
      onError: (payload) => setError(payload.message),
    });

    signalRClient.sendJoinRoom(trimmed, roomId.toUpperCase());
  }, [nickname, nicknameValid, roomId, roomIdValid, storeNickname, ensureConnected, setRoomId, navigate]);

  const handleRandomMatch = useCallback(async () => {
    if (!nicknameValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onMatchFound: (payload) => {
        setRoomId(payload.roomId);
        usePlayerStore.getState().setOpponentNickname(payload.opponentNickname);
        navigate(`/lobby/${payload.roomId}`);
      },
      onError: (payload) => setError(payload.message),
    });

    signalRClient.sendJoinRandomMatch(trimmed);
  }, [nickname, nicknameValid, storeNickname, ensureConnected, setRoomId, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-bold mb-2 text-cyan-400">Battle Tetris</h1>
      <p className="text-gray-400 mb-8">Online</p>

      {/* Nickname input */}
      <div className="w-full max-w-sm mb-6">
        <label htmlFor="nickname" className="block text-sm text-gray-300 mb-1">
          ニックネーム
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX_LENGTH + 1}
          placeholder="1〜16文字"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
          data-testid="nickname-input"
        />
        {nicknameError && (
          <p className="text-red-400 text-sm mt-1" data-testid="nickname-error">
            {nicknameError}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleCreateRoom}
          disabled={!nicknameValid || isConnecting}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
          data-testid="create-room-btn"
        >
          ルームを作成
        </button>

        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId_(e.target.value.toUpperCase())}
            maxLength={ROOM_ID_LENGTH}
            placeholder="ルームID (6桁)"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 uppercase"
            data-testid="room-id-input"
          />
          <button
            onClick={handleJoinRoom}
            disabled={!nicknameValid || !roomIdValid || isConnecting}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
            data-testid="join-room-btn"
          >
            参加
          </button>
        </div>

        <button
          onClick={handleRandomMatch}
          disabled={!nicknameValid || isConnecting}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
          data-testid="random-match-btn"
        >
          ランダムマッチ
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 mt-4" data-testid="error-message">
          {error}
        </p>
      )}

      {isConnecting && (
        <p className="text-gray-400 mt-4">接続中...</p>
      )}
    </div>
  );
}
