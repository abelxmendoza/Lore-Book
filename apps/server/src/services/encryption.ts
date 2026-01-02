import crypto from 'node:crypto';
import { config } from '../config';
import { logger } from '../logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// Derive encryption key from salt
const deriveKey = (password: string, salt: Buffer): Buffer => {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
};

/**
 * Encrypt sensitive data
 */
export const encrypt = (text: string): string => {
  try {
    const salt = config.encryptionSalt || 'default-salt-change-in-production';
    
    // Generate random salt for this encryption
    const randomSalt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt, randomSalt);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt, iv, tag, and encrypted data
    const combined = Buffer.concat([
      randomSalt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    logger.error({ error }, 'Encryption failed');
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive data
 */
export const decrypt = (encryptedText: string): string => {
  try {
    const salt = config.encryptionSalt || 'default-salt-change-in-production';
    
    const combined = Buffer.from(encryptedText, 'base64');
    
    // Extract components
    const randomSalt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(salt, randomSalt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error({ error }, 'Decryption failed');
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Hash data (one-way, for passwords, etc.)
 */
export const hash = (text: string): string => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Generate secure random token
 */
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

