import UserSettings from '@app/components/UserProfile/UserSettings';
import UserMALSettings from '@app/components/UserProfile/UserSettings/UserMALSettings';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserMALPage: NextPage = () => {
  useRouteGuard(Permission.MANAGE_USERS);
  return (
    <UserSettings>
      <UserMALSettings />
    </UserSettings>
  );
};

export default UserMALPage;
