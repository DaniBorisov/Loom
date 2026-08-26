import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { WatchlistStatus } from '@server/entity/Watchlist';
import { processAutoRequest } from '@server/lib/auto-request';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

function buildUser(permissions: number): User {
  const user = new User();
  user.id = 100;
  user.permissions = permissions;
  return user;
}

const sendNotificationMock = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
).mock;

setupTestDb();

describe('processAutoRequest', () => {
  let savedMediaType: MediaServerType;

  before(() => {
    savedMediaType = getSettings().main.mediaServerType;
  });

  beforeEach(() => {
    sendNotificationMock.resetCalls();
    getSettings().main.mediaServerType = savedMediaType;
  });

  afterEach(() => mock.restoreAll());

  it('skips auto-request when status is not want_to_watch', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({})
    );
    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 12345,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WATCHING,
    });

    assert.strictEqual(requestMock.mock.callCount(), 0);
  });

  it('skips auto-request when user lacks AUTO_REQUEST permission for movies', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({})
    );
    const user = buildUser(Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 12345,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(requestMock.mock.callCount(), 0);
  });

  it('skips auto-request when user lacks AUTO_REQUEST permission for TV', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({})
    );
    const user = buildUser(Permission.REQUEST_TV);

    await processAutoRequest({
      user,
      tmdbId: 12345,
      mediaType: MediaType.TV,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(requestMock.mock.callCount(), 0);
  });

  it('creates request for movie when Jellyfin reports not available', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1, status: 2 })
    );

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    // Seed admin with Jellyfin credentials
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    admin.jellyfinAuthToken = 'test-jf-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    // Mock the JellyfinAPI constructor to return a mock with lookupByProviderId
    const lookupResult = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => null
    );

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(lookupResult.mock.callCount(), 1);
    assert.strictEqual(requestMock.mock.callCount(), 1);

    const callArgs = requestMock.mock.calls[0]!;
    assert.strictEqual((callArgs.arguments[0] as any).mediaType, MediaType.MOVIE);
    assert.strictEqual((callArgs.arguments[2] as any).isAutoRequest, true);

    // Clean up admin credentials
    admin.jellyfinAuthToken = '';
    admin.jellyfinUserId = '';
    admin.jellyfinDeviceId = '';
    await userRepo.save(admin);
  });

  it('skips request when Jellyfin reports already available', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({})
    );

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    admin.jellyfinAuthToken = 'test-jf-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupResult = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => ({ Id: 'abc', Name: 'Test Movie' })
    );

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(lookupResult.mock.callCount(), 1);
    assert.strictEqual(requestMock.mock.callCount(), 0);

    admin.jellyfinAuthToken = '';
    admin.jellyfinUserId = '';
    admin.jellyfinDeviceId = '';
    await userRepo.save(admin);
  });

  it('logs error when request fails and does not throw', async () => {
    mock.method(MediaRequest, 'request', async () => {
      throw new Error('Sonarr connection refused');
    });

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.PLEX;

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });
  });

  it('resolves TVDB ID via crosswalk for anime', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 })
    );

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.PLEX;

    const crosswalk = getAnimeCrosswalk();
    const crosswalkMock = mock.method(
      crosswalk,
      'getByTmdbId',
      () => ({ AniList_id: 1, TheTVDB_id: 9999, TheMovieDB_id: 54321 })
    );

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST_TV);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.ANIME,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(crosswalkMock.mock.callCount(), 1);
    assert.strictEqual(requestMock.mock.callCount(), 1);

    const callArgs = requestMock.mock.calls[0]!;
    assert.strictEqual((callArgs.arguments[0] as any).mediaType, MediaType.TV);
    assert.strictEqual((callArgs.arguments[0] as any).tvdbId, 9999);
  });

  it('falls back to TV when crosswalk has no TVDB ID for anime', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 })
    );

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.PLEX;

    const crosswalk = getAnimeCrosswalk();
    mock.method(crosswalk, 'getByTmdbId', () => ({
      AniList_id: 2,
      TheMovieDB_id: 54321,
    }));

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST_TV);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.ANIME,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(requestMock.mock.callCount(), 1);

    const callArgs = requestMock.mock.calls[0]!;
    assert.strictEqual((callArgs.arguments[0] as any).mediaType, MediaType.TV);
    assert.strictEqual((callArgs.arguments[0] as any).tvdbId, undefined);
  });

  it('skips Jellyfin check when server type is not Jellyfin/Emby', async () => {
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 })
    );

    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.PLEX;

    const user = buildUser(Permission.AUTO_REQUEST | Permission.REQUEST);

    await processAutoRequest({
      user,
      tmdbId: 54321,
      mediaType: MediaType.MOVIE,
      watchlistStatus: WatchlistStatus.WANT_TO_WATCH,
    });

    assert.strictEqual(requestMock.mock.callCount(), 1);
  });
});
