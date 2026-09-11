import TmdbLogo from '@app/assets/tmdb_logo.svg';
import List from '@app/components/Common/List';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.Credits', {
  credits: 'Credits',
  forkedfrom: 'Forked from Seerr',
  anilist: 'AniList',
  myanimelist: 'MyAnimeList',
  tmdbattribution:
    'This product uses the TMDb API but is not endorsed or certified by TMDb',
  usagetitle: 'Usage',
  usagenotice:
    'Loom is a personal, non-commercial media companion for self-hosted setups.',
});

/**
 * Shared data-source credits + usage notice (DAN-67/68/69, extended to
 * user settings). Rendered in the admin About page and the user About tab
 * alike so the two copies cannot drift.
 */
const CreditsBlock = () => {
  const intl = useIntl();

  return (
    <>
      <div className="section">
        <List title={intl.formatMessage(messages.credits)}>
          <List.Item title={intl.formatMessage(messages.forkedfrom)}>
            <a
              href="https://github.com/seerr-team/seerr"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://github.com/seerr-team/seerr
            </a>
          </List.Item>
          <List.Item title="TMDB">
            <div className="flex items-center gap-3">
              <TmdbLogo
                className="h-6 w-auto flex-shrink-0"
                data-testid="tmdb-logo"
              />
              <span>{intl.formatMessage(messages.tmdbattribution)}</span>
            </div>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.anilist)}>
            <a
              href="https://anilist.co"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://anilist.co
            </a>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.myanimelist)}>
            <a
              href="https://myanimelist.net"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://myanimelist.net
            </a>
          </List.Item>
        </List>
      </div>
      <div className="section">
        <h3 className="heading">{intl.formatMessage(messages.usagetitle)}</h3>
        <p className="description">
          {intl.formatMessage(messages.usagenotice)}
        </p>
      </div>
    </>
  );
};

export default CreditsBlock;
