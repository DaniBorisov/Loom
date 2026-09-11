import TvDetails from '@app/components/TvDetails';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { TvDetails as TvDetailsType } from '@server/models/Tv';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface TvPageProps {
  tv?: TvDetailsType;
}

const TvPage: NextPage<TvPageProps> = ({ tv }) => {
  return <TvDetails tv={tv} />;
};

export const getServerSideProps: GetServerSideProps<TvPageProps> = async (
  ctx
) => {
  // TMDB IDs are positive integers — reject anything else before it can
  // reach the request URL (CodeQL js/request-forgery, DAN-107). The
  // validated number (not the raw string) is interpolated below, so path
  // traversal sequences cannot survive.
  const tvId = Number(ctx.query.tvId);
  if (!Number.isInteger(tvId) || tvId <= 0) {
    return { notFound: true };
  }

  const response = await axios.get<TvDetailsType>(
    `http://${getHostAndPort()}/api/v1/tv/${tvId}`,
    {
      headers: ctx.req?.headers?.cookie
        ? { cookie: ctx.req.headers.cookie }
        : undefined,
    }
  );

  return {
    props: {
      tv: response.data,
    },
  };
};

export default TvPage;
