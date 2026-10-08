// tests.js: Automated test suite for Hotel Room Booking System API
// Uses Node.js native fetch (no external libraries)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper function to send HTTP requests to the API
async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// Calculate dates dynamically for next month
function getNextMonthDates() {
  const now = new Date();
  const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonth = (now.getMonth() + 1) % 12; // 0-indexed
  const pad = (n) => String(n).padStart(2, '0');
  const ym = `${nextMonthYear}-${pad(nextMonth + 1)}`;

  return {
    d10: `${ym}-10`,
    d15: `${ym}-15`,
    d12: `${ym}-12`,
    d14: `${ym}-14`,
    d18: `${ym}-18`
  };
}

async function runTests() {
  console.log('===========================================================');
  console.log('   Hotel Room Booking System - Automated API Test Suite');
  console.log(`   Target Server: ${BASE_URL}`);
  console.log('===========================================================\n');

  // Verify server connectivity
  try {
    const health = await api('/api/health');
    if (health.status !== 200) {
      throw new Error(`Health route returned status ${health.status}`);
    }
  } catch (err) {
    console.error(`❌ Connection failed: Unable to connect to server at ${BASE_URL}.`);
    console.error('   Please ensure the server is running with "npm start" before testing.');
    process.exit(1);
  }

  const { d10, d15, d12, d14, d18 } = getNextMonthDates();
  const testRoomNo = `TEST_${Date.now().toString().slice(-4)}`;
  let testRoomId = null;
  let booking1Id = null;
  let booking2Id = null;

  const testResults = [];
  function logResult(num, title, passed, details) {
    testResults.push({ num, title, passed, details });
    const mark = passed ? 'PASS' : 'FAIL';
    console.log(`[${mark}] Test ${num}: ${title}`);
    if (details) console.log(`       -> ${details}`);
  }

  try {
    // Setup: Create a dedicated test room
    const createRoomRes = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ room_no: testRoomNo, type: 'Deluxe', price: 175 })
    });

    if (createRoomRes.status !== 201 || !createRoomRes.body?.room?.id) {
      throw new Error(`Setup failed: could not create test room (${JSON.stringify(createRoomRes.body)})`);
    }
    testRoomId = createRoomRes.body.room.id;

    // ------------------------------------------------------------------------
    // Test 1: Book a room for 10-15 of next month, then try an overlapping range, expecting 409
    // ------------------------------------------------------------------------
    const b1 = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Test Guest 1',
        check_in: d10,
        check_out: d15
      })
    });
    booking1Id = b1.body?.booking?.id;

    const bOverlap = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Overlapping Guest',
        check_in: d12,
        check_out: d14
      })
    });

    const test1Pass = b1.status === 201 && bOverlap.status === 409;
    logResult(
      1,
      'Book a room for 10-15 of next month, then try an overlapping range, expecting 409',
      test1Pass,
      `Initial booking: ${b1.status} (ID: ${booking1Id}), Overlap attempt: ${bOverlap.status} (${bOverlap.body.error || 'Conflict'})`
    );

    // ------------------------------------------------------------------------
    // Test 2: Book starting on the previous check-out day, expecting success
    // ------------------------------------------------------------------------
    const bAdjacent = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Adjacent Guest',
        check_in: d15, // Starts on previous checkout day (d15)
        check_out: d18
      })
    });
    booking2Id = bAdjacent.body?.booking?.id;

    const test2Pass = bAdjacent.status === 201 && !!booking2Id;
    logResult(
      2,
      'Book starting on the previous check-out day, expecting success',
      test2Pass,
      `Adjacent booking status: ${bAdjacent.status} (Booking ID: ${booking2Id})`
    );

    // ------------------------------------------------------------------------
    // Test 3: check_out earlier than or equal to check_in, expecting 400
    // ------------------------------------------------------------------------
    const bEarlier = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Invalid Date Guest',
        check_in: d15,
        check_out: d10 // earlier
      })
    });

    const bEqual = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Equal Date Guest',
        check_in: d15,
        check_out: d15 // equal
      })
    });

    const test3Pass = bEarlier.status === 400 && bEqual.status === 400;
    logResult(
      3,
      'check_out earlier than or equal to check_in, expecting 400',
      test3Pass,
      `Earlier checkout: ${bEarlier.status}, Equal checkout: ${bEqual.status}`
    );

    // ------------------------------------------------------------------------
    // Test 4: check_in in the past, expecting 400
    // ------------------------------------------------------------------------
    const bPast = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: 'Past Date Guest',
        check_in: '2020-01-01',
        check_out: '2020-01-05'
      })
    });

    const test4Pass = bPast.status === 400;
    logResult(
      4,
      'check_in in the past, expecting 400',
      test4Pass,
      `Past check_in status: ${bPast.status} (${bPast.body.error})`
    );

    // ------------------------------------------------------------------------
    // Test 5: Empty guest name, expecting 400
    // ------------------------------------------------------------------------
    const bEmptyName = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        room_id: testRoomId,
        guest_name: '   ',
        check_in: d18,
        check_out: `${d18.slice(0, 8)}25`
      })
    });

    const test5Pass = bEmptyName.status === 400;
    logResult(
      5,
      'Empty guest name, expecting 400',
      test5Pass,
      `Empty name status: ${bEmptyName.status} (${bEmptyName.body.error})`
    );

    // ------------------------------------------------------------------------
    // Test 6: Duplicate room number, expecting 409
    // ------------------------------------------------------------------------
    const duplicateRoom = await api('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ room_no: testRoomNo, type: 'Suite', price: 200 })
    });

    const test6Pass = duplicateRoom.status === 409;
    logResult(
      6,
      'Duplicate room number, expecting 409',
      test6Pass,
      `Duplicate room status: ${duplicateRoom.status} (${duplicateRoom.body.error})`
    );

    // ------------------------------------------------------------------------
    // Test 7: Cancel a booking that doesn't exist, expecting 404
    // ------------------------------------------------------------------------
    const nonExistentBooking = await api('/api/bookings/99999999', {
      method: 'DELETE'
    });

    const test7Pass = nonExistentBooking.status === 404;
    logResult(
      7,
      "Cancel a booking that doesn't exist, expecting 404",
      test7Pass,
      `Non-existent cancellation status: ${nonExistentBooking.status} (${nonExistentBooking.body.error})`
    );

    // ------------------------------------------------------------------------
    // Test 8: Search excludes rooms with overlapping bookings
    // ------------------------------------------------------------------------
    // Test room is booked for d10-d15. Searching d12-d14 should EXCLUDE it.
    const searchOverlapping = await api(`/api/rooms/search?check_in=${d12}&check_out=${d14}`);
    const isExcluded = Array.isArray(searchOverlapping.body) &&
      !searchOverlapping.body.some(r => r.id === testRoomId);

    const test8Pass = searchOverlapping.status === 200 && isExcluded;
    logResult(
      8,
      'Search excludes rooms with overlapping bookings',
      test8Pass,
      `Search status: ${searchOverlapping.status}, Room ${testRoomNo} excluded: ${isExcluded}`
    );

    // ------------------------------------------------------------------------
    // Test 10 (Bonus): Edit room using PUT /api/rooms/:id
    // ------------------------------------------------------------------------
    const updateRes = await api(`/api/rooms/${testRoomId}`, {
      method: 'PUT',
      body: JSON.stringify({ room_no: testRoomNo, type: 'Suite', price: 199.99 })
    });
    const updateNonExistent = await api('/api/rooms/999999', {
      method: 'PUT',
      body: JSON.stringify({ room_no: '999999', type: 'Suite', price: 200 })
    });
    const updateInvalidPrice = await api(`/api/rooms/${testRoomId}`, {
      method: 'PUT',
      body: JSON.stringify({ room_no: testRoomNo, type: 'Suite', price: -25 })
    });

    const test10Pass = updateRes.status === 200 && 
                       updateRes.body?.room?.price === 199.99 &&
                       updateNonExistent.status === 404 &&
                       updateInvalidPrice.status === 400;

    logResult(
      10,
      'Update room via PUT /api/rooms/:id (valid edit, 404 on missing, 400 on invalid price)',
      test10Pass,
      `Valid edit status: ${updateRes.status}, Missing ID: ${updateNonExistent.status}, Invalid price: ${updateInvalidPrice.status}`
    );

    // ------------------------------------------------------------------------
    // Test 9: Deleting a room also removes its bookings
    // ------------------------------------------------------------------------
    const deleteRoomRes = await api(`/api/rooms/${testRoomId}`, {
      method: 'DELETE'
    });

    const checkBookingsRes = await api('/api/bookings');
    const hasOrphanBookings = Array.isArray(checkBookingsRes.body) &&
      checkBookingsRes.body.some(b => b.room_id === testRoomId);

    const test9Pass = deleteRoomRes.status === 200 && !hasOrphanBookings;
    logResult(
      9,
      'Deleting a room also removes its bookings',
      test9Pass,
      `Room delete status: ${deleteRoomRes.status}, Cascade verified (bookings for room removed: ${!hasOrphanBookings})`
    );

  } catch (err) {
    console.error('❌ Unexpected test runner error:', err);
  } finally {
    // Clean up test data
    console.log('\n--- Cleaning up test artifacts ---');
    if (testRoomId) {
      await api(`/api/rooms/${testRoomId}`, { method: 'DELETE' }).catch(() => {});
    }
    console.log('Cleanup completed.\n');
  }

  // Summary
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;

  console.log('===========================================================');
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('===========================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
