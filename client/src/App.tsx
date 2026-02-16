import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import LoginPage from './pages/LoginPage';
import TopPage from './pages/TopPage';
import LobbyPage from './pages/LobbyPage';
import BattlePage from './pages/BattlePage';
import ResultPage from './pages/ResultPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="top-page">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>認証中...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TopPage />} />
        <Route path="/lobby/:roomId" element={<LobbyPage />} />
        <Route path="/battle/:roomId" element={<BattlePage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
