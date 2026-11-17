import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { AuditLog } = await import('../services/auditService.js');
const { encryptField, decryptField, isEncrypted, maskAadhaar } = await import('../utils/fieldEncryption.js');
const { assertSafeFile, detectFileType, LIMITS } = await import('../services/uploadService.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, authHeader } = await import('./helpers.js');

describe('PHASE 5 — KYC & privacy protection', () => {
  let app;

  before(async () => {
    await startTestDb();
    await syncIndexes();
    app = buildApp();
  });

  after(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  test('Aadhaar encryption at rest with AES-256-GCM (KYC-1)', () => {
    const rawAadhaar = '987654321012';
    const encrypted = encryptField(rawAadhaar);

    assert.ok(isEncrypted(encrypted));
    assert.match(encrypted, /^enc:v1:k1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    assert.notEqual(encrypted, rawAadhaar);

    const decrypted = decryptField(encrypted);
    assert.equal(decrypted, rawAadhaar);

    // Masking exposes only last 4 digits
    const masked = maskAadhaar(rawAadhaar.slice(-4));
    assert.equal(masked, 'XXXX-XXXX-1012');
  });

  test('public scrapper profile redacts sensitive KYC, financial and contact fields (KYC-2)', async () => {
    const otherUser = await makeUser();
    const { scrapper } = await makeScrapper({
      wallet: { balance: 9999 },
      kycStatus: 'verified'
    });

    const res = await request(app)
      .get(`/api/v1/scrappers/${scrapper._id}`)
      .set(authHeader(otherUser));

    assert.equal(res.status, 200);
    const profile = res.body.data.scrapper;

    // Sensitive data MUST be undefined/redacted
    assert.equal(profile.wallet, undefined);
    assert.equal(profile.email, undefined);
    assert.equal(profile.aadhaarNumber, undefined);
    assert.equal(profile.documents, undefined);
    assert.equal(profile.fcmTokens, undefined);
    assert.equal(profile.liveLocation, undefined);
    // Phone must be hidden since otherUser has no order with this scrapper
    assert.equal(profile.phone, undefined);

    // Public fields are present
    assert.equal(profile.name, scrapper.name);
    assert.equal(profile.isVerified, true);
  });

  test('phone is disclosed only to users with an active order with the scrapper (KYC-3)', async () => {
    const customer = await makeUser();
    const { scrapper } = await makeScrapper();

    // Create active order between customer and scrapper
    await makeOrder({
      user: customer._id,
      scrapper: scrapper._id,
      status: 'confirmed'
    });

    const res = await request(app)
      .get(`/api/v1/scrappers/${scrapper._id}`)
      .set(authHeader(customer));

    assert.equal(res.status, 200);
    const profile = res.body.data.scrapper;
    assert.equal(profile.phone, scrapper.phone);
  });

  test('admin KYC verification workflow and audited document access (KYC-4)', async () => {
    const admin = await makeAdmin();
    const { scrapper } = await makeScrapper({
      kycStatus: 'pending',
      wallet: { balance: 500 }
    });

    // 1. Admin views KYC documents -> records audit log
    const docRes = await request(app)
      .get(`/api/v1/kyc/${scrapper._id}/documents`)
      .set(authHeader(admin));

    assert.equal(docRes.status, 200);
    assert.equal(docRes.body.data.kyc.urlsExpireInSeconds, 300);

    const auditEntry = await AuditLog.findOne({
      action: 'KYC_DOCUMENTS_VIEWED',
      targetId: scrapper._id.toString()
    });
    assert.ok(auditEntry);
    assert.equal(auditEntry.actorRole, 'admin');

    // 2. Admin verifies KYC
    const verifyRes = await request(app)
      .post(`/api/v1/kyc/${scrapper._id}/verify`)
      .set(authHeader(admin));

    assert.equal(verifyRes.status, 200);

    const freshScrapper = await Scrapper.findById(scrapper._id);
    assert.equal(freshScrapper.kyc.status, 'verified');
    assert.ok(freshScrapper.kyc.verifiedAt);
    assert.equal(freshScrapper.kyc.verifiedBy.toString(), admin._id.toString());
  });

  test('upload validation detects magic bytes and rejects spoofed files (KYC-5)', () => {
    // 1. Valid JPEG buffer (FF D8 FF)
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const detectedJpg = detectFileType(validJpgBuffer);
    assert.ok(detectedJpg);
    assert.equal(detectedJpg.mime, 'image/jpeg');

    const safeFile = { originalname: 'photo.jpg', buffer: validJpgBuffer, size: validJpgBuffer.length };
    const validated = assertSafeFile(safeFile, { allow: 'image' });
    assert.equal(validated.mime, 'image/jpeg');

    // 2. Spoofed file: text content renamed to image.jpg
    const spoofedBuffer = Buffer.from('<html><script>alert(1)</script></html>');
    const detectedSpoof = detectFileType(spoofedBuffer);
    assert.equal(detectedSpoof, null);

    const spoofedFile = { originalname: 'exploit.jpg', buffer: spoofedBuffer, size: spoofedBuffer.length };
    assert.throws(
      () => assertSafeFile(spoofedFile, { allow: 'image' }),
      (err) => /unsupported or corrupted file/i.test(err.message)
    );

    // 3. Oversized file rejected
    const bigBuffer = Buffer.alloc(LIMITS.IMAGE_BYTES + 1024);
    bigBuffer[0] = 0xff; bigBuffer[1] = 0xd8; bigBuffer[2] = 0xff;
    const oversizedFile = { originalname: 'huge.jpg', buffer: bigBuffer, size: bigBuffer.length };
    assert.throws(
      () => assertSafeFile(oversizedFile, { allow: 'image' }),
      (err) => /file too large/i.test(err.message)
    );
  });
});
