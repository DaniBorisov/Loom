import MovieDetails from '@app/components/MovieDetails';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { MovieDetails as MovieDetailsType } from '@server/models/Movie';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface MoviePageProps {
  movie?: MovieDetailsType;
}

const MoviePage: NextPage<MoviePageProps> = ({ movie }) => {
  return <MovieDetails movie={movie} />;
};

export const getServerSideProps: GetServerSideProps<MoviePageProps> = async (
  ctx
) => {
  // TMDB IDs are positive integers — reject anything else before it can
  // reach the request URL (CodeQL js/request-forgery, DAN-107). The
  // validated number (not the raw string) is interpolated below, so path
  // traversal sequences cannot survive.
  const movieId = Number(ctx.query.movieId);
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return { notFound: true };
  }

  const response = await axios.get<MovieDetailsType>(
    `http://${getHostAndPort()}/api/v1/movie/${movieId}`,
    {
      headers: ctx.req?.headers?.cookie
        ? { cookie: ctx.req.headers.cookie }
        : undefined,
    }
  );

  return {
    props: {
      movie: response.data,
    },
  };
};

export default MoviePage;
