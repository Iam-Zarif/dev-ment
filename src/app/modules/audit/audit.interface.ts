import type { Prisma } from "../../../generated/prisma/client.js";

export type CreateAuditLogInput = {
	actorUserId?: string;
	action: string;
	entityType: string;
	entityId?: string;
	metadata?: Prisma.InputJsonValue;
	ipAddress?: string;
};
