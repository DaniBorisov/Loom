import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { NotifyOn, Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import {
  InvalidTransitionError,
  isValidTransition,
  transitionStatus,
} from '@server/lib/watchlist-transitions';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Watchlist status & notifyOn', () => {
  it('should default status to want_to_watch and notifyOn to both', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const wl = await wlRepo.save(
      new Watchlist({
        tmdbId: 99901,
        mediaType: 'movie' as never,
        title: 'Default Test Movie',
        requestedBy: user,
      } as never)
    );

    assert.equal(wl.status, WatchlistStatus.WANT_TO_WATCH);
    assert.equal(wl.notifyOn, NotifyOn.BOTH);
  });

  it('should persist each WatchlistStatus enum value', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    for (const status of Object.values(WatchlistStatus)) {
      const wl = await wlRepo.save(
        new Watchlist({
          tmdbId: 99902 + Object.values(WatchlistStatus).indexOf(status),
          mediaType: 'movie' as never,
          title: `Status test ${status}`,
          requestedBy: user,
          status,
        } as never)
      );

      const loaded = await wlRepo.findOneByOrFail({ id: wl.id });
      assert.equal(loaded.status, status);
    }
  });

  it('should persist each NotifyOn enum value', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    for (const notifyOn of Object.values(NotifyOn)) {
      const wl = await wlRepo.save(
        new Watchlist({
          tmdbId: 99910 + Object.values(NotifyOn).indexOf(notifyOn),
          mediaType: 'movie' as never,
          title: `NotifyOn test ${notifyOn}`,
          requestedBy: user,
          notifyOn,
        } as never)
      );

      const loaded = await wlRepo.findOneByOrFail({ id: wl.id });
      assert.equal(loaded.notifyOn, notifyOn);
    }
  });
});

describe('Watchlist status transitions', () => {
  it('should allow want_to_watch → watching', () => {
    assert.ok(
      isValidTransition(WatchlistStatus.WANT_TO_WATCH, WatchlistStatus.WATCHING)
    );
  });

  it('should allow want_to_watch → watched', () => {
    assert.ok(
      isValidTransition(WatchlistStatus.WANT_TO_WATCH, WatchlistStatus.WATCHED)
    );
  });

  it('should allow watching → watched', () => {
    assert.ok(
      isValidTransition(WatchlistStatus.WATCHING, WatchlistStatus.WATCHED)
    );
  });

  it('should allow watching → want_to_watch (backward)', () => {
    assert.ok(
      isValidTransition(WatchlistStatus.WATCHING, WatchlistStatus.WANT_TO_WATCH)
    );
  });

  it('should allow watched → want_to_watch (backward)', () => {
    assert.ok(
      isValidTransition(WatchlistStatus.WATCHED, WatchlistStatus.WANT_TO_WATCH)
    );
  });

  it('should reject watched → watching', () => {
    assert.ok(
      !isValidTransition(WatchlistStatus.WATCHED, WatchlistStatus.WATCHING)
    );
  });

  it('should throw InvalidTransitionError for invalid transitions', () => {
    assert.throws(
      () => transitionStatus(WatchlistStatus.WATCHED, WatchlistStatus.WATCHING),
      InvalidTransitionError
    );
  });

  it('should return the target status on valid transition', () => {
    const result = transitionStatus(
      WatchlistStatus.WANT_TO_WATCH,
      WatchlistStatus.WATCHED
    );
    assert.equal(result, WatchlistStatus.WATCHED);
  });
});
