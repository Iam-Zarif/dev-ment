import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { questionService } from "./question.service.js";
import type {
	CreateQuestionInput,
	QuestionListQuery,
	UpdateQuestionInput,
} from "./question.validation.js";

const getUserId = (req: Request): string => {
	const userId = req.user?.userId;

	if (!userId) {
		throw new AppError(401, "Authentication required");
	}

	return userId;
};

const getQuestionId = (req: Request): string => {
	const questionId = req.params.id;

	if (typeof questionId !== "string" || !questionId) {
		throw new AppError(400, "Question ID is required");
	}

	return questionId;
};

const create = catchAsync(async (req, res) => {
	const data = await questionService.create(
		getUserId(req),
		req.body as CreateQuestionInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Question created successfully",
		data,
	});
});

const getAll = catchAsync(async (req, res) => {
	const data = await questionService.getAll(
		getUserId(req),
		req.query as unknown as QuestionListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Questions retrieved successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await questionService.getById(
		getUserId(req),
		getQuestionId(req),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Question retrieved successfully",
		data,
	});
});

const update = catchAsync(async (req, res) => {
	const data = await questionService.update(
		getUserId(req),
		getQuestionId(req),
		req.body as UpdateQuestionInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Question updated successfully",
		data,
	});
});

const duplicate = catchAsync(async (req, res) => {
	const data = await questionService.duplicate(
		getUserId(req),
		getQuestionId(req),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Question duplicated successfully",
		data,
	});
});

const remove = catchAsync(async (req, res) => {
	const data = await questionService.remove(
		getUserId(req),
		getQuestionId(req),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Question deleted successfully",
		data,
	});
});

export const questionController = {
	create,
	getAll,
	getById,
	update,
	duplicate,
	remove,
};
