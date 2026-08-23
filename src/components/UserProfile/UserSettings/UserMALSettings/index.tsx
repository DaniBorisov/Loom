import MalLogo from '@app/assets/services/mal.svg';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  LinkIcon,
    TrashIcon,
    XCircleIcon,
  } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserMALSettings',
  {
    malSettings: 'MyAnimeList Settings',
    malSettingsDescription:
      'Connect your MyAnimeList account to import your anime watchlist and keep it in sync with {applicationName}.',
    connectMal: 'Connect MyAnimeList',
    connected: 'Connected',
    malUsername: 'MAL Username',
    disconnect: 'Disconnect',
    disconnectConfirm:
      'Are you sure you want to disconnect your MyAnimeList account? This will not remove already-imported items.',
    importAnimeList: 'Import Anime List',
    importDescription:
      'Import your MyAnimeList anime list into your {applicationName} watchlist.',
    importStarted: 'Import started!',
    importComplete: 'Import complete!',
    importError: 'Import failed. Please try again.',
    imported: 'Imported',
    skipped: 'Skipped',
    conflicts: 'Conflicts',
    errors: 'Errors',
    autoSync: 'Auto-Sync',
    autoSyncDescription:
      'Periodically sync status changes from your MAL list to your watchlist.',
    saving: 'Saving…',
    toastSaveSuccess: 'Settings saved successfully!',
    toastSaveError: 'Something went wrong while saving settings.',
    connectError: 'Failed to connect to MyAnimeList. Please try again.',
    noImportInProgress: 'No import in progress.',
    reauthRequired:
      'Your MAL token has expired. Please disconnect and reconnect your MAL account.',
    importRunning: 'Importing… {progress}/{total}',
    alreadyImported: 'Already Imported (Up to Date)',
    reimport: 'Re-Import',
    removeMalImport: 'Remove Imported List',
    removeMalImportConfirm:
      'This will remove all MAL-imported watchlist items from Loom. Your MyAnimeList account and connection will not be affected. You can re-import later.',
    removeMalImportSuccess:
      'Removed {count} MAL-imported watchlist item(s).',
    removeMalImportEmpty: 'No MAL-imported items to remove.',
  }
);

type ImportProgress = {
  running: boolean;
  progress: number;
  total: number;
  result?: {
    imported: number;
    skipped: number;
    conflicts: unknown[];
    errors: string[];
  };
};

const UserMALSettings = () => {
  const intl = useIntl();
  const router = useRouter();
  const { user, revalidate: revalidateUser } = useUser({
    id: Number(router.query.userId),
  });
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    conflicts: number;
    errors: number;
  } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [savingSync, setSavingSync] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const isMalConnected = !!user?.malUsername;

  // Detect ?mal=connected query param
  useEffect(() => {
    if (router.query.mal === 'connected') {
      revalidateUser();
      // Remove query param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('mal');
      window.history.replaceState({}, '', url.toString());
    }
  }, [router.query.mal, revalidateUser]);

  // Sync autoSync state from user data
  useEffect(() => {
    if (user?.settings?.malSyncEnabled !== undefined) {
      setAutoSyncEnabled(user.settings.malSyncEnabled);
    }
  }, [user?.settings?.malSyncEnabled]);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get<{ url: string }>('/api/v1/auth/mal');
      window.open(res.data.url, '_blank');
    } catch {
      setError(intl.formatMessage(messages.connectError));
    }
  }, [intl]);

  const handleDisconnect = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      await axios.delete(
        `/api/v1/user/${user.id}/settings/linked-accounts/mal`
      );
      await revalidateUser();
    } catch {
      setError(intl.formatMessage(messages.toastSaveError));
    }
  }, [user, revalidateUser, intl]);

  const handleImport = useCallback(async () => {
    if (!user) return;
    setError(null);
    setImportResult(null);
    setProgress(null);
    setImporting(true);

    // Clear any leftover interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    try {
      await axios.post(`/api/v1/user/${user.id}/settings/mal/import`);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        // Import already running, just start polling
      } else if (status === 400) {
        setError(intl.formatMessage(messages.reauthRequired));
        setImporting(false);
        return;
      } else {
        setError(intl.formatMessage(messages.importError));
        setImporting(false);
        return;
      }
    }

    // Start polling for progress every 500ms via setInterval (bypasses SWR tab throttling)
    progressIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get<ImportProgress>(
          `/api/v1/user/${user.id}/settings/mal/import/progress`
        );
        setProgress(data);
        if (!data.running && data.result) {
          // Import finished
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          setImporting(false);
          setImportResult({
            imported: data.result.imported,
            skipped: data.result.skipped,
            conflicts: data.result.conflicts.length,
            errors: data.result.errors.length,
          });
        }
      } catch {
        // Silently retry on next tick
      }
    }, 500);
  }, [user, intl]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handleToggleAutoSync = useCallback(async () => {
    if (!user) return;
    setSavingSync(true);
    try {
      await axios.post(`/api/v1/user/${user.id}/settings/main`, {
        malSyncEnabled: !autoSyncEnabled,
      });
      setAutoSyncEnabled(!autoSyncEnabled);
      await revalidateUser();
    } catch {
      setError(intl.formatMessage(messages.toastSaveError));
    } finally {
      setSavingSync(false);
    }
  }, [user, autoSyncEnabled, revalidateUser, intl]);

  const handleRemoveMalImport = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await axios.delete<{ deleted: number }>(
        '/api/v1/watchlist/mal-import'
      );
      setError(null);
      setImportResult(null);
      setProgress(null);
      if (data.deleted > 0) {
        setSuccessMessage(
          intl.formatMessage(messages.removeMalImportSuccess, {
            count: data.deleted,
          })
        );
      } else {
        setSuccessMessage(
          intl.formatMessage(messages.removeMalImportEmpty)
        );
      }
    } catch {
      setSuccessMessage(null);
      setError(intl.formatMessage(messages.toastSaveError));
    }
  }, [user, intl]);

  const applicationTitle =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any)?.settings?.applicationTitle || 'Loom';

  if (!user) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.malSettings),
          intl.formatMessage(globalMessages.usersettings),
          user.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.malSettings)}</h3>
        <h6 className="description">
          {intl.formatMessage(messages.malSettingsDescription, {
            applicationName: applicationTitle,
          })}
        </h6>
      </div>

      {error && (
        <div className="mb-6">
          <Alert title={error} type="error" />
        </div>
      )}

      {successMessage && (
        <div className="mb-6">
          <Alert title={successMessage} type="info" />
        </div>
      )}

      {/* Connected Account Card */}
      {isMalConnected ? (
        <div className="mb-6 overflow-hidden rounded-lg bg-gray-800/50 px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800">
              <MalLogo className="h-8 w-8" />
            </div>
            <div className="flex-grow">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-gray-300">
                  {intl.formatMessage(messages.connected)}
                </div>
                <CheckCircleIcon className="h-4 w-4 text-green-400" />
              </div>
              <div className="text-xl font-semibold text-white">
                {user.malUsername}
              </div>
            </div>
            <ConfirmButton
              onClick={handleDisconnect}
              confirmText={intl.formatMessage(globalMessages.areyousure)}
            >
              <XCircleIcon className="h-5 w-5" />
              <span>{intl.formatMessage(messages.disconnect)}</span>
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg bg-gray-800/50 px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800">
              <MalLogo className="h-8 w-8" />
            </div>
            <div className="flex-grow">
              <div className="text-sm font-bold text-gray-300">
                {intl.formatMessage(messages.connectMal)}
              </div>
              <div className="text-white">
                Link your MyAnimeList account to import your anime list.
              </div>
            </div>
            <Button buttonType="primary" onClick={handleConnect}>
              <LinkIcon className="mr-2 h-5 w-5" />
              {intl.formatMessage(messages.connectMal)}
            </Button>
          </div>
        </div>
      )}

      {/* Import Section */}
      {isMalConnected && (
        <div className="mb-6 overflow-hidden rounded-lg bg-gray-800/50 px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6">
          <h4 className="mb-2 text-lg font-semibold text-white">
            {intl.formatMessage(messages.importAnimeList)}
          </h4>
          <p className="mb-4 text-sm text-gray-400">
            {intl.formatMessage(messages.importDescription, {
              applicationName: applicationTitle,
            })}
          </p>

          {progress?.running || importing ? (
            <div className="space-y-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${
                      progress?.total
                        ? (progress.progress / progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="text-sm text-gray-400">
                {intl.formatMessage(messages.importRunning, {
                  progress: progress?.progress ?? 0,
                  total: progress?.total ?? 0,
                })}
              </div>
            </div>
          ) : importResult ? (
            <div className="space-y-3">
              {importResult.imported > 0 ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircleIcon className="h-5 w-5" />
                  {intl.formatMessage(messages.importComplete)}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-blue-400">
                  <CheckCircleIcon className="h-5 w-5" />
                  {intl.formatMessage(messages.alreadyImported)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-gray-400">
                    {intl.formatMessage(messages.imported)}:
                  </span>{' '}
                  <span className="font-semibold text-white">
                    {importResult.imported}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">
                    {intl.formatMessage(messages.skipped)}:
                  </span>{' '}
                  <span className="font-semibold text-white">
                    {importResult.skipped}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">
                    {intl.formatMessage(messages.conflicts)}:
                  </span>{' '}
                  <span className="font-semibold text-white">
                    {importResult.conflicts}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">
                    {intl.formatMessage(messages.errors)}:
                  </span>{' '}
                  <span className="font-semibold text-white">
                    {importResult.errors}
                  </span>
                </div>
              </div>
              <Button
                buttonType="default"
                onClick={handleImport}
                className="mt-2"
              >
                <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
                {intl.formatMessage(messages.reimport)}
              </Button>
            </div>
          ) : (
            <Button
              buttonType="primary"
              onClick={handleImport}
              disabled={importing}
            >
              <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
              {intl.formatMessage(messages.importAnimeList)}
            </Button>
          )}
          <div className="mt-4 border-t border-gray-700 pt-4">
            <ConfirmButton
              onClick={handleRemoveMalImport}
              confirmText={intl.formatMessage(globalMessages.areyousure)}
            >
              <TrashIcon className="h-5 w-5" />
              <span>{intl.formatMessage(messages.removeMalImport)}</span>
            </ConfirmButton>
            <p className="mt-2 text-xs text-gray-500">
              {intl.formatMessage(messages.removeMalImportConfirm)}
            </p>
          </div>
        </div>
      )}

      {/* Auto-Sync Toggle */}
      {isMalConnected && (
        <div className="overflow-hidden rounded-lg bg-gray-800/50 px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-white">
                {intl.formatMessage(messages.autoSync)}
              </h4>
              <p className="text-sm text-gray-400">
                {intl.formatMessage(messages.autoSyncDescription)}
              </p>
            </div>
            <button
              type="button"
              disabled={savingSync}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoSyncEnabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
              onClick={handleToggleAutoSync}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default UserMALSettings;
