import type { RequestHandler } from "express";
import * as svc from "../services/notification-service.js";

export const list: RequestHandler = async (req, res, next) => {
  try {
    const notifications = await svc.listNotifications(req.user!.id);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    const count = await svc.getUnreadCount(req.user!.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const result = await svc.markAsRead(req.params.id as string, req.user!.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markAllRead: RequestHandler = async (req, res, next) => {
  try {
    await svc.markAllAsRead(req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
