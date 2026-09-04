import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { attemptService } from "./attempt.service.js";
import type {
	ProctorEventInput,
	SaveAnswerInput,
	StartAttemptInput,
} from "./attempt.validation.js";

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

const start = catchAsync(async (req, res) => {
	const data = await attemptService.start(
		getUserId(req),
		req.body as StartAttemptInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Attempt started successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await attemptService.getById(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Attempt retrieved successfully",
		data,
	});
});

const saveAnswer = catchAsync(async (req, res) => {
	const data = await attemptService.saveAnswer(
		getUserId(req),
		getParam(req, "id"),
		getParam(req, "assessmentQuestionId"),
		req.body as SaveAnswerInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Answer saved successfully",
		data,
	});
});

const recordProctorEvent = catchAsync(async (req, res) => {
	const data = await attemptService.recordProctorEvent(
		getUserId(req),
		getParam(req, "id"),
		req.body as ProctorEventInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Proctor event recorded successfully",
		data,
	});
});

const submit = catchAsync(async (req, res) => {
	const data = await attemptService.submit(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message:
			data.status === "AUTO_SUBMITTED"
				? "Attempt auto-submitted because the allowed time ended"
				: "Attempt submitted successfully",
		data,
	});
});

export const attemptController = {
	start,
	getById,
	saveAnswer,
	recordProctorEvent,
	submit,
};
