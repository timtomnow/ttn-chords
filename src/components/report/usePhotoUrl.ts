// Turns a stored Photo (Blob in IndexedDB) into an object URL for <img>, and
// revokes it on change/unmount. The DB is the source of truth (repo hook);
// this only manages the ephemeral URL.

import { useEffect, useState } from 'react';
import { usePhotoBlob } from '@/db/repo';

export function usePhotoUrl(id: string | undefined): string | undefined {
  const blob = usePhotoBlob(id);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!(blob instanceof Blob)) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return url;
}
