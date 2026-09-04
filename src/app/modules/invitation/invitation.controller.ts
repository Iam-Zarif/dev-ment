import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { invitationService } from "./invitation.service.js";
import type {
	CreateInvitationInput,
	InvitationListQuery,
	InvitationTokenInput,
} from "./invitation.validation.js";

const getUserId = (req: Request): string => {
	const userId = req.user?.userId;

	if (!userId) {
		throw new AppError(401, "Authentication required");
	}

	return userId;
};

const getInvitationId = (req: Request): string => {
	const invitationId = req.params.id;

	if (typeof invitationId !== "string" || !invitationId) {
		throw new AppError(400, "Invitation ID is required");
	}

	return invitationId;
};

const create = catchAsync(async (req, res) => {
	const data = await invitationService.create(
		getUserId(req),
		req.body as CreateInvitationInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 202,
		message: data.queueAccepted
			? "Invitations queued successfully"
			: "Invitations created and waiting for queue recovery",
		data,
	});
});

const getAll = catchAsync(async (req, res) => {
	const data = await invitationService.getAll(
		getUserId(req),
		req.query as unknown as InvitationListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Invitations retrieved successfully",
		data,
	});
});

const resend = catchAsync(async (req, res) => {
	const data = await invitationService.resend(
		getUserId(req),
		getInvitationId(req),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 202,
		message: data.queueAccepted
			? "Invitation resend queued successfully"
			: "Invitation resend created and waiting for queue recovery",
		data,
	});
});

const revoke = catchAsync(async (req, res) => {
	const data = await invitationService.revoke(
		getUserId(req),
		getInvitationId(req),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Invitation revoked successfully",
		data,
	});
});

const verify = catchAsync(async (req, res) => {
	const data = await invitationService.verify(
		getUserId(req),
		req.body as InvitationTokenInput,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Invitation verified successfully",
		data,
	});
});

const accept = catchAsync(async (req, res) => {
	const data = await invitationService.accept(
		getUserId(req),
		req.body as InvitationTokenInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Invitation accepted successfully",
		data,
	});
});

export const invitationController = {
	create,
	getAll,
	resend,
	revoke,
	verify,
	accept,
};
