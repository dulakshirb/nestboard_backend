import type { RequestHandler } from "express";
import * as svc from "../services/user-service.js";

export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const user = await svc.updateUserProfile(req.user!.id, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
};