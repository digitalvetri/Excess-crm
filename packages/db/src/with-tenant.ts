import { PrismaClient, Prisma, type UserRole } from '@prisma/client';

export interface TenantContext {
  tenantId: string;
  role: UserRole;
  userId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES: ReadonlySet<string> = new Set([
  'ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER', 'ENGINEER',
]);

// Sentinel IDs used by background workers acting as system
export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
export const SYSTEM_USER_ID   = '00000000-0000-0000-0000-000000000001';

export async function withTenantContext<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(ctx.tenantId) || !UUID_RE.test(ctx.userId) || !VALID_ROLES.has(ctx.role)) {
    throw new Error('Invalid tenant context');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${ctx.tenantId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.role = '${ctx.role}'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${ctx.userId}'`);
    return fn(tx);
  });
}

/**
 * Used by BullMQ workers that operate without a user session.
 * Sets role=ADMIN which triggers the admin_bypass RLS policy.
 * Pass the real tenantId when known; use SYSTEM_TENANT_ID for cross-tenant lookups.
 */
export async function withSystemContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantContext(prisma, { tenantId, role: 'ADMIN', userId: SYSTEM_USER_ID }, fn);
}
