import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import AniList from '@server/api/anilist';
import type { AniListSearchResult } from '@server/api/anilist/interfaces';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import discoverRoutes from './discover';

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
  app.use('/api/v1/discover', discoverRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // Express requires a 4-arg handler; the param is intentionally unused.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function trendingItem(id: number): AniListSearchResult {
  return {
    id,
    title: `Title ${id}`,
    overview: 'Overview',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    genres: ['Action'],
    averageScore: 80,
    status: 'RELEASING',
    seasonYear: 2004,
    format: 'TV',
  };
}

describe('GET /discover/anime/trending anime ID resolution (DAN-103)', () => {
  before(async () => {
    app = createApp();
  });

  it('returns resolved TMDB IDs and omits unmapped items', async () => {
    // Bleach: AniList ID 269 collides with TMDB ID 269 (One Tree Hill).
    // An unresolved response would misroute the card there.
    const trendingMock = mock.method(
      AniList.prototype as any,
      'getTrending',
      async () => ({
        results: [trendingItem(269), trendingItem(999999999)],
        pageInfo: {
          total: 2,
          perPage: 20,
          currentPage: 1,
          lastPage: 1,
          hasNextPage: false,
        },
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.get('/api/v1/discover/anime/trending');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 1);
      assert.strictEqual(res.body.results[0].id, 30984);
      assert.strictEqual(res.body.results[0].sourceId, 269);
      assert.strictEqual(res.body.results[0].source, 'anilist');
      assert.strictEqual(trendingMock.mock.callCount(), 1);
    } finally {
      trendingMock.mock.restore();
    }
  });
});
