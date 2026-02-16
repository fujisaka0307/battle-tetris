import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import LoginPage from './pages/LoginPage';
import TopPage from './pages/TopPage';
import LobbyPage from './pages/LobbyPage';
import BattlePage from './pages/BattlePage';
import ResultPage from './pages/ResultPage';
import NotFoundPage from './pages/NotFoundPage';
import DashboardPage from './pages/DashboardPage';

function AppRoutes() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  // /dashboard は認証不要で直接表示
  if (location.pathname === '/dashboard') {
    return <DashboardPage />;
  }

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
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/lobby/:roomId" element={<LobbyPage />} />
      <Route path="/battle/:roomId" element={<BattlePage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
