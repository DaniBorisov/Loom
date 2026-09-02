import InstallAppPrompt from '@app/components/InstallAppPrompt';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/utils/installPrompt', () => ({
  isIOS: () => true,
}));

const renderPrompt = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <InstallAppPrompt applicationTitle="MyApp" />
    </IntlProvider>
  );

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InstallAppPrompt iOS fallback', () => {
  it('shows manual instructions on iOS without an Install button', async () => {
    renderPrompt();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('install-button')).not.toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('dismisses and persists on iOS', async () => {
    renderPrompt();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('dont-show-again'));
    expect(window.localStorage.getItem('install-app-prompt-dismissed')).toBe(
      'true'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
