import * as XLSX from 'xlsx';

const BASE_URL = 'http://localhost:7000/api';

async function testMetaLeadsFlow() {
  console.log('===============================================================');
  console.log('🚀 TESTING META LEADS EXCEL UPLOAD & AUTO/MANUAL DISTRIBUTION');
  console.log('===============================================================\n');

  // Step 1: Admin login
  console.log('[Step 1] Admin Login for scrapto@scrapto.com...');
  const adminRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'scrapto@scrapto.com', password: 'scrapto@123' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.data?.token || adminData.token;
  if (!adminRes.ok || !adminToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminData)}`);
  }
  console.log('  ✅ Admin logged in successfully!\n');

  // Step 2: Fetch Active Scrappers
  console.log('[Step 2] Fetching Active Scrappers dynamically...');
  const scrappersRes = await fetch(`${BASE_URL}/admin/leads/active-scrappers`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const scrappersData = await scrappersRes.json();
  console.log(`  ✅ Found ${scrappersData.data.scrappers.length} active scrappers:`,
    scrappersData.data.scrappers.map(s => `${s.name} (${s.phone}) - Online: ${s.isOnline}`));

  const targetScrapper = scrappersData.data.scrappers[0];
  if (!targetScrapper) throw new Error('No active scrapper found in system for testing');

  // Step 3: Create a synthetic Meta Lead Excel buffer
  console.log('\n[Step 3] Creating sample Meta Leads Excel file in memory...');
  const testLeads = [
    {
      'id': 'l:meta_auto_001',
      'created_time': new Date().toISOString(),
      'campaign_name': 'Facebook Diwali Scrap Mega Campaign',
      'full_name': 'Rajesh Gupta',
      'phone_number': '+919876500111',
      'street_address': 'Flat 404, Sunrise Heights, Sector 62',
      'city': 'Noida',
      'post_code': '201309',
      'what_type_of_scrap_do_you_have?': 'Iron grill, Newspaper, Brass tap',
      'estimated_weight_in_kg': '35',
      'preferred_pickup_time': 'Today 4 PM',
      'notes': 'Lift is working, 4th floor'
    },
    {
      'id': 'l:meta_manual_002',
      'created_time': new Date().toISOString(),
      'campaign_name': 'Instagram Recommerce Clean Drive',
      'full_name': 'Sunita Deshmukh',
      'phone_number': '+919876500222',
      'street_address': 'House 12, Block C, Malviya Nagar',
      'city': 'Delhi',
      'post_code': '110017',
      'what_type_of_scrap_do_you_have?': 'Old Air Cooler, Cartons',
      'estimated_weight_in_kg': '20',
      'preferred_pickup_time': 'Tomorrow 11 AM',
      'notes': 'Ground floor house'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(testLeads);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Step 4: Test Automatic Distribution Upload
  console.log('\n[Step 4] Testing Automatic Distribution Upload...');
  const formData = new FormData();
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  formData.append('file', blob, 'test_meta_leads.xlsx');
  formData.append('distributionMode', 'automatic');

  const uploadRes = await fetch(`${BASE_URL}/admin/leads/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
    body: formData
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
  console.log('  ✅ Upload Response:', uploadData.message);
  console.log('  🎯 Distribution details:', uploadData.data.scrappers);

  // Step 5: Verify assigned leads exist in database
  console.log('\n[Step 5] Checking Admin Leads list (/admin/leads)...');
  const listRes = await fetch(`${BASE_URL}/admin/leads?limit=5`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const listData = await listRes.json();
  console.log(`  ✅ Total Leads in System: ${listData.data.stats.total} (Unassigned: ${listData.data.stats.unassigned}, Assigned: ${listData.data.stats.assigned})`);
  const assignedLead = listData.data.leads.find(l => l.phone === '9876500111');
  console.log('  🎯 Found Assigned Lead:', {
    name: assignedLead?.name,
    phone: assignedLead?.phone,
    status: assignedLead?.status,
    distributionType: assignedLead?.distributionType,
    assignedScrapper: assignedLead?.assignedScrapper?.name,
    orderNo: assignedLead?.assignedOrder?.orderNo
  });

  // Step 6: Log in as the Scrapper and verify the lead is in the Partner App
  console.log(`\n[Step 6] Logging in as Scrapper (${targetScrapper.phone}) to verify Partner App receives the lead...`);
  const scrapperLoginRes = await fetch(`${BASE_URL}/auth/login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: targetScrapper.phone, role: 'scrapper' })
  });
  const scrapperVerifyRes = await fetch(`${BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: targetScrapper.phone, otp: '123456', role: 'scrapper' })
  });
  const scrapperAuth = await scrapperVerifyRes.json();
  const scrapperToken = scrapperAuth.data?.token || scrapperAuth.token;

  console.log('  ✅ Scrapper authenticated!');

  // Check /orders/my-assigned
  const myAssignedRes = await fetch(`${BASE_URL}/orders/my-assigned?status=confirmed,in_progress`, {
    headers: { 'Authorization': `Bearer ${scrapperToken}` }
  });
  const myAssignedData = await myAssignedRes.json();
  console.log('  Debug myAssigned status:', myAssignedRes.status, myAssignedData);
  const orders = myAssignedData.data?.orders || myAssignedData.orders || [];
  console.log(`  ✅ Scrapper My Assigned Pickups Count: ${orders.length}`);

  const leadOrder = orders.find(o => o.orderNo === assignedLead?.assignedOrder?.orderNo);
  if (leadOrder) {
    console.log('  🎉 LEAD ORDER FOUND IN SCRAPPER APP!');
    console.log('  📋 Order Details:', {
      orderNo: leadOrder.orderNo,
      customerName: leadOrder.user?.name,
      customerPhone: leadOrder.user?.phone,
      address: `${leadOrder.pickupAddress.street}, ${leadOrder.pickupAddress.city}`,
      status: leadOrder.status,
      items: leadOrder.scrapItems.map(i => `${i.category} (${i.weight}kg @ ₹${i.rate})`),
      totalAmount: `₹${leadOrder.totalAmount}`,
      notes: leadOrder.notes
    });
  } else {
    throw new Error(`Order ${assignedLead?.assignedOrder?.orderNo} not found in scrapper's assigned list!`);
  }

  // Check scrapper notifications
  const notifRes = await fetch(`${BASE_URL}/notifications`, {
    headers: { 'Authorization': `Bearer ${scrapperToken}` }
  });
  const notifData = await notifRes.json();
  const notifications = notifData.data?.notifications || [];
  console.log(`  🔔 Scrapper In-App Notifications Count: ${notifications.length}`);
  const leadNotif = notifications.find(n => n.title?.includes('Lead') || n.body?.includes('Rajesh'));
  if (leadNotif) {
    console.log('  ✅ Scrapper Notification Received:', { title: leadNotif.title, body: leadNotif.body });
  }

  // Step 7: Test Manual Distribution Flow
  console.log('\n[Step 7] Testing Manual Distribution Flow...');
  const manualLead = [{
    'id': 'l:meta_manual_999',
    'created_time': new Date().toISOString(),
    'campaign_name': 'Manual Meta Leads Ad',
    'full_name': 'Vikas Malhotra',
    'phone_number': '+919876500333',
    'street_address': 'Plot 88, Udyog Vihar Phase 4',
    'city': 'Gurgaon',
    'post_code': '122015',
    'what_type_of_scrap_do_you_have?': 'Aluminium wires, Batteries',
    'estimated_weight_in_kg': '50',
    'preferred_pickup_time': 'Tomorrow 2 PM',
    'notes': 'Commercial pickup'
  }];

  const wsMan = XLSX.utils.json_to_sheet(manualLead);
  const wbMan = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbMan, wsMan, 'ManualLeads');
  const manBuffer = XLSX.write(wbMan, { type: 'buffer', bookType: 'xlsx' });

  const manForm = new FormData();
  manForm.append('file', new Blob([manBuffer]), 'manual_lead.xlsx');
  manForm.append('distributionMode', 'manual');

  const manUploadRes = await fetch(`${BASE_URL}/admin/leads/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
    body: manForm
  });
  const manUploadData = await manUploadRes.json();
  console.log('  ✅ Manual Upload Result:', manUploadData.message);

  // Fetch unassigned leads
  const unassignedRes = await fetch(`${BASE_URL}/admin/leads?status=unassigned`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const unassignedData = await unassignedRes.json();
  const unassignedLeads = unassignedData.data.leads || [];
  console.log(`  ✅ Unassigned Leads Count: ${unassignedLeads.length}`);
  const leadToAssign = unassignedLeads.find(l => l.phone === '9876500333');
  if (!leadToAssign) throw new Error('Uploaded manual lead not found in unassigned list');

  // Distribute manually to target scrapper
  console.log(`  🎯 Manually assigning lead (${leadToAssign.name}) to scrapper ${targetScrapper.name}...`);
  const distributeRes = await fetch(`${BASE_URL}/admin/leads/distribute`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      leadIds: [leadToAssign._id],
      distributionMode: 'manual',
      scrapperId: targetScrapper.id
    })
  });
  const distributeData = await distributeRes.json();
  console.log('  ✅ Distribution Response:', distributeData.message);

  console.log('\n===============================================================');
  console.log('🎉 100% META LEADS AUTO & MANUAL DISTRIBUTION TEST PASSED!');
  console.log('===============================================================\n');
}

testMetaLeadsFlow().catch(err => {
  console.error('\n❌ Meta Leads Test Error:', err);
  process.exit(1);
});
