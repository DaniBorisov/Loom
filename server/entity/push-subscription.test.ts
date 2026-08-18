import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('UserPushSubscription keys refactor', () => {
  it('should save and read back keys as JSON', async () => {
    const userRepo = getRepository(User);
    const subRepo = getRepository(UserPushSubscription);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const sub = await subRepo.save(
      new UserPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/test-1',
        keys: { p256dh: 'key-p256dh-1', auth: 'key-auth-1' },
        userAgent: 'Chrome/120',
        user,
      })
    );

    const loaded = await subRepo.findOneByOrFail({ id: sub.id });
    assert.deepEqual(loaded.keys, {
      p256dh: 'key-p256dh-1',
      auth: 'key-auth-1',
    });
  });

  it('should enforce global endpoint uniqueness', async () => {
    const userRepo = getRepository(User);
    const subRepo = getRepository(UserPushSubscription);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await subRepo.save(
      new UserPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/dup-endpoint',
        keys: { p256dh: 'dup-key-1', auth: 'dup-auth-1' },
        user,
      })
    );

    // Different user, same endpoint — should fail
    const otherUser = new User();
    otherUser.email = 'dup-test@seerr.dev';
    otherUser.username = 'dup-test-user';
    otherUser.avatar = '';
    const savedUser = await userRepo.save(otherUser);

    try {
      await subRepo.save(
        new UserPushSubscription({
          endpoint: 'https://fcm.googleapis.com/push/dup-endpoint',
          keys: { p256dh: 'dup-key-2', auth: 'dup-auth-2' },
          user: savedUser,
        })
      );
      assert.fail('Should have thrown unique constraint error');
    } catch {
      // Expected: unique constraint violation
    }
  });

  it('should list subscriptions for a specific user', async () => {
    const userRepo = getRepository(User);
    const subRepo = getRepository(UserPushSubscription);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    // Clean up any prior test subscriptions
    const existing = await subRepo.find({ where: { user: { id: user.id } } });
    if (existing.length > 0) {
      await subRepo.remove(existing);
    }

    await subRepo.save(
      new UserPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/list-1',
        keys: { p256dh: 'list-key-1', auth: 'list-auth-1' },
        user,
      })
    );
    await subRepo.save(
      new UserPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/list-2',
        keys: { p256dh: 'list-key-2', auth: 'list-auth-2' },
        user,
      })
    );

    const subs = await subRepo.find({ where: { user: { id: user.id } } });
    assert.equal(subs.length, 2);
  });

  it('should delete a subscription', async () => {
    const userRepo = getRepository(User);
    const subRepo = getRepository(UserPushSubscription);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const sub = await subRepo.save(
      new UserPushSubscription({
        endpoint: 'https://fcm.googleapis.com/push/delete-me',
        keys: { p256dh: 'del-key', auth: 'del-auth' },
        user,
      })
    );

    await subRepo.remove(sub);
    const found = await subRepo.findOneBy({ id: sub.id });
    assert.equal(found, null);
  });
});
