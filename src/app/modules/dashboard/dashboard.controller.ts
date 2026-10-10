import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { dashboardService } from "./dashboard.service.js";

const userId = (req: Request) => {
	if (!req.user?.userId) throw new AppError(401, "Authentication required");
	return req.user.userId;
};

const getRecruiter = catchAsync(async (req, res) => {
	const data = await dashboardService.getRecruiter(userId(req));
	return sendResponse(res, {
		statusCode: 200,
		message: "Recruiter dashboard retrieved successfully",
		data,
	});
});

const getCandidate = catchAsync(async (req, res) => {
	const data = await dashboardService.getCandidate(userId(req));
	return sendResponse(res, {
		statusCode: 200,
		message: "Candidate dashboard retrieved successfully",
		data,
	});
});

export const dashboardController = { getRecruiter, getCandidate };
