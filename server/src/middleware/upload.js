import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { LIMITS } from '../config/constants.js';
import { safeFilename } from '../utils/sanitize.js';

/**
 * FR-6: photo, video and audio evidence.
 *
 * Files are written to the uploads folder and served as static files by
 * Express. `persistUpload(file)` returns the media subdocument the Incident
 * model stores.
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac'];

const ALLOWED = [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];

/* ------------------------------------------------------- content sniffing --- */

/**
 * Leading bytes for the container formats we accept.
 *
 * `file.mimetype` is whatever the client wrote in the multipart part - it is a
 * claim, not a fact. Checking it alone meant a Windows executable renamed to
 * evidence.png and labelled image/png was stored as incident evidence, which is
 * exactly the check NFR-4 is supposed to make.
 *
 * `offset` covers the formats that carry their marker after a length prefix:
 * MP4/MOV/HEIC put "ftyp" at byte 4, WAV and WEBP put their marker at byte 8
 * inside a RIFF container.
 */
const SIGNATURES = [
  { kind: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { kind: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'image/gif', offset: 0, ascii: 'GIF8' },
  { kind: 'image/webp', offset: 0, ascii: 'RIFF' },
  { kind: 'image/heic', offset: 4, ascii: 'ftyp' },
  { kind: 'video/mp4', offset: 4, ascii: 'ftyp' },
  { kind: 'video/quicktime', offset: 4, ascii: 'ftyp' },
  // Matroska and WebM share the EBML header; the codec inside decides which.
  { kind: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'video/x-matroska', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'audio/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { kind: 'audio/ogg', offset: 0, ascii: 'OggS' },
  { kind: 'audio/wav', offset: 0, ascii: 'RIFF' },
  { kind: 'audio/mpeg', offset: 0, bytes: [0x49, 0x44, 0x33] }, // ID3-tagged MP3
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xfb] }, // bare MPEG frame
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf3] },
  { kind: 'audio/mpeg', offset: 0, bytes: [0xff, 0xf2] },
  { kind: 'audio/mp4', offset: 4, ascii: 'ftyp' },
  { kind: 'audio/aac', offset: 0, bytes: [0xff, 0xf1] },
  { kind: 'audio/aac', offset: 0, bytes: [0xff, 0xf9] },
];

/** How many leading bytes are enough to recognise every signature above. */
const SNIFF_BYTES = 16;

function matches(head, signature) {
  const { offset } = signature;
  const expected = signature.ascii
    ? [...signature.ascii].map((character) => character.charCodeAt(0))
    : signature.bytes;

  if (head.length < offset + expected.length) return false;
  return expected.every((byte, index) => head[offset + index] === byte);
}

/**
 * True when the first bytes of `buffer` are consistent with `declaredType`.
 *
 * Deliberately checks the declared type rather than trying to identify the file
 * from scratch: the point is to catch a mismatch between what was claimed and
 * what was sent, not to become a format detector.
 *
 * @param {Buffer} buffer       at least the first few bytes of the file
 * @param {string} declaredType the client's Content-Type for this part
 */
function looksLike(buffer, declaredType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  const candidates = SIGNATURES.filter((signature) => signature.kind === declaredType);
  // An accepted type with no signature on file is passed through rather than
  // rejected, so adding a format to ALLOWED can never silently break uploads.
  if (!candidates.length) return true;

  return candidates.some((signature) => matches(buffer, signature));
}

/** The message a rejected file gets. Same wording wherever the check runs. */
function contentMismatchError() {
  return AppError.badRequest(
    'That file does not look like the type it claims to be. Please attach a real image, ' +
      'video or audio recording.',
    { code: 'CONTENT_TYPE_MISMATCH' }
  );
}

/** Maps a mime type to the bucket the Incident model stores. */
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
      // The stored name is generated, never taken from the client. The original
      // is kept in the database for display only. This is what stops a file
      // called "../../server.js" from going anywhere it should not.
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

/** Evidence attached to an incident report. */
const incidentMedia = multer({
  storage: diskStorage('incidents'),
  fileFilter,
  limits: { fileSize: env.uploads.maxBytes, files: LIMITS.MAX_INCIDENT_MEDIA },
}).array('media', LIMITS.MAX_INCIDENT_MEDIA);

/** Profile picture: images only, and much smaller. */
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

/** The first bytes of an uploaded file, whichever storage engine holds it. */
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

/**
 * Rejects anything whose contents contradict its declared type.
 *
 * Runs after multer rather than in `fileFilter`, because the filter is handed
 * the headers before any bytes have arrived - there is nothing to inspect yet.
 * The disk driver has therefore already written the file by this point, so a
 * rejection cleans up after itself.
 */
async function verifyContents(req) {
  const files = [req.file, ...(req.files || [])].filter(Boolean);
  if (!files.length) return;

  for (const file of files) {
    /* eslint-disable no-await-in-loop */
    const head = await readHead(file);
    if (!looksLike(head, file.mimetype)) {
      removeUploadedFiles(files);
      throw contentMismatchError();
    }
  }
}

/**
 * Multer's own errors arrive as exceptions rather than through next(), so each
 * uploader is wrapped to keep the controllers clean.
 */
function wrap(uploader) {
  return (req, res, next) => {
    uploader(req, res, (error) => {
      if (error) return next(error);
      return verifyContents(req).then(next).catch(next);
    });
  };
}

/** Best-effort cleanup after a request fails part-way through. */
function removeUploadedFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const file of list) {
    if (!file?.path) continue;
    fs.promises.unlink(file.path).catch(() => {});
  }
}

/**
 * Turns a multer file into the media subdocument the models store.
 *
 * @param {object} file  a multer file
 * @returns {Promise<{url:string,type:string,mimeType:string,size:number,originalName:string}>}
 */
async function persistUpload(file) {
  return {
    type: mediaKind(file.mimetype),
    mimeType: file.mimetype,
    size: file.size,
    originalName: safeFilename(file.originalname),
    url: `/uploads/${path.basename(path.dirname(file.path))}/${file.filename}`,
  };
}

/** Persists a list of multer files in parallel. */
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
