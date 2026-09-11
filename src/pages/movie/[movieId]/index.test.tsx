import { getServerSideProps } from '@app/pages/movie/[movieId]';
import axios from 'axios';
import type { GetServerSidePropsContext } from 'next';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = axios.get as unknown as Mock;

const ctxFor = (movieId: unknown) =>
  ({
    query: { movieId },
    req: { headers: {} },
  }) as unknown as GetServerSidePropsContext;

describe('movie detail getServerSideProps (DAN-107)', () => {
  it('fetches by numeric ID', async () => {
    mockedGet.mockResolvedValue({ data: { id: 200 } });
    const result = await getServerSideProps(ctxFor('200'));

    expect(mockedGet).toHaveBeenCalledTimes(1);
    const url = (mockedGet.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('/api/v1/movie/200');
    expect(url).not.toContain('..');
    expect(result).toEqual({ props: { movie: { id: 200 } } });
  });

  it.each([
    '../../../v1/settings',
    '..%2F..%2Fv1%2Fsettings',
    'abc',
    '',
    '0',
    '-5',
    '1.5',
    '12abc',
  ])('rejects %p with 404 before any request', async (movieId) => {
    mockedGet.mockClear();
    const result = await getServerSideProps(ctxFor(movieId));

    expect(result).toEqual({ notFound: true });
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
