// Shared modal open/close functions (used across most pages)
function openModal(id) {
    document.getElementById(id).classList.add('show');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Used on schedule.html - clicking an available time slot
function selectSlot(el) {
    document.querySelectorAll('.selected-slot').forEach(s => {
        s.classList.remove('selected-slot');
        s.classList.add('available');
        s.textContent = '+';
    });
    el.classList.remove('available');
    el.classList.add('selected-slot');
    el.textContent = 'Selected';
}

// Used on schedule.html - equipment quantity +/- buttons
function changeQty(id, delta) {
    const el = document.getElementById(id);
    let val = parseInt(el.textContent) + delta;
    if (val < 0) val = 0;
    el.textContent = val;
}

// Used on availability.html - clicking a calendar day
function pickDay(el) {
    if (el.classList.contains('booked')) {
        openModal('warningModal');
        return;
    }
    window.location.href = 'schedule.html';
}

// Used on availability.html - Court 1 / Court 2 toggle
function setCourt(num, btn) {
    document.querySelectorAll('.pill-group button').forEach(b => b.classList.remove('active-court'));
    btn.classList.add('active-court');
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

// Used on schedule.html - Change Date button
function toggleDatePicker() {
    const input = document.getElementById('datePickerInput');
    input.style.display = (input.style.display === 'none') ? 'inline-block' : 'none';
    if (input.style.display === 'inline-block') input.focus();
}

function applyDate(value) {
    if (!value) return;
    const dateObj = new Date(value + 'T00:00:00');
    const formatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('selectedDateInput').value = 'Selected Date: ' + formatted;
    document.getElementById('datePickerInput').style.display = 'none';
}

// ===== Court Availability calendar (availability.html) =====
// Dummy booked dates per month, keyed as "YYYY-M" (month is 0-indexed) -> array of day numbers
const bookedDatesByMonth = {
    '2026-8': [21, 24, 25, 27] // September 2026 (month index 8), matches the Figma reference
};

let calendarViewDate = new Date(2026, 8, 1); // starts on September 2026 to match the design

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return; // only run on availability.html

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const monthLabel = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('calendarMonthLabel').textContent = monthLabel;

    // Clear any existing day cells (keep the 7 day-label headers)
    grid.querySelectorAll('.day-cell').forEach(cell => cell.remove());

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bookedDays = bookedDatesByMonth[year + '-' + month] || [];

    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell empty';
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell' + (bookedDays.includes(day) ? ' booked' : '');
        cell.textContent = day;
        cell.onclick = () => pickDay(cell);
        grid.appendChild(cell);
    }
}

function changeMonth(delta) {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    renderCalendar();
}

document.addEventListener('DOMContentLoaded', renderCalendar);
