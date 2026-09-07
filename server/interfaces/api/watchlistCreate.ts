import { MediaType } from '@server/constants/media';
import { NotifyOn } from '@server/entity/Watchlist';
import { z } from 'zod';

export const watchlistCreate = z.object({
  ratingKey: z.coerce.string().optional(),
  tmdbId: z.coerce.number(),
  mediaType: z.nativeEnum(MediaType),
  title: z.coerce.string().optional(),
  notifyOn: z.nativeEnum(NotifyOn).optional(),
});
