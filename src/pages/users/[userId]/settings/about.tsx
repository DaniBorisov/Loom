import UserSettings from '@app/components/UserProfile/UserSettings';
import CreditsBlock from '@app/components/Settings/SettingsAbout/CreditsBlock';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserAboutPage: NextPage = () => {
  useRouteGuard(Permission.MANAGE_USERS);
  return (
    <UserSettings>
      <CreditsBlock />
    </UserSettings>
  );
};

export default UserAboutPage;
