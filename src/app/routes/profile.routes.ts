import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth, validateRequest } from "../../shared/middlewares/index.js";
import { profileController } from "../modules/profile/profile.controller.js";
import {
	createUploadSignatureSchema,
	updateCandidateProfileSchema,
	updateRecruiterProfileSchema,
} from "../modules/profile/profile.validation.js";

const router = Router();

router.patch(
	"/candidate",
	auth(UserRole.CANDIDATE),
	validateRequest({
		body: updateCandidateProfileSchema,
	}),
	profileController.updateCandidate,
);

router.patch(
	"/recruiter",
	auth(UserRole.RECRUITER),
	validateRequest({
		body: updateRecruiterProfileSchema,
	}),
	profileController.updateRecruiter,
);

router.post(
	"/upload-signature",
	auth(UserRole.CANDIDATE, UserRole.RECRUITER),
	validateRequest({
		body: createUploadSignatureSchema,
	}),
	profileController.createUploadSignature,
);

export default router;
