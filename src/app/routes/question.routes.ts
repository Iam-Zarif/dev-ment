import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { questionController } from "../modules/question/question.controller.js";
import {
	createQuestionSchema,
	questionListQuerySchema,
	updateQuestionSchema,
} from "../modules/question/question.validation.js";

const router = Router();

router.use(auth(UserRole.RECRUITER));

router.post(
	"/",
	validateRequest({
		body: createQuestionSchema,
	}),
	questionController.create,
);

router.get(
	"/",
	validateRequest({
		query: questionListQuerySchema,
	}),
	questionController.getAll,
);

router.get(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	questionController.getById,
);

router.patch(
	"/:id",
	validateRequest({
		params: idParamSchema,
		body: updateQuestionSchema,
	}),
	questionController.update,
);

router.post(
	"/:id/duplicate",
	validateRequest({
		params: idParamSchema,
	}),
	questionController.duplicate,
);

router.delete(
	"/:id",
	validateRequest({
		params: idParamSchema,
	}),
	questionController.remove,
);

export default router;
