import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { exportFileName } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

import { callFunction } from './functions';

// The signed-in person's own data (design/DECISIONS.md #31; COMPLIANCE §9): download it, or delete the
// account. Both go through the `account` function, which reads and deletes with the service role.

/** Hands the JSON over: a download in the browser version, the share sheet on a phone (save to Files, mail…). */
async function handOver(json: string, name: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: name });
}

export function useAccount() {
  const { supabase } = useAuth();
  return {
    /** Everything MoversHub keeps about the account, saved or shared as a file. False when it failed. */
    downloadData: async (): Promise<boolean> => {
      // Everything about the account, with links to its files: give it more time than a step.
      const answer = await callFunction<object>(supabase, 'account', { action: 'export' }, 45_000);
      if (!answer.ok) return false;
      await handOver(JSON.stringify(answer.data, null, 2), exportFileName(new Date()));
      return true;
    },
    /** Deletes the account (password typed again): `deleted`, or why not. */
    deleteAccount: async (password: string) => {
      const answer = await callFunction<{ status: 'deleted' }>(supabase, 'account', { action: 'delete', password }, 45_000);
      return answer.ok ? ('deleted' as const) : answer.error;
    },
  };
}
