import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { LIMITS } from '../config/constants.js';
import { safeFilename } from '../utils/sanitize.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac'];

const ALLOWED = [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];

const SIGNATURES = [
  { kind: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { kind: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'image/gif', offset: 0, ascii: 'GIF8' },
  { kind: 'image/webp', offset: 0, ascii: 'RIFF' },
  { kind: 'image/heic', offset: 4, ascii: 'ftyp' },
  { kind: 'video/mp4', offset: 4, ascii: 'ftyp' },
  { kind: 'video/quicktime', offset: 4, ascii: 'ftyp' },

  { kind: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'video/x-matroska', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'audio/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'audio/ogg', offset: 0, ascii: 'OggS' },
  { kind: 'audio/wav', offset: 0, ascii: 'RIFF' },
  { kind: 'audio/mpeg', offset: 0, bytes: [0x49, 0x44, 0x33] },
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xfb] },
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf3] },
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf2] },
  { kind: 'audio/mp4', offset: 4, ascii: 'ftyp' },
  { kind: 'audio/aac', offset: 0, bytes: [0xff, 0xf1] },
  { kind: 'audio/aac', offset: 0, bytes: [0xff, 0xf9] },
];

const SNIFF_BYTES = 16;

function matches(head, signature) {
  const { offset } = signature;
  const expected = signature.ascii
    ? [...signature.ascii].map((character) => character.charCodeAt(0))
    : signature.bytes;

  if (head.length < offset + expected.length) return false;
  return expected.every((byte, index) => head[offset + index] === byte);
}

function looksLike(buffer, declaredType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  const candidates = SIGNATURES.filter((signature) => signature.kind === declaredType);

  if (!candidates.length) return true;

  return candidates.some((signature) => matches(buffer, signature));
}

function contentMismatchError() {
  return AppError.badRequest(
    'That file does not look like the type it claims to be. Please attach a real image, ' +
      'video or audio recording.',
    { code: 'CONTENT_TYPE_MISMATCH' }
  );
}

function mediaKind(mimeType) {
  if (IMAGE_TYPES.includes(mimeType)) return 'image';
  if (VIDEO_TYPES.includes(mimeType)) return 'video';
  if (AUDIO_TYPES.includes(mimeType)) return 'audio';
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ensureDir(env.uploads.dir);

function diskStorage(subfolder) {
  return multer.diskStorage({
    destination(req, file, cb) {
      try {
        cb(null, ensureDir(path.join(env.uploads.dir, subfolder)));
      } catch (error) {
        cb(error);
      }
    },
    filename(req, file, cb) {

      const ext = path.extname(safeFilename(file.originalname)).toLowerCase().slice(0, 10);
      const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      cb(null, `${unique}${ext || ''}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED.includes(file.mimetype)) {
    return cb(
      AppError.badRequest(
        'That file type is not supported. Please attach an image, a video or an audio recording.',
        { code: 'UNSUPPORTED_MEDIA' }
      )
    );
  }
  return cb(null, true);
}

const incidentMedia = multer({
  storage: diskStorage('incidents'),
  fileFilter,
  limits: { fileSize: env.uploads.maxBytes, files: LIMITS.MAX_INCIDENT_MEDIA },
}).array('media', LIMITS.MAX_INCIDENT_MEDIA);

const avatar = multer({
  storage: diskStorage('avatars'),
  fileFilter(req, file, cb) {
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      return cb(AppError.badRequest('Your profile picture must be an image file.'));
    }
    return cb(null, true);
  },
  limits: { fileSize: Math.min(5 * 1024 * 1024, env.uploads.maxBytes), files: 1 },
}).single('avatar');

async function readHead(file) {
  if (file.buffer) return file.buffer.subarray(0, SNIFF_BYTES);
  if (!file.path) return null;

  const handle = await fs.promises.open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function verifyContents(req) {
  const files = [req.file, ...(req.files || [])].filter(Boolean);
  if (!files.length) return;

  for (const file of files) {

    const head = await readHead(file);
    if (!looksLike(head, file.mimetype)) {
      removeUploadedFiles(files);
      throw contentMismatchError();
    }
  }
}

function wrap(uploader) {
  return (req, res, next) => {
    uploader(req, res, (error) => {
      if (error) return next(error);
      return verifyContents(req).then(next).catch(next);
    });
  };
}

function removeUploadedFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const file of list) {
    if (!file?.path) continue;
    fs.promises.unlink(file.path).catch(() => {});
  }
}

async function persistUpload(file) {
  return {
    type: mediaKind(file.mimetype),
    mimeType: file.mimetype,
    size: file.size,
    originalName: safeFilename(file.originalname),
    url: `/uploads/${path.basename(path.dirname(file.path))}/${file.filename}`,
  };
}

function persistUploads(files) {
  return Promise.all((files || []).map((file) => persistUpload(file)));
}

export const uploadIncidentMedia = wrap(incidentMedia);
export const uploadAvatar = wrap(avatar);

export {
  removeUploadedFiles,
  persistUpload,
  persistUploads,
};
