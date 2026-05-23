import type { PrismaClient } from '@excess/db';

interface NotifyPayload {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  linkHref?: string;
}

export async function notifyUser(prisma: PrismaClient, payload: NotifyPayload): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        ...(payload.body !== undefined && { body: payload.body }),
        ...(payload.linkHref !== undefined && { linkHref: payload.linkHref }),
      },
    });
  } catch {
    // Non-critical — never let notification failure break the caller
  }
}
