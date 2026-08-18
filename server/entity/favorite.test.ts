import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import {
  Favorite,
  FavoriteMediaType,
  FavoriteSource,
} from '@server/entity/Favorite';
import { User } from '@server/entity/User';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Favorite entity', () => {
  it('should add a favorite for a user', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const fav = new Favorite({
      userId: user.id,
      mediaId: 12345,
      mediaType: FavoriteMediaType.MOVIE,
      source: FavoriteSource.TMDB,
    });

    const saved = await favRepo.save(fav);
    assert.ok(saved.id, 'should have an id');
    assert.equal(saved.mediaId, 12345);
    assert.equal(saved.mediaType, FavoriteMediaType.MOVIE);
    assert.equal(saved.source, FavoriteSource.TMDB);
    assert.equal(saved.userId, user.id);
  });

  it('should not allow duplicate favorites for the same user/media/source', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const fav1 = new Favorite({
      userId: user.id,
      mediaId: 99999,
      mediaType: FavoriteMediaType.TV,
      source: FavoriteSource.TMDB,
    });
    await favRepo.save(fav1);

    const fav2 = new Favorite({
      userId: user.id,
      mediaId: 99999,
      mediaType: FavoriteMediaType.TV,
      source: FavoriteSource.TMDB,
    });

    await assert.rejects(() => favRepo.save(fav2), /UNIQUE/);
  });

  it('should allow different users to favorite the same media', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    const fav1 = new Favorite({
      userId: admin.id,
      mediaId: 55555,
      mediaType: FavoriteMediaType.MOVIE,
      source: FavoriteSource.TMDB,
    });
    await favRepo.save(fav1);

    const fav2 = new Favorite({
      userId: friend.id,
      mediaId: 55555,
      mediaType: FavoriteMediaType.MOVIE,
      source: FavoriteSource.TMDB,
    });
    const saved = await favRepo.save(fav2);
    assert.ok(saved.id);
    assert.equal(saved.userId, friend.id);
  });

  it('should list only a specific user favorites', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await favRepo.save(
      new Favorite({
        userId: admin.id,
        mediaId: 11111,
        mediaType: FavoriteMediaType.MOVIE,
        source: FavoriteSource.TMDB,
      })
    );
    await favRepo.save(
      new Favorite({
        userId: friend.id,
        mediaId: 22222,
        mediaType: FavoriteMediaType.TV,
        source: FavoriteSource.TMDB,
      })
    );

    const adminFavs = await favRepo.find({
      where: { userId: admin.id },
    });
    assert.equal(adminFavs.length, 1);
    assert.equal(adminFavs[0].mediaId, 11111);

    const friendFavs = await favRepo.find({
      where: { userId: friend.id },
    });
    assert.equal(friendFavs.length, 1);
    assert.equal(friendFavs[0].mediaId, 22222);
  });

  it('should remove a favorite', async () => {
    const userRepo = getRepository(User);
    const favRepo = getRepository(Favorite);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const fav = await favRepo.save(
      new Favorite({
        userId: user.id,
        mediaId: 77777,
        mediaType: FavoriteMediaType.MOVIE,
        source: FavoriteSource.TMDB,
      })
    );

    await favRepo.remove(fav);
    const found = await favRepo.findOneBy({ id: fav.id });
    assert.equal(found, null);
  });
});
