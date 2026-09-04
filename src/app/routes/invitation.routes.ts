import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { idParamSchema } from "../../shared/validation/index.js";
import { invitationController } from "../modules/invitation/invitation.controller.js";
import {
	createInvitationSchema,
	invitationListQuerySchema,
	invitationTokenSchema,
} from "../modules/invitation/invitation.validation.js";

const router = Router();

router.post(
	"/verify",
	auth(UserRole.CANDIDATE),
	validateRequest({
		body: invitationTokenSchema,
	}),
	invitationController.verify,
);

router.post(
	"/accept",
	auth(UserRole.CANDIDATE),
	validateRequest({
		body: invitationTokenSchema,
	}),
	invitationController.accept,
);

router.post(
	"/",
	auth(UserRole.RECRUITER),
	validateRequest({
		body: createInvitationSchema,
	}),
	invitationController.create,
);

router.get(
	"/",
	auth(UserRole.RECRUITER),
	validateRequest({
		query: invitationListQuerySchema,
	}),
	invitationController.getAll,
);

router.post(
	"/:id/resend",
	auth(UserRole.RECRUITER),
	validateRequest({
		params: idParamSchema,
	}),
	invitationController.resend,
);

router.post(
	"/:id/revoke",
	auth(UserRole.RECRUITER),
	validateRequest({
		params: idParamSchema,
	}),
	invitationController.revoke,
);

export default router;
