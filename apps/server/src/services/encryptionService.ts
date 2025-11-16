import crypto from 'node:crypto';

import { config } from '../config';

const getSalt = (userId: string) => {
  const envSalt = config.encryptionSalt || process.env.ENCRYPTION_SALT || '';
  return `${userId}:${envSalt}`;
};

const deriveKey = async (userId: string, passphrase: string): Promise<Buffer> => {
  return await new Promise((resolve, reject) => {
    crypto.pbkdf2(passphrase, getSalt(userId), 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
};

export const encryptContent = async (
  userId: string,
  plainText: string,
  passphrase: string
): Promise<{ iv: string; content: string; tag: string; algorithm: string }> => {
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(userId, passphrase);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex'),
    tag: authTag.toString('hex'),
    algorithm: 'aes-256-gcm'
  };
};

export const decryptContent = async (
  userId: string,
  encryptedPayload: { iv: string; content: string; tag: string },
  passphrase: string
): Promise<string> => {
  const iv = Buffer.from(encryptedPayload.iv, 'hex');
  const content = Buffer.from(encryptedPayload.content, 'hex');
  const tag = Buffer.from(encryptedPayload.tag, 'hex');
  const key = await deriveKey(userId, passphrase);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString('utf8');
};
