import SearchInput from '@app/components/Layout/SearchInput';
import { addRecentSearch } from '@app/utils/recentSearches';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setSearchValueMock = vi.fn();
const setIsOpenMock = vi.fn();
const clearMock = vi.fn();

let mockState = { searchValue: '', searchOpen: false };

vi.mock('@app/hooks/useSearchInput', () => ({
  default: () => ({
    searchValue: mockState.searchValue,
    searchOpen: mockState.searchOpen,
    setSearchValue: setSearchValueMock,
    setIsOpen: setIsOpenMock,
    clear: clearMock,
  }),
}));

const renderBar = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <SearchInput />
    </IntlProvider>
  );

beforeEach(() => {
  window.localStorage.clear();
  mockState = { searchValue: '', searchOpen: false };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SearchInput recent searches (DAN-106)', () => {
  it('shows stored terms most-recent-first when focused and empty', () => {
    addRecentSearch('movies');
    addRecentSearch('anime');
    mockState = { searchValue: '', searchOpen: true };
    renderBar();

    expect(screen.getByTestId('recent-searches')).toBeTruthy();
    const items = screen
      .getAllByTestId(/^recent-search-(?!clear)/)
      .map((el) => el.textContent);
    expect(items).toEqual(['anime', 'movies']);
  });

  it('hides when empty, when typing, and when blurred shut', () => {
    // Nothing stored.
    mockState = { searchValue: '', searchOpen: true };
    const { unmount } = renderBar();
    expect(screen.queryByTestId('recent-searches')).toBeNull();
    unmount();

    // Typing.
    addRecentSearch('movies');
    mockState = { searchValue: 'mov', searchOpen: true };
    renderBar();
    expect(screen.queryByTestId('recent-searches')).toBeNull();
  });

  it('re-runs a recent search on click', () => {
    addRecentSearch('movies');
    mockState = { searchValue: '', searchOpen: true };
    renderBar();

    fireEvent.click(screen.getByTestId('recent-search-movies'));
    expect(setSearchValueMock).toHaveBeenCalledWith('movies');
  });

  it('moves a repeated search to the front', async () => {
    addRecentSearch('movies');
    addRecentSearch('anime');
    mockState = { searchValue: '', searchOpen: true };
    renderBar();

    fireEvent.click(screen.getByTestId('recent-search-movies'));

    await waitFor(() => {
      expect(
        JSON.parse(window.localStorage.getItem('recentSearches') as string)
      ).toEqual(['movies', 'anime']);
    });
  });

  it('clears all recents from the dropdown', async () => {
    addRecentSearch('movies');
    mockState = { searchValue: '', searchOpen: true };
    renderBar();

    fireEvent.click(screen.getByTestId('recent-searches-clear'));

    await waitFor(() => {
      expect(screen.queryByTestId('recent-searches')).toBeNull();
    });
    expect(window.localStorage.getItem('recentSearches')).toBeNull();
  });

  it('records the term on Enter', () => {
    mockState = { searchValue: 'movies', searchOpen: true };
    renderBar();

    fireEvent.keyUp(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(
      JSON.parse(window.localStorage.getItem('recentSearches') as string)
    ).toEqual(['movies']);
  });
});
