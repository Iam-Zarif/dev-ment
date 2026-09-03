import { Router } from "express";
import authRouter from "./auth.routes.js";
import questionRouter from "./question.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/questions", questionRouter);

export default router;
