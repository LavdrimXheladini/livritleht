import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  MOVER_DOCUMENT_COLUMNS,
  documentPath,
  moverDocumentRowSchema,
  type DocumentMimeType,
  type DocumentType,
  type MoverDocumentRow,
} from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const BUCKET = 'mover-documents';
const documentsKey = (companyId: string | undefined) => ['mover-documents', companyId] as const;

/** The company's current documents (RLS: its owner only); one per type. */
export function useMoverDocuments(companyId: string | undefined) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: documentsKey(companyId),
    enabled: companyId !== undefined,
    retry: 1,
    networkMode: 'always',
    staleTime: 60_000,
    queryFn: async (): Promise<MoverDocumentRow[]> => {
      const { data, error } = await supabase.from('mover_documents').select(MOVER_DOCUMENT_COLUMNS).eq('company_id', companyId ?? '');
      if (error) throw error;
      return moverDocumentRowSchema.array().parse(data);
    },
  });
}

/** A file chosen on the phone (camera or files) or in the browser. */
export type ChosenFile = { uri: string; name: string; mime: DocumentMimeType; size: number | null };

/** A new name for every upload: files are never overwritten (the replaced one is removed after). */
const fileId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Uploads a document: the file into the company's folder of the private bucket, then the document row
 * (new, or replacing the file and end date of the current one — Postgres then clears its check), then
 * removes the replaced file. A failed row write removes the new file again.
 */
export function useUploadDocument(companyId: string | undefined) {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({
      type,
      file,
      expiresOn,
      current,
    }: {
      type: DocumentType;
      file: ChosenFile;
      /** "2027-12-31", or null for documents without an end date. */
      expiresOn: string | null;
      current: MoverDocumentRow | undefined;
    }) => {
      if (!companyId) throw new Error('no company');
      const bytes = await (await fetch(file.uri)).arrayBuffer();
      const path = documentPath(companyId, type, fileId(), file.mime);
      const uploaded = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: file.mime, upsert: false });
      if (uploaded.error) throw uploaded.error;

      // Valid through the whole last day.
      const expires_at = expiresOn ? `${expiresOn}T23:59:59Z` : null;
      const write = current
        ? supabase.from('mover_documents').update({ file_path: path, expires_at }).eq('id', current.id)
        : supabase.from('mover_documents').insert({ company_id: companyId, type, file_path: path, expires_at });
      const { data, error } = await write.select(MOVER_DOCUMENT_COLUMNS).single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      if (current) await supabase.storage.from(BUCKET).remove([current.file_path]);
      return moverDocumentRowSchema.parse(data);
    },
    onSuccess: (row) =>
      queryClient.setQueryData<MoverDocumentRow[]>(documentsKey(companyId), (rows = []) => [...rows.filter((r) => r.type !== row.type), row]),
  });
}
