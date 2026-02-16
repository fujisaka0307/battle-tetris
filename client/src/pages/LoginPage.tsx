import { useAuth } from '../auth/useAuth';

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  return (
    <div className="top-page">
      <div className="top-header">
        <span className="top-logo-icon" aria-hidden="true">🎮</span>
        <h1 className="top-title">Battle Tetris</h1>
        <p className="top-subtitle">オンライン たいせん</p>
      </div>

      <div className="top-section" style={{ textAlign: 'center' }}>
        <p className="top-label" style={{ marginBottom: '1.5rem' }}>
          DXC SSO でログインしてください
        </p>
        <button
          onClick={login}
          disabled={isLoading}
          className="mode-btn mode-btn--cyan"
          data-testid="login-btn"
          style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}
        >
          {isLoading ? 'ログイン中...' : 'DXC SSO でログイン'}
        </button>
      </div>
    </div>
  );
}
