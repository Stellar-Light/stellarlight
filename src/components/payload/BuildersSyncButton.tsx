'use client';

import { useState } from 'react';
import { Button } from '@payloadcms/ui';
import { toast } from '@payloadcms/ui';

export const BuildersSyncButton = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync/builders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(
          `Successfully synced builders: ${data.results?.created || 0} created, ${data.results?.updated || 0} updated`
        );
      } else {
        toast.error(data.error || 'Failed to sync builders');
      }
    } catch (error) {
      toast.error('Network error while syncing builders');
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      onClick={handleSync}
      disabled={isSyncing}
      size="small"
      buttonStyle="primary"
    >
      {isSyncing ? 'Syncing Builders...' : 'Sync Builders from Passport'}
    </Button>
  );
};