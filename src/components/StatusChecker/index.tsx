import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { StatusResponse } from '@server/interfaces/api/settingsInterfaces';
import { Fragment, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.StatusChecker', {
  appUpdated: '{applicationTitle} Updated',
  appUpdatedDescription:
    'Please click the button below to reload the application.',
  reloadApp: 'Reload {applicationTitle}',
  restartRequired: 'Server Restart Required',
  restartRequiredDescription:
    'Please restart the server to apply the updated settings.',
  connectionLost: 'Connection to {applicationTitle} lost — retrying…',
});

// Consecutive heartbeat failures before showing the banner (a single
// transient blip must not flash it).
export const CONNECTION_LOST_THRESHOLD = 2;

const StatusChecker = () => {
  const intl = useIntl();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Fail fast-ish while the connection is down so the banner clears quickly
  // once the server is back; otherwise keep the quiet 60s heartbeat.
  const connectionLost =
    consecutiveFailures >= CONNECTION_LOST_THRESHOLD;

  const { data, error } = useSWR<StatusResponse>(
    '/api/v1/status?checkUpdateAvailable=false',
    {
      refreshInterval: connectionLost ? 10 * 1000 : 60 * 1000,
    }
  );

  useEffect(() => {
    if (error) {
      setConsecutiveFailures((count) => count + 1);
    } else if (data) {
      // Any successful poll clears the failed state (and the banner) with
      // no user action required.
      setConsecutiveFailures(0);
    }
  }, [error, data]);

  useEffect(() => {
    if (!data?.restartRequired) {
      setAlertDismissed(false);
    }
  }, [data?.restartRequired]);

  if (!data && !connectionLost) {
    return null;
  }

  return (
    <>
      {connectionLost && (
        <div
          className="fixed left-0 right-0 top-0 z-40 flex justify-center px-4 pt-4"
          role="alert"
        >
          <div className="w-full max-w-lg">
            <Alert
              type="error"
              title={intl.formatMessage(messages.connectionLost, {
                applicationTitle: settings.currentSettings.applicationTitle,
              })}
            />
          </div>
        </div>
      )}
      {data && (
        <Transition
          as={Fragment}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          appear
          show={
            !alertDismissed &&
            ((hasPermission(Permission.ADMIN) && data.restartRequired) ||
              data.commitTag !== process.env.commitTag)
          }
        >
          {hasPermission(Permission.ADMIN) && data.restartRequired ? (
        <Modal
          title={intl.formatMessage(messages.restartRequired)}
          backgroundClickable={false}
          onOk={() => {
            setAlertDismissed(true);
            if (data.commitTag !== process.env.commitTag) {
              location.reload();
            }
          }}
          okText={intl.formatMessage(globalMessages.close)}
        >
          {intl.formatMessage(messages.restartRequiredDescription)}
        </Modal>
      ) : (
        <Modal
          title={intl.formatMessage(messages.appUpdated, {
            applicationTitle: settings.currentSettings.applicationTitle,
          })}
          onOk={() => location.reload()}
          okText={intl.formatMessage(messages.reloadApp, {
            applicationTitle: settings.currentSettings.applicationTitle,
          })}
          backgroundClickable={false}
        >
          {intl.formatMessage(messages.appUpdatedDescription)}
          </Modal>
        )}
      </Transition>
      )}
    </>
  );
};

export default StatusChecker;
