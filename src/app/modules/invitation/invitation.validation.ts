import { z } from "zod";
import { InvitationStatus } from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { INVITATION_CONSTANTS } from "./invitation.constant.js";

const invitationStatusSchema = z.enum([
	InvitationStatus.PENDING,
	InvitationStatus.ACCEPTED,
	InvitationStatus.REVOKED,
	InvitationStatus.EXPIRED,
]);

export const createInvitationSchema = z
	.object({
		applicationId: z.uuid().optional(),
		applicationIds: z
			.array(z.uuid())
			.min(1, "At least one application is required")
			.max(
				INVITATION_CONSTANTS.MAX_RECIPIENTS_PER_REQUEST,
				`Maximum ${INVITATION_CONSTANTS.MAX_RECIPIENTS_PER_REQUEST} applications are allowed`,
			)
			.optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		const hasSingle = Boolean(data.applicationId);
		const hasMultiple = Boolean(data.applicationIds);

		if (hasSingle === hasMultiple) {
			ctx.addIssue({
				code: "custom",
				message: "Provide either applicationId or applicationIds",
			});
		}

		if (
			data.applicationIds &&
			new Set(data.applicationIds).size !== data.applicationIds.length
		) {
			ctx.addIssue({
				code: "custom",
				path: ["applicationIds"],
				message: "Application IDs must be unique",
			});
		}
	})
	.transform((data) => ({
		applicationIds: data.applicationIds ?? [data.applicationId as string],
	}));
export const invitationTokenSchema = z
	.object({
		token: z
			.string()
			.trim()
			.length(
				INVITATION_CONSTANTS.TOKEN_HEX_LENGTH,
				"Invitation token is invalid",
			)
			.regex(/^[a-f0-9]+$/i, "Invitation token is invalid"),
	})
	.strict();

export const invitationListQuerySchema = z
	.object({
		page: z.coerce
			.number()
			.int()
			.positive()
			.default(APP_CONSTANTS.DEFAULT_PAGE),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(APP_CONSTANTS.MAX_LIMIT)
			.default(APP_CONSTANTS.DEFAULT_LIMIT),
		status: invitationStatusSchema.optional(),
		assessmentId: z.uuid().optional(),
	})
	.strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export type InvitationTokenInput = z.infer<typeof invitationTokenSchema>;

export type InvitationListQuery = z.infer<typeof invitationListQuerySchema>;
