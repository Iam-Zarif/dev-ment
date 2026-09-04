import { createNodeRedisClient, Queue } from "bullmq";
import { createClient } from "redis";
import { config } from "../../../config/index.js";
import { NotificationStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { INVITATION_CONSTANTS } from "./invitation.constant.js";

export type InvitationEmailJobData = {
	invitationId: string;
	notificationLogId: string;
};

export const INVITATION_EMAIL_QUEUE_NAME = "invitation-email";

const invitationQueueRedisClient = createClient({
	url: config.redis.url,
	socket: {
		connectTimeout: config.redis.connectTimeoutMs,
		reconnectStrategy: (retries) =>
			Math.min(1000 * 2 ** Math.min(retries, 5), 20000),
	},
});

invitationQueueRedisClient.on("error", () => undefined);

export const invitationQueueConnection = createNodeRedisClient(
	invitationQueueRedisClient,
);

export const invitationEmailQueue = new Queue<InvitationEmailJobData>(
	INVITATION_EMAIL_QUEUE_NAME,
	{
		connection: invitationQueueConnection,
		prefix: `${config.redis.keyPrefix}bull`,
		defaultJobOptions: {
			attempts: config.invitationEmail.maxAttempts,
			backoff: {
				type: "exponential",
				delay: config.invitationEmail.retryDelayMs,
			},
			removeOnComplete: 1000,
			removeOnFail: 5000,
		},
	},
);

export const enqueueInvitationEmailJobs = async (
	jobs: InvitationEmailJobData[],
): Promise<void> => {
	if (jobs.length === 0) {
		return;
	}

	await invitationEmailQueue.addBulk(
		jobs.map((job) => ({
			name: "send-invitation-email",
			data: job,
			opts: {
				jobId: job.notificationLogId,
			},
		})),
	);
};

export const recoverPendingInvitationEmailJobs = async (): Promise<number> => {
	const logs = await prisma.notificationLog.findMany({
		where: {
			notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
			entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
			status: NotificationStatus.PENDING,
			entityId: {
				not: null,
			},
		},
		orderBy: {
			createdAt: "asc",
		},
		take: INVITATION_CONSTANTS.RECOVERY_BATCH_SIZE,
		select: {
			id: true,
			entityId: true,
		},
	});

	await enqueueInvitationEmailJobs(
		logs.flatMap((log) =>
			log.entityId
				? [
						{
							invitationId: log.entityId,
							notificationLogId: log.id,
						},
					]
				: [],
		),
	);

	return logs.length;
};

export const closeInvitationEmailQueue = async (): Promise<void> => {
	await invitationEmailQueue.close();

	if (invitationQueueRedisClient.isOpen) {
		await invitationQueueRedisClient.quit();
	}
};
