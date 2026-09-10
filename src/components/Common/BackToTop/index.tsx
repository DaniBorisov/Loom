import { ArrowUpIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';

const SHOW_AFTER_PX = 480;

/**
 * Floating back-to-top bubble (DAN-59): bottom-right, floating above the
 * mobile bottom bar, appearing once the page is scrolled down.
 */
const BackToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.pageYOffset > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  const scrollToTop = () => {
    const reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      aria-label="Back to top"
      data-testid="back-to-top"
      onClick={scrollToTop}
      className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-gray-600 bg-gray-800/90 text-gray-100 shadow-lg backdrop-blur transition hover:border-gray-200 sm:bottom-8"
    >
      <ArrowUpIcon className="h-5 w-5" />
    </button>
  );
};

export default BackToTop;
