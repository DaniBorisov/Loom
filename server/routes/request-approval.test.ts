import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from '../routes/auth';
import requestRoutes from '../routes/request';
import { checkUser } from '@server/middleware/auth';

const sendNotificationMock = mock.method(
  MediaRequest,
  'sendNotification',
  async () => undefined
).mock;

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
  app.use('/request', requestRoutes);
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

before(async () => {
  app = createApp();
});

beforeEach(() => {
  sendNotificationMock.resetCalls();
});

setupTestDb();

async function loginAs(email: string, _password = 'test1234') {
  const settings = (await import('@server/lib/settings')).getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

async function seedRequest(status = MediaRequestStatus.PENDING) {
  const userRepo = getRepository(User);
  const mediaRepo = getRepository(Media);
  const requestRepo = getRepository(MediaRequest);

  const requestedBy = await userRepo.findOneOrFail({
    where: { email: 'friend@seerr.dev' },
  });

  const media = await mediaRepo.save(
    new Media({
      mediaType: MediaType.MOVIE,
      tmdbId: 50000 + Math.floor(Math.random() * 100000),
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.UNKNOWN,
    })
  );

  const created = await requestRepo.save(
    new MediaRequest({
      type: MediaType.MOVIE,
      status,
      media,
      requestedBy,
      is4k: false,
    })
  );

  return requestRepo.findOneOrFail({
    where: { id: created.id },
    relations: { requestedBy: true, modifiedBy: true },
  });
}

describe('Approval workflow — auto-approve permission', () => {
  it('auto-approves when user has AUTO_APPROVE permission', () => {
    const user = new User();
    user.permissions = Permission.REQUEST | Permission.AUTO_APPROVE;

    assert.ok(
      user.hasPermission(
        [Permission.AUTO_APPROVE, Permission.AUTO_APPROVE_MOVIE],
        { type: 'or' }
      )
    );
  });

  it('auto-approves when user has MANAGE_REQUESTS permission', () => {
    const user = new User();
    user.permissions = Permission.REQUEST | Permission.MANAGE_REQUESTS;

    assert.ok(
      user.hasPermission(
        [
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_MOVIE,
          Permission.MANAGE_REQUESTS,
        ],
        { type: 'or' }
      )
    );
  });

  it('does not auto-approve when user lacks AUTO_APPROVE and MANAGE_REQUESTS', () => {
    const user = new User();
    user.permissions = Permission.REQUEST | Permission.REQUEST_MOVIE;

    assert.ok(
      !user.hasPermission(
        [
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_MOVIE,
          Permission.MANAGE_REQUESTS,
        ],
        { type: 'or' }
      )
    );
  });

  it('auto-approves TV with AUTO_APPROVE_TV permission', () => {
    const user = new User();
    user.permissions = Permission.REQUEST | Permission.AUTO_APPROVE_TV;

    assert.ok(
      user.hasPermission(
        [Permission.AUTO_APPROVE, Permission.AUTO_APPROVE_TV],
        { type: 'or' }
      )
    );
  });

  it('does not auto-approve 4K movie with only non-4K AUTO_APPROVE', () => {
    const user = new User();
    user.permissions = Permission.REQUEST | Permission.AUTO_APPROVE;

    assert.ok(
      !user.hasPermission(
        [
          Permission.AUTO_APPROVE_4K,
          Permission.AUTO_APPROVE_4K_MOVIE,
          Permission.MANAGE_REQUESTS,
        ],
        { type: 'or' }
      )
    );
  });

  it('auto-approves 4K movie with AUTO_APPROVE_4K + AUTO_APPROVE_4K_MOVIE', () => {
    const user = new User();
    user.permissions =
      Permission.REQUEST_4K |
      Permission.REQUEST_4K_MOVIE |
      Permission.AUTO_APPROVE_4K |
      Permission.AUTO_APPROVE_4K_MOVIE;

    assert.ok(
      user.hasPermission(
        [
          Permission.AUTO_APPROVE_4K,
          Permission.AUTO_APPROVE_4K_MOVIE,
          Permission.MANAGE_REQUESTS,
        ],
        { type: 'or' }
      )
    );
  });
});

describe('Approval workflow — request status persistence', () => {
  it('persists APPROVED status for auto-approved requests', async () => {
    const mediaRepo = getRepository(Media);
    const requestRepo = getRepository(MediaRequest);
    const userRepo = getRepository(User);

    const friend = await userRepo.findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    const media = await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 60001,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const req = await requestRepo.save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: friend,
        modifiedBy: friend,
        is4k: false,
      })
    );

    const persisted = await requestRepo.findOneOrFail({
      where: { id: req.id },
      relations: { modifiedBy: true },
    });

    assert.strictEqual(persisted.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(persisted.modifiedBy?.email, 'friend@seerr.dev');
  });

  it('persists PENDING status for non-auto-approved requests', async () => {
    const mediaRepo = getRepository(Media);
    const requestRepo = getRepository(MediaRequest);
    const userRepo = getRepository(User);

    const friend = await userRepo.findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    const media = await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 60002,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const req = await requestRepo.save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: friend,
        is4k: false,
      })
    );

    const persisted = await requestRepo.findOneOrFail({
      where: { id: req.id },
      relations: { modifiedBy: true },
    });

    assert.strictEqual(persisted.status, MediaRequestStatus.PENDING);
    assert.strictEqual(persisted.modifiedBy, null);
  });

  it('persists isAutoRequest flag', async () => {
    const mediaRepo = getRepository(Media);
    const requestRepo = getRepository(MediaRequest);
    const userRepo = getRepository(User);

    const admin = await userRepo.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });

    const media = await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 60003,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const req = await requestRepo.save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.APPROVED,
        media,
        requestedBy: admin,
        is4k: false,
        isAutoRequest: true,
      })
    );

    const persisted = await requestRepo.findOneOrFail({
      where: { id: req.id },
    });

    assert.strictEqual(persisted.isAutoRequest, true);
  });
});

describe('Approval workflow — admin approve/decline from queue', () => {
  it('admin approves a pending request and sets modifiedBy', async () => {
    const pending = await seedRequest();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/request/${pending.id}/approve`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(res.body.modifiedBy.email, 'admin@seerr.dev');
  });

  it('admin declines a pending request and sets modifiedBy', async () => {
    const pending = await seedRequest();
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/request/${pending.id}/decline`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, MediaRequestStatus.DECLINED);
    assert.strictEqual(res.body.modifiedBy.email, 'admin@seerr.dev');
  });

  it('non-admin non-owner cannot approve a pending request', async () => {
    const userRepo = getRepository(User);
    const mediaRepo = getRepository(Media);
    const requestRepo = getRepository(MediaRequest);

    const admin = await userRepo.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });

    const media = await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 60004,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const pendingReq = await requestRepo.save(
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: admin,
        is4k: false,
      })
    );

    const friend = await loginAs('friend@seerr.dev');
    const res = await friend.post(`/request/${pendingReq.id}/approve`);

    assert.strictEqual(res.status, 403);
  });

  it('admin can retry a failed request', async () => {
    const failed = await seedRequest(MediaRequestStatus.FAILED);
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/request/${failed.id}/retry`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(res.body.modifiedBy.email, 'admin@seerr.dev');
  });
});

describe('Approval workflow — media request instance behavior', () => {
  it('sets isAutoRequest to undefined when not provided (defaults to false at DB level)', () => {
    const req = new MediaRequest({
      type: MediaType.MOVIE,
      status: MediaRequestStatus.PENDING,
    });
    assert.strictEqual(req.isAutoRequest, undefined);
  });

  it('preserves isAutoRequest when set to true', () => {
    const req = new MediaRequest({
      type: MediaType.MOVIE,
      status: MediaRequestStatus.APPROVED,
      isAutoRequest: true,
    });
    assert.strictEqual(req.isAutoRequest, true);
  });
});
