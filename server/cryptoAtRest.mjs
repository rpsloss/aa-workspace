export {
  ENC_MAGIC as MAGIC,
  KEY_FILENAME as PACKAGE_KEY_FILENAME,
  decryptBuffer,
  encryptBuffer,
  isEncryptedBuffer as isCiphertext,
  isEncryptedBuffer,
  loadExistingKey,
  loadKey,
  loadOrCreateKey,
  atomicWriteBuffer as saveBufferAtomic,
  resolveKeyPath,
  resolveAuditPath,
} from "./atRest.mjs";
