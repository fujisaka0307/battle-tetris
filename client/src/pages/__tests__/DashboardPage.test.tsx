import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockEntry = {
  timestamp: '2026-02-16T08:00:00Z',
  commit: 'abc1234',
  runId: '12345678',
  ci: {
    unitTests: { total: 484, passed: 484, failed: 0 },
    e2eTests: { total: 77, passed: 77, failed: 0 },
  },
  quality: {
    coverage: 82.5,
    bugs: 0,
    codeSmells: 3,
    duplication: 1.2,
    qualityGate: 'OK',
  },
  security: {
    vulnerabilities: 0,
    securityHotspots: 0,
    zapAlerts: { high: 0, medium: 0, low: 2 },
    codeqlFindings: 0,
    gitleaksFindings: 0,
    npmAudit: { critical: 0, high: 0, moderate: 0, low: 0 },
  },
  lighthouse: {
    performance: 95,
    accessibility: 100,
    bestPractices: 100,
    seo: 100,
  },
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('Loading 状態が表示されること', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('fetch 成功時にカードが描画されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [mockEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });

    expect(screen.getByTestId('card-tests')).toBeInTheDocument();
    expect(screen.getByTestId('card-quality')).toBeInTheDocument();
    expect(screen.getByTestId('card-security')).toBeInTheDocument();
    expect(screen.getByTestId('card-lighthouse')).toBeInTheDocument();
  });

  it('fetch 失敗時にエラーが表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('HTTP 404 時にデータなし状態が表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument();
    });
  });

  it('HTTP 500 時にエラーが表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it('データなし時に空メッセージが表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument();
    });
  });

  it('外部リンクが正しい URL を持つこと', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [mockEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('link-allure')).toBeInTheDocument();
    });

    expect(screen.getByTestId('link-allure')).toHaveAttribute(
      'href',
      'https://fujisaka0307.github.io/battle-tetris',
    );
    expect(screen.getByTestId('link-security')).toHaveAttribute(
      'href',
      'https://github.com/fujisaka0307/battle-tetris/security',
    );
  });

  it('期間セレクタが機能すること', async () => {
    const oldEntry = {
      ...mockEntry,
      timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      commit: 'old1234',
    };
    const recentEntry = {
      ...mockEntry,
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      commit: 'new5678',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [oldEntry, recentEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });

    // Default is 30d, so only recentEntry should show
    expect(screen.getByTestId('dashboard-footer')).toHaveTextContent('new5678');

    // Switch to 7d
    await userEvent.click(screen.getByTestId('period-7d'));
    expect(screen.getByTestId('dashboard-footer')).toHaveTextContent('new5678');

    // Switch to 90d — both entries visible, latest is recentEntry
    await userEvent.click(screen.getByTestId('period-90d'));
    expect(screen.getByTestId('dashboard-footer')).toHaveTextContent('new5678');
  });

  it('戻るボタンでトップへナビゲートされること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [mockEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-back')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('dashboard-back'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('テスト結果の数値が正しく表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [mockEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('card-tests')).toBeInTheDocument();
    });

    expect(screen.getByTestId('card-tests')).toHaveTextContent('484 / 484');
    expect(screen.getByTestId('card-tests')).toHaveTextContent('77 / 77');
  });

  it('コード品質メトリクスが正しく表示されること', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [mockEntry] }),
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('card-quality')).toBeInTheDocument();
    });

    expect(screen.getByTestId('card-quality')).toHaveTextContent('82.5%');
  });
});
