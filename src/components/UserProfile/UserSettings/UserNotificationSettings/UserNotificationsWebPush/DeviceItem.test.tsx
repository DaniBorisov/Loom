import DeviceItem from '@app/components/UserProfile/UserSettings/UserNotificationSettings/UserNotificationsWebPush/DeviceItem';
import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const baseDevice = {
  endpoint: 'https://push.example/sub-1',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  userAgent: '',
  createdAt: new Date('2026-09-07T12:00:00Z'),
};

const renderItem = (userAgent: string) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <DeviceItem
        deletePushSubscriptionFromBackend={vi.fn()}
        device={{ ...baseDevice, userAgent }}
        subEndpoint="https://push.example/sub-1"
      />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DeviceItem name fallback', () => {
  it('shows "Browser on OS" for desktop user agents without a model', () => {
    renderItem(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    expect(screen.getByText('Chrome on Windows')).toBeTruthy();
  });

  it('prefers the device model when present (mobile)', () => {
    renderItem(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    );

    expect(screen.getByText('iPhone')).toBeTruthy();
  });

  it('shows Unknown when nothing is parseable', () => {
    renderItem('');

    expect(screen.getByText('Unknown')).toBeTruthy();
  });
});
