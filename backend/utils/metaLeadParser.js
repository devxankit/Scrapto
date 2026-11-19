import * as XLSX from 'xlsx';

/**
 * Clean phone number to 10-digit Indian mobile number
 * Handles formats: +919876543210, p:+91 98765 43210, 09876543210, 98765-43210
 */
export const cleanPhoneNumber = (raw) => {
  if (!raw) return '';
  const str = String(raw).trim();
  // Strip non-digits
  const digits = str.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

/**
 * Normalize column names for flexible matching
 */
const normalizeKey = (key) => {
  return String(key || '')
    .toLowerCase()
    .trim()
    .replace(/[_\-\s]+/g, ' ')
    .replace(/[^\w\s]/gi, '');
};

/**
 * Find matching key from row object using candidate keywords
 */
const findValue = (row, candidates) => {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const candNorm = normalizeKey(candidate);
    for (const key of keys) {
      const norm = normalizeKey(key);
      if (norm === candNorm || norm.includes(candNorm)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }
  return '';
};

/**
 * Parse an Excel/CSV buffer into standardized lead objects
 */
export const parseMetaLeadsFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file contains no sheets');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded file is empty');
  }

  const validLeads = [];
  const invalidRows = [];

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // 1-based index accounting for header row

    // Name resolution
    let name = findValue(row, ['full name', 'fullname', 'name', 'customer name', 'client name']);
    if (!name) {
      const first = findValue(row, ['first name', 'firstname']);
      const last = findValue(row, ['last name', 'lastname']);
      if (first || last) name = `${first} ${last}`.trim();
    }
    if (!name) name = `Meta Lead #${rowNum}`;

    // Phone resolution
    const rawPhone = findValue(row, ['phone number', 'phonenumber', 'phone', 'mobile', 'contact', 'whatsapp']);
    const phone = cleanPhoneNumber(rawPhone);

    // Address resolution
    const address = findValue(row, ['street address', 'street', 'address', 'locality', 'house address', 'area']);
    const city = findValue(row, ['city', 'town', 'district']) || 'Delhi';
    const state = findValue(row, ['state', 'province', 'region']) || 'Delhi';
    const pincode = findValue(row, ['post code', 'postal code', 'zip code', 'zip', 'pincode', 'pin']) || '';

    // Scrap details resolution
    const scrapType = findValue(row, ['scrap type', 'type of scrap', 'material', 'items', 'what type', 'scrap categories']) || 'Mixed Scrap';
    const rawWeight = findValue(row, ['estimated weight', 'weight', 'approx weight', 'quantity', 'kg']);
    const weightNum = parseFloat(String(rawWeight).replace(/[^\d.]/g, ''));
    const estimatedWeight = !isNaN(weightNum) && weightNum > 0 ? weightNum : 10;

    // Meta campaign & ad details
    const leadId = findValue(row, ['id', 'lead id', 'leadid']);
    const campaignName = findValue(row, ['campaign name', 'campaign', 'campaign id']);
    const adName = findValue(row, ['ad name', 'ad', 'ad id']);
    const formName = findValue(row, ['form name', 'form', 'form id']);
    const preferredDate = findValue(row, ['date', 'preferred date', 'slot', 'time', 'pickup date']) || 'ASAP';
    const notes = findValue(row, ['notes', 'comments', 'comment', 'description', 'message', 'remarks']);

    // Validation
    if (!phone || phone.length !== 10) {
      invalidRows.push({
        rowNumber: rowNum,
        rawPhone,
        reason: 'Invalid or missing 10-digit mobile number',
        data: row
      });
      return;
    }

    if (!address) {
      invalidRows.push({
        rowNumber: rowNum,
        phone,
        reason: 'Missing pickup address / locality',
        data: row
      });
      return;
    }

    validLeads.push({
      leadId: leadId || undefined,
      name,
      phone,
      email: findValue(row, ['email', 'email address']),
      address,
      city,
      state,
      pincode,
      scrapType,
      estimatedWeight,
      preferredDate,
      notes: notes || (scrapType ? `Scrap: ${scrapType}` : ''),
      campaignName,
      adName,
      formName,
      rawDetails: row,
      source: 'meta_ad'
    });
  });

  return {
    totalRows: rawRows.length,
    validCount: validLeads.length,
    invalidCount: invalidRows.length,
    validLeads,
    invalidRows
  };
};

/**
 * Generate a ready-to-use Sample Meta Lead Excel file buffer
 */
export const generateSampleMetaLeadsWorkbook = () => {
  const sampleData = [
    {
      'id': 'l:1092837465',
      'created_time': new Date().toISOString(),
      'ad_name': 'Scrap Pickup Delhi 20% Extra',
      'campaign_name': 'Meta Scrap Conversion Q4',
      'form_name': 'Instant Pickup Booking Form',
      'full_name': 'Ramesh Kumar',
      'phone_number': '+919876512345',
      'email': 'ramesh.kumar@example.com',
      'street_address': 'Flat 302, Green Valley Apartments, Rohini Sector 9',
      'city': 'Delhi',
      'post_code': '110085',
      'what_type_of_scrap_do_you_have?': 'Iron & Old Newspapers',
      'estimated_weight_in_kg': '25',
      'preferred_pickup_time': 'Tomorrow Morning',
      'notes': 'Please call before arriving'
    },
    {
      'id': 'l:1092837466',
      'created_time': new Date().toISOString(),
      'ad_name': 'Scrap Pickup Delhi 20% Extra',
      'campaign_name': 'Meta Scrap Conversion Q4',
      'form_name': 'Instant Pickup Booking Form',
      'full_name': 'Pooja Sharma',
      'phone_number': '+919811223344',
      'email': 'pooja.sharma@example.com',
      'street_address': 'B-12, Lajpat Nagar Part 2',
      'city': 'Delhi',
      'post_code': '110024',
      'what_type_of_scrap_do_you_have?': 'Old Air Conditioner & Plastic',
      'estimated_weight_in_kg': '40',
      'preferred_pickup_time': 'Today Afternoon',
      'notes': 'AC is already unmounted'
    },
    {
      'id': 'l:1092837467',
      'created_time': new Date().toISOString(),
      'ad_name': 'Scrap Pickup Delhi 20% Extra',
      'campaign_name': 'Meta Scrap Conversion Q4',
      'form_name': 'Instant Pickup Booking Form',
      'full_name': 'Amit Verma',
      'phone_number': '+919988776655',
      'email': 'amit.v@example.com',
      'street_address': 'House 45, Sector 15',
      'city': 'Noida',
      'post_code': '201301',
      'what_type_of_scrap_do_you_have?': 'Cardboard, Books & Mixed Metal',
      'estimated_weight_in_kg': '15',
      'preferred_pickup_time': 'Anytime today',
      'notes': 'Office clearance'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Meta Leads Sample');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
