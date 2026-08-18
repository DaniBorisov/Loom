import { WatchlistStatus } from '@server/entity/Watchlist';
import { z } from 'zod';

export const watchlistUpdate = z.object({
  status: z.nativeEnum(WatchlistStatus),
});
