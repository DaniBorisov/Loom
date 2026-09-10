import Dropdown from '@app/components/Common/Dropdown';
import type { NotifyOnValue } from '@app/components/Common/NotifyOnSelector';
import {
  NOTIFY_ON_OPTIONS,
  notifyOnOptionMessages,
} from '@app/components/Common/NotifyOnSelector';
import { BellIcon } from '@heroicons/react/24/outline';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { useIntl } from 'react-intl';

interface NotifyOnDropdownProps {
  value: NotifyOnValue;
  onChange: (value: NotifyOnValue) => void;
}

/**
 * Per-item notification override styled like the PlayButton ghost
 * dropdown (DAN-57): a bell "Notification" button with a split chevron
 * that expands to the preference options. The current choice is marked
 * with a check.
 */
const NotifyOnDropdown = ({ value, onChange }: NotifyOnDropdownProps) => {
  const intl = useIntl();

  return (
    <Dropdown
      buttonType="ghost"
      data-testid="notify-on-selector"
      text={
        <span className="flex items-center gap-2">
          <BellIcon className="h-5 w-5" />
          <span>Notification</span>
        </span>
      }
      dropdownIcon={
        <>
          <span
            aria-hidden="true"
            className="-my-2 w-px self-stretch bg-gray-600"
          />
          <ChevronDownIcon className="h-5 w-5" />
        </>
      }
    >
      {NOTIFY_ON_OPTIONS.map((option) => (
        <Dropdown.Item
          key={option.value}
          buttonType="ghost"
          data-testid={`notify-on-option-${option.value}`}
          onClick={() => onChange(option.value)}
        >
          <span className="flex w-full items-center justify-between gap-2">
            {intl.formatMessage(
              notifyOnOptionMessages[
                option.labelId as
                  | 'both'
                  | 'episodeAiring'
                  | 'availableInLibrary'
                  | 'none'
              ]
            )}
            {option.value === value && <CheckIcon className="h-4 w-4" />}
          </span>
        </Dropdown.Item>
      ))}
    </Dropdown>
  );
};

export default NotifyOnDropdown;
