import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PushSubscriptionLike } from '@server/lib/notifications/pushSender';
import { deliverPush } from '@server/lib/notifications/pushSender';

const subscription: PushSubscriptionLike = {
  endpoint: 'https://fcm.googleapis.com/push/test-endpoint',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

const payload = Buffer.from(JSON.stringify({ title: 'Test' }), 'utf-8');

const statusError = (statusCode: number) => {
  const error = new Error(`push failed with ${statusCode}`) as Error & {
    statusCode: number;
  };
  error.statusCode = statusCode;
  return error;
};

describe('deliverPush (DAN-45)', () => {
  it('reports delivered on a successful send with a single attempt', async () => {
    let calls = 0;

    const outcome = await deliverPush({
      subscription,
      payload,
      send: async () => {
        calls += 1;
      },
      sleep: async () => undefined,
    });

    assert.equal(outcome, 'delivered');
    assert.equal(calls, 1);
  });

  it('reports permanent-failure on 410 without retrying', async () => {
    let calls = 0;

    const outcome = await deliverPush({
      subscription,
      payload,
      send: async () => {
        calls += 1;
        throw statusError(410);
      },
      sleep: async () => undefined,
    });

    assert.equal(outcome, 'permanent-failure');
    assert.equal(calls, 1);
  });

  it('reports permanent-failure on 404 without retrying', async () => {
    const outcome = await deliverPush({
      subscription,
      payload,
      send: async () => {
        throw statusError(404);
      },
      sleep: async () => undefined,
    });

    assert.equal(outcome, 'permanent-failure');
  });

  it('retries a transient failure and reports delivered on recovery', async () => {
    let calls = 0;
    const slept: number[] = [];

    const outcome = await deliverPush({
      subscription,
      payload,
      send: async () => {
        calls += 1;
        if (calls === 1) {
          throw statusError(503);
        }
      },
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    assert.equal(outcome, 'delivered');
    assert.equal(calls, 2);
    assert.deepEqual(slept, [500]);
  });

  it('reports transient-failure after exhausting attempts with backoff', async () => {
    let calls = 0;
    const slept: number[] = [];

    const outcome = await deliverPush({
      subscription,
      payload,
      maxAttempts: 3,
      baseDelayMs: 100,
      send: async () => {
        calls += 1;
        throw statusError(500);
      },
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    assert.equal(outcome, 'transient-failure');
    assert.equal(calls, 3);
    assert.deepEqual(slept, [100, 200]);
  });
});
