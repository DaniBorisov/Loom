import { CheckBadgeIcon } from '@heroicons/react/20/solid';

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
        className={`rounded-full border-green-400 bg-green-500/80 ring-green-400 text-green-100 ${
          shrink ? 'w-4 sm:w-5 border p-0' : 'w-5 ring-1 p-0.5'
        }`}
      >
        <CheckBadgeIcon />
      </div>
      <span className="pl-1 pr-2 text-gray-200">In Library</span>
    </div>
  );
};

export default LibraryBadge;
