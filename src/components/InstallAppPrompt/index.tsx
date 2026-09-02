import Button from '@app/components/Common/Button';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isIOS } from '@app/utils/installPrompt';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const messages = defineMessages('components.InstallAppPrompt', {
  installApp: 'Install App',
  installAppDescription:
    'Install {applicationTitle} on this device for quick access and a full-screen experience.',
  install: 'Install',
  iosDescription:
    'Tap the Share button in your browser, then select "Add to Home Screen" to install {applicationTitle}.',
  dontShowAgain: "Don't show this again",
});

const STORAGE_KEY = 'install-app-prompt-dismissed';

export const getDismissed = (storage: Pick<Storage, 'getItem'>): boolean =>
  storage.getItem(STORAGE_KEY) === 'true';

export const setDismissed = (storage: Pick<Storage, 'setItem'>): void => {
  storage.setItem(STORAGE_KEY, 'true');
};

interface InstallAppPromptProps {
  applicationTitle?: string;
}

const InstallAppPrompt = ({
  applicationTitle = 'Seerr',
}: InstallAppPromptProps) => {
  const intl = useIntl();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  const iosDevice = isIOS();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (getDismissed(window.localStorage)) {
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // On iOS the event never fires; show the manual instructions instead.
    if (isIOS()) {
      setShow(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    setDismissed(window.localStorage);
  };

  const handleDismiss = (persist: boolean) => {
    if (persist) {
      setDismissed(window.localStorage);
    }
    setShow(false);
  };

  if (!show) {
    return null;
  }

  const installReady = iosDevice || deferredPrompt !== null;

  if (!installReady) {
    return null;
  }

  return (
    <div
      className="fixed bottom-16 left-0 right-0 z-40 flex justify-center px-4 sm:bottom-8"
      role="dialog"
      aria-label={intl.formatMessage(messages.installApp)}
    >
      <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-gray-100">
              {intl.formatMessage(messages.installApp)}
            </div>
            <div className="mt-1 text-sm text-gray-300">
              {iosDevice
                ? intl.formatMessage(messages.iosDescription, {
                    applicationTitle,
                  })
                : intl.formatMessage(messages.installAppDescription, {
                    applicationTitle,
                  })}
            </div>
          </div>
          <button
            type="button"
            aria-label={intl.formatMessage(globalMessages.close)}
            onClick={() => handleDismiss(false)}
            className="ml-2 text-gray-400 hover:text-gray-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center text-xs text-gray-400">
            <input
              type="checkbox"
              className="mr-2"
              data-testid="dont-show-again"
              onChange={(e) => handleDismiss(e.target.checked)}
            />
            {intl.formatMessage(messages.dontShowAgain)}
          </label>
          {!iosDevice && deferredPrompt && (
            <Button
              type="button"
              onClick={handleInstall}
              data-testid="install-button"
            >
              {intl.formatMessage(messages.install)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallAppPrompt;
