// routes/rooms.js: Express Router for Room Management
const express = require('express');
const router = express.Router();
const db = require('../db');

// Allowed room categories for strict data integrity
const ALLOWED_ROOM_TYPES = ['Single', 'Double', 'Deluxe', 'Suite'];

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
// 1. GET /api/rooms: List all rooms with current availability status for today
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const today = getTodayDateString();

    // Prepared statement: check if any booking covers today's date
    // A booking covers today if: check_in <= today AND today < check_out
    const stmt = db.prepare(`
      SELECT 
        r.id,
        r.room_no,
        r.type,
        r.price,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM bookings b 
            WHERE b.room_id = r.id 
              AND b.check_in <= ? 
              AND b.check_out > ?
          ) THEN 'Booked'
          ELSE 'Available'
        END AS status
      FROM rooms r
      ORDER BY r.room_no ASC
    `);

    const rooms = stmt.all(today, today);
    res.json(rooms);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/rooms/search: Search rooms by optional type and required date range
// NOTE: Defined BEFORE /:id so Express does not treat 'search' as an ID
// ---------------------------------------------------------------------------
router.get('/search', (req, res) => {
  try {
    const { type, check_in, check_out } = req.query;

    // Validate that both date parameters are present
    if (!check_in || !check_out) {
      return res.status(400).json({ 
        error: 'Both check_in and check_out dates are required (format: YYYY-MM-DD).' 
      });
    }

    const cleanCheckIn = String(check_in).trim();
    const cleanCheckOut = String(check_out).trim();

    // Validate date format and validity
    if (!isValidDateString(cleanCheckIn) || !isValidDateString(cleanCheckOut)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Dates must be valid calendar dates in YYYY-MM-DD format.' 
      });
    }

    // Ensure check_out is strictly after check_in
    if (cleanCheckOut <= cleanCheckIn) {
      return res.status(400).json({ 
        error: 'check_out date must be strictly after check_in date.' 
      });
    }

    // Overlap logic:
    // Existing stay [b.check_in, b.check_out) overlaps with requested [check_in, check_out) if:
    // b.check_in < requested.check_out AND b.check_out > requested.check_in
    let sql = `
      SELECT 
        r.id,
        r.room_no,
        r.type,
        r.price,
        'Available' AS status
      FROM rooms r
      WHERE r.id NOT IN (
        SELECT b.room_id 
        FROM bookings b 
        WHERE b.check_in < ? AND b.check_out > ?
      )
    `;
    const params = [cleanCheckOut, cleanCheckIn];

    // Optional filter by room type (case-insensitive)
    if (type && String(type).trim() !== '') {
      sql += ` AND LOWER(r.type) = LOWER(?)`;
      params.push(String(type).trim());
    }

    sql += ` ORDER BY r.room_no ASC`;

    const stmt = db.prepare(sql);
    const availableRooms = stmt.all(...params);
    res.json(availableRooms);
  } catch (err) {
    console.error('Error searching rooms:', err);
    res.status(500).json({ error: 'Failed to search rooms.' });
  }
});

// ---------------------------------------------------------------------------
// 3. POST /api/rooms: Add a new room
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  try {
    const { room_no, type, price } = req.body;

    // Required fields check
    if (!room_no || !type || price === undefined || price === null || price === '') {
      return res.status(400).json({ 
        error: 'room_no, type, and price are required fields.' 
      });
    }

    const trimmedRoomNo = String(room_no).trim();
    const trimmedType = String(type).trim();

    if (!trimmedRoomNo || !trimmedType) {
      return res.status(400).json({ 
        error: 'room_no and type cannot be empty strings.' 
      });
    }

    if (trimmedRoomNo.length > 20) {
      return res.status(400).json({ 
        error: 'room_no cannot exceed 20 characters.' 
      });
    }

    // Validate type against allowed list (case-insensitive matching)
    const matchedType = ALLOWED_ROOM_TYPES.find(t => t.toLowerCase() === trimmedType.toLowerCase());
    if (!matchedType) {
      return res.status(400).json({ 
        error: `Invalid room type '${trimmedType}'. Allowed types: ${ALLOWED_ROOM_TYPES.join(', ')}.` 
      });
    }

    // Price must be a finite, positive number
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0 || numPrice > 100000) {
      return res.status(400).json({ 
        error: 'price must be a positive finite number greater than 0 (max $100,000).' 
      });
    }

    const insertStmt = db.prepare(`
      INSERT INTO rooms (room_no, type, price)
      VALUES (?, ?, ?)
    `);

    const result = insertStmt.run(trimmedRoomNo, matchedType, numPrice);

    res.status(201).json({
      message: 'Room added successfully',
      room: {
        id: Number(result.lastInsertRowid),
        room_no: trimmedRoomNo,
        type: matchedType,
        price: numPrice
      }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(409).json({ 
        error: `Room number '${req.body.room_no}' already exists.` 
      });
    }

    console.error('Error creating room:', err);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

// ---------------------------------------------------------------------------
// 4. PUT /api/rooms/:id: Update an existing room
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  try {
    const roomId = parseIdParam(req.params.id);
    if (!roomId) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const { room_no, type, price } = req.body;

    // Check if the room exists
    const checkStmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
    const existingRoom = checkStmt.get(roomId);

    if (!existingRoom) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    // Required fields check
    if (!room_no || !type || price === undefined || price === null || price === '') {
      return res.status(400).json({ 
        error: 'room_no, type, and price are required fields.' 
      });
    }

    const trimmedRoomNo = String(room_no).trim();
    const trimmedType = String(type).trim();

    if (!trimmedRoomNo || !trimmedType) {
      return res.status(400).json({ 
        error: 'room_no and type cannot be empty strings.' 
      });
    }

    if (trimmedRoomNo.length > 20) {
      return res.status(400).json({ 
        error: 'room_no cannot exceed 20 characters.' 
      });
    }

    const matchedType = ALLOWED_ROOM_TYPES.find(t => t.toLowerCase() === trimmedType.toLowerCase());
    if (!matchedType) {
      return res.status(400).json({ 
        error: `Invalid room type '${trimmedType}'. Allowed types: ${ALLOWED_ROOM_TYPES.join(', ')}.` 
      });
    }

    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0 || numPrice > 100000) {
      return res.status(400).json({ 
        error: 'price must be a positive finite number greater than 0 (max $100,000).' 
      });
    }

    const updateStmt = db.prepare(`
      UPDATE rooms 
      SET room_no = ?, type = ?, price = ?
      WHERE id = ?
    `);

    updateStmt.run(trimmedRoomNo, matchedType, numPrice, roomId);

    res.json({
      message: 'Room updated successfully',
      room: {
        id: roomId,
        room_no: trimmedRoomNo,
        type: matchedType,
        price: numPrice
      }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(409).json({ 
        error: `Room number '${req.body.room_no}' already exists.` 
      });
    }

    console.error('Error updating room:', err);
    res.status(500).json({ error: 'Failed to update room.' });
  }
});

// ---------------------------------------------------------------------------
// 5. DELETE /api/rooms/:id: Delete a room (cascades to its bookings)
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  try {
    const roomId = parseIdParam(req.params.id);
    if (!roomId) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    // Check if the room exists
    const checkStmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
    const existingRoom = checkStmt.get(roomId);

    if (!existingRoom) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const deleteStmt = db.prepare('DELETE FROM rooms WHERE id = ?');
    deleteStmt.run(roomId);

    res.json({ 
      message: `Room '${existingRoom.room_no}' deleted successfully.` 
    });
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ error: 'Failed to delete room.' });
  }
});

module.exports = router;
