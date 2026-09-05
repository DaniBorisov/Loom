import webpush from 'web-push';

export interface PushSubscriptionLike {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type PushDeliveryOutcome =
  | 'delivered'
  | 'permanent-failure'
  | 'transient-failure';

interface PushDeliveryError extends Error {
  statusCode?: number;
  status?: number;
}

type SendFn = (
  subscription: PushSubscriptionLike,
  payload: Buffer
) => Promise<unknown>;

type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface DeliverPushInput {
  subscription: PushSubscriptionLike;
  payload: Buffer;
  /** Defaults to webpush.sendNotification. Injected in tests. */
  send?: SendFn;
  /** Defaults to a setTimeout sleep. Injected (no-op) in tests. */
  sleep?: SleepFn;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const statusOf = (error: unknown): number | undefined => {
  const e = error as PushDeliveryError;
  return e?.statusCode ?? e?.status;
};

/**
 * Deliver one push message with bounded exponential-backoff retry (DAN-45).
 *
 * - 410/404 (RFC 8030) are permanent: the subscription is dead (uninstalled,
 *   cleared data) — no retry; the caller should delete the row.
 * - Anything else is transient: retry up to maxAttempts, then report
 *   transient-failure so the caller keeps the row for next time.
 */
export const deliverPush = async ({
  subscription,
  payload,
  send = webpush.sendNotification,
  sleep = defaultSleep,
  maxAttempts = 3,
  baseDelayMs = 500,
}: DeliverPushInput): Promise<PushDeliveryOutcome> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await send(subscription, payload);
      return 'delivered';
    } catch (e) {
      const status = statusOf(e);

      if (status === 410 || status === 404) {
        return 'permanent-failure';
      }

      if (attempt === maxAttempts) {
        return 'transient-failure';
      }

      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  return 'transient-failure';
};
