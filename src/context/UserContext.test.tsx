import { UserContext } from '@app/context/UserContext';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dist/client/router', () => ({
  useRouter: () => ({ pathname: '/' }),
}));

const mockUseUserState: {
  user?: { id: number };
  error?: unknown;
} = {};

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    user: mockUseUserState.user,
    error: mockUseUserState.error,
    revalidate: vi.fn(),
    hasPermission: () => false,
  }),
}));

const locationStub = { href: 'http://localhost/' };
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

const renderContext = () =>
  render(
    <UserContext initialUser={mockUseUserState.user as never}>
      <div />
    </UserContext>
  );

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...locationStub },
    writable: true,
    configurable: true,
  });
  mockUseUserState.user = { id: 1 };
  mockUseUserState.error = undefined;
});

afterEach(() => {
  cleanup();
  if (originalLocation) {
    Object.defineProperty(window, 'location', originalLocation);
  }
  mockUseUserState.user = undefined;
  mockUseUserState.error = undefined;
});

const currentHref = () =>
  (window.location as unknown as { href: string }).href;

describe('UserContext session redirect (DAN-96)', () => {
  it('stays put on transport errors (server down, no response)', () => {
    mockUseUserState.error = new Error('Network Error');
    renderContext();
    expect(currentHref()).not.toContain('/login');
  });

  it('redirects to login on a 401 (session actually invalid)', () => {
    mockUseUserState.error = Object.assign(
      new Error('Request failed with status code 401'),
      { response: { status: 401 } }
    );
    renderContext();
    expect(currentHref()).toBe('/login');
  });

  it('redirects to login when there is no user at all', () => {
    mockUseUserState.user = undefined;
    renderContext();
    expect(currentHref()).toBe('/login');
  });

  it('stays put when healthy', () => {
    renderContext();
    expect(currentHref()).not.toContain('/login');
  });
});
