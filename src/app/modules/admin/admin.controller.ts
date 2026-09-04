import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { adminService } from "./admin.service.js";
import type {
	AdminAuditListQuery,
	AdminCompanyListQuery,
	AdminCreditGrantInput,
	AdminPaymentListQuery,
	AdminUserListQuery,
	UpdateCompanyVerificationInput,
	UpdatePricingPlanInput,
	UpdateUserStatusInput,
} from "./admin.validation.js";

const getUserId = (req: Request): string => {
	const userId = req.user?.userId;

	if (!userId) {
		throw new AppError(401, "Authentication required");
	}

	return userId;
};

const getParam = (req: Request, key: string): string => {
	const value = req.params[key];

	if (typeof value !== "string" || !value) {
		throw new AppError(400, `${key} is required`);
	}

	return value;
};

const getDashboard = catchAsync(async (_req, res) => {
	const data = await adminService.getDashboard();

	return sendResponse(res, {
		statusCode: 200,
		message: "Admin dashboard retrieved successfully",
		data,
	});
});

const getUsers = catchAsync(async (req, res) => {
	const data = await adminService.getUsers(
		req.query as unknown as AdminUserListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Users retrieved successfully",
		data,
	});
});

const getUserById = catchAsync(async (req, res) => {
	const data = await adminService.getUserById(getParam(req, "id"));

	return sendResponse(res, {
		statusCode: 200,
		message: "User retrieved successfully",
		data,
	});
});

const updateUserStatus = catchAsync(async (req, res) => {
	const data = await adminService.updateUserStatus(
		getUserId(req),
		getParam(req, "id"),
		req.body as UpdateUserStatusInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: data.changed
			? "User status updated successfully"
			: "User already has the requested status",
		data,
	});
});

const deleteUser = catchAsync(async (req, res) => {
	const data = await adminService.deleteUser(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "User deleted successfully",
		data,
	});
});

const getCompanies = catchAsync(async (req, res) => {
	const data = await adminService.getCompanies(
		req.query as unknown as AdminCompanyListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Companies retrieved successfully",
		data,
	});
});

const updateCompanyVerification = catchAsync(async (req, res) => {
	const data = await adminService.updateCompanyVerification(
		getUserId(req),
		getParam(req, "id"),
		req.body as UpdateCompanyVerificationInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: data.changed
			? "Company verification updated successfully"
			: "Company already has the requested verification status",
		data,
	});
});

const getPricingPlans = catchAsync(async (_req, res) => {
	const data = await adminService.getPricingPlans();

	return sendResponse(res, {
		statusCode: 200,
		message: "Pricing plans retrieved successfully",
		data,
	});
});

const updatePricingPlan = catchAsync(async (req, res) => {
	const data = await adminService.updatePricingPlan(
		getUserId(req),
		getParam(req, "id"),
		req.body as UpdatePricingPlanInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Pricing plan updated successfully",
		data,
	});
});

const getRecruiterCredits = catchAsync(async (req, res) => {
	const data = await adminService.getRecruiterCredits(getParam(req, "id"));

	return sendResponse(res, {
		statusCode: 200,
		message: "Recruiter credits retrieved successfully",
		data,
	});
});

const grantRecruiterCredits = catchAsync(async (req, res) => {
	const data = await adminService.grantRecruiterCredits(
		getUserId(req),
		getParam(req, "id"),
		req.body as AdminCreditGrantInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Recruiter credits granted successfully",
		data,
	});
});

const getPayments = catchAsync(async (req, res) => {
	const data = await adminService.getPayments(
		req.query as unknown as AdminPaymentListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Payments retrieved successfully",
		data,
	});
});

const getAuditLogs = catchAsync(async (req, res) => {
	const data = await adminService.getAuditLogs(
		req.query as unknown as AdminAuditListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Audit logs retrieved successfully",
		data,
	});
});

export const adminController = {
	getDashboard,
	getUsers,
	getUserById,
	updateUserStatus,
	deleteUser,
	getCompanies,
	updateCompanyVerification,
	getPricingPlans,
	updatePricingPlan,
	getRecruiterCredits,
	grantRecruiterCredits,
	getPayments,
	getAuditLogs,
};
