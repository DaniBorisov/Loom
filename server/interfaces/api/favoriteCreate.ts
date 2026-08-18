import { FavoriteMediaType, FavoriteSource } from '@server/entity/Favorite';
import { z } from 'zod';

export const favoriteCreate = z.object({
  mediaId: z.coerce.number(),
  mediaType: z.nativeEnum(FavoriteMediaType),
  source: z.nativeEnum(FavoriteSource),
});
