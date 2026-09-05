import Slider from '@app/components/Slider';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import {
  availabilityResultKey,
  useJellyfinAvailabilityBatch,
} from '@app/hooks/useJellyfinAvailability';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { MediaResultsResponse } from '@server/interfaces/api/mediaInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.RecentlyAddedSlider', {
  recentlyAdded: 'Recently Added',
});

const RecentlyAddedSlider = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { data: media, error: mediaError } = useSWR<MediaResultsResponse>(
    '/api/v1/media?filter=allavailable&take=20&sort=mediaAdded',
    { revalidateOnMount: true }
  );

  const sliderItems = media?.results ?? [];

  // One batched availability request for all rendered cards (DAN-98). Must
  // stay above the early return below to keep hook order stable.
  const { data: availabilityData } = useJellyfinAvailabilityBatch(
    sliderItems.length
      ? sliderItems.map((item) => ({
          tmdbId: item.tmdbId,
          type: item.mediaType,
        }))
      : undefined
  );

  if (
    (media && !media.results.length && !mediaError) ||
    !hasPermission([Permission.MANAGE_REQUESTS, Permission.RECENT_VIEW], {
      type: 'or',
    })
  ) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.recentlyAdded)}</span>
        </div>
      </div>
      <Slider
        sliderKey="media"
        isLoading={!media}
        items={(media?.results ?? []).map((item) => (
          <TmdbTitleCard
            key={`media-slider-item-${item.id}`}
            id={item.id}
            tmdbId={item.tmdbId}
            tvdbId={item.tvdbId}
            type={item.mediaType}
            libraryAvailable={
              availabilityData?.results[
                availabilityResultKey(item.tmdbId, item.mediaType)
              ]
            }
          />
        ))}
      />
    </>
  );
};

export default RecentlyAddedSlider;
