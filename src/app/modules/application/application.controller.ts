import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { applicationService } from "./application.service.js";
import type {
	ApplicationListQuery,
	ApplyAssessmentInput,
	RejectApplicationInput,
} from "./application.validation.js";

const getUserId = (req: Request): string => {
	const userId = req.user?.userId;

	if (!userId) {
		throw new AppError(401, "Authentication required");
	}

	return userId;
};

const getApplicationId = (req: Request): string => {
	const applicationId = req.params.id;

	if (typeof applicationId !== "string" || !applicationId) {
		throw new AppError(400, "Application ID is required");
	}

	return applicationId;
};

const apply = catchAsync(async (req, res) => {
	const data = await applicationService.apply(
		getUserId(req),
		req.body as ApplyAssessmentInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Application submitted successfully",
		data,
	});
});

const getMine = catchAsync(async (req, res) => {
	const data = await applicationService.getMine(
		getUserId(req),
		req.query as unknown as ApplicationListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Applications retrieved successfully",
		data,
	});
});

const getMineById = catchAsync(async (req, res) => {
	const data = await applicationService.getMineById(
		getUserId(req),
		getApplicationId(req),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Application retrieved successfully",
		data,
	});
});

const getRecruiterApplications = catchAsync(async (req, res) => {
	const data = await applicationService.getRecruiterApplications(
		getUserId(req),
		req.query as unknown as ApplicationListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Applicant list retrieved successfully",
		data,
	});
});

const getRecruiterApplicationById = catchAsync(async (req, res) => {
	const data = await applicationService.getRecruiterApplicationById(
		getUserId(req),
		getApplicationId(req),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Applicant details retrieved successfully",
		data,
	});
});

const shortlist = catchAsync(async (req, res) => {
	const data = await applicationService.shortlist(
		getUserId(req),
		getApplicationId(req),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Candidate shortlisted successfully",
		data,
	});
});

const reject = catchAsync(async (req, res) => {
	const data = await applicationService.reject(
		getUserId(req),
		getApplicationId(req),
		req.body as RejectApplicationInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Application rejected successfully",
		data,
	});
});

export const applicationController = {
	apply,
	getMine,
	getMineById,
	getRecruiterApplications,
	getRecruiterApplicationById,
	shortlist,
	reject,
};
