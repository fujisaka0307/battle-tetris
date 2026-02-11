import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TopPage from './pages/TopPage';
import LobbyPage from './pages/LobbyPage';
import BattlePage from './pages/BattlePage';
import ResultPage from './pages/ResultPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
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
