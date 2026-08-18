import UserSettings from '@app/components/UserProfile/UserSettings';
import UserMALSettings from '@app/components/UserProfile/UserSettings/UserMALSettings';
import type { NextPage } from 'next';

const UserSettingsMALPage: NextPage = () => {
  return (
    <UserSettings>
      <UserMALSettings />
    </UserSettings>
  );
};

export default UserSettingsMALPage;
