import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums.js";
import { auth } from "../../shared/middlewares/index.js";
import { dashboardController } from "../modules/dashboard/dashboard.controller.js";

const router = Router();

router.get("/recruiter", auth(UserRole.RECRUITER), dashboardController.getRecruiter);
router.get("/candidate", auth(UserRole.CANDIDATE), dashboardController.getCandidate);

export default router;
