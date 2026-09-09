import UserWebPushSettings from '@app/components/UserProfile/UserSettings/UserNotificationSettings/UserNotificationsWebPush';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import useSWR from 'swr';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    user: { id: 1, displayName: 'Test User' },
    hasPermission: () => false,
  }),
  Permission: { ADMIN: 1 },
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: {
      vapidPublic: 'test-vapid-public-key',
      enablePushRegistration: true,
    },
  }),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {} }),
}));

const addToastMock = vi.fn();
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: addToastMock }),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const mockedUseSWR = useSWR as unknown as Mock;
const mockedPost = axios.post as unknown as Mock;

const notificationMock = {
  permission: 'default',
  requestPermission: vi.fn(),
};

const pushManagerMock = {
  subscribe: vi.fn(),
  getSubscription: vi.fn().mockResolvedValue(null),
};

const renderSettings = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <UserWebPushSettings />
    </IntlProvider>
  );

beforeEach(() => {
  localStorage.clear();

  Object.defineProperty(window, 'Notification', {
    value: notificationMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({ pushManager: pushManagerMock }),
    },
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
  });

  notificationMock.permission = 'default';
  notificationMock.requestPermission.mockReset();
  pushManagerMock.subscribe.mockReset();
  pushManagerMock.getSubscription.mockClear();
  pushManagerMock.getSubscription.mockResolvedValue(null);
  pushManagerMock.subscribe.mockResolvedValue({
    endpoint: 'https://push.example/sub-1',
    toJSON: () => ({
      endpoint: 'https://push.example/sub-1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }),
  });

  mockedUseSWR.mockImplementation((url: string) => {
    if (url.includes('/settings/notifications')) {
      return {
        data: {
          notificationTypes: { webpush: 2 },
          pgpKey: '',
          discordIds: [],
          pushbulletAccessToken: '',
          pushoverApplicationToken: '',
          pushoverUserKey: '',
          telegramChatId: '',
          telegramSendSilently: false,
          defaultNotifyOn: 'both',
        },
        error: undefined,
        mutate: vi.fn(),
      };
    }
    return { data: [], mutate: vi.fn() };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserNotificationsWebPush permission flow (DAN-44)', () => {
  it('renders the enable button with no guidance when permission is default', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Enable web push')).toBeTruthy();
    });
    expect(screen.queryByText('Notifications are blocked')).toBeNull();
  });

  it('shows browser-settings guidance and never subscribes when denied', async () => {
    notificationMock.permission = 'denied';
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Notifications are blocked')).toBeTruthy();
    });
    expect(
      screen.getByText(/allow notifications in your browser site settings/i)
    ).toBeTruthy();

    fireEvent.click(screen.getByText('Enable web push'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushManagerMock.subscribe).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalledWith(
      '/api/v1/user/registerPushSubscription',
      expect.anything()
    );
  });

  it('requests permission then subscribes and persists when default', async () => {
    notificationMock.permission = 'default';
    notificationMock.requestPermission.mockResolvedValue('granted');
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Enable web push')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Enable web push'));

    await waitFor(() => {
      expect(notificationMock.requestPermission).toHaveBeenCalled();
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/v1/user/registerPushSubscription',
        expect.objectContaining({
          endpoint: 'https://push.example/sub-1',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        })
      );
    });
    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Web push has been enabled.'),
      expect.anything()
    );
  });

  it('subscribes directly without prompting when already granted', async () => {
    notificationMock.permission = 'granted';
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Enable web push')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Enable web push'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/v1/user/registerPushSubscription',
        expect.anything()
      );
    });
    expect(notificationMock.requestPermission).not.toHaveBeenCalled();
  });

  it('shows guidance without subscribing when the prompt is denied', async () => {
    notificationMock.permission = 'default';
    notificationMock.requestPermission.mockImplementation(async () => {
      notificationMock.permission = 'denied';
      return 'denied';
    });
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Enable web push')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Enable web push'));

    await waitFor(() => {
      expect(screen.getByText('Notifications are blocked')).toBeTruthy();
    });
    expect(pushManagerMock.subscribe).not.toHaveBeenCalled();
  });
});

describe('default notifyOn global setting (DAN-48)', () => {
  const settingsWithDefault = (defaultNotifyOn: string) => {
    mockedUseSWR.mockImplementation((url: string) => {
      if (url.includes('/settings/notifications')) {
        return {
          data: {
            notificationTypes: { webpush: 2 },
            pgpKey: '',
            discordIds: [],
            pushbulletAccessToken: '',
            pushoverApplicationToken: '',
            pushoverUserKey: '',
            telegramChatId: '',
            telegramSendSilently: false,
            defaultNotifyOn,
          },
          error: undefined,
          mutate: vi.fn(),
        };
      }
      return { data: [], mutate: vi.fn() };
    });
  };

  it('reflects the server default on load', async () => {
    settingsWithDefault('none');
    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });
    expect(
      (screen.getByTestId('notify-on-selector') as HTMLSelectElement).value
    ).toBe('none');
  });

  it('persists a changed default on save', async () => {
    settingsWithDefault('both');
    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('notify-on-selector'), {
      target: { value: 'episode_airing' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/v1/user/1/settings/notifications',
        expect.objectContaining({ defaultNotifyOn: 'episode_airing' })
      );
    });
  });
});
