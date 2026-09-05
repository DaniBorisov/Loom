/**
 * VAPID key resolution (DAN-43).
 *
 * VAPID identifies our server to push services (FCM, Mozilla autopush, …)
 * without a per-service account. The public key is shipped to the frontend
 * for `PushManager.subscribe()`; the private key must stay server-side.
 *
 * Precedence:
 *   1. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars (both must be set;
 *      a half-set pair is ignored entirely — mixing keys from different
 *      pairs silently breaks every subscription).
 *   2. The stored pair from settings.json.
 *   3. A freshly generated pair (persisted by the caller via `changed`).
 *
 * Rotation note: VAPID keys rarely need rotating, but rotating them
 * invalidates EVERY existing push subscription — the push service rejects
 * sends signed with the old key (typically 410 Gone), our sender deletes
 * those rows, and each user must re-subscribe on every device. There is no
 * migration path; rotation is effectively "everyone opts in again".
 */

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface VapidResolution extends VapidKeyPair {
  /** True when the caller should persist the resolved pair. */
  changed: boolean;
  /** Where the resolved pair came from. */
  source: 'env' | 'stored' | 'generated';
}

interface ResolveVapidKeysInput {
  storedPublic: string;
  storedPrivate: string;
  envPublic?: string;
  envPrivate?: string;
  generate: () => VapidKeyPair;
}

export const resolveVapidKeys = ({
  storedPublic,
  storedPrivate,
  envPublic,
  envPrivate,
  generate,
}: ResolveVapidKeysInput): VapidResolution => {
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      changed: false,
      source: 'env',
    };
  }

  if (storedPublic && storedPrivate) {
    return {
      publicKey: storedPublic,
      privateKey: storedPrivate,
      changed: false,
      source: 'stored',
    };
  }

  const generated = generate();
  return {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    changed: true,
    source: 'generated',
  };
};
