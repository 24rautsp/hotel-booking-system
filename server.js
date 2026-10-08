// server.js: Express server configuration and route mounting
const express = require('express');
const path = require('path');

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware: Limit JSON payload to 20kb to prevent oversized payload attacks
app.use(express.json({ limit: '20kb' }));

// Serve static frontend assets (HTML, CSS, JS) from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Import API routers
const roomsRouter = require('./routes/rooms');
const bookingsRouter = require('./routes/bookings');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API route handlers
app.use('/api/rooms', roomsRouter);
app.use('/api/bookings', bookingsRouter);

// Catch-all 404 handler for undefined /api endpoints (Express 5 compatible)
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route '${req.method} ${req.originalUrl}' not found.` });
});

// Centralized error-handling middleware (prevents leaking internal stack traces)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

// Start the HTTP server
const server = app.listen(PORT, () => {
  console.log(`Hotel Reservation server running at http://localhost:${PORT}`);
});

// Export app and server for modular testing
module.exports = { app, server };
