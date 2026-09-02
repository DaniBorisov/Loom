import InstallAppPrompt from '@app/components/InstallAppPrompt';
import { isIOS } from '@app/utils/installPrompt';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renderPrompt = (props?: { applicationTitle?: string }) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <InstallAppPrompt {...props} />
    </IntlProvider>
  );

const dispatchBeforeInstallPrompt = () => {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  return event;
};

const setStoredDismissed = (value: boolean) => {
  window.localStorage.setItem('install-app-prompt-dismissed', String(value));
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('InstallAppPrompt', () => {
  it('renders nothing initially when no install prompt is available', () => {
    renderPrompt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the install prompt once beforeinstallprompt fires', async () => {
    renderPrompt();
    dispatchBeforeInstallPrompt();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('install-button')).toBeInTheDocument();
  });

  it('calls event.prompt() and hides the prompt on install', async () => {
    renderPrompt();
    const event = dispatchBeforeInstallPrompt();
    await waitFor(() => {
      expect(screen.getByTestId('install-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('install-button'));

    await waitFor(() => {
      expect(event.prompt).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('persists dismissal without reappearing on remount', async () => {
    const first = renderPrompt();
    dispatchBeforeInstallPrompt();
    await waitFor(() => {
      expect(screen.getByTestId('dont-show-again')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dont-show-again'));
    expect(window.localStorage.getItem('install-app-prompt-dismissed')).toBe(
      'true'
    );

    first.unmount();

    renderPrompt();
    dispatchBeforeInstallPrompt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show when already dismissed in storage', () => {
    setStoredDismissed(true);
    renderPrompt();
    dispatchBeforeInstallPrompt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('isIOS', () => {
  it('returns true for iPhone user agents', () => {
    expect(
      isIOS(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
      )
    ).toBe(true);
  });

  it('returns true for iPad user agents', () => {
    expect(
      isIOS(
        'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
      )
    ).toBe(true);
  });

  it('returns false for Android and desktop user agents', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36')).toBe(
      false
    );
    expect(isIOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isIOS(undefined)).toBe(false);
  });
});
