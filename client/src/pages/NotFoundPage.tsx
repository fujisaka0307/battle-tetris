import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-6xl font-bold text-gray-600 mb-4">404</h1>
      <p className="text-gray-400 mb-6">ページが見つかりません</p>
      <button
        onClick={() => navigate('/')}
        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded font-bold transition-colors"
        data-testid="go-home-btn"
      >
        トップへ戻る
      </button>
    </div>
  );
}
