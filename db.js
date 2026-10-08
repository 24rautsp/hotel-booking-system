// db.js: SQLite database configuration and schema initialization
const Database = require('better-sqlite3');
const path = require('path');

// Connect to SQLite database file named 'hotel.db' (creates the file if it does not exist)
const db = new Database(path.join(__dirname, 'hotel.db'));

// Enable foreign key constraints (SQLite turns this off by default)
db.pragma('foreign_keys = ON');

// Enable Write-Ahead Logging (WAL) for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// SQL script to create the necessary tables if they do not exist already
const schema = `
  -- 1. Rooms Table: Stores details about each hotel room
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique numerical ID for each room record
    room_no TEXT NOT NULL UNIQUE,          -- Room identifier (e.g., "101", "202"), required and must be unique
    type TEXT NOT NULL,                   -- Category/Type of room (e.g., "Single", "Deluxe", "Suite")
    price REAL NOT NULL CHECK(price > 0)  -- Nightly room price in decimals, must be greater than 0
  );

  -- 2. Bookings Table: Stores guest reservations for specific rooms
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Unique numerical ID for each booking record
    room_id INTEGER NOT NULL,             -- References the room that was booked
    guest_name TEXT NOT NULL,             -- Full name of the guest booking the room
    check_in TEXT NOT NULL,               -- Start date of the stay in 'YYYY-MM-DD' format
    check_out TEXT NOT NULL,              -- End date of the stay in 'YYYY-MM-DD' format
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );
`;

// Execute the schema script to create the tables
db.exec(schema);

// Seed default starter rooms if the database is newly initialized
const roomCount = db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count;
if (roomCount === 0) {
  const seedRooms = db.prepare(`
    INSERT INTO rooms (room_no, type, price) VALUES 
    ('101', 'Single', 100.00),
    ('102', 'Deluxe', 150.00),
    ('201', 'Suite', 250.00)
  `);
  seedRooms.run();
}

// Export the database instance for use in API route files
module.exports = db;
