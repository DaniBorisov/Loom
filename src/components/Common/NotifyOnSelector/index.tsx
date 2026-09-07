import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

export type NotifyOnValue =
  | 'both'
  | 'episode_airing'
  | 'available_in_library'
  | 'none';

export const NOTIFY_ON_OPTIONS: { value: NotifyOnValue; labelId: string }[] = [
  { value: 'both', labelId: 'both' },
  { value: 'episode_airing', labelId: 'episodeAiring' },
  { value: 'available_in_library', labelId: 'availableInLibrary' },
  { value: 'none', labelId: 'none' },
];

const messages = defineMessages('components.Common.NotifyOnSelector', {
  notifyLabel: 'Notify me about',
  both: 'New episodes and availability',
  episodeAiring: 'New episodes only',
  availableInLibrary: 'Availability only',
  none: 'Nothing',
});

interface NotifyOnSelectorProps {
  value: NotifyOnValue;
  onChange: (value: NotifyOnValue) => void;
  id?: string;
  label?: string;
}

/**
 * Preference dropdown shared by the global default (notification settings)
 * and per-item overrides (title cards). Values match the server NotifyOn
 * enum (DAN-48).
 */
const NotifyOnSelector = ({
  value,
  onChange,
  id,
  label,
}: NotifyOnSelectorProps) => {
  const intl = useIntl();

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-300">
        {label ?? intl.formatMessage(messages.notifyLabel)}
      </span>
      <select
        id={id}
        data-testid="notify-on-selector"
        className="rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value as NotifyOnValue)}
      >
        {NOTIFY_ON_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {intl.formatMessage(
              messages[option.labelId as keyof typeof messages]
            )}
          </option>
        ))}
      </select>
    </label>
  );
};

export default NotifyOnSelector;
