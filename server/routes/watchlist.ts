import {
  DuplicateWatchlistRequestError,
  NotFoundError,
  Watchlist,
  WatchlistStatus,
} from '@server/entity/Watchlist';
import logger from '@server/logger';
import { Router } from 'express';
import { QueryFailedError } from 'typeorm';
import { getRepository } from '@server/datasource';

import { MediaType } from '@server/constants/media';
import { watchlistCreate } from '@server/interfaces/api/watchlistCreate';
import { watchlistUpdate } from '@server/interfaces/api/watchlistUpdate';
import { transitionStatus } from '@server/lib/watchlist-transitions';

const watchlistRoutes = Router();

watchlistRoutes.post<never, Watchlist, Watchlist>(
  '/',
  async (req, res, next) => {
    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to add watchlist.',
        });
      }
      const values = watchlistCreate.parse(req.body);

      const request = await Watchlist.createWatchlist({
        watchlistRequest: values,
        user: req.user,
      });
      return res.status(201).json(request);
    } catch (error) {
      if (!(error instanceof Error)) {
        return;
      }
      switch (error.constructor) {
        case QueryFailedError:
          logger.warn('Something wrong with data watchlist', {
            tmdbId: req.body.tmdbId,
            mediaType: req.body.mediaType,
            label: 'Watchlist',
          });
          return next({ status: 409, message: 'Something wrong' });
        case DuplicateWatchlistRequestError:
          return next({ status: 409, message: error.message });
        default:
          return next({ status: 500, message: error.message });
      }
    }
  }
);

watchlistRoutes.patch<{ id: string }, Watchlist>(
  '/:id',
  async (req, res, next) => {
    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to update watchlist status.',
        });
      }

      const values = watchlistUpdate.parse(req.body);

      const wlRepo = getRepository(Watchlist);
      const watchlist = await wlRepo.findOne({
        where: { id: Number(req.params.id) },
        relations: ['requestedBy'],
      });

      if (!watchlist) {
        return next({ status: 404, message: 'Watchlist item not found.' });
      }

      if (watchlist.requestedBy.id !== req.user.id) {
        return next({
          status: 403,
          message: 'You can only update your own watchlist items.',
        });
      }

      const newStatus = transitionStatus(watchlist.status, values.status);
      watchlist.status = newStatus;

      const saved = await wlRepo.save(watchlist);
      return res.status(200).json(saved);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return next({ status: 400, message: error.message });
      }
      return next({ status: 500, message: (error as Error).message });
    }
  }
);

watchlistRoutes.delete('/:tmdbId', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 401,
      message: 'You must be logged in to delete watchlist data.',
    });
  }
  try {
    const mediaType = req.query.mediaType;
    if (
      mediaType !== MediaType.MOVIE &&
      mediaType !== MediaType.TV &&
      mediaType !== MediaType.ANIME
    ) {
      return next({
        status: 400,
        message: 'Invalid mediaType query parameter.',
      });
    }

    await Watchlist.deleteWatchlist(
      Number(req.params.tmdbId),
      mediaType,
      req.user
    );
    return res.status(204).send();
  } catch (e) {
    if (e instanceof NotFoundError) {
      return next({
        status: 404,
        message: e.message,
      });
    }
    return next({ status: 500, message: (e as Error).message });
  }
});

watchlistRoutes.get('/', async (req, res, next) => {
  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to list watchlist items.',
      });
    }

    const wlRepo = getRepository(Watchlist);
    const itemsPerPage = 20;
    const page = req.query.page ? Number(req.query.page) : 1;
    const offset = (page - 1) * itemsPerPage;

    const statusFilter = req.query.status as WatchlistStatus | undefined;

    const where: Record<string, unknown> = {
      requestedBy: { id: req.user.id },
    };

    if (
      statusFilter &&
      Object.values(WatchlistStatus).includes(statusFilter)
    ) {
      where.status = statusFilter;
    }

    const [results, total] = await wlRepo.findAndCount({
      where,
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

export default watchlistRoutes;
