// ============================================================================
// Hotel Room Booking System - Frontend Vanilla JavaScript (public/app.js)
// Handles API calls, dynamic DOM updates, input validation, and user notifications
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const toastContainer = document.getElementById('toast-container');

  // Forms
  const addRoomForm = document.getElementById('add-room-form');
  const bookRoomForm = document.getElementById('book-room-form');
  const searchRoomsForm = document.getElementById('search-rooms-form');
  const btnShowAll = document.getElementById('btn-show-all');

  // Edit Room Modal Elements
  const editRoomModal = document.getElementById('edit-room-modal');
  const editRoomForm = document.getElementById('edit-room-form');
  const editRoomIdInput = document.getElementById('edit-room-id');
  const editRoomNoInput = document.getElementById('edit-room-no');
  const editRoomTypeSelect = document.getElementById('edit-room-type');
  const editRoomPriceInput = document.getElementById('edit-room-price');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  // Select dropdowns and tables
  const bookRoomSelect = document.getElementById('book-room-id');
  const roomsTbody = document.getElementById('rooms-tbody');
  const bookingsTbody = document.getElementById('bookings-tbody');
  const roomsCountBadge = document.getElementById('rooms-count');
  const bookingsCountBadge = document.getElementById('bookings-count');

  // Date inputs
  const bookCheckInInput = document.getElementById('book-check-in');
  const bookCheckOutInput = document.getElementById('book-check-out');
  const searchCheckInInput = document.getElementById('search-check-in');
  const searchCheckOutInput = document.getElementById('search-check-out');

  // --------------------------------------------------------------------------
  // Helper: XSS Protection (Escape untrusted user inputs)
  // --------------------------------------------------------------------------
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --------------------------------------------------------------------------
  // Helper: Show Auto-hiding Toast Notifications (4 seconds)
  // --------------------------------------------------------------------------
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Auto-hide after 4 seconds (4000ms)
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300); // Wait for transition animation to complete
    }, 4000);
  }

  // --------------------------------------------------------------------------
  // Helper: Set minimum date to today for all date pickers
  // --------------------------------------------------------------------------
  function initDateInputs() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

    const dateInputs = [
      bookCheckInInput,
      bookCheckOutInput,
      searchCheckInInput,
      searchCheckOutInput
    ];

    dateInputs.forEach(input => {
      if (input) {
        input.min = today;
      }
    });

    // When check-in changes, adjust check-out min date
    bookCheckInInput.addEventListener('change', () => {
      if (bookCheckInInput.value) {
        bookCheckOutInput.min = bookCheckInInput.value;
        if (bookCheckOutInput.value && bookCheckOutInput.value <= bookCheckInInput.value) {
          bookCheckOutInput.value = '';
        }
      }
    });

    searchCheckInInput.addEventListener('change', () => {
      if (searchCheckInInput.value) {
        searchCheckOutInput.min = searchCheckInInput.value;
        if (searchCheckOutInput.value && searchCheckOutInput.value <= searchCheckInInput.value) {
          searchCheckOutInput.value = '';
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // Modal Helpers (Open / Close Edit Modal)
  // --------------------------------------------------------------------------
  function openEditModal(room) {
    editRoomIdInput.value = room.id;
    editRoomNoInput.value = room.room_no;
    editRoomTypeSelect.value = room.type;
    editRoomPriceInput.value = room.price;
    editRoomModal.classList.add('active');
    editRoomModal.setAttribute('aria-hidden', 'false');
    editRoomNoInput.focus();
  }

  function closeEditModal() {
    editRoomModal.classList.remove('active');
    editRoomModal.setAttribute('aria-hidden', 'true');
    editRoomForm.reset();
  }

  if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditModal);
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);

  // Close modal when clicking outside modal card
  if (editRoomModal) {
    editRoomModal.addEventListener('click', (e) => {
      if (e.target === editRoomModal) {
        closeEditModal();
      }
    });
  }

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editRoomModal && editRoomModal.classList.contains('active')) {
      closeEditModal();
    }
  });

  // --------------------------------------------------------------------------
  // 1. Fetch & Render Rooms Table (with Edit and Delete buttons)
  // --------------------------------------------------------------------------
  async function loadRooms() {
    try {
      const response = await fetch('/api/rooms');
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const rooms = await response.json();

      renderRoomsTable(rooms);
      populateRoomDropdown(rooms);
    } catch (err) {
      console.error('Error loading rooms:', err);
      showToast(err.message, 'error');
    }
  }

  function renderRoomsTable(rooms) {
    roomsCountBadge.textContent = `${rooms.length} Room${rooms.length === 1 ? '' : 's'}`;
    roomsTbody.innerHTML = '';

    if (rooms.length === 0) {
      roomsTbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">No rooms found. Add a room using the form on the left.</td>
        </tr>
      `;
      return;
    }

    rooms.forEach(room => {
      const tr = document.createElement('tr');
      const isAvailable = (room.status || '').toLowerCase() === 'available';
      const badgeClass = isAvailable ? 'available' : 'booked';
      const statusText = isAvailable ? 'Available' : 'Booked';

      tr.innerHTML = `
        <td><strong>${escapeHTML(room.room_no)}</strong></td>
        <td>${escapeHTML(room.type)}</td>
        <td>$${Number(room.price).toFixed(2)}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-edit-sm btn-edit-room" 
                  data-id="${room.id}" 
                  data-room-no="${escapeHTML(room.room_no)}" 
                  data-type="${escapeHTML(room.type)}" 
                  data-price="${room.price}">
            ✏️ Edit
          </button>
          <button class="btn btn-danger-sm btn-delete-room" 
                  data-id="${room.id}" 
                  data-room-no="${escapeHTML(room.room_no)}">
            🗑️ Delete
          </button>
        </td>
      `;
      roomsTbody.appendChild(tr);
    });
  }

  // Populate "Select Room" dropdown in Book a Room form
  function populateRoomDropdown(rooms) {
    bookRoomSelect.innerHTML = '';

    if (rooms.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No rooms available to book';
      option.disabled = true;
      option.selected = true;
      bookRoomSelect.appendChild(option);
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select a room --';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    bookRoomSelect.appendChild(defaultOption);

    rooms.forEach(room => {
      const option = document.createElement('option');
      option.value = room.id;
      const statusInfo = (room.status || '').toLowerCase() === 'booked' ? ' [Booked Today]' : '';
      option.textContent = `Room ${room.room_no} (${room.type} - $${Number(room.price).toFixed(2)}/night)${statusInfo}`;
      bookRoomSelect.appendChild(option);
    });
  }

  // --------------------------------------------------------------------------
  // 2. Fetch & Render Bookings Table
  // --------------------------------------------------------------------------
  async function loadBookings() {
    try {
      const response = await fetch('/api/bookings');
      if (!response.ok) throw new Error('Failed to fetch bookings');
      const bookings = await response.json();

      renderBookingsTable(bookings);
    } catch (err) {
      console.error('Error loading bookings:', err);
      showToast(err.message, 'error');
    }
  }

  function renderBookingsTable(bookings) {
    bookingsCountBadge.textContent = `${bookings.length} Booking${bookings.length === 1 ? '' : 's'}`;
    bookingsTbody.innerHTML = '';

    if (bookings.length === 0) {
      bookingsTbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">No bookings yet. Reserve a room using the booking form.</td>
        </tr>
      `;
      return;
    }

    bookings.forEach(b => {
      const tr = document.createElement('tr');
      const nights = b.nights !== undefined ? b.nights : '-';
      const total = b.total_price !== undefined ? `$${Number(b.total_price).toFixed(2)}` : '-';

      tr.innerHTML = `
        <td>#${b.id}</td>
        <td><strong>${escapeHTML(b.room_no)}</strong></td>
        <td>${escapeHTML(b.room_type || '')}</td>
        <td>${escapeHTML(b.guest_name)}</td>
        <td>${escapeHTML(b.check_in)}</td>
        <td>${escapeHTML(b.check_out)}</td>
        <td>${nights} night${nights === 1 ? '' : 's'}</td>
        <td><strong>${total}</strong></td>
        <td>
          <button class="btn btn-danger-sm btn-cancel-booking" data-id="${b.id}" data-guest="${escapeHTML(b.guest_name)}" data-room-no="${escapeHTML(b.room_no)}">
            Cancel
          </button>
        </td>
      `;
      bookingsTbody.appendChild(tr);
    });
  }

  // --------------------------------------------------------------------------
  // 3. Add Room Form Submission
  // --------------------------------------------------------------------------
  addRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const roomNo = document.getElementById('room-no').value.trim();
    const type = document.getElementById('room-type').value;
    const price = parseFloat(document.getElementById('room-price').value);

    if (!roomNo || !type || isNaN(price) || price <= 0) {
      showToast('Please provide valid room number, type, and positive price.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_no: roomNo, type, price })
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Failed to add room', 'error');
        return;
      }

      showToast(`Room ${data.room.room_no} added successfully!`, 'success');
      addRoomForm.reset();
      await loadRooms();
    } catch (err) {
      console.error('Error adding room:', err);
      showToast('Server communication error', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 4. Edit Room Action (Modal Open & PUT Submission)
  // --------------------------------------------------------------------------
  roomsTbody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-room');
    if (!editBtn) return;

    const roomId = editBtn.getAttribute('data-id');
    const roomNo = editBtn.getAttribute('data-room-no');
    const type = editBtn.getAttribute('data-type');
    const price = editBtn.getAttribute('data-price');

    openEditModal({ id: roomId, room_no: roomNo, type, price });
  });

  editRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const roomId = editRoomIdInput.value;
    const roomNo = editRoomNoInput.value.trim();
    const type = editRoomTypeSelect.value;
    const price = parseFloat(editRoomPriceInput.value);

    if (!roomNo || !type || isNaN(price) || price <= 0) {
      showToast('Please provide valid room number, type, and positive price.', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_no: roomNo, type, price })
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Failed to update room', 'error');
        return;
      }

      showToast(data.message || `Room ${roomNo} updated successfully!`, 'success');
      closeEditModal();
      // Refresh both rooms and bookings because room details (number, type, price) might have changed
      await Promise.all([loadRooms(), loadBookings()]);
    } catch (err) {
      console.error('Error updating room:', err);
      showToast('Server communication error', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 5. Delete Room Action (with Confirmation Dialog)
  // --------------------------------------------------------------------------
  roomsTbody.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.btn-delete-room');
    if (!deleteBtn) return;

    const roomId = deleteBtn.getAttribute('data-id');
    const roomNo = deleteBtn.getAttribute('data-room-no');

    // Confirm before deleting
    const confirmed = confirm(`Are you sure you want to delete Room "${roomNo}"?\nAll associated bookings will also be removed!`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Failed to delete room', 'error');
        return;
      }

      showToast(data.message || `Room ${roomNo} deleted.`, 'success');
      // Refresh both rooms and bookings because deleting a room cascades to bookings
      await Promise.all([loadRooms(), loadBookings()]);
    } catch (err) {
      console.error('Error deleting room:', err);
      showToast('Server communication error', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 6. Search Rooms Form Submission
  // --------------------------------------------------------------------------
  searchRoomsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = document.getElementById('search-type').value;
    const checkIn = searchCheckInInput.value;
    const checkOut = searchCheckOutInput.value;

    if (!checkIn || !checkOut) {
      showToast('Please specify both check-in and check-out dates for search.', 'error');
      return;
    }

    if (checkOut <= checkIn) {
      showToast('Check-out date must be strictly after check-in date.', 'error');
      return;
    }

    try {
      const params = new URLSearchParams({
        check_in: checkIn,
        check_out: checkOut
      });
      if (type) params.append('type', type);

      const response = await fetch(`/api/rooms/search?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Search failed', 'error');
        return;
      }

      renderRoomsTable(data);
      showToast(`Found ${data.length} available room(s) for selected dates.`, 'success');
    } catch (err) {
      console.error('Error searching rooms:', err);
      showToast('Server communication error', 'error');
    }
  });

  // Reset / Show All Rooms button
  btnShowAll.addEventListener('click', () => {
    searchRoomsForm.reset();
    initDateInputs();
    loadRooms();
    showToast('Showing all rooms.', 'success');
  });

  // --------------------------------------------------------------------------
  // 7. Book a Room Form Submission
  // --------------------------------------------------------------------------
  bookRoomForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const roomId = bookRoomSelect.value;
    const guestName = document.getElementById('book-guest-name').value.trim();
    const checkIn = bookCheckInInput.value;
    const checkOut = bookCheckOutInput.value;

    if (!roomId || !guestName || !checkIn || !checkOut) {
      showToast('All booking fields are required.', 'error');
      return;
    }

    if (checkOut <= checkIn) {
      showToast('Check-out date must be strictly after check-in date.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: Number(roomId),
          guest_name: guestName,
          check_in: checkIn,
          check_out: checkOut
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Shows 409 overlap error or 400 validation error
        showToast(data.error || 'Failed to complete booking', 'error');
        return;
      }

      showToast(`Booking #${data.booking.id} confirmed for ${data.booking.guest_name}!`, 'success');
      bookRoomForm.reset();
      initDateInputs();

      // Refresh both tables dynamically
      await Promise.all([loadRooms(), loadBookings()]);
    } catch (err) {
      console.error('Error booking room:', err);
      showToast('Server communication error', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 8. Cancel Booking Action (with Confirmation Dialog)
  // --------------------------------------------------------------------------
  bookingsTbody.addEventListener('click', async (e) => {
    const cancelBtn = e.target.closest('.btn-cancel-booking');
    if (!cancelBtn) return;

    const bookingId = cancelBtn.getAttribute('data-id');
    const guest = cancelBtn.getAttribute('data-guest');
    const roomNo = cancelBtn.getAttribute('data-room-no');

    const confirmed = confirm(`Are you sure you want to cancel booking #${bookingId} for "${guest}" (Room ${roomNo})?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Failed to cancel booking', 'error');
        return;
      }

      showToast(data.message || `Booking #${bookingId} canceled.`, 'success');
      // Refresh both tables dynamically
      await Promise.all([loadRooms(), loadBookings()]);
    } catch (err) {
      console.error('Error canceling booking:', err);
      showToast('Server communication error', 'error');
    }
  });

  // --- Initial Data Load ---
  initDateInputs();
  loadRooms();
  loadBookings();
});
