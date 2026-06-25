import { createHash } from 'node:crypto';

// Session and password-reset tokens are stored HASHED at rest. The raw value lives only
// in the user's cookie / reset link; the DB (and Redis) hold sha256(token). So a DB
// backup leak, read-replica exposure, or Redis dump never yields a usable token.
export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');
