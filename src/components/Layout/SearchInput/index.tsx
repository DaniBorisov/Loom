import RecentSearches from '@app/components/Layout/SearchInput/RecentSearches';
import useClickOutside from '@app/hooks/useClickOutside';
import useSearchInput from '@app/hooks/useSearchInput';
import defineMessages from '@app/utils/defineMessages';
import { addRecentSearch } from '@app/utils/recentSearches';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { useRef } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.SearchInput', {
  searchPlaceholder: 'Search Movies & Series',
});

const SearchInput = () => {
  const intl = useIntl();
  const { searchValue, searchOpen, setSearchValue, setIsOpen, clear } =
    useSearchInput();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Tapping non-focusable page content does not blur the input, so close
  // the dropdown explicitly. Only when empty — a valued input stays open
  // until cleared or submitted, as before.
  useClickOutside(wrapperRef, () => {
    if (searchValue === '') {
      setIsOpen(false);
    }
  });

  const commitSearch = (term: string) => {
    if (term.trim() !== '') {
      addRecentSearch(term);
    }
  };

  return (
    <div className="flex flex-1">
      <div className="flex w-full">
        <label htmlFor="search_field" className="sr-only">
          Search
        </label>
        <div
          ref={wrapperRef}
          className="relative flex w-full items-center text-white focus-within:text-gray-200"
        >
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
          <input
            id="search_field"
            style={{ paddingRight: searchValue.length > 0 ? '1.75rem' : '' }}
            className="block w-full rounded-full border border-gray-600 bg-gray-900/80 py-2 pl-10 text-white placeholder-gray-300 hover:border-gray-500 focus:border-gray-500 focus:bg-gray-900 focus:placeholder-gray-400 focus:outline-none focus:ring-0 sm:text-base"
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            type="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              if (searchValue === '') {
                setIsOpen(false);
              } else {
                commitSearch(searchValue);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSearch(searchValue);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {searchOpen && searchValue === '' && (
            <RecentSearches
              onSelect={(term) => {
                commitSearch(term);
                setSearchValue(term);
              }}
            />
          )}
          {searchValue.length > 0 && (
            <button
              className="absolute inset-y-0 right-2 m-auto h-7 w-7 border-none p-1 text-gray-400 outline-none transition hover:text-white focus:border-none focus:outline-none"
              onClick={() => clear()}
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchInput;
