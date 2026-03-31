const crypto = require('crypto');

function buildEncryptedExport(payload, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const plaintext = JSON.stringify(payload);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const integritySha256 = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');

  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    integritySha256,
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptEncryptedExport(bundle, password) {
  const salt = Buffer.from(bundle.salt, 'base64');
  const iv = Buffer.from(bundle.iv, 'base64');
  const authTag = Buffer.from(bundle.authTag, 'base64');
  const ciphertext = Buffer.from(bundle.ciphertext, 'base64');
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const digest = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');

  if (digest !== bundle.integritySha256) {
    throw new Error('Integrity check failed');
  }

  return JSON.parse(plaintext);
}

module.exports = {
  buildEncryptedExport,
  decryptEncryptedExport
};
