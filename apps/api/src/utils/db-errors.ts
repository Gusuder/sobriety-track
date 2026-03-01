type PgLikeError = {
  code?: string;
  constraint?: string;
  table?: string;
};

export type ApiMappedError = {
  statusCode: number;
  body: { error: string };
};

export function mapDbError(err: unknown): ApiMappedError | null {
  const dbErr = err as PgLikeError | undefined;
  if (!dbErr?.code) {
    return null;
  }

  // Foreign key to users failed: token user does not exist in current DB.
  if (dbErr.code === '23503' && dbErr.constraint?.includes('user_id_fkey')) {
    return { statusCode: 401, body: { error: 'Unauthorized' } };
  }

  return null;
}
