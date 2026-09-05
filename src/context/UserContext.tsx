import type { User } from '@app/hooks/useUser';
import { useUser } from '@app/hooks/useUser';
import { useRouter } from 'next/dist/client/router';
import { useEffect, useRef } from 'react';

interface UserContextProps {
  initialUser: User;
  children?: React.ReactNode;
}

/**
 * This UserContext serves the purpose of just preparing the useUser hooks
 * cache on server side render. It also will handle redirecting the user to
 * the login page if their session ever becomes invalid.
 */
export const UserContext = ({ initialUser, children }: UserContextProps) => {
  const { user, error, revalidate } = useUser({ initialData: initialUser });
  const router = useRouter();
  const routing = useRef(false);

  useEffect(() => {
    revalidate();
  }, [router.pathname, revalidate]);

  useEffect(() => {
    if (router.pathname.match(/(setup|login|resetpassword)/)) {
      return;
    }
    if (routing.current) {
      return;
    }
    // Only redirect when the session is actually invalid — not when the
    // server is simply unreachable (DAN-96). A transport-level failure
    // (no response) means "server down", in which case navigating to /login
    // would just destroy the open tab; StatusChecker's connection-lost
    // banner is the correct signal there.
    const status = (
      error as unknown as { response?: { status?: number } } | undefined
    )?.response?.status;
    const sessionInvalid =
      !user || status === 401 || status === 403;
    if (sessionInvalid) {
      routing.current = true;
      location.href = '/login';
    }
  }, [router, user, error]);

  return <>{children}</>;
};
