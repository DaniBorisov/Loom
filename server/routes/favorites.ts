import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { getRepository } from '@server/datasource';
import { Favorite, FavoriteSource } from '@server/entity/Favorite';
import { favoriteCreate } from '@server/interfaces/api/favoriteCreate';
import logger from '@server/logger';
import { Router } from 'express';
import { QueryFailedError } from 'typeorm';

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

export default favoritesRoutes;
