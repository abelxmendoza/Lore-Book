import multer from 'multer';

/** Hardened defaults for multipart uploads (multer 2.2+ CVE mitigations). */
export const SECURE_MULTIPART_LIMITS: multer.Options['limits'] = {
  fieldNestingDepth: 2,
  fields: 20,
  parts: 25,
};

export function createMemoryUpload(options: multer.Options = {}): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      ...SECURE_MULTIPART_LIMITS,
      ...options.limits,
    },
    ...options,
  });
}
