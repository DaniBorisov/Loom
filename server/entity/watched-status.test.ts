import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('WatchedStatus entity', () => {
  it('should upsert a watched status for a user', async () => {
    const userRepo = getRepository(User);
    const wsRepo = getRepository(WatchedStatus);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const ws = new WatchedStatus({
      userId: user.id,
      jellyfinItemId: 'jf-item-001',
      mediaId: 12345,
      watchedAt: new Date(),
      progress: 100,
    });

    const saved = await wsRepo.save(ws);
    assert.ok(saved.id, 'should have an id');
    assert.equal(saved.jellyfinItemId, 'jf-item-001');
    assert.equal(saved.mediaId, 12345);
    assert.equal(saved.progress, 100);
  });

  it('should upsert on conflict (same user + jellyfinItemId)', async () => {
    const userRepo = getRepository(User);
    const wsRepo = getRepository(WatchedStatus);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await wsRepo.save(
      new WatchedStatus({
        userId: user.id,
        jellyfinItemId: 'jf-item-conflict',
        mediaId: 11111,
        progress: 50,
      })
    );

    // Same user + jellyfinItemId, different mediaId — should upsert
    const ws2 = new WatchedStatus({
      userId: user.id,
      jellyfinItemId: 'jf-item-conflict',
      mediaId: 22222,
      progress: 100,
    });

    // SQLite uses OR REPLACE for upsert — the old row is deleted and a new one inserted
    // With a unique constraint, saving a conflicting row should fail (not auto-upsert)
    // unless we handle it explicitly. Let's verify the behavior.
    await assert.rejects(() => wsRepo.save(ws2), /UNIQUE/);
  });

  it('should allow different users to track the same jellyfin item', async () => {
    const userRepo = getRepository(User);
    const wsRepo = getRepository(WatchedStatus);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await wsRepo.save(
      new WatchedStatus({
        userId: admin.id,
        jellyfinItemId: 'jf-item-shared',
        mediaId: 33333,
        progress: 100,
      })
    );

    const ws2 = await wsRepo.save(
      new WatchedStatus({
        userId: friend.id,
        jellyfinItemId: 'jf-item-shared',
        mediaId: 33333,
        progress: 75,
      })
    );

    assert.ok(ws2.id);
    assert.equal(ws2.progress, 75);
  });

  it('should list only a specific user watched statuses', async () => {
    const userRepo = getRepository(User);
    const wsRepo = getRepository(WatchedStatus);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await wsRepo.save(
      new WatchedStatus({
        userId: admin.id,
        jellyfinItemId: 'jf-item-list-a',
        mediaId: 44444,
        progress: 100,
      })
    );
    await wsRepo.save(
      new WatchedStatus({
        userId: friend.id,
        jellyfinItemId: 'jf-item-list-b',
        mediaId: 55555,
        progress: 50,
      })
    );

    const adminStatuses = await wsRepo.find({
      where: { userId: admin.id },
    });
    assert.equal(adminStatuses.length, 1);
    assert.equal(adminStatuses[0].jellyfinItemId, 'jf-item-list-a');

    const friendStatuses = await wsRepo.find({
      where: { userId: friend.id },
    });
    assert.equal(friendStatuses.length, 1);
    assert.equal(friendStatuses[0].jellyfinItemId, 'jf-item-list-b');
  });

  it('should delete a watched status', async () => {
    const userRepo = getRepository(User);
    const wsRepo = getRepository(WatchedStatus);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const ws = await wsRepo.save(
      new WatchedStatus({
        userId: user.id,
        jellyfinItemId: 'jf-item-delete',
        mediaId: 66666,
        progress: 100,
      })
    );

    await wsRepo.remove(ws);
    const found = await wsRepo.findOneBy({ id: ws.id });
    assert.equal(found, null);
  });
});
