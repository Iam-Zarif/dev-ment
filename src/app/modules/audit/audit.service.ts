import { prisma } from "../../../lib/prisma/index.js";
import type { CreateAuditLogInput } from "./audit.interface.js";

type AuditClient = Pick<typeof prisma, "auditLog">;

const create = async (
	input: CreateAuditLogInput,
	client: AuditClient = prisma,
) => {
	return client.auditLog.create({
		data: {
			actorUserId: input.actorUserId ?? null,
			action: input.action,
			entityType: input.entityType,
			entityId: input.entityId ?? null,
			...(input.metadata !== undefined
				? {
						metadata: input.metadata,
					}
				: {}),
			ipAddress: input.ipAddress ?? null,
		},
		select: {
			id: true,
			createdAt: true,
		},
	});
};

export const auditService = {
	create,
};
