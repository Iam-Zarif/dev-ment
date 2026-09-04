import type { Request } from "express";
import { AppError } from "../../../shared/errors/index.js";
import { catchAsync, sendResponse } from "../../../shared/utils/index.js";
import { assessmentService } from "./assessment.service.js";
import type {
	AssessmentListQuery,
	AttachAssessmentQuestionInput,
	CreateAssessmentInput,
	PublishedAssessmentListQuery,
	ReorderAssessmentQuestionsInput,
	UpdateAssessmentInput,
	UpdateAssessmentQuestionInput,
} from "./assessment.validation.js";

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

const create = catchAsync(async (req, res) => {
	const data = await assessmentService.create(
		getUserId(req),
		req.body as CreateAssessmentInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Assessment created successfully",
		data,
	});
});

const getAll = catchAsync(async (req, res) => {
	const data = await assessmentService.getAll(
		getUserId(req),
		req.query as unknown as AssessmentListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessments retrieved successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await assessmentService.getById(
		getUserId(req),
		getParam(req, "id"),
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment retrieved successfully",
		data,
	});
});

const update = catchAsync(async (req, res) => {
	const data = await assessmentService.update(
		getUserId(req),
		getParam(req, "id"),
		req.body as UpdateAssessmentInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment updated successfully",
		data,
	});
});

const addQuestion = catchAsync(async (req, res) => {
	const data = await assessmentService.addQuestion(
		getUserId(req),
		getParam(req, "id"),
		req.body as AttachAssessmentQuestionInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 201,
		message: "Question added to assessment successfully",
		data,
	});
});

const updateQuestion = catchAsync(async (req, res) => {
	const data = await assessmentService.updateQuestion(
		getUserId(req),
		getParam(req, "id"),
		getParam(req, "assessmentQuestionId"),
		req.body as UpdateAssessmentQuestionInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment question updated successfully",
		data,
	});
});

const reorderQuestions = catchAsync(async (req, res) => {
	const data = await assessmentService.reorderQuestions(
		getUserId(req),
		getParam(req, "id"),
		req.body as ReorderAssessmentQuestionsInput,
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment questions reordered successfully",
		data,
	});
});

const removeQuestion = catchAsync(async (req, res) => {
	const data = await assessmentService.removeQuestion(
		getUserId(req),
		getParam(req, "id"),
		getParam(req, "assessmentQuestionId"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Question removed from assessment successfully",
		data,
	});
});

const publish = catchAsync(async (req, res) => {
	const data = await assessmentService.publish(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment published successfully",
		data,
	});
});

const close = catchAsync(async (req, res) => {
	const data = await assessmentService.close(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment closed successfully",
		data,
	});
});

const remove = catchAsync(async (req, res) => {
	const data = await assessmentService.remove(
		getUserId(req),
		getParam(req, "id"),
		req.ip,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Assessment deleted successfully",
		data,
	});
});

const getPublished = catchAsync(async (req, res) => {
	const data = await assessmentService.getPublished(
		req.query as unknown as PublishedAssessmentListQuery,
	);

	return sendResponse(res, {
		statusCode: 200,
		message: "Published assessments retrieved successfully",
		data,
	});
});

const getPublishedById = catchAsync(async (req, res) => {
	const data = await assessmentService.getPublishedById(getParam(req, "id"));

	return sendResponse(res, {
		statusCode: 200,
		message: "Published assessment retrieved successfully",
		data,
	});
});

export const assessmentController = {
	create,
	getAll,
	getById,
	update,
	addQuestion,
	updateQuestion,
	reorderQuestions,
	removeQuestion,
	publish,
	close,
	remove,
	getPublished,
	getPublishedById,
};
