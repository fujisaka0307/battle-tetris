import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const METRICS_URL =
  'https://fujisaka0307.github.io/battle-tetris/metrics-history.json';

const SONARCLOUD_PROJECT_KEY =
  import.meta.env.VITE_SONARCLOUD_PROJECT_KEY || '';

const EXTERNAL_LINKS = {
  allure: 'https://fujisaka0307.github.io/battle-tetris',
  sonarcloud: SONARCLOUD_PROJECT_KEY
    ? `https://sonarcloud.io/project/overview?id=${SONARCLOUD_PROJECT_KEY}`
    : '',
  security: 'https://github.com/fujisaka0307/battle-tetris/security',
};

interface TestCounts {
  total: number;
  passed: number;
  failed: number;
}

interface MetricsEntry {
  timestamp: string;
  commit: string;
  runId: string;
  ci: {
    unitTests: TestCounts;
    e2eTests: TestCounts;
  };
  quality: {
    coverage: number | null;
    bugs: number | null;
    codeSmells: number | null;
    duplication: number | null;
    qualityGate: string | null;
  };
  security: {
    vulnerabilities: number | null;
    securityHotspots: number | null;
    zapAlerts: { high: number; medium: number; low: number };
    codeqlFindings: number | null;
    gitleaksFindings: number | null;
    npmAudit: { critical: number; high: number; moderate: number; low: number };
  };
  lighthouse: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
}

interface MetricsHistory {
  entries: MetricsEntry[];
}

type Period = '7d' | '30d' | '90d' | '1y';

const PERIOD_DAYS: Record<Period, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7日',
  '30d': '30日',
  '90d': '90日',
  '1y': '1年',
};

function Sparkline({
  data,
  color,
  width = 200,
  height = 40,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      className="dashboard-sparkline"
      width={width}
      height={height}
      role="img"
      aria-label="Sparkline chart"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusClass(ok: boolean): string {
  return ok ? 'dashboard-card--ok' : 'dashboard-card--warning';
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    fetch(METRICS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: MetricsHistory) => setData(json))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const cutoff = Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
    return data.entries.filter(
      (e) => new Date(e.timestamp).getTime() > cutoff,
    );
  }, [data, period]);

  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : null;

  if (loading) {
    return (
      <div className="dashboard-page" data-testid="dashboard-loading">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page" data-testid="dashboard-error">
        <div className="dashboard-header">
          <h1 className="dashboard-title">CI/CD Dashboard</h1>
          <button
            onClick={() => navigate('/')}
            className="dashboard-back-link"
            data-testid="dashboard-back"
          >
            ← トップへ戻る
          </button>
        </div>
        <div className="dashboard-error-box">
          <p>データの取得に失敗しました: {error}</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            CI パイプラインが実行されるとデータが表示されます。
          </p>
        </div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="dashboard-page" data-testid="dashboard-empty">
        <div className="dashboard-header">
          <h1 className="dashboard-title">CI/CD Dashboard</h1>
          <button
            onClick={() => navigate('/')}
            className="dashboard-back-link"
            data-testid="dashboard-back"
          >
            ← トップへ戻る
          </button>
        </div>
        <div className="dashboard-error-box">
          <p>まだデータがありません。</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            CI パイプラインが実行されるとデータが表示されます。
          </p>
        </div>
      </div>
    );
  }

  const unitPassRate =
    latest.ci.unitTests.total > 0
      ? (latest.ci.unitTests.passed / latest.ci.unitTests.total) * 100
      : 0;
  const e2ePassRate =
    latest.ci.e2eTests.total > 0
      ? (latest.ci.e2eTests.passed / latest.ci.e2eTests.total) * 100
      : 0;

  const totalSecurityIssues =
    (latest.security.vulnerabilities ?? 0) +
    latest.security.zapAlerts.high +
    latest.security.zapAlerts.medium +
    (latest.security.codeqlFindings ?? 0) +
    (latest.security.gitleaksFindings ?? 0) +
    latest.security.npmAudit.critical +
    latest.security.npmAudit.high;

  return (
    <div className="dashboard-page" data-testid="dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">CI/CD Dashboard</h1>
        <button
          onClick={() => navigate('/')}
          className="dashboard-back-link"
          data-testid="dashboard-back"
        >
          ← トップへ戻る
        </button>
      </div>

      {/* External Links */}
      <div className="dashboard-links" data-testid="dashboard-links">
        <a
          href={EXTERNAL_LINKS.allure}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-ext-link"
          data-testid="link-allure"
        >
          Allure Report
        </a>
        {EXTERNAL_LINKS.sonarcloud && (
          <a
            href={EXTERNAL_LINKS.sonarcloud}
            target="_blank"
            rel="noopener noreferrer"
            className="dashboard-ext-link"
            data-testid="link-sonarcloud"
          >
            SonarCloud
          </a>
        )}
        <a
          href={EXTERNAL_LINKS.security}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-ext-link"
          data-testid="link-security"
        >
          GitHub Security
        </a>
      </div>

      {/* Period Selector */}
      <div className="dashboard-period" data-testid="dashboard-period">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            className={`dashboard-period-btn${period === p ? ' dashboard-period-btn--active' : ''}`}
            onClick={() => setPeriod(p)}
            data-testid={`period-${p}`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Metric Cards Grid */}
      <div className="dashboard-grid">
        {/* Tests Card */}
        <div
          className={`dashboard-card ${statusClass(latest.ci.unitTests.failed === 0 && latest.ci.e2eTests.failed === 0)}`}
          data-testid="card-tests"
        >
          <h2 className="dashboard-card-title">テスト</h2>
          <div className="dashboard-card-body">
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Unit</span>
              <span className="dashboard-metric-value">
                {latest.ci.unitTests.passed} / {latest.ci.unitTests.total}
              </span>
              <span className="dashboard-metric-badge">
                {unitPassRate.toFixed(0)}%
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">E2E</span>
              <span className="dashboard-metric-value">
                {latest.ci.e2eTests.passed} / {latest.ci.e2eTests.total}
              </span>
              <span className="dashboard-metric-badge">
                {e2ePassRate.toFixed(0)}%
              </span>
            </div>
            <Sparkline
              data={filtered.map((e) => e.ci.unitTests.passed)}
              color="#00e5ff"
            />
          </div>
        </div>

        {/* Code Quality Card */}
        <div
          className={`dashboard-card ${statusClass(latest.quality.qualityGate === 'OK' || latest.quality.qualityGate === null)}`}
          data-testid="card-quality"
        >
          <h2 className="dashboard-card-title">コード品質</h2>
          <div className="dashboard-card-body">
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Coverage</span>
              <span className="dashboard-metric-value">
                {latest.quality.coverage !== null
                  ? `${latest.quality.coverage}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Bugs</span>
              <span className="dashboard-metric-value">
                {latest.quality.bugs ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Code Smells</span>
              <span className="dashboard-metric-value">
                {latest.quality.codeSmells ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Duplication</span>
              <span className="dashboard-metric-value">
                {latest.quality.duplication !== null
                  ? `${latest.quality.duplication}%`
                  : 'N/A'}
              </span>
            </div>
            <Sparkline
              data={filtered
                .map((e) => e.quality.coverage)
                .filter((v): v is number => v !== null)}
              color="#4caf50"
            />
          </div>
        </div>

        {/* Security Card */}
        <div
          className={`dashboard-card ${statusClass(totalSecurityIssues === 0)}`}
          data-testid="card-security"
        >
          <h2 className="dashboard-card-title">セキュリティ</h2>
          <div className="dashboard-card-body">
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Vulnerabilities</span>
              <span className="dashboard-metric-value">
                {latest.security.vulnerabilities ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">ZAP Alerts</span>
              <span className="dashboard-metric-value">
                {latest.security.zapAlerts.high}H /{' '}
                {latest.security.zapAlerts.medium}M /{' '}
                {latest.security.zapAlerts.low}L
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">npm audit</span>
              <span className="dashboard-metric-value">
                {latest.security.npmAudit.critical}C /{' '}
                {latest.security.npmAudit.high}H /{' '}
                {latest.security.npmAudit.moderate}M
              </span>
            </div>
            <Sparkline
              data={filtered.map(
                (e) =>
                  (e.security.vulnerabilities ?? 0) +
                  e.security.zapAlerts.high +
                  e.security.zapAlerts.medium,
              )}
              color="#ff4081"
            />
          </div>
        </div>

        {/* Lighthouse Card */}
        <div
          className={`dashboard-card ${statusClass((latest.lighthouse.performance ?? 0) >= 50)}`}
          data-testid="card-lighthouse"
        >
          <h2 className="dashboard-card-title">Lighthouse</h2>
          <div className="dashboard-card-body">
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Performance</span>
              <span className="dashboard-metric-value">
                {latest.lighthouse.performance ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Accessibility</span>
              <span className="dashboard-metric-value">
                {latest.lighthouse.accessibility ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">Best Practices</span>
              <span className="dashboard-metric-value">
                {latest.lighthouse.bestPractices ?? 'N/A'}
              </span>
            </div>
            <div className="dashboard-metric-row">
              <span className="dashboard-metric-label">SEO</span>
              <span className="dashboard-metric-value">
                {latest.lighthouse.seo ?? 'N/A'}
              </span>
            </div>
            <Sparkline
              data={filtered
                .map((e) => e.lighthouse.performance)
                .filter((v): v is number => v !== null)}
              color="#7c4dff"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer" data-testid="dashboard-footer">
        最終更新: {formatTimestamp(latest.timestamp)} ({latest.commit})
      </div>
    </div>
  );
}
