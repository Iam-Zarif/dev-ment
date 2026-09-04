import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { evaluationService } from "./evaluation.service.js";
import type {
	EvaluationListQuery,
	FinalizeEvaluationInput,
	ManualEvaluationInput,
} from "./evaluation.validation.js";

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

const getAll = catchAsync(async (req, res) => {
	const data = await evaluationService.getAll(
		getUserId(req),
		req.query as unknown as EvaluationListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Evaluation attempts retrieved successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await evaluationService.getById(
		getUserId(req),
		getParam(req, "id"),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Evaluation details retrieved successfully",
		data,
	});
});

const reviewAnswer = catchAsync(async (req, res) => {
	const data = await evaluationService.reviewAnswer(
		getUserId(req),
		getParam(req, "id"),
		getParam(req, "assessmentQuestionId"),
		req.body as ManualEvaluationInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Answer evaluated successfully",
		data,
	});
});

const evaluate = catchAsync(async (req, res) => {
	const data = await evaluationService.evaluate(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Attempt evaluated successfully",
		data,
	});
});

const finalize = catchAsync(async (req, res) => {
	const data = await evaluationService.finalize(
		getUserId(req),
		getParam(req, "id"),
		req.body as FinalizeEvaluationInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Evaluation finalized successfully",
		data,
	});
});

const release = catchAsync(async (req, res) => {
	const data = await evaluationService.release(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Result released successfully",
		data,
	});
});

const getCandidateResult = catchAsync(async (req, res) => {
	const data = await evaluationService.getCandidateResult(
		getUserId(req),
		getParam(req, "id"),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Result retrieved successfully",
		data,
	});
});

export const evaluationController = {
	getAll,
	getById,
	reviewAnswer,
	evaluate,
	finalize,
	release,
	getCandidateResult,
};
