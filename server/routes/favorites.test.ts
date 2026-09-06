import { getRepository } from '@server/datasource';
import {
  Favorite,
  FavoriteMediaType,
  FavoriteSource,
} from '@server/entity/Favorite';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import favoritesRoutes from './favorites';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/api/v1/favorites', favoritesRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

setupTestDb();

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('Favorite routes (entity-level)', () => {
  let admin: User;

  before(async () => {
    app = createApp();
    admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
  });

  it('should add a favorite via entity and retrieve it', async () => {
    const favRepo = getRepository(Favorite);

    const fav = new Favorite({
      userId: admin.id,
      mediaId: 300,
      mediaType: FavoriteMediaType.MOVIE,
      source: FavoriteSource.TMDB,
    });

    const saved = await favRepo.save(fav);
    assert.ok(saved.id, 'should have an id');
    assert.equal(saved.mediaId, 300);

    const found = await favRepo.findOneBy({ id: saved.id });
    assert.equal(found?.mediaId, 300);
    assert.equal(found?.userId, admin.id);
  });

  it('should not allow duplicate favorites for same user/mediaId/source', async () => {
    const favRepo = getRepository(Favorite);

    const fav1 = new Favorite({
      userId: admin.id,
      mediaId: 400,
      mediaType: FavoriteMediaType.TV,
      source: FavoriteSource.TMDB,
    });
    await favRepo.save(fav1);

    const fav2 = new Favorite({
      userId: admin.id,
      mediaId: 400,
      mediaType: FavoriteMediaType.TV,
      source: FavoriteSource.TMDB,
    });

    await assert.rejects(() => favRepo.save(fav2), /UNIQUE/);
  });

  it('should allow different sources for same media', async () => {
    const favRepo = getRepository(Favorite);

    const fav1 = new Favorite({
      userId: admin.id,
      mediaId: 500,
      mediaType: FavoriteMediaType.ANIME,
      source: FavoriteSource.ANILIST,
    });
    await favRepo.save(fav1);

    const fav2 = new Favorite({
      userId: admin.id,
      mediaId: 500,
      mediaType: FavoriteMediaType.ANIME,
      source: FavoriteSource.TMDB,
    });
    const saved = await favRepo.save(fav2);
    assert.ok(saved.id);
    assert.equal(saved.source, FavoriteSource.TMDB);
  });

  it('should list only a specific user favorites', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await favRepo.save(
      new Favorite({
        userId: admin.id,
        mediaId: 600,
        mediaType: FavoriteMediaType.MOVIE,
        source: FavoriteSource.TMDB,
      })
    );
    await favRepo.save(
      new Favorite({
        userId: friend.id,
        mediaId: 700,
        mediaType: FavoriteMediaType.TV,
        source: FavoriteSource.TMDB,
      })
    );

    const adminFavs = await favRepo.find({
      where: { userId: admin.id },
    });
    assert.ok(adminFavs.length >= 1);
    assert.ok(adminFavs.some((f) => f.mediaId === 600));

    const friendFavs = await favRepo.find({
      where: { userId: friend.id },
    });
    assert.ok(friendFavs.length >= 1);
    assert.ok(friendFavs.some((f) => f.mediaId === 700));
  });

  it('should remove a favorite', async () => {
    const favRepo = getRepository(Favorite);

    const fav = await favRepo.save(
      new Favorite({
        userId: admin.id,
        mediaId: 800,
        mediaType: FavoriteMediaType.MOVIE,
        source: FavoriteSource.TMDB,
      })
    );

    await favRepo.remove(fav);
    const found = await favRepo.findOneBy({ id: fav.id });
    assert.equal(found, null);
  });
});

describe('Favorite routes (HTTP-level)', () => {
  before(async () => {
    app = createApp();
  });

  it('should prevent user B from deleting user A\'s favorite via DELETE', async () => {
    const favRepo = getRepository(Favorite);

    // Login as admin and create a favorite
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 9901, mediaType: 'movie', source: 'tmdb' });
    assert.strictEqual(createRes.status, 201);
    const favId = createRes.body.id;

    // Login as friend and try to delete admin's favorite
    const friendAgent = await loginAs('friend@seerr.dev', 'test1234');
    const deleteRes = await friendAgent.delete(
      `/api/v1/favorites/${favId}`
    );
    assert.strictEqual(deleteRes.status, 403);

    // Favorite should still exist
    const stillThere = await favRepo.findOneBy({ id: favId });
    assert.ok(stillThere, 'favorite should still exist after 403');
  });

  it('should allow a user to delete their own favorite', async () => {
    const favRepo = getRepository(Favorite);

    // Login as admin and create a favorite
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 9902, mediaType: 'movie', source: 'tmdb' });
    assert.strictEqual(createRes.status, 201);
    const favId = createRes.body.id;

    // Delete own favorite
    const deleteRes = await adminAgent.delete(`/api/v1/favorites/${favId}`);
    assert.strictEqual(deleteRes.status, 204);

    const gone = await favRepo.findOneBy({ id: favId });
    assert.equal(gone, null);
  });

  it('should resolve AniList ID to TMDB ID when favoriting', async () => {

    const favRepo = getRepository(Favorite);

    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');

    // AniList ID 9253 (Steins;Gate) maps to TMDB ID 42509 in crosswalk
    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 9253, mediaType: 'anime', source: 'anilist' });
    assert.strictEqual(createRes.status, 201);

    // mediaId should be resolved to TMDB ID
    assert.equal(createRes.body.mediaId, 42509);
    assert.equal(createRes.body.source, 'anilist');

    // Favorite check should work with resolved TMDB ID + source=anilist
    const checkRes = await adminAgent.get(
      '/api/v1/favorites/check?mediaId=42509&source=anilist'
    );
    assert.strictEqual(checkRes.status, 200);
    assert.equal(checkRes.body.isFavorited, true);

    // Cleanup
    await favRepo.delete({ id: createRes.body.id });
  });
});

describe('Favorite check-batch route (DAN-99)', () => {
  before(async () => {
    app = createApp();
  });

  it('should return batched status with favoriteIds in one request', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');

    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 20101, mediaType: 'movie', source: 'tmdb' });
    assert.strictEqual(createRes.status, 201);

    const res = await adminAgent.post('/api/v1/favorites/check-batch').send({
      items: [
        { mediaId: 20101, source: 'tmdb' },
        { mediaId: 20102, source: 'tmdb' },
        { mediaId: 20103, source: 'anilist' },
      ],
    });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.results['tmdb:20101'].isFavorited, true);
    assert.equal(res.body.results['tmdb:20101'].favoriteId, createRes.body.id);
    assert.equal(res.body.results['tmdb:20102'].isFavorited, false);
    assert.equal(res.body.results['tmdb:20102'].favoriteId, null);
    assert.equal(res.body.results['anilist:20103'].isFavorited, false);
  });

  it('should scope results to the requesting user', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 20201, mediaType: 'movie', source: 'tmdb' });
    assert.strictEqual(createRes.status, 201);

    const friendAgent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await friendAgent.post('/api/v1/favorites/check-batch').send({
      items: [{ mediaId: 20201, source: 'tmdb' }],
    });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.results['tmdb:20201'].isFavorited, false);
    assert.equal(res.body.results['tmdb:20201'].favoriteId, null);
  });

  it('should distinguish the same mediaId under different sources', async () => {
    const favRepo = getRepository(Favorite);
    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });

    await favRepo.save(
      new Favorite({
        userId: admin.id,
        mediaId: 20301,
        mediaType: FavoriteMediaType.ANIME,
        source: FavoriteSource.ANILIST,
      })
    );

    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await adminAgent.post('/api/v1/favorites/check-batch').send({
      items: [
        { mediaId: 20301, source: 'anilist' },
        { mediaId: 20301, source: 'tmdb' },
      ],
    });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.results['anilist:20301'].isFavorited, true);
    assert.equal(res.body.results['tmdb:20301'].isFavorited, false);
  });

  it('should return all-false results when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/favorites/check-batch')
      .send({ items: [{ mediaId: 20401, source: 'tmdb' }] });

    assert.strictEqual(res.status, 200);
    assert.equal(res.body.results['tmdb:20401'].isFavorited, false);
    assert.equal(res.body.results['tmdb:20401'].favoriteId, null);
  });

  it('should return empty results for an empty items array', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await adminAgent
      .post('/api/v1/favorites/check-batch')
      .send({ items: [] });

    assert.strictEqual(res.status, 200);
    assert.deepEqual(res.body.results, {});
  });

  it('should reject invalid payloads with 400', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');

    const nonArray = await adminAgent
      .post('/api/v1/favorites/check-batch')
      .send({ items: 'nope' });
    assert.strictEqual(nonArray.status, 400);

    const badSource = await adminAgent
      .post('/api/v1/favorites/check-batch')
      .send({ items: [{ mediaId: 20501, source: 'bogus' }] });
    assert.strictEqual(badSource.status, 400);

    const badMediaId = await adminAgent
      .post('/api/v1/favorites/check-batch')
      .send({ items: [{ mediaId: 'abc', source: 'tmdb' }] });
    assert.strictEqual(badMediaId.status, 400);

    const tooMany = await adminAgent
      .post('/api/v1/favorites/check-batch')
      .send({
        items: Array.from({ length: 101 }, (_, i) => ({
          mediaId: 21000 + i,
          source: 'tmdb',
        })),
      });
    assert.strictEqual(tooMany.status, 400);
  });
});
