import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: Order } = await import('../models/Order.js');
const { default: MetaLead } = await import('../models/MetaLead.js');
const { makeAdmin, makeScrapper, authHeader } = await import('./helpers.js');
const { parseMetaLeadsFile, parseLeadDateTime, generateSampleMetaLeadsWorkbook } = await import('../utils/metaLeadParser.js');

const sheet = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Leads');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Admin-uploaded leads carry the seven fields the partner needs:
 * Name, Number, Address, Mail ID, Category, Date and time, Price.
 */
describe('Admin lead upload: the seven lead fields', () => {
  test('LEAD-1 our template columns are read into all seven fields', () => {
    const r = parseMetaLeadsFile(generateSampleMetaLeadsWorkbook());
    assert.equal(r.validCount, 3);
    const l = r.validLeads[0];
    assert.equal(l.name, 'Ramesh Kumar');
    assert.equal(l.phone, '9876512345');
    assert.match(l.address, /Green Valley/);
    assert.equal(l.email, 'ramesh.kumar@example.com');
    assert.equal(l.scrapType, 'Iron');
    assert.equal(l.price, 450);
    // 27/11/2026 10:30 AM India time = 05:00 UTC
    assert.equal(l.preferredAt.toISOString(), '2026-11-27T05:00:00.000Z');
    assert.deepEqual(l.missing, []);
  });

  test('LEAD-2 Meta export: created_time is not the pickup time; campaign name is not the customer', () => {
    const r = parseMetaLeadsFile(sheet([{
      id: 'l:1', created_time: '2026-11-19T10:36:01.262Z', campaign_name: 'Scrap Q4', ad_name: 'Ad 1',
      full_name: 'Sunita D', phone_number: 'p:+919811100000', email: 'sunita@example.com',
      street_address: 'House 12, Malviya Nagar', city: 'Delhi', 'what_type_of_scrap_do_you_have?': 'Old newspapers',
    }]));
    const l = r.validLeads[0];
    assert.equal(l.name, 'Sunita D');
    assert.equal(l.phone, '9811100000');
    assert.equal(l.preferredAt, null, 'created_time must not be used as the pickup time');
    assert.deepEqual(l.missing.sort(), ['Date and time', 'Price']);
  });

  test('LEAD-3 rows without name, number or address are skipped with a reason', () => {
    const r = parseMetaLeadsFile(sheet([
      { Name: 'A', Number: '98', Address: 'X' },
      { Name: '', Number: '9876500001', Address: 'Y' },
      { Name: 'B', Number: '9876500002', Address: '' },
      { Name: 'C', Number: '9876500003', Address: 'Z', 'Mail ID': 'c@x.com', Category: 'Copper', 'Date and time': '28-11-2026 14:00', Price: '₹1,250' },
    ]));
    assert.equal(r.validCount, 1);
    assert.equal(r.invalidCount, 3);
    assert.equal(r.validLeads[0].price, 1250);
    assert.equal(r.validLeads[0].preferredAt.toISOString(), '2026-11-28T08:30:00.000Z');
  });

  test('LEAD-4 date formats', () => {
    assert.equal(parseLeadDateTime('2026-11-27 16:00').toISOString(), '2026-11-27T10:30:00.000Z');
    assert.equal(parseLeadDateTime('27 Nov 2026, 4 PM').toISOString(), '2026-11-27T10:30:00.000Z');
    assert.equal(parseLeadDateTime('ASAP'), null);
    assert.equal(parseLeadDateTime('31/02/2026'), null);
  });

  describe('distribution to a partner', () => {
    let app;
    before(async () => { await startTestDb(); await syncIndexes(); app = buildApp(); });
    after(async () => { await stopTestDb(); });
    beforeEach(async () => { await clearTestDb(); });

    test('LEAD-5 the partner job carries all seven fields, the lead price and the real slot', async () => {
      const admin = await makeAdmin();
      const { scrapper } = await makeScrapper({ status: 'active', kyc: { status: 'verified' } });
      const file = sheet([{
        Name: 'Ramesh Kumar', Number: '9876512345', Address: 'Flat 302, Rohini Sector 9', 'Mail ID': 'ramesh@example.com',
        Category: 'Split AC', 'Date and time': '27/11/2026 4:00 PM', Price: 2500, City: 'Delhi', Pincode: '110085',
      }]);

      const preview = await request(app).post('/api/admin/leads/upload').set(authHeader(admin))
        .field('distributionMode', 'preview').attach('file', file, 'leads.xlsx');
      assert.equal(preview.status, 200, preview.body.message);
      const p = preview.body.data.preview[0];
      assert.deepEqual([p.name, p.phone, p.email, p.category, p.price], ['Ramesh Kumar', '9876512345', 'ramesh@example.com', 'Split AC', 2500]);
      assert.match(p.address, /Rohini Sector 9, Delhi, 110085/);
      assert.deepEqual(p.missing, []);

      const res = await request(app).post('/api/admin/leads/upload').set(authHeader(admin))
        .field('distributionMode', 'manual').field('targetScrapperId', String(scrapper._id)).attach('file', file, 'leads.xlsx');
      assert.equal(res.status, 201, res.body.message);

      const order = await Order.findOne({ scrapper: scrapper._id }).lean();
      assert.ok(order, 'an order is created for the partner');
      assert.equal(order.totalAmount, 2500, 'lead price, not a fixed Rs 15/kg');
      assert.equal(order.scrapItems[0].category, 'split ac');
      assert.equal(order.pickupSlot.slot, '4:00 PM');
      assert.match(order.pickupSlot.dayName, /27 Nov/);
      assert.equal(order.leadInfo.name, 'Ramesh Kumar');
      assert.equal(order.leadInfo.phone, '9876512345');
      assert.equal(order.leadInfo.email, 'ramesh@example.com');
      assert.equal(order.leadInfo.category, 'Split AC');
      assert.equal(order.leadInfo.price, 2500);
      assert.equal(new Date(order.leadInfo.preferredAt).toISOString(), '2026-11-27T10:30:00.000Z');
      assert.equal((await MetaLead.findOne({})).status, 'assigned');
    });
  });
});
