import * as XLSX from 'xlsx';

/**
 * Lead sheet parser.
 *
 * Every lead carries the seven fields the partner needs:
 *   Name · Number · Address · Mail ID · Category · Date and time · Price
 * Name, Number and Address are required (a row without them is skipped). The
 * other four are expected; when one is missing the row is still imported and
 * the preview lists what is missing so the admin can fix the sheet first.
 *
 * Column names are matched flexibly (Meta Lead Ads exports, our template, or
 * a hand-made sheet): exact names win over partial ones, and partial matches
 * are whole words only, so "Campaign Name" is never read as the customer name
 * and "created_time" is never read as the pickup time.
 */

export const LEAD_FIELDS = ['Name', 'Number', 'Address', 'Mail ID', 'Category', 'Date and time', 'Price'];

/**
 * Clean phone number to 10-digit Indian mobile number
 * Handles formats: +919876543210, p:+91 98765 43210, 09876543210, 98765-43210
 */
export const cleanPhoneNumber = (raw) => {
  if (!raw) return '';
  const digits = String(raw).trim().replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

/** "What_type-of Scrap?" -> "what type of scrap" */
const normalizeKey = (key) =>
  String(key || '')
    .toLowerCase()
    .replace(/[_\-\s/]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Value of the first column matching one of the candidate names.
 * Pass 1: exact name. Pass 2: the candidate's words appear as whole words in
 * the column name. Columns containing any `exclude` word are never used.
 * Returns the raw cell value (string, number or Date).
 */
const findRaw = (row, candidates, exclude = []) => {
  const cols = Object.keys(row).map((k) => ({ k, n: normalizeKey(k) }))
    .filter(({ n }) => !exclude.some((x) => n.split(' ').includes(x)));
  for (const c of candidates) {
    const cn = normalizeKey(c);
    const hit = cols.find(({ k, n }) => n === cn && !isBlank(row[k]));
    if (hit) return row[hit.k];
  }
  for (const c of candidates) {
    // normalizeKey leaves only a-z, 0-9 and single spaces, so this is a plain literal.
    const re = new RegExp(`(^| )${normalizeKey(c)}( |$)`);
    const hit = cols.find(({ k, n }) => re.test(n) && !isBlank(row[k]));
    if (hit) return row[hit.k];
  }
  return '';
};
const findText = (row, candidates, exclude) => {
  const v = findRaw(row, candidates, exclude);
  if (v instanceof Date) return v.toISOString();
  return isBlank(v) ? '' : String(v).trim();
};

/** "₹ 1,250.50", "1250 rs", 1250 -> 1250.5; anything unreadable -> 0 */
export const parsePrice = (raw) => {
  if (typeof raw === 'number') return raw > 0 ? Math.round(raw * 100) / 100 : 0;
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Pickup date and time as a Date (India time), or null when the text is not a
 * date ("ASAP", "Tomorrow morning"). Accepts Excel date cells, ISO strings,
 * "27/11/2026 10:30 AM", "27-11-2026 14:00", "2026-11-27 10:30",
 * "27 Nov 2026, 4 PM". Day comes before month (Indian format).
 */
export const parseLeadDateTime = (raw) => {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial date (days since 1899-12-30), read as India time.
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms - 330 * 60 * 1000);
  }
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let y; let mo; let d;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
  if (!m) {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { d = +m[1]; mo = +m[2] - 1; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
  }
  if (!m) {
    m = s.match(/^(\d{1,2})\s+([a-z]{3,4})[a-z]*\.?,?\s+(\d{4})/i);
    if (m && MONTHS[m[2].toLowerCase()] !== undefined) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; } else m = null;
  }
  if (!m || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, mo, d)).getUTCDate() !== d) return null; // 31/02 is not a date
  let h = 10; let min = 0; // date only: assume 10 AM
  const t = s.slice(m[0].length).match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  if (t) {
    h = +t[1]; min = t[2] ? +t[2] : 0;
    const ap = (t[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) { h = 10; min = 0; }
  }
  // Build the instant for that wall-clock time in India (UTC+5:30).
  const out = new Date(Date.UTC(y, mo, d, h, min) - 330 * 60 * 1000);
  return Number.isNaN(out.getTime()) ? null : out;
};

const FIELD_COLUMNS = {
  name: { cand: ['name', 'full name', 'customer name', 'client name', 'lead name'], exclude: ['campaign', 'ad', 'form', 'first', 'last'] },
  phone: { cand: ['number', 'phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'contact', 'whatsapp', 'whatsapp number'], exclude: ['id', 'pin', 'post', 'zip', 'house', 'flat'] },
  address: { cand: ['address', 'street address', 'full address', 'pickup address', 'street', 'locality', 'area'], exclude: ['email', 'mail', 'ip'] },
  email: { cand: ['mail id', 'email', 'email id', 'email address', 'mail', 'e mail'], exclude: [] },
  category: { cand: ['category', 'scrap category', 'scrap type', 'type of scrap', 'what type of scrap do you have', 'material', 'items', 'scrap'], exclude: ['id'] },
  dateTime: { cand: ['date and time', 'date time', 'datetime', 'pickup date and time', 'preferred date and time', 'preferred pickup time', 'preferred date', 'pickup date', 'pickup time', 'date', 'time', 'slot'], exclude: ['created', 'updated', 'submitted'] },
  price: { cand: ['price', 'amount', 'expected price', 'quoted price', 'price rs', 'price inr', 'value', 'rate'], exclude: [] },
};

/**
 * Parse an Excel/CSV buffer into standardized lead objects
 */
export const parseMetaLeadsFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file contains no sheets');

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows || rawRows.length === 0) throw new Error('The uploaded file is empty');

  const validLeads = [];
  const invalidRows = [];
  const get = (row, f) => findText(row, FIELD_COLUMNS[f].cand, FIELD_COLUMNS[f].exclude);

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1

    let name = get(row, 'name');
    if (!name) {
      const first = findText(row, ['first name', 'firstname']);
      const last = findText(row, ['last name', 'lastname']);
      name = `${first} ${last}`.trim();
    }
    const rawPhone = get(row, 'phone');
    const phone = cleanPhoneNumber(rawPhone);
    const address = get(row, 'address');
    const email = get(row, 'email').toLowerCase();
    const category = get(row, 'category');
    const dtRaw = findRaw(row, FIELD_COLUMNS.dateTime.cand, FIELD_COLUMNS.dateTime.exclude);
    const preferredAt = parseLeadDateTime(dtRaw);
    const preferredDate = dtRaw instanceof Date ? dtRaw.toISOString() : String(dtRaw ?? '').trim();
    const price = parsePrice(findRaw(row, FIELD_COLUMNS.price.cand, FIELD_COLUMNS.price.exclude));

    const city = findText(row, ['city', 'town', 'district']) || 'Delhi';
    const state = findText(row, ['state', 'province', 'region']) || 'Delhi';
    const pincode = findText(row, ['pincode', 'pin code', 'pin', 'post code', 'postal code', 'zip code', 'zip']);
    const weightNum = parseFloat(String(findText(row, ['estimated weight', 'estimated weight in kg', 'weight', 'weight kg', 'approx weight', 'quantity', 'kg'])).replace(/[^\d.]/g, ''));
    const estimatedWeight = Number.isFinite(weightNum) && weightNum > 0 ? weightNum : 10;
    const notes = findText(row, ['notes', 'note', 'comments', 'comment', 'description', 'message', 'remarks']);

    // Required: a lead without these cannot be served.
    const reasons = [];
    if (!name) reasons.push('Missing name');
    if (!phone || phone.length !== 10) reasons.push('Invalid or missing 10-digit mobile number');
    if (!address) reasons.push('Missing address');
    if (reasons.length) {
      invalidRows.push({ rowNumber: rowNum, phone, rawPhone, reason: reasons.join('; '), data: row });
      return;
    }

    // Expected: imported, but flagged in the preview.
    const missing = [];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) missing.push('Mail ID');
    if (!category) missing.push('Category');
    if (!preferredAt) missing.push('Date and time');
    if (!price) missing.push('Price');

    validLeads.push({
      leadId: findText(row, ['lead id', 'leadid', 'id'], ['mail', 'email', 'ad', 'campaign', 'form', 'page', 'adset']) || undefined,
      name,
      phone,
      email: missing.includes('Mail ID') ? '' : email,
      address,
      city,
      state,
      pincode,
      scrapType: category || 'Mixed Scrap',
      estimatedWeight,
      preferredDate: preferredDate || 'ASAP',
      preferredAt,
      price,
      notes,
      campaignName: findText(row, ['campaign name', 'campaign']),
      adName: findText(row, ['ad name']),
      formName: findText(row, ['form name']),
      missing,
      rowNumber: rowNum,
      rawDetails: row,
      source: 'meta_ad'
    });
  });

  return {
    totalRows: rawRows.length,
    validCount: validLeads.length,
    invalidCount: invalidRows.length,
    incompleteCount: validLeads.filter((l) => l.missing.length).length,
    validLeads,
    invalidRows
  };
};

/**
 * Sample sheet with exactly the columns the partner needs (plus optional ones).
 */
export const generateSampleMetaLeadsWorkbook = () => {
  const sampleData = [
    {
      'Name': 'Ramesh Kumar',
      'Number': '9876512345',
      'Address': 'Flat 302, Green Valley Apartments, Rohini Sector 9',
      'Mail ID': 'ramesh.kumar@example.com',
      'Category': 'Iron',
      'Date and time': '27/11/2026 10:30 AM',
      'Price': 450,
      'City': 'Delhi',
      'Pincode': '110085',
      'Weight (kg)': 25,
      'Notes': 'Please call before arriving'
    },
    {
      'Name': 'Pooja Sharma',
      'Number': '9811223344',
      'Address': 'B-12, Lajpat Nagar Part 2',
      'Mail ID': 'pooja.sharma@example.com',
      'Category': 'Split AC',
      'Date and time': '27/11/2026 4:00 PM',
      'Price': 2500,
      'City': 'Delhi',
      'Pincode': '110024',
      'Weight (kg)': 40,
      'Notes': 'AC is already unmounted'
    },
    {
      'Name': 'Amit Verma',
      'Number': '9988776655',
      'Address': 'House 45, Sector 15',
      'Mail ID': 'amit.v@example.com',
      'Category': 'Newspaper',
      'Date and time': '28/11/2026 11:00 AM',
      'Price': 210,
      'City': 'Noida',
      'Pincode': '201301',
      'Weight (kg)': 15,
      'Notes': 'Office clearance'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  worksheet['!cols'] = [18, 14, 44, 28, 14, 22, 10, 12, 10, 12, 30].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
