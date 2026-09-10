import BackToTop from '@app/components/Common/BackToTop';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'pageYOffset', {
    value,
    writable: true,
    configurable: true,
  });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('BackToTop (DAN-59)', () => {
  it('stays hidden at the top of the page', async () => {
    setScrollY(0);
    render(<BackToTop />);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('back-to-top')).toBeNull();
  });

  it('appears after scrolling and jumps to top on click', async () => {
    const scrollToMock = vi.fn();
    vi.stubGlobal('scrollTo', scrollToMock);
    setScrollY(0);
    render(<BackToTop />);

    setScrollY(800);
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByTestId('back-to-top')).toBeTruthy();
    });

    // 44px touch target, floating above the bottom bar.
    expect(screen.getByTestId('back-to-top').className).toContain('h-11');
    expect(screen.getByTestId('back-to-top').className).toContain('w-11');

    fireEvent.click(screen.getByTestId('back-to-top'));
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });
});
