import { Router } from "express";
import { z } from "zod";
import { verifyJwt, allowRoles } from "../middleware/auth.js";
import { validateParams } from "../middleware/validate.js";
import * as ctrl from "../controllers/notification-controller.js";
import { Role } from "../generated/enums.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  verifyJwt,
  allowRoles(Role.USER, Role.ADMIN),
  ctrl.list,
);

notificationsRouter.get(
  "/unread-count",
  verifyJwt,
  allowRoles(Role.USER, Role.ADMIN),
  ctrl.unreadCount,
);

notificationsRouter.patch(
  "/:id/read",
  verifyJwt,
  allowRoles(Role.USER, Role.ADMIN),
  validateParams(z.object({ id: z.uuid() })),
  ctrl.markRead,
);

notificationsRouter.patch(
  "/read-all",
  verifyJwt,
  allowRoles(Role.USER, Role.ADMIN),
  ctrl.markAllRead,
);
