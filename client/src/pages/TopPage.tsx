import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROOM_ID_LENGTH } from '@battle-tetris/shared';
import type { WaitingRoomInfo, RankingEntry, MatchHistoryEntry } from '@battle-tetris/shared';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useGameStore } from '../stores/useGameStore';
import { useAuth } from '../auth/useAuth';

export default function TopPage() {
  const navigate = useNavigate();
  const { setEnterpriseId: storeEnterpriseId, setRoomId } = usePlayerStore();
  const { enterpriseId, logout, getToken } = useAuth();

  const [roomId, setRoomId_] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [waitingRooms, setWaitingRooms] = useState<WaitingRoomInfo[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [aiLevel, setAiLevel] = useState(5);
  const subscribedRef = useRef(false);
  const connectingPromiseRef = useRef<Promise<boolean> | null>(null);

  const roomIdValid = /^[A-Za-z0-9]{6}$/.test(roomId);

  const ensureConnected = useCallback(async () => {
    if (signalRClient.state === 'connected') return true;
    if (connectingPromiseRef.current) return connectingPromiseRef.current;
    setIsConnecting(true);
    const promise = (async () => {
      try {
        const url = import.meta.env.VITE_SIGNALR_URL || '/hub';
        const token = await getToken();
        if (token) {
          await signalRClient.connect(url, async () => token);
        } else {
          await signalRClient.connect(url);
        }
        return true;
      } catch {
        setError('サーバーに接続できませんでした');
        return false;
      } finally {
        setIsConnecting(false);
        connectingPromiseRef.current = null;
      }
    })();
    connectingPromiseRef.current = promise;
    return promise;
  }, [getToken]);

  // Enterprise ID をストアに保存
  useEffect(() => {
    if (enterpriseId) {
      storeEnterpriseId(enterpriseId);
    }
  }, [enterpriseId, storeEnterpriseId]);

  // 早期接続とルームリスト・リーダーボード購読
  useEffect(() => {
    let cancelled = false;
    const connectAndSubscribe = async () => {
      const connected = await ensureConnected();
      if (!cancelled && connected && signalRClient.state === 'connected') {
        signalRClient.setHandlers({
          onWaitingRoomListUpdated: (payload) => {
            if (!cancelled) setWaitingRooms(payload.rooms);
          },
          onLeaderboardUpdated: (payload) => {
            if (!cancelled) setRankings(payload.rankings);
          },
          onMatchHistoryUpdated: (payload) => {
            if (!cancelled) setMatchHistory(payload.matches);
          },
        });
        signalRClient.sendSubscribeRoomList();
        signalRClient.sendSubscribeLeaderboard();
        subscribedRef.current = true;
        setIsReady(true);
      }
    };
    connectAndSubscribe();
    return () => {
      cancelled = true;
      if (subscribedRef.current) {
        signalRClient.sendUnsubscribeRoomList();
        signalRClient.sendUnsubscribeLeaderboard();
        subscribedRef.current = false;
      }
    };
  }, [ensureConnected]);

  const subscribeIfNeeded = useCallback(() => {
    if (!subscribedRef.current && signalRClient.state === 'connected') {
      signalRClient.sendSubscribeRoomList();
      subscribedRef.current = true;
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onRoomCreated: (payload) => {
        setRoomId(payload.roomId);
        navigate(`/lobby/${payload.roomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onLeaderboardUpdated: (payload) => setRankings(payload.rankings),
      onMatchHistoryUpdated: (payload) => setMatchHistory(payload.matches),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendCreateRoom();
  }, [ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinRoom = useCallback(async () => {
    if (!roomIdValid) return;
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(roomId.toUpperCase());
        usePlayerStore.getState().setOpponentEnterpriseId(payload.enterpriseId);
        navigate(`/lobby/${roomId.toUpperCase()}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onLeaderboardUpdated: (payload) => setRankings(payload.rankings),
      onMatchHistoryUpdated: (payload) => setMatchHistory(payload.matches),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(roomId.toUpperCase());
  }, [roomId, roomIdValid, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinFromList = useCallback(async (targetRoomId: string) => {
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(targetRoomId);
        usePlayerStore.getState().setOpponentEnterpriseId(payload.enterpriseId);
        navigate(`/lobby/${targetRoomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onLeaderboardUpdated: (payload) => setRankings(payload.rankings),
      onMatchHistoryUpdated: (payload) => setMatchHistory(payload.matches),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(targetRoomId);
  }, [ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleCreateAiRoom = useCallback(async () => {
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onRoomCreated: (payload) => {
        setRoomId(payload.roomId);
        navigate(`/lobby/${payload.roomId}`);
      },
      onOpponentJoined: (payload) => {
        usePlayerStore.getState().setOpponentEnterpriseId(payload.enterpriseId);
      },
      onBothReady: (payload) => {
        useGameStore.getState().setSeed(payload.seed);
        useGameStore.getState().setPendingCountdown(payload.countdown);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onLeaderboardUpdated: (payload) => setRankings(payload.rankings),
      onMatchHistoryUpdated: (payload) => setMatchHistory(payload.matches),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendCreateAiRoom(aiLevel);
  }, [aiLevel, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  return (
    <div className="top-page">
      {/* ---- 左上 設定ボタン (CI/CD Dashboard) ---- */}
      <button
        onClick={() => navigate('/dashboard')}
        className="top-settings-btn"
        data-testid="dashboard-link"
        title="CI/CD Dashboard"
        aria-label="CI/CD Dashboard"
      >
        ⚙️
      </button>

      {/* ---- ヘッダー ---- */}
      <div className="top-header">
        <span className="top-logo-icon" aria-hidden="true">🎮</span>
        <h1 className="top-title">Battle Tetris</h1>
        <p className="top-subtitle">オンライン たいせん</p>
      </div>

      {/* ---- Enterprise ID バッジ + ログアウト ---- */}
      <div className="top-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="top-enterprise-badge" data-testid="enterprise-id">
          {enterpriseId}
        </span>
        <button
          onClick={logout}
          className="top-logout-btn"
          data-testid="logout-btn"
        >
          ログアウト
        </button>
      </div>

      {/* ---- モードカード ---- */}
      <div className="top-cards">
        {/* カード1 — ルーム作成 */}
        <div className="mode-card mode-card--cyan">
          <span className="mode-card-icon" aria-hidden="true">🏠</span>
          <div className="mode-card-body">
            <p className="mode-card-title">へやを つくる</p>
            <p className="mode-card-desc">あたらしい へやを つくって ともだちを まとう</p>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={!isReady || isConnecting}
            className="mode-btn mode-btn--cyan"
            data-testid="create-room-btn"
          >
            つくる
          </button>
        </div>

        {/* カード2 — ルーム参加 */}
        <div className="mode-card mode-card--green">
          <span className="mode-card-icon" aria-hidden="true">🔑</span>
          <div className="mode-card-body">
            <p className="mode-card-title">へやに はいる</p>
            <p className="mode-card-desc">ともだちの へやIDを いれて さんかしよう</p>
            <div className="mode-card-join-row">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId_(e.target.value.toUpperCase())}
                maxLength={ROOM_ID_LENGTH}
                placeholder="へやID (6もじ)"
                className="top-room-input"
                data-testid="room-id-input"
                aria-label="へやID"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomIdValid || !isReady || isConnecting}
                className="mode-btn mode-btn--green mode-btn--small"
                data-testid="join-room-btn"
              >
                はいる
              </button>
            </div>
          </div>
        </div>

        {/* カード3 — AI対戦 */}
        <div className="mode-card mode-card--purple">
          <span className="mode-card-icon" aria-hidden="true">🤖</span>
          <div className="mode-card-body">
            <p className="mode-card-title">AI と たいせん</p>
            <p className="mode-card-desc">つよさを えらんで AIと しょうぶ！</p>
            <div className="mode-card-join-row">
              <select
                value={aiLevel}
                onChange={(e) => setAiLevel(Number(e.target.value))}
                className="top-ai-select"
                data-testid="ai-level-select"
                aria-label="AIレベル"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
                  <option key={lv} value={lv}>
                    Lv.{lv}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateAiRoom}
                disabled={!isReady || isConnecting}
                className="mode-btn mode-btn--purple mode-btn--small"
                data-testid="ai-battle-btn"
              >
                たいせん
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ---- 待機中ルームリスト ---- */}
      {waitingRooms.length > 0 && (
        <div className="top-section top-waiting" data-testid="waiting-room-list">
          <h2 className="top-label">まっている へや</h2>
          <div className="top-waiting-list">
            {waitingRooms.map((room) => (
              <div
                key={room.roomId}
                className="waiting-card"
                data-testid="waiting-room-item"
              >
                <div className="waiting-card-info">
                  <span className="waiting-card-id" data-testid="waiting-room-id">
                    {room.roomId}
                  </span>
                  <span className="waiting-card-creator" data-testid="waiting-room-creator">
                    {room.creatorEnterpriseId}
                  </span>
                </div>
                <button
                  onClick={() => handleJoinFromList(room.roomId)}
                  disabled={!isReady || isConnecting}
                  className="mode-btn mode-btn--green mode-btn--small"
                  data-testid="waiting-room-join-btn"
                >
                  はいる
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- ランキング & 対戦履歴 ---- */}
      <div className="top-stats-row">
        {/* ランキング */}
        <div className="top-section top-ranking" data-testid="ranking-list">
          <h2 className="top-label">ランキング</h2>
          {rankings.length > 0 ? (
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>プレイヤー</th>
                  <th>W</th>
                  <th>L</th>
                  <th>しょうりつ</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => (
                  <tr key={r.enterpriseId} className="ranking-row" data-testid="ranking-item">
                    <td className="ranking-rank">{r.rank}</td>
                    <td className="ranking-player">{r.enterpriseId}</td>
                    <td className="ranking-wins">{r.wins}</td>
                    <td className="ranking-losses">{r.losses}</td>
                    <td className="ranking-rate">{r.winRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="top-empty" data-testid="ranking-empty">まだ きろくが ありません</p>
          )}
        </div>

        {/* 対戦履歴 */}
        <div className="top-section top-history" data-testid="match-history">
          <h2 className="top-label">たいせん りれき</h2>
          {matchHistory.length > 0 ? (
            <div className="history-list">
              {matchHistory.map((m) => (
                <div key={m.id} className="history-card" data-testid="history-item">
                  <div className="history-players">
                    <span className="history-winner">{m.winnerId}</span>
                    <span className="history-vs">VS</span>
                    <span className="history-loser">{m.loserId}</span>
                  </div>
                  <div className="history-details">
                    <span>{m.winnerScore} - {m.loserScore}</span>
                    {m.isAiMatch && <span className="history-ai-badge">AI</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="top-empty" data-testid="history-empty">まだ きろくが ありません</p>
          )}
        </div>
      </div>

      {/* ---- エラー / 接続中 ---- */}
      {error && (
        <p className="top-error" data-testid="error-message">
          {error}
        </p>
      )}

      {isConnecting && (
        <div className="top-connecting">
          <span className="top-connecting-dot" />
          <span>せつぞくちゅう...</span>
        </div>
      )}
    </div>
  );
}
