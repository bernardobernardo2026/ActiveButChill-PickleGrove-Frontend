// Shared modal open/close functions (used across most pages)
function openModal(id) {
    document.getElementById(id).classList.add('show');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Used on schedule.html - clicking an available time slot (toggles selection, multiple allowed)
function toggleSlot(el) {
    if (el.classList.contains('past') || el.classList.contains('booked')) return;
    if (el.classList.contains('selected-slot')) {
        el.classList.remove('selected-slot');
        el.classList.add('available');
        el.textContent = '+';
    } else {
        el.classList.remove('available');
        el.classList.add('selected-slot');
        el.textContent = 'Selected';
    }
    updateBookingSummary();
}

// Dummy per-hour rates matching the rates shown on the Court Rules page
function getSlotRate(timeLabel) {
    // Non-Peak: 5:00 AM - 5:00 PM -> 250
    // Peak: 5:00 PM - 12:00 AM -> 350
    // Late Night: 12:00 AM - 2:00 AM -> 380
    const match = timeLabel.match(/(\d+):00(AM|PM)/);
    if (!match) return 250;
    let hour = parseInt(match[1]);
    const period = match[2];
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;
    // hour is now in 24h format
    if (hour >= 0 && hour < 5) return 380;   // 12AM-2AM late night (and up to 5AM non-peak start)
    if (hour >= 17) return 350;              // 5PM-12AM peak
    return 250;                              // 5AM-5PM non-peak
}

// Used on schedule.html - equipment quantity +/- buttons
function changeQty(id, delta) {
    const el = document.getElementById(id);
    let val = parseInt(el.textContent) + delta;
    if (val < 0) val = 0;
    el.textContent = val;
    updateBookingSummary();
}

// Recalculates the Booking Summary panel from current selections
function updateBookingSummary() {
    const listEl = document.getElementById('selectedSlotsList');
    const totalEl = document.getElementById('totalPrice');
    if (!listEl || !totalEl) return; // only run on schedule.html

    const selected = document.querySelectorAll('.status.selected-slot');
    let subtotal = 0;

    if (selected.length === 0) {
        listEl.innerHTML = '<div class="muted" style="margin-bottom:10px;">No time slots selected yet. Click any open (+) slot on the left.</div>';
    } else {
        let rows = '';
        selected.forEach(slot => {
            const time = slot.getAttribute('data-time');
            const court = slot.getAttribute('data-court');
            const rate = getSlotRate(time);
            subtotal += rate;
            rows += '<div class="summary-row"><span>Court ' + court + ' - ' + time + '</span><span>\u20B1' + rate.toFixed(2) + '</span></div>';
        });
        listEl.innerHTML = rows;
    }

    const paddleQty = parseInt(document.getElementById('paddleQty').textContent) || 0;
    const ballQty = parseInt(document.getElementById('ballQty').textContent) || 0;
    const equipmentTotal = (paddleQty * 50) + (ballQty * 20);

    const total = subtotal + equipmentTotal;
    totalEl.textContent = '\u20B1' + total.toFixed(2);
}

// Used on schedule.html - Change Date button, opens a click-only mini calendar (no manual typing)
let miniCalendarDate = new Date(2026, 8, 1); // starts on September 2026

function toggleMiniCalendar() {
    const popup = document.getElementById('miniCalendarPopup');
    const isHidden = popup.style.display === 'none' || popup.style.display === '';
    popup.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderMiniCalendar();
}

function changeMiniCalendarMonth(delta) {
    miniCalendarDate.setMonth(miniCalendarDate.getMonth() + delta);
    renderMiniCalendar();
}

function renderMiniCalendar() {
    const grid = document.getElementById('miniCalendarGrid');
    const label = document.getElementById('miniCalendarLabel');
    if (!grid) return;
    grid.innerHTML = '';

    const year = miniCalendarDate.getFullYear();
    const month = miniCalendarDate.getMonth();
    if (label) label.textContent = miniCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
        const dayLabel = document.createElement('div');
        dayLabel.style.fontWeight = 'bold';
        dayLabel.textContent = d;
        grid.appendChild(dayLabel);
    });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.textContent = day;
        cell.style.cssText = 'padding:6px 0; border-radius:4px; cursor:pointer; background:#f4f9f0;';
        cell.onclick = () => selectMiniCalendarDate(day, month, year);
        grid.appendChild(cell);
    }
}

function selectMiniCalendarDate(day, month, year) {
    currentBookingDate = new Date(year, month, day);
    const formatted = currentBookingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('selectedDateInput').value = 'Selected Date: ' + formatted;
    document.getElementById('miniCalendarPopup').style.display = 'none';
    refreshScheduleTable();
}

// Tracks which real calendar date is currently selected on the booking page (defaults to today)
let currentBookingDate = new Date();

// Pulls the date/court chosen on the Court Availability calendar, if the user arrived that way
function loadDateFromAvailabilityPage() {
    const dateInput = document.getElementById('selectedDateInput');
    if (!dateInput) return; // only run on schedule.html

    const savedDate = localStorage.getItem('pickleGroveSelectedDate');
    if (savedDate) {
        currentBookingDate = new Date(savedDate);
        dateInput.value = 'Selected Date: ' + savedDate;
        localStorage.removeItem('pickleGroveSelectedDate');
        localStorage.removeItem('pickleGroveSelectedCourt');
    } else {
        // No date was passed in, so default to today (matches the landing page's "today" behavior)
        const formatted = currentBookingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        dateInput.value = 'Selected Date: ' + formatted;
    }
    refreshScheduleTable();
}
document.addEventListener('DOMContentLoaded', loadDateFromAvailabilityPage);
document.addEventListener('DOMContentLoaded', updateBookingSummary);

// Disables/grays out time slots that have already passed, but only when the selected date is actually today.
// Future dates stay fully open; a past date (if ever reached) is treated as entirely past.
function refreshScheduleTable() {
    const table = document.querySelector('.booking-left .schedule-table');
    if (!table) return; // only run on schedule.html

    const year = currentBookingDate.getFullYear();
    const month = currentBookingDate.getMonth();
    const day = currentBookingDate.getDate();

    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const selectedDateOnly = new Date(year, month, day);
    const dayDiffMs = selectedDateOnly - todayDateOnly;
    const dayDiff = Math.round(dayDiffMs / (1000 * 60 * 60 * 24));

    let currentHour24 = today.getHours();
    if (currentHour24 < 7) currentHour24 += 24; // 12AM-2AM belongs to the next day, same as the landing page logic

    table.querySelectorAll('.status[data-time]').forEach(slot => {
        const time = slot.getAttribute('data-time');
        const court = slot.getAttribute('data-court');

        // Real bookings take priority over everything else
        if (isExactSlotBooked(year, month, day, court, time)) {
            slot.classList.remove('available', 'selected-slot', 'past');
            slot.classList.add('booked');
            slot.textContent = 'BOOKED';
            return;
        } else if (slot.classList.contains('booked')) {
            // Was booked (e.g. after switching dates) but no longer matches a real booking
            slot.classList.remove('booked');
            slot.classList.add('available');
            slot.textContent = '+';
        }

        let isPast = false;
        if (dayDiff < 0) {
            isPast = true; // selected date has already fully passed
        } else if (dayDiff === 0) {
            const match = time.match(/(\d+):00(AM|PM)/);
            if (match) {
                let hour = parseInt(match[1]);
                const period = match[2];
                if (period === 'AM' && hour === 12) hour = 0;
                if (period === 'PM' && hour !== 12) hour += 12;
                if (hour < 7) hour += 24;
                isPast = hour < currentHour24;
            }
        }
        // dayDiff > 0 (a future date) -> never past

        if (isPast) {
            slot.classList.remove('available', 'selected-slot');
            slot.classList.add('past');
            slot.textContent = '+';
        } else if (slot.classList.contains('past')) {
            slot.classList.remove('past');
            slot.classList.add('available');
        }
    });

    updateBookingSummary();
}

function handleConfirmClick() {
    const selected = document.querySelectorAll('.status.selected-slot');
    if (selected.length === 0) {
        openModal('noSelectionModal');
        return;
    }
    const nameInput = document.getElementById('bookingCustomerName');
    if (nameInput && !nameInput.value.trim()) {
        nameInput.focus();
        nameInput.style.border = '1px solid #d9534f';
        return;
    }
    openModal('confirmModal');
}

// ===================================================================
// ===== REAL BOOKING DATA STORE (localStorage-backed) ================
// ===================================================================
// A booking record looks like:
// { id, name, year, month, day, slots: [{court, time}], paddles, balls, total, createdAt }

function getBookings() {
    try {
        return JSON.parse(localStorage.getItem('pickleGroveBookings')) || [];
    } catch (e) {
        return [];
    }
}

function saveBookingRecord(record) {
    const bookings = getBookings();
    bookings.push(record);
    localStorage.setItem('pickleGroveBookings', JSON.stringify(bookings));
}

// Builds a booking record from the current schedule.html page state and saves it.
// Also stashes the record for receipt.html to read.
function finalizeBooking() {
    const selected = document.querySelectorAll('.status.selected-slot');
    const nameInput = document.getElementById('bookingCustomerName');
    const name = nameInput ? nameInput.value.trim() : 'Guest';

    const slots = [];
    let subtotal = 0;
    selected.forEach(slot => {
        const time = slot.getAttribute('data-time');
        const court = slot.getAttribute('data-court');
        slots.push({ court: court, time: time });
        subtotal += getSlotRate(time);
    });

    const paddleQty = parseInt(document.getElementById('paddleQty').textContent) || 0;
    const ballQty = parseInt(document.getElementById('ballQty').textContent) || 0;
    const total = subtotal + (paddleQty * 50) + (ballQty * 20);

    const record = {
        id: Date.now(),
        name: name,
        year: currentBookingDate.getFullYear(),
        month: currentBookingDate.getMonth(),
        day: currentBookingDate.getDate(),
        slots: slots,
        paddles: paddleQty,
        balls: ballQty,
        total: total,
        createdAt: Date.now()
    };

    saveBookingRecord(record);
    localStorage.setItem('pickleGroveLastBooking', JSON.stringify(record));

    // Immediately reflect the new booking on the current table (in case the user doesn't leave right away)
    refreshScheduleTable();
}

// Whole-day-and-court check (used by the calendar views) - true if this court has ANY booking that day
function isDateCourtBooked(year, month, day, court) {
    const bookings = getBookings();
    return bookings.some(b =>
        b.year === year && b.month === month && b.day === day &&
        b.slots.some(s => parseInt(s.court) === parseInt(court))
    );
}

// Exact slot check (used on schedule.html and landingpage.html) - true if this specific date+court+time is already booked
function isExactSlotBooked(year, month, day, court, time) {
    const bookings = getBookings();
    return bookings.some(b =>
        b.year === year && b.month === month && b.day === day &&
        b.slots.some(s => parseInt(s.court) === parseInt(court) && s.time === time)
    );
}

// The full list of bookable time slots, matching schedule.html's table exactly.
// Used to determine whether a whole day is truly fully booked for a court.
const ALL_TIME_SLOTS = [
    '7:00AM', '8:00AM', '9:00AM', '10:00AM', '11:00AM', '12:00PM', '1:00PM', '2:00PM',
    '3:00PM', '4:00PM', '5:00PM', '6:00PM', '7:00PM', '8:00PM', '9:00PM', '10:00PM',
    '11:00PM', '12:00AM', '1:00AM', '2:00AM'
];

// A day only counts as "Booked" on the calendar once EVERY slot for that specific court is taken -
// a single booked hour should not paint the whole day red (and should never affect the other court).
function isFullyBookedDay(year, month, day, court) {
    return ALL_TIME_SLOTS.every(time => isExactSlotBooked(year, month, day, court, time));
}

function getBookedDaysForMonth(year, month, court) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        if (isFullyBookedDay(year, month, day, court)) bookedDays.push(day);
    }
    return bookedDays;
}

function isTodayDate(year, month, day) {
    const today = new Date();
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
}

function getTodaysBookingsCount() {
    let count = 0;
    getBookings().forEach(b => {
        if (isTodayDate(b.year, b.month, b.day)) count += b.slots.length;
    });
    return count;
}

function getUpcomingBookingsCount() {
    const today = new Date(); today.setHours(0,0,0,0);
    let count = 0;
    getBookings().forEach(b => {
        const d = new Date(b.year, b.month, b.day);
        if (d >= today) count += b.slots.length;
    });
    return count;
}

function getCompletedBookingsCount() {
    const today = new Date(); today.setHours(0,0,0,0);
    let count = 0;
    getBookings().forEach(b => {
        const d = new Date(b.year, b.month, b.day);
        if (d < today) count += b.slots.length;
    });
    return count;
}

function getTotalBookingSlotsCount() {
    let count = 0;
    getBookings().forEach(b => { count += b.slots.length; });
    return count;
}

function getAvailableDaysThisMonthCount(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedDaysAnyCourt = new Set();
    getBookings().forEach(b => {
        if (b.year === year && b.month === month) bookedDaysAnyCourt.add(b.day);
    });
    return daysInMonth - bookedDaysAnyCourt.size;
}

// Flattened list of {name, date, time, court} rows, most recent first
function getRecentBookingRows(limit) {
    const bookings = getBookings().slice().sort((a, b) => b.createdAt - a.createdAt);
    const rows = [];
    bookings.forEach(b => {
        const dateStr = new Date(b.year, b.month, b.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        b.slots.forEach(s => {
            rows.push({ name: b.name, date: dateStr, time: s.time, court: 'Court ' + s.court });
        });
    });
    return rows.slice(0, limit || rows.length);
}

// Equipment rental records derived from bookings that included paddles/balls
function getEquipmentRentalRows() {
    const bookings = getBookings().slice().sort((a, b) => b.createdAt - a.createdAt);
    const rows = [];
    bookings.forEach(b => {
        if (b.paddles > 0 || b.balls > 0) {
            const parts = [];
            if (b.paddles > 0) parts.push(b.paddles + ' Paddles');
            if (b.balls > 0) parts.push(b.balls + ' Balls');
            const dateStr = new Date(b.year, b.month, b.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const today = new Date(); today.setHours(0,0,0,0);
            const bDate = new Date(b.year, b.month, b.day);
            rows.push({
                name: b.name,
                date: dateStr,
                equipment: parts.join(', '),
                quantity: b.paddles + b.balls,
                status: bDate >= today ? 'Upcoming' : 'Completed'
            });
        }
    });
    return rows;
}

// Used on availability.html - clicking a calendar day
function pickDay(el, day, month, year) {
    const messageEl = document.getElementById('warningModalMessage');
    if (el.classList.contains('booked')) {
        if (messageEl) messageEl.textContent = 'The selected date is already booked. Please try an alternative date.';
        openModal('warningModal');
        return;
    }
    if (el.classList.contains('past')) {
        if (messageEl) messageEl.textContent = 'This date has already passed. Please select a current or upcoming date.';
        openModal('warningModal');
        return;
    }
    // Pass the picked date + court along to the booking page
    const formatted = new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    localStorage.setItem('pickleGroveSelectedDate', formatted);
    localStorage.setItem('pickleGroveSelectedCourt', currentCourt);
    window.location.href = 'schedule.html';
}

// Used on availability.html - Court 1 / Court 2 toggle
let currentCourt = 1;
function setCourt(num, btn) {
    currentCourt = num;
    document.querySelectorAll('.pill-group button').forEach(b => b.classList.remove('active-court'));
    btn.classList.add('active-court');
    renderCalendar();
}

// Used on help.html - expanding FAQ answers
function toggleFaq(id) {
    document.getElementById(id).classList.toggle('show');
}

// Highlights the nav link matching the current page (replaces the old hardcoded #home underline)
function setActiveNav() {
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-links .link').forEach(link => {
        const linkPage = link.getAttribute('href');
        if (linkPage === currentPage) {
            link.classList.add('active-link');
        } else {
            link.classList.remove('active-link');
        }
    });
}
document.addEventListener('DOMContentLoaded', setActiveNav);

// Used on landingpage.html - shows real bookings for today as BOOKED, and grays out anything else already past
function markPastSlots() {
    const table = document.getElementById('liveAvailabilityTable');
    if (!table) return; // only run on landingpage.html

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();

    let currentHour24 = now.getHours();
    // The schedule starts at 7AM, so 12AM/1AM/2AM belong to the *next* day, not earlier today.
    // Shift any hour before 7AM forward by 24 so the comparison stays in the right order.
    if (currentHour24 < 7) currentHour24 += 24;

    table.querySelectorAll('.status[data-time]').forEach(slot => {
        const time = slot.getAttribute('data-time');
        const court = slot.getAttribute('data-court');

        // Real bookings for today take priority over everything else
        if (isExactSlotBooked(todayYear, todayMonth, todayDay, court, time)) {
            slot.classList.remove('available', 'past');
            slot.classList.add('booked');
            slot.textContent = 'BOOKED';
            return;
        } else if (slot.classList.contains('booked')) {
            slot.classList.remove('booked');
            slot.classList.add('available');
            slot.textContent = '';
        }

        const match = time.match(/(\d+):00(AM|PM)/);
        if (!match) return;
        let hour = parseInt(match[1]);
        const period = match[2];
        if (period === 'AM' && hour === 12) hour = 0;
        if (period === 'PM' && hour !== 12) hour += 12;
        if (hour < 7) hour += 24; // same next-day shift for the slot's own hour

        if (hour < currentHour24) {
            slot.classList.remove('available');
            slot.classList.add('past');
        } else if (slot.classList.contains('past')) {
            slot.classList.remove('past');
            slot.classList.add('available');
        }
    });
}
document.addEventListener('DOMContentLoaded', markPastSlots);

// ===== Court Availability calendar (availability.html) =====
// Booked days now come from real bookings (see getBookedDaysForMonth), starting empty until people book.
let calendarViewDate = new Date(2026, 8, 1); // starts on September 2026
const CALENDAR_MIN_YEAR = 2026;
const CALENDAR_MIN_MONTH = 8; // September (0-indexed) - "today" for this demo, so can't go earlier

// Shared helper - true if the given date is strictly before today (time-of-day ignored)
function isDateInThePast(year, month, day) {
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const checkDate = new Date(year, month, day);
    return checkDate < todayDateOnly;
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return; // only run on availability.html

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const monthLabel = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('calendarMonthLabel').textContent = monthLabel;

    // Disable/gray out the prev-month arrow once at the earliest allowed month
    const prevBtn = document.getElementById('calendarPrevBtn');
    if (prevBtn) {
        const atMinimum = (year === CALENDAR_MIN_YEAR && month === CALENDAR_MIN_MONTH);
        prevBtn.disabled = atMinimum;
        prevBtn.style.opacity = atMinimum ? '0.3' : '1';
        prevBtn.style.cursor = atMinimum ? 'not-allowed' : 'pointer';
    }

    grid.querySelectorAll('.day-cell').forEach(cell => cell.remove());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedDays = getBookedDaysForMonth(year, month, currentCourt);

    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        const isPastDay = isDateInThePast(year, month, day);
        const isBooked = bookedDays.includes(day);

        if (isBooked) {
            cell.className = 'day-cell booked';
        } else if (isPastDay) {
            cell.className = 'day-cell past';
        } else {
            cell.className = 'day-cell';
        }
        cell.textContent = day;
        cell.onclick = () => pickDay(cell, day, month, year);
        grid.appendChild(cell);
    }
}

function changeMonth(delta) {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const atMinimum = (year === CALENDAR_MIN_YEAR && month === CALENDAR_MIN_MONTH);
    if (delta < 0 && atMinimum) return; // block going earlier than September 2026
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    renderCalendar();
}

document.addEventListener('DOMContentLoaded', renderCalendar);

// ===== Login / Sign Up pages =====
function togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    field.type = (field.type === 'password') ? 'text' : 'password';
}

// Dummy login check - since this is static/dummy-data stage, any non-empty fields succeed.
// This makes it easy to demo both the success and error modals.
function attemptLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (email && password) {
        localStorage.setItem('pickleGroveLoggedIn', 'true');
        openModal('loginSuccessModal');
    } else {
        openModal('loginErrorModal');
    }
}

function attemptSignup() {
    openModal('signupSuccessModal');
}

// Used on schedule.html - keeps only one payment method checked at a time
function enforceSinglePayment(clickedBox) {
    if (!clickedBox.checked) return;
    document.querySelectorAll('input[name="payment"]').forEach(box => {
        if (box !== clickedBox) box.checked = false;
    });
}

// ===== Admin pages: notification panel =====
function toggleNotifications() {
    document.getElementById('notificationPanel').classList.toggle('show');
}
function markAllRead() {
    document.getElementById('notificationPanel').classList.remove('show');
}

// Shared Logout handler - used by every nav/sidebar Logout button across the site
function handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
        localStorage.removeItem('pickleGroveLoggedIn');
        window.location.href = 'login.html';
    }
}

// Used on schedule.html - blocks booking until the user has logged in
function requireLoginForBooking() {
    if (!document.querySelector('.booking-left .schedule-table')) return; // only run on schedule.html
    const isLoggedIn = localStorage.getItem('pickleGroveLoggedIn') === 'true';
    if (!isLoggedIn) {
        openModal('loginRequiredModal');
    }
}
document.addEventListener('DOMContentLoaded', requireLoginForBooking);
// Close the notification panel if the user clicks anywhere outside it
document.addEventListener('click', function (e) {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    const isIconClick = e.target.closest('.topbar-icon');
    const isPanelClick = e.target.closest('.notification-panel');
    if (!isIconClick && !isPanelClick) {
        panel.classList.remove('show');
    }
});

// ===== Generic reusable calendar renderer for admin pages (Dashboard mini + full Calendar page) =====
// Now driven by the same real booking data as the user-facing Court Availability page.

function renderAdminCalendarGeneric(gridId, labelId, dateObj, court) {
    const grid = document.getElementById(gridId);
    const label = document.getElementById(labelId);
    if (!grid || !label) return;

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    label.textContent = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    grid.querySelectorAll('.day-cell').forEach(cell => cell.remove());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedDays = court
        ? getBookedDaysForMonth(year, month, court)
        : Array.from(new Set(getBookings().filter(b => b.year === year && b.month === month).map(b => b.day)));

    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        const isBooked = bookedDays.includes(day);
        const isPastDay = isDateInThePast(year, month, day);

        if (isBooked) {
            cell.className = 'day-cell booked';
        } else if (isPastDay) {
            cell.className = 'day-cell past';
        } else {
            cell.className = 'day-cell';
        }
        cell.textContent = day;
        grid.appendChild(cell);
    }
}

// Dashboard mini calendar (starts August 2026), with its own Court 1/2 toggle like the user page
let dashboardCalendarDate = new Date(2026, 7, 1);
let dashboardCourt = 1;
function changeDashboardMonth(delta) {
    dashboardCalendarDate.setMonth(dashboardCalendarDate.getMonth() + delta);
    renderAdminCalendarGeneric('dashboardCalendarGrid', 'dashboardCalendarLabel', dashboardCalendarDate, dashboardCourt);
}
function setDashboardCourt(num, btn) {
    dashboardCourt = num;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active-court'));
    btn.classList.add('active-court');
    renderAdminCalendarGeneric('dashboardCalendarGrid', 'dashboardCalendarLabel', dashboardCalendarDate, dashboardCourt);
}
function initDashboardCalendar() {
    if (document.getElementById('dashboardCalendarGrid')) {
        renderAdminCalendarGeneric('dashboardCalendarGrid', 'dashboardCalendarLabel', dashboardCalendarDate, dashboardCourt);
    }
}
document.addEventListener('DOMContentLoaded', initDashboardCalendar);

// Full Calendar page (starts August 2026) - shows bookings across both courts combined
let adminCalendarDate = new Date(2026, 7, 1);
function changeAdminCalendarMonth(delta) {
    adminCalendarDate.setMonth(adminCalendarDate.getMonth() + delta);
    renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
}
function initAdminCalendarPage() {
    if (document.getElementById('adminCalendarGrid')) {
        renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
    }
}
document.addEventListener('DOMContentLoaded', initAdminCalendarPage);

// ===== Populate Dashboard stat cards + Recent Bookings from real data =====
function populateDashboardStats() {
    const todaysEl = document.getElementById('statTodaysBookings');
    if (!todaysEl) return; // only run on admin-dashboard.html

    const now = new Date();
    todaysEl.textContent = getTodaysBookingsCount();
    document.getElementById('statAvailableDates').textContent = getAvailableDaysThisMonthCount(now.getFullYear(), now.getMonth());
    document.getElementById('statEquipmentRentals').textContent = getEquipmentRentalRows().length;

    document.getElementById('statUpcoming').textContent = getUpcomingBookingsCount();
    document.getElementById('statTotalBookings').textContent = getTotalBookingSlotsCount();
    document.getElementById('statCompleted').textContent = getCompletedBookingsCount();
    document.getElementById('statCancelled').textContent = 0; // no cancellation feature exists yet

    const rows = getRecentBookingRows(7);
    const tbody = document.getElementById('recentBookingsBody');
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>'.repeat(7);
    } else {
        tbody.innerHTML = rows.map(r =>
            `<tr><td>${r.name}</td><td>${r.date}</td><td>${r.time}</td><td>${r.court}</td></tr>`
        ).join('');
    }
}
document.addEventListener('DOMContentLoaded', populateDashboardStats);

// ===== Admin Bookings page: real data table with search + All/Upcoming filter =====
let adminBookingsFilter = 'all';
function setBookingsFilter(filter, btn) {
    adminBookingsFilter = filter;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAdminBookingsTable();
}

function renderAdminBookingsTable() {
    const tbody = document.getElementById('adminBookingsBody');
    if (!tbody) return; // only run on admin-bookings.html

    let rows = getRecentBookingRows(); // all rows, most recent first
    const searchInput = document.getElementById('bookingsSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    if (adminBookingsFilter === 'upcoming') {
        const today = new Date(); today.setHours(0,0,0,0);
        rows = rows.filter(r => new Date(r.date) >= today);
    }
    if (query) {
        rows = rows.filter(r => r.name.toLowerCase().includes(query) || r.date.toLowerCase().includes(query));
    }

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No bookings found.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(r =>
            `<tr><td>${r.name}</td><td>${r.date}</td><td>${r.time}</td><td>${r.court}</td></tr>`
        ).join('');
    }
}
document.addEventListener('DOMContentLoaded', renderAdminBookingsTable);

// ===== Equipment Rental page: real data table with search + All/Upcoming filter =====
let equipmentFilterMode = 'all';
function setEquipmentFilter(filter, btn) {
    equipmentFilterMode = filter;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEquipmentTable();
}

function renderEquipmentTable() {
    const tbody = document.getElementById('equipmentTableBody');
    if (!tbody) return; // only run on equipment.html

    let rows = getEquipmentRentalRows();
    const searchInput = document.getElementById('equipmentSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    if (equipmentFilterMode === 'upcoming') {
        rows = rows.filter(r => r.status === 'Upcoming');
    }
    if (query) {
        rows = rows.filter(r => r.name.toLowerCase().includes(query) || r.date.toLowerCase().includes(query));
    }

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No equipment rentals found.</td></tr>';
    } else {
        tbody.innerHTML = rows.map(r =>
            `<tr><td>${r.name}</td><td>${r.date}</td><td>${r.equipment}</td><td>${r.quantity}</td><td>${r.status}</td></tr>`
        ).join('');
    }
}
document.addEventListener('DOMContentLoaded', renderEquipmentTable);

// ===== Digital Receipt page: shows the actual last confirmed booking =====
function populateReceipt() {
    const nameEl = document.getElementById('receiptCustomerName');
    if (!nameEl) return; // only run on receipt.html

    let record;
    try {
        record = JSON.parse(localStorage.getItem('pickleGroveLastBooking'));
    } catch (e) {
        record = null;
    }
    if (!record) return; // no booking yet - leave the placeholder dashes

    const createdDateStr = new Date(record.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const bookingDateStr = new Date(record.year, record.month, record.day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    nameEl.textContent = record.name;
    document.getElementById('receiptCreatedDate').textContent = createdDateStr;
    document.getElementById('receiptRefNo').textContent = '#PG-' + String(record.id).slice(-5);
    document.getElementById('receiptTotal').textContent = '\u20B1' + record.total.toFixed(2);

    const rowsHtml = record.slots.map(s =>
        `<div class="receipt-row"><span>Court ${s.court}:</span><span>${s.time}</span></div>`
    ).join('');
    document.getElementById('receiptBookingRows').innerHTML =
        `<div class="receipt-row"><span>Date:</span><span>${bookingDateStr}</span></div>` + rowsHtml;
}
document.addEventListener('DOMContentLoaded', populateReceipt);

// ===== Profile page: real persistence via localStorage =====
const DEFAULT_PROFILE = { fullName: '', email: '', contact: '', address: '' };
const DEFAULT_PASSWORD = 'password123'; // starting dummy password for this demo account

function getUserProfile() {
    try {
        return JSON.parse(localStorage.getItem('pickleGroveUserProfile')) || DEFAULT_PROFILE;
    } catch (e) {
        return DEFAULT_PROFILE;
    }
}

function getStoredPassword() {
    return localStorage.getItem('pickleGroveUserPassword') || DEFAULT_PASSWORD;
}

// Fills the profile form + display name/email + saved photo, if any exist
function loadProfilePage() {
    const nameInput = document.getElementById('profileFullName');
    if (!nameInput) return; // only run on myprofile.html

    const profile = getUserProfile();
    nameInput.value = profile.fullName;
    document.getElementById('profileEmail').value = profile.email;
    document.getElementById('profileContact').value = profile.contact;
    document.getElementById('profileAddress').value = profile.address;

    document.getElementById('profileDisplayName').textContent = profile.fullName || 'Name';
    document.getElementById('profileDisplayEmail').textContent = profile.email || 'Email';

    const savedPhoto = localStorage.getItem('pickleGroveUserPhoto');
    if (savedPhoto) {
        const preview = document.getElementById('profileAvatarPreview');
        preview.innerHTML = '';
        preview.style.backgroundImage = "url('" + savedPhoto + "')";
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    }
}
document.addEventListener('DOMContentLoaded', loadProfilePage);

// Saves the Personal Information fields and updates the display name/email immediately
function saveProfileInfo() {
    const profile = {
        fullName: document.getElementById('profileFullName').value.trim(),
        email: document.getElementById('profileEmail').value.trim(),
        contact: document.getElementById('profileContact').value.trim(),
        address: document.getElementById('profileAddress').value.trim()
    };
    localStorage.setItem('pickleGroveUserProfile', JSON.stringify(profile));

    document.getElementById('profileDisplayName').textContent = profile.fullName || 'Name';
    document.getElementById('profileDisplayEmail').textContent = profile.email || 'Email';

    openModal('profileSavedModal');
}

// Reads the chosen image file and stores it as the profile photo
function handleProfilePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const dataUrl = e.target.result;
        localStorage.setItem('pickleGroveUserPhoto', dataUrl);

        const preview = document.getElementById('profileAvatarPreview');
        preview.innerHTML = '';
        preview.style.backgroundImage = "url('" + dataUrl + "')";
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    };
    reader.readAsDataURL(file);
}

// Validates and applies a password change against the stored dummy password
function handlePasswordChange() {
    const currentInput = document.getElementById('currentPasswordInput');
    const newInput = document.getElementById('newPasswordInput');
    const confirmInput = document.getElementById('confirmPasswordInput');
    const errorEl = document.getElementById('passwordChangeError');

    const showError = (message) => {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    };
    errorEl.style.display = 'none';

    if (currentInput.value !== getStoredPassword()) {
        showError('Current password is incorrect.');
        return;
    }
    if (!newInput.value || newInput.value.length < 6) {
        showError('New password must be at least 6 characters.');
        return;
    }
    if (newInput.value !== confirmInput.value) {
        showError('New password and confirmation do not match.');
        return;
    }

    localStorage.setItem('pickleGroveUserPassword', newInput.value);
    currentInput.value = '';
    newInput.value = '';
    confirmInput.value = '';

    closeModal('changePasswordModal');
    openModal('passwordDoneModal');
}

// ===== My Bookings page: real data, grouped one card per (booking, court), with real cancellation =====
function timeLabelToHour24(label) {
    const match = label.match(/(\d+):00(AM|PM)/);
    let hour = parseInt(match[1]);
    const period = match[2];
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour !== 12) hour += 12;
    return hour;
}

function hour24ToLabel(hour) {
    const h = ((hour % 24) + 24) % 24;
    const period = h < 12 ? 'AM' : 'PM';
    let displayHour = h % 12;
    if (displayHour === 0) displayHour = 12;
    return displayHour + ':00 ' + period;
}

// Builds one card per (booking record, court) combo, since a single checkout can span both courts
function getMyBookingsCards() {
    const bookings = getBookings();
    const cards = [];
    bookings.forEach(b => {
        const courts = Array.from(new Set(b.slots.map(s => s.court)));
        courts.forEach(court => {
            const hours = b.slots.filter(s => s.court === court).map(s => timeLabelToHour24(s.time)).sort((a, c) => a - c);
            const startHour = hours[0];
            const endHour = hours[hours.length - 1] + 1;
            const dateObj = new Date(b.year, b.month, b.day);
            cards.push({
                recordId: b.id,
                court: court,
                dateObj: dateObj,
                dateStr: dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                timeRangeStr: hour24ToLabel(startHour) + ' - ' + hour24ToLabel(endHour),
                paddles: b.paddles,
                total: b.total
            });
        });
    });
    return cards;
}

let myBookingsFilter = 'today';
function setMyBookingsFilter(filter, el) {
    myBookingsFilter = filter;
    el.parentElement.querySelectorAll('span').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    renderMyBookings();
}

function renderMyBookings() {
    const list = document.getElementById('myBookingsList');
    if (!list) return; // only run on mybookings.html

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let cards = getMyBookingsCards();

    cards = cards.filter(c => {
        const cardDate = new Date(c.dateObj.getFullYear(), c.dateObj.getMonth(), c.dateObj.getDate());
        if (myBookingsFilter === 'today') return cardDate.getTime() === today.getTime();
        if (myBookingsFilter === 'upcoming') return cardDate.getTime() > today.getTime();
        if (myBookingsFilter === 'history') return cardDate.getTime() < today.getTime();
        return true;
    });

    cards.sort((a, b) => myBookingsFilter === 'history' ? (b.dateObj - a.dateObj) : (a.dateObj - b.dateObj));

    if (cards.length === 0) {
        list.innerHTML = '<p style="color:#888; text-align:center; padding:30px 0;">No bookings found for this tab.</p>';
        return;
    }

    list.innerHTML = cards.map(c => `
        <div class="booking-card">
            <div class="booking-info">
                <h4>Court ${c.court}</h4>
                <p>Date: ${c.dateStr}</p>
                <p>Time: ${c.timeRangeStr}</p>
                <p>Paddle Rental: ${c.paddles}</p>
                <p class="booking-total">Total Amount: \u20B1${c.total.toFixed(2)}</p>
            </div>
            <button class="cancel-btn" onclick="openCancelModal(${c.recordId}, '${c.court}')">Cancel Booking</button>
        </div>
    `).join('');
}
document.addEventListener('DOMContentLoaded', renderMyBookings);

let pendingCancelRecordId = null;
let pendingCancelCourt = null;
function openCancelModal(recordId, court) {
    pendingCancelRecordId = recordId;
    pendingCancelCourt = court;
    openModal('cancelBookingModal');
}

function confirmCancelBooking() {
    const bookings = getBookings();
    const idx = bookings.findIndex(b => b.id === pendingCancelRecordId);
    if (idx === -1) { closeModal('cancelBookingModal'); return; }

    const record = bookings[idx];
    const remainingSlots = record.slots.filter(s => s.court !== pendingCancelCourt);

    if (remainingSlots.length === 0) {
        bookings.splice(idx, 1); // that was the whole booking - remove it entirely
    } else {
        // Recompute total for whatever's left (remaining slot rates + the original equipment cost)
        const equipmentCost = (record.paddles * 50) + (record.balls * 20);
        const remainingSubtotal = remainingSlots.reduce((sum, s) => sum + getSlotRate(s.time), 0);
        record.slots = remainingSlots;
        record.total = remainingSubtotal + equipmentCost;
    }

    localStorage.setItem('pickleGroveBookings', JSON.stringify(bookings));
    closeModal('cancelBookingModal');
    openModal('cancelSuccessModal');
    renderMyBookings();
}