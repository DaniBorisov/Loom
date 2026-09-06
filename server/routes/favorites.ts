import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { getRepository } from '@server/datasource';
import { Favorite, FavoriteSource } from '@server/entity/Favorite';
import { favoriteCreate } from '@server/interfaces/api/favoriteCreate';
import logger from '@server/logger';
import { Router } from 'express';
import { In, QueryFailedError } from 'typeorm';

const favoritesRoutes = Router();

favoritesRoutes.post<never, Favorite, Favorite>('/', async (req, res, next) => {
  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to add a favorite.',
      });
    }

    const values = favoriteCreate.parse(req.body);

    if (values.source === FavoriteSource.ANILIST) {
      const crosswalk = getAnimeCrosswalk();
      const entry = crosswalk.getByAniListId(values.mediaId);
      if (entry?.TheMovieDB_id) {
        values.mediaId = entry.TheMovieDB_id;
      } else {
        logger.warn(
          `No crosswalk TMDB mapping for AniList ID ${values.mediaId}, storing raw ID`,
          { label: 'Favorites' }
        );
      }
    }

    const existing = await getRepository(Favorite).findOne({
      where: {
        userId: req.user.id,
        mediaId: values.mediaId,
        source: values.source,
      },
    });

    if (existing) {
      return next({ status: 409, message: 'Favorite already exists.' });
    }

    const favorite = new Favorite({
      userId: req.user.id,
      mediaId: values.mediaId,
      mediaType: values.mediaType,
      source: values.source,
    });

    const saved = await getRepository(Favorite).save(favorite);
    return res.status(201).json(saved);
  } catch (error) {
    if (error instanceof QueryFailedError) {
      logger.warn('Duplicate favorite attempt', {
        label: 'Favorites',
      });
      return next({ status: 409, message: 'Favorite already exists.' });
    }
    return next({ status: 500, message: (error as Error).message });
  }
});

favoritesRoutes.delete('/:id', async (req, res, next) => {
  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to remove a favorite.',
      });
    }

    const favorite = await getRepository(Favorite).findOne({
      where: { id: Number(req.params.id) },
    });

    if (!favorite) {
      return next({ status: 404, message: 'Favorite not found.' });
    }

    if (favorite.userId !== req.user.id) {
      return next({
        status: 403,
        message: 'You can only remove your own favorites.',
      });
    }

    await getRepository(Favorite).remove(favorite);
    return res.status(204).send();
  } catch (error) {
    return next({ status: 500, message: (error as Error).message });
  }
});

favoritesRoutes.get('/', async (req, res, next) => {
  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to list favorites.',
      });
    }

    const itemsPerPage = 20;
    const page = req.query.page ? Number(req.query.page) : 1;
    const offset = (page - 1) * itemsPerPage;

    const [results, total] = await getRepository(Favorite).findAndCount({
      where: { userId: req.user.id },
      order: { createdAt: 'DESC' },
      take: itemsPerPage,
      skip: offset,
    });

    return res.json({
      page,
      totalPages: Math.ceil(total / itemsPerPage),
      totalResults: total,
      results,
    });
  } catch (error) {
    return next({ status: 500, message: (error as Error).message });
  }
});

favoritesRoutes.get('/check', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({ isFavorited: false });
    }

    const mediaId = Number(req.query.mediaId);
    const source = req.query.source as FavoriteSource;

    if (!mediaId || !source) {
      return next({
        status: 400,
        message: 'mediaId and source query parameters are required.',
      });
    }

    const existing = await getRepository(Favorite).findOne({
      where: {
        userId: req.user.id,
        mediaId,
        source,
      },
    });

    return res.json({
      isFavorited: !!existing,
      favoriteId: existing?.id ?? null,
    });
  } catch (error) {
    return next({ status: 500, message: (error as Error).message });
  }
});

const MAX_FAVORITE_BATCH_ITEMS = 100;

interface FavoriteStatusResult {
  isFavorited: boolean;
  favoriteId: number | null;
}

/**
 * Batched favorite-status check (DAN-99): one request for N cards instead
 * of N per-card GET /check requests. A single `IN (...)` query against the
 * Favorite table rather than N separate lookups.
 */
favoritesRoutes.post<
  never,
  { results: Record<string, FavoriteStatusResult> }
>('/check-batch', async (req, res, next) => {
  try {
    const rawItems = req.body?.items;
    const items = Array.isArray(rawItems) ? rawItems : [];
    const results: Record<string, FavoriteStatusResult> = {};
    const allFalse = () => {
      for (const item of items) {
        const mediaId = Number(item?.mediaId);
        if (Number.isFinite(mediaId) && typeof item?.source === 'string') {
          results[`${item.source}:${mediaId}`] = {
            isFavorited: false,
            favoriteId: null,
          };
        }
      }
      return res.json({ results });
    };

    if (!req.user) {
      return allFalse();
    }

    if (!Array.isArray(rawItems) || rawItems.length > MAX_FAVORITE_BATCH_ITEMS) {
      return next({
        status: 400,
        message: 'items must be an array with at most 100 entries.',
      });
    }

    const validSources = Object.values(FavoriteSource);
    for (const item of rawItems) {
      const mediaId = Number(item?.mediaId);
      if (
        !item ||
        !Number.isFinite(mediaId) ||
        !validSources.includes(item?.source)
      ) {
        return next({
          status: 400,
          message:
            'Each item must have a numeric mediaId and a valid source.',
        });
      }
    }

    const mediaIds = [...new Set(rawItems.map((item) => Number(item.mediaId)))];
    const found = mediaIds.length
      ? await getRepository(Favorite).find({
          where: { userId: req.user.id, mediaId: In(mediaIds) },
        })
      : [];
    const byKey = new Map(
      found.map((favorite) => [`${favorite.source}:${favorite.mediaId}`, favorite])
    );

    for (const item of rawItems) {
      const key = `${item.source}:${Number(item.mediaId)}`;
      const match = byKey.get(key);
      results[key] = {
        isFavorited: !!match,
        favoriteId: match?.id ?? null,
      };
    }

    return res.json({ results });
  } catch (error) {
    return next({ status: 500, message: (error as Error).message });
  }
});

export default favoritesRoutes;
