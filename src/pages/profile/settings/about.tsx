import CreditsBlock from '@app/components/Settings/SettingsAbout/CreditsBlock';
import UserSettings from '@app/components/UserProfile/UserSettings';
import type { NextPage } from 'next';

const UserAboutPage: NextPage = () => {
  return (
    <UserSettings>
      <CreditsBlock />
    </UserSettings>
  );
};

export default UserAboutPage;
