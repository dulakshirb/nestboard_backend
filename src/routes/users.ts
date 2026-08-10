import { Router } from "express";
import { z } from "zod";
import { verifyJwt } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as ctrl from "../controllers/user-controller.js"

export const usersRouter = Router();
usersRouter.use(verifyJwt);

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  bioTag: z.string().max(500).optional()
})

usersRouter.patch(
  "/profile",
  validateBody(updateProfileSchema),
  ctrl.updateProfile
)