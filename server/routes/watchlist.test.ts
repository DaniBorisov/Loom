import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import {
  Watchlist,
  WatchlistStatus,
} from '@server/entity/Watchlist';
import { MediaType } from '@server/constants/media';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Watchlist routes', () => {
  it('should create and retrieve a watchlist item', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const wl = await wlRepo.save(
      new Watchlist({
        tmdbId: 50001,
        mediaType: MediaType.MOVIE,
        title: 'Route Test Movie',
        requestedBy: user,
      } as never)
    );

    assert.ok(wl.id);
    assert.equal(wl.status, WatchlistStatus.WANT_TO_WATCH);

    const found = await wlRepo.findOneBy({ id: wl.id });
    assert.ok(found);
    assert.equal(found.tmdbId, 50001);
  });

  it('should update status via PATCH logic', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const wl = await wlRepo.save(
      new Watchlist({
        tmdbId: 50002,
        mediaType: MediaType.TV,
        title: 'Route Test TV',
        requestedBy: user,
      } as never)
    );

    // Simulate PATCH: change status
    wl.status = WatchlistStatus.WATCHING;
    const saved = await wlRepo.save(wl);

    const found = await wlRepo.findOneBy({ id: saved.id });
    assert.equal(found?.status, WatchlistStatus.WATCHING);
  });

  it('should list watchlist items for a user', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50003,
        mediaType: MediaType.MOVIE,
        title: 'List Test Movie',
        requestedBy: user,
      } as never)
    );

    const items = await wlRepo.find({
      where: { requestedBy: { id: user.id } },
    });

    assert.ok(items.length >= 1);
    assert.ok(items.some((i) => i.tmdbId === 50003));
  });

  it('should filter watchlist by status', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50004,
        mediaType: MediaType.MOVIE,
        title: 'Status Filter Movie',
        requestedBy: user,
        status: WatchlistStatus.WATCHED,
      } as never)
    );

    const watched = await wlRepo.find({
      where: {
        requestedBy: { id: user.id },
        status: WatchlistStatus.WATCHED,
      },
    });

    assert.ok(watched.some((i) => i.tmdbId === 50004));
  });

  it('should not return other users watchlist items', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50005,
        mediaType: MediaType.MOVIE,
        title: 'Admin Only Movie',
        requestedBy: admin,
      } as never)
    );

    const friendItems = await wlRepo.find({
      where: { requestedBy: { id: friend.id } },
    });

    assert.ok(!friendItems.some((i) => i.tmdbId === 50005));
  });
});
