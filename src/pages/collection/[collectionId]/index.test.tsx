import { getServerSideProps } from '@app/pages/collection/[collectionId]';
import axios from 'axios';
import type { GetServerSidePropsContext } from 'next';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const mockedGet = axios.get as unknown as Mock;

const ctxFor = (collectionId: unknown) =>
  ({
    query: { collectionId },
    req: { headers: {} },
  }) as unknown as GetServerSidePropsContext;

describe('collection detail getServerSideProps (DAN-107)', () => {
  it('fetches by numeric ID', async () => {
    mockedGet.mockResolvedValue({ data: { id: 300 } });
    const result = await getServerSideProps(ctxFor('300'));

    expect(mockedGet).toHaveBeenCalledTimes(1);
    const url = (mockedGet.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('/api/v1/collection/300');
    expect(url).not.toContain('..');
    expect(result).toEqual({ props: { collection: { id: 300 } } });
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
  ])('rejects %p with 404 before any request', async (collectionId) => {
    mockedGet.mockClear();
    const result = await getServerSideProps(ctxFor(collectionId));

    expect(result).toEqual({ notFound: true });
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
