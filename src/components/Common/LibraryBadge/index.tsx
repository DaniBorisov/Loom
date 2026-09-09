import { CheckCircleIcon } from '@heroicons/react/20/solid';

interface LibraryBadgeProps {
  shrink?: boolean;
}

const LibraryBadge = ({ shrink = false }: LibraryBadgeProps) => {
  return (
    <div
      className={`relative inline-flex whitespace-nowrap rounded-full border-gray-700 text-xs font-semibold leading-5 ring-gray-700 ${
        shrink ? '' : 'ring-1'
      }`}
    >
      <div
        className={`rounded-full border-green-400 bg-green-500/80 text-green-100 ring-green-400 ${
          shrink ? 'w-4 border p-0 sm:w-5' : 'w-5 p-0.5 ring-1'
        }`}
      >
        <CheckCircleIcon />
      </div>
    </div>
  );
};

export default LibraryBadge;
