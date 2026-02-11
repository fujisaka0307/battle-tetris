import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderNotFoundPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('404 テキストが表示されること', () => {
    renderNotFoundPage();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('トップへ戻るボタンで / にナビゲートされること', async () => {
    renderNotFoundPage();
    await userEvent.click(screen.getByTestId('go-home-btn'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
