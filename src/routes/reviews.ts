import { Router } from "express";
import { z } from "zod";
import { verifyJwt, requireRole, optionalAuth } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createReviewSchema } from "../schemas/review.js";
import * as ctrl from "../controllers/review-controller.js";
import { Role } from "../generated/enums.js";

export const reviewsRouter = Router();
const propertyIdParam = z.object({ propertyId: z.uuid() });

reviewsRouter.post(
  "/:propertyId",
  verifyJwt,
  requireRole(Role.USER),
  validateParams(propertyIdParam),
  validateBody(createReviewSchema),
  ctrl.create,
);

reviewsRouter.get(
  "/:propertyId",
  validateParams(propertyIdParam),
  ctrl.list,
);

reviewsRouter.get(
  "/:propertyId/my",
  verifyJwt,
  validateParams(propertyIdParam),
  ctrl.getUserReview,
);