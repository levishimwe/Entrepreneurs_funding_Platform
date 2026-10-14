// A user's own private evidence. Never served statically; each download is
// authorised per request. Administrators use /api/admin/documents/:id/file.
const express = require('express');
const { Document } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { notFound } = require('../middleware/errors');
const { sendStoredFile } = require('../services/fileDelivery');

const router = express.Router();

router.get('/:id/file', requireAuth, async (req, res) => {
  const document = await Document.findByPk(req.params.id);
  // Same response for "missing" and "not yours" so ids cannot be probed.
  if (!document || document.uploaderId !== req.user.id) throw notFound('Document not found.');
  await sendStoredFile(res, { storageKey: document.storageKey, mimeType: document.mimeType, filename: document.originalName });
});

module.exports = router;
