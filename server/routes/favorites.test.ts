import { getRepository } from '@server/datasource';
import {
  Favorite,
  FavoriteMediaType,
  FavoriteSource,
} from '@server/entity/Favorite';
import { User } from '@server/entity/User';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

setupTestDb();

describe('Favorite routes', () => {
  let admin: User;

  before(async () => {
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
