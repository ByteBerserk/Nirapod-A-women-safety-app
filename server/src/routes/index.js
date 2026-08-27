import express from 'express';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { ok } from '../utils/apiResponse.js';
import { INCIDENT_CATEGORY_VALUES, INCIDENT_CATEGORY_LABELS, INCIDENT_SEVERITY, REACTION_TYPES, CONTENT_REPORT_REASONS, BLOOD_GROUPS, GENDERS, SAFE_PLACE_TYPES, RESOURCE_CATEGORIES, FEEDBACK_TYPES, LIMITS } from '../config/constants.js';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import contactRoutes from './contactRoutes.js';
import sosRoutes from './sosRoutes.js';
import checkInRoutes from './checkInRoutes.js';
import incidentRoutes from './incidentRoutes.js';
import groupRoutes from './groupRoutes.js';
import placeRoutes from './placeRoutes.js';
import resourceRoutes from './resourceRoutes.js';
import feedbackRoutes from './feedbackRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const healthy = dbState === 1;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    database: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

router.get('/meta', (req, res) =>
  ok(res, {

    capabilities: { realtime: env.realtimeEnabled },

    incidentCategories: INCIDENT_CATEGORY_VALUES.map((value) => ({
      value,
      label: INCIDENT_CATEGORY_LABELS[value],
    })),
    incidentSeverities: INCIDENT_SEVERITY,
    reactionTypes: REACTION_TYPES,
    reportReasons: CONTENT_REPORT_REASONS,
    bloodGroups: BLOOD_GROUPS,
    genders: GENDERS,
    safePlaceTypes: SAFE_PLACE_TYPES,
    resourceCategories: RESOURCE_CATEGORIES,
    feedbackTypes: FEEDBACK_TYPES,
    limits: {
      maxEmergencyContacts: LIMITS.MAX_EMERGENCY_CONTACTS,
      maxGroupMembers: LIMITS.MAX_GROUP_MEMBERS,
      maxSafePlaces: LIMITS.MAX_SAFE_PLACES,
      maxIncidentMedia: LIMITS.MAX_INCIDENT_MEDIA,
    },
  })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/contacts', contactRoutes);
router.use('/sos', sosRoutes);
router.use('/check-ins', checkInRoutes);
router.use('/incidents', incidentRoutes);
router.use('/groups', groupRoutes);
router.use('/places', placeRoutes);
router.use('/resources', resourceRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

export default router;
