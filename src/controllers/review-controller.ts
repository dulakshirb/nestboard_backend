import type { RequestHandler } from "express";
import * as svc from "../services/review-service.js";

type PropertyParams = { propertyId: string }

export const create: RequestHandler<PropertyParams> = async (req, res, next) => {
  try {
    const propertyId = req.params.propertyId;
    const review = await svc.createOrUpdateReview(
      req.user!.id,
      propertyId,
      req.body,
    );
    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
};

export const list: RequestHandler<PropertyParams> = async (req, res, next) => {
  try {
    const propertyId = req.params.propertyId;
    const reviews = await svc.getPropertyReviews(propertyId);
    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

export const getUserReview: RequestHandler<PropertyParams> = async (req, res, next) => {
  try {
    const propertyId = req.params.propertyId;
    const review = await svc.getUserReviewForProperty(
      req.user!.id,
      propertyId,
    );
    res.json(review ?? null);
  } catch (err) {
    next(err);
  }
};