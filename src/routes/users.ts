import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { verifyJwt } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as ctrl from "../controllers/user-controller.js";
import { uploadToR2 } from "../lib/storage.js";
import { env } from "../lib/env.js";
import { Errors } from "../lib/errors.js";

export const usersRouter = Router();
usersRouter.use(verifyJwt);

const useR2 = env.UPLOAD_PROVIDER === "r2";

const storage = useR2
  ? multer.memoryStorage()
  : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.UPLOAD_LOCAL_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok: boolean = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype,
    );
    cb(
      ok
        ? null
        : (Errors.validation("Only JPG/PNG/WEBP images are allowed") as any),
      ok,
    );
  },
});

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  bioTag: z.string().max(500).optional(),
});

usersRouter.patch(
  "/profile",
  upload.single("avatar"),
  async (req, res, next) => {
    try {
      const validatedData = updateProfileSchema.parse(req.body);
      const updateData: any = { ...validatedData };

      // If file was uploaded
      if (req.file) {
        let avatarUrl: string;

        if (useR2) {
          const ext = path.extname(req.file.originalname).toLowerCase();
          const key = `avatar/${req.user!.id}/${randomUUID()}${ext}`;
          avatarUrl = await uploadToR2(key, req.file.buffer, req.file.mimetype);
        } else {
          avatarUrl = `/uploads/${req.file.filename}`;
        }

        updateData.avatarUrl = avatarUrl;
      }
      req.body = updateData;
      await ctrl.updateProfile(req, res, next);
    } catch (err) {
      next(err);
    }
  }
);