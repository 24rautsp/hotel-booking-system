// routes/bookings.js: Express Router for Booking Management
const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper function: Return today's date formatted as 'YYYY-MM-DD'
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function: Validate 'YYYY-MM-DD' format and verify it is a real calendar date
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  if (year < 2000 || year > 2100) return false;
  const dateObj = new Date(year, month - 1, day);
  return (
    dateObj.getFullYear() === year &&
    dateObj.getMonth() === month - 1 &&
    dateObj.getDate() === day
  );
}

// Helper function: Parse and validate an integer ID from route params
function parseIdParam(idStr) {
  const parsed = parseInt(idStr, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== String(idStr).trim()) {
    return null;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 1. GET /api/bookings: List all bookings joined with room info & calculated totals
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        b.id,
        b.room_id,
        b.guest_name,
        b.check_in,
        b.check_out,
        r.room_no,
        r.type AS room_type,
        r.price AS room_price,
        CAST(ROUND(julianday(b.check_out) - julianday(b.check_in)) AS INTEGER) AS nights,
        ROUND((julianday(b.check_out) - julianday(b.check_in)) * r.price, 2) AS total_price
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      ORDER BY b.check_in ASC, b.id ASC
    `);

    const bookings = stmt.all();
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

// Prepared statements for booking creation
const checkRoomStmt = db.prepare('SELECT id, room_no, type, price FROM rooms WHERE id = ?');
const checkOverlapStmt = db.prepare(`
  SELECT id, guest_name, check_in, check_out 
  FROM bookings
  WHERE room_id = ?
    AND check_in < ?
    AND check_out > ?
  LIMIT 1
`);
const insertBookingStmt = db.prepare(`
  INSERT INTO bookings (room_id, guest_name, check_in, check_out)
  VALUES (?, ?, ?, ?)
`);

// Atomic Transaction: verifies availability and inserts booking within a single DB lock
const createBookingTransaction = db.transaction((roomId, guestName, checkIn, checkOut, room) => {
  const overlappingBooking = checkOverlapStmt.get(roomId, checkOut, checkIn);
  if (overlappingBooking) {
    const conflictError = new Error(
      `Room ${room.room_no} is already booked by ${overlappingBooking.guest_name} from ${overlappingBooking.check_in} to ${overlappingBooking.check_out}. Overlapping dates are not allowed.`
    );
    conflictError.statusCode = 409;
    throw conflictError;
  }

  const result = insertBookingStmt.run(roomId, guestName, checkIn, checkOut);
  return Number(result.lastInsertRowid);
});

// ---------------------------------------------------------------------------
// 2. POST /api/bookings: Create a new room booking (Atomically checked & created)
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  try {
    const { room_id, guest_name, check_in, check_out } = req.body;

    // Rule 1: room_id, guest_name, check_in, check_out are required
    if (!room_id || !guest_name || !check_in || !check_out) {
      return res.status(400).json({ 
        error: 'room_id, guest_name, check_in, and check_out are all required fields.' 
      });
    }

    // Validate room_id format
    const parsedRoomId = parseInt(room_id, 10);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
      return res.status(400).json({ 
        error: 'room_id must be a valid positive integer.' 
      });
    }

    const trimmedGuestName = String(guest_name).trim();
    if (!trimmedGuestName) {
      return res.status(400).json({ 
        error: 'guest_name cannot be an empty string.' 
      });
    }

    if (trimmedGuestName.length > 100) {
      return res.status(400).json({ 
        error: 'guest_name cannot exceed 100 characters.' 
      });
    }

    const cleanCheckIn = String(check_in).trim();
    const cleanCheckOut = String(check_out).trim();

    // Rule 2: Dates must be valid and in YYYY-MM-DD format
    if (!isValidDateString(cleanCheckIn) || !isValidDateString(cleanCheckOut)) {
      return res.status(400).json({ 
        error: 'Dates must be valid calendar dates in YYYY-MM-DD format.' 
      });
    }

    // Rule 3: check_out must be strictly after check_in
    if (cleanCheckOut <= cleanCheckIn) {
      return res.status(400).json({ 
        error: 'check_out date must be strictly after check_in date.' 
      });
    }

    // Rule 4: check_in cannot be in the past (today is allowed)
    const today = getTodayDateString();
    if (cleanCheckIn < today) {
      return res.status(400).json({ 
        error: `check_in date (${cleanCheckIn}) cannot be in the past. Today is ${today}.` 
      });
    }

    // Maximum stay limit check (365 days)
    const inDate = new Date(cleanCheckIn);
    const outDate = new Date(cleanCheckOut);
    const nights = Math.round((outDate - inDate) / (1000 * 60 * 60 * 24));
    if (nights > 365) {
      return res.status(400).json({ 
        error: 'Maximum reservation duration is 365 nights.' 
      });
    }

    // Rule 5: Room must exist (404 otherwise)
    const room = checkRoomStmt.get(parsedRoomId);
    if (!room) {
      return res.status(404).json({ 
        error: `Room with ID ${parsedRoomId} not found.` 
      });
    }

    // Rule 6: Atomic Overlap Check & Booking Insertion
    const newBookingId = createBookingTransaction(parsedRoomId, trimmedGuestName, cleanCheckIn, cleanCheckOut, room);

    const totalPrice = Number((nights * room.price).toFixed(2));

    res.status(201).json({
      message: 'Booking created successfully',
      booking: {
        id: newBookingId,
        room_id: parsedRoomId,
        guest_name: trimmedGuestName,
        check_in: cleanCheckIn,
        check_out: cleanCheckOut,
        nights,
        room_no: room.room_no,
        room_type: room.type,
        room_price: room.price,
        total_price: totalPrice
      }
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }

    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

// ---------------------------------------------------------------------------
// 3. DELETE /api/bookings/:id: Cancel a booking (404 if it does not exist)
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  try {
    const bookingId = parseIdParam(req.params.id);
    if (!bookingId) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Check if booking exists
    const checkStmt = db.prepare(`
      SELECT b.id, b.guest_name, r.room_no 
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.id = ?
    `);
    const existingBooking = checkStmt.get(bookingId);

    if (!existingBooking) {
      return res.status(404).json({ error: `Booking with ID ${bookingId} not found.` });
    }

    const deleteStmt = db.prepare('DELETE FROM bookings WHERE id = ?');
    deleteStmt.run(bookingId);

    res.json({ 
      message: `Booking #${bookingId} for guest '${existingBooking.guest_name}' (Room ${existingBooking.room_no}) was canceled successfully.` 
    });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: 'Failed to cancel booking.' });
  }
});

module.exports = router;
