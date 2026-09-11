import CollectionDetails from '@app/components/CollectionDetails';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { Collection } from '@server/models/Collection';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface CollectionPageProps {
  collection?: Collection;
}

const CollectionPage: NextPage<CollectionPageProps> = ({ collection }) => {
  return <CollectionDetails collection={collection} />;
};

export const getServerSideProps: GetServerSideProps<
  CollectionPageProps
> = async (ctx) => {
  // TMDB IDs are positive integers — reject anything else before it can
  // reach the request URL (CodeQL js/request-forgery, DAN-107). The
  // validated number (not the raw string) is interpolated below, so path
  // traversal sequences cannot survive.
  const collectionId = Number(ctx.query.collectionId);
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    return { notFound: true };
  }

  const response = await axios.get<Collection>(
    `http://${getHostAndPort()}/api/v1/collection/${collectionId}`,
    {
      headers: ctx.req?.headers?.cookie
        ? { cookie: ctx.req.headers.cookie }
        : undefined,
    }
  );

  return {
    props: {
      collection: response.data,
    },
  };
};

export default CollectionPage;
