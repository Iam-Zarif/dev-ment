import type { Request } from "express";
import type { UserRole } from "../../../generated/prisma/enums.js";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { profileService } from "./profile.service.js";
import type {
	CreateUploadSignatureInput,
	UpdateCandidateProfileInput,
	UpdateRecruiterProfileInput,
} from "./profile.validation.js";

const getIdentity = (
	req: Request,
): {
	userId: string;
	role: UserRole;
} => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	return {
		userId: req.user.userId,
		role: req.user.role,
	};
};

const updateCandidate = catchAsync(async (req, res) => {
	const { userId } = getIdentity(req);

	const data = await profileService.updateCandidate(
		userId,
		req.body as UpdateCandidateProfileInput,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Candidate profile updated successfully",
		data,
	});
});

const updateRecruiter = catchAsync(async (req, res) => {
	const { userId } = getIdentity(req);

	const data = await profileService.updateRecruiter(
		userId,
		req.body as UpdateRecruiterProfileInput,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Recruiter profile updated successfully",
		data,
	});
});

const createUploadSignature = catchAsync(async (req, res) => {
	const { userId, role } = getIdentity(req);

	const data = await profileService.createUploadSignature(
		userId,
		role,
		req.body as CreateUploadSignatureInput,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Cloudinary upload signature created successfully",
		data,
	});
});

export const profileController = {
	updateCandidate,
	updateRecruiter,
	createUploadSignature,
};
