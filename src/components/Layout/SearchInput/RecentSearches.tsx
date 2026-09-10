import defineMessages from '@app/utils/defineMessages';
import {
  clearRecentSearches,
  getRecentSearches,
} from '@app/utils/recentSearches';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.RecentSearches', {
  recentSearches: 'Recent searches',
  clear: 'Clear',
});

interface RecentSearchesProps {
  onSelect: (term: string) => void;
}

/**
 * Recent-search dropdown (DAN-106): anchored under the search input while
 * it is focused but empty. Hidden entirely when there is nothing stored.
 * Items use onMouseDown (instead of onClick alone) so selecting a term
 * does not blur the input before the click lands.
 */
const RecentSearches = ({ onSelect }: RecentSearchesProps) => {
  const intl = useIntl();
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(getRecentSearches());
  }, []);

  if (recents.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-gray-700 bg-gray-900/95 shadow-xl backdrop-blur"
      data-testid="recent-searches"
      role="listbox"
      aria-label={intl.formatMessage(messages.recentSearches)}
    >
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {intl.formatMessage(messages.recentSearches)}
        </span>
        <button
          type="button"
          className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          data-testid="recent-searches-clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            clearRecentSearches();
            setRecents([]);
          }}
        >
          {intl.formatMessage(messages.clear)}
        </button>
      </div>
      <ul className="pb-2">
        {recents.map((term) => (
          <li key={term}>
            <button
              type="button"
              role="option"
              aria-selected="false"
              data-testid={`recent-search-${term}`}
              className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm text-gray-100 transition hover:bg-gray-800"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(term)}
            >
              <ClockIcon className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <span className="truncate">{term}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RecentSearches;
