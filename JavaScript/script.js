// Shared modal open/close functions (used across most pages)
function openModal(id) {
    document.getElementById(id).classList.add('show');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// ===== Time slot helpers (shared by the booking pages, receipt and My Bookings) =====
// Slot labels look like "5:00PM". The schedule day runs 7AM -> 2AM, so 12AM-2AM count as hours 24-26.
function slotSortHour(label) {
    const match = label.match(/(\d+):00(AM|PM)/);
    if (!match) return 0;
    let hour = parseInt(match[1]);
    if (match[2] === 'AM' && hour === 12) hour = 0;
    if (match[2] === 'PM' && hour !== 12) hour += 12;
    return hour < 7 ? hour + 24 : hour;
}
function formatHour(hour) {
    const h = hour % 24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':00 ' + period;
}
// "5:00PM" -> "5:00 PM - 6:00 PM"
function slotRangeLabel(label) {
    const start = slotSortHour(label);
    return formatHour(start) + ' – ' + formatHour(start + 1);
}
// A list of consecutive slots -> "5:00 PM - 7:00 PM"
function slotsRangeLabel(labels) {
    if (!labels.length) return '';
    const hours = labels.map(slotSortHour).sort((a, b) => a - b);
    return formatHour(hours[0]) + ' – ' + formatHour(hours[hours.length - 1] + 1);
}
function sortSlotLabels(labels) {
    return labels.slice().sort((a, b) => slotSortHour(a) - slotSortHour(b));
}

// ===== Booking more than one court =====
// "Court 1" or "Courts 1 & 2"
function courtsLabel(courts) {
    const list = courts.map(c => parseInt(c)).sort((a, b) => a - b);
    return list.length === 1 ? 'Court ' + list[0] : 'Courts ' + list.join(' & ');
}
// Turns a list of {court, time} into time blocks. Back-to-back hours with the SAME courts are joined;
// if the courts are different for an hour, that hour becomes its own line.
// e.g. Court 1 7-9AM + Court 2 7-9AM -> "7:00 AM - 9:00 AM · Courts 1 & 2"
//      Court 1 7-9AM + Court 2 8-9AM -> "7:00 AM - 8:00 AM · Court 1" and "8:00 AM - 9:00 AM · Courts 1 & 2"
function groupCourtSlots(slotObjs) {
    const courtsByHour = {};
    slotObjs.forEach(s => {
        const h = slotSortHour(s.time);
        if (!courtsByHour[h]) courtsByHour[h] = new Set();
        courtsByHour[h].add(parseInt(s.court));
    });
    const hours = Object.keys(courtsByHour).map(Number).sort((a, b) => a - b);
    const groups = [];
    hours.forEach(h => {
        const courts = Array.from(courtsByHour[h]).sort((a, b) => a - b);
        const key = courts.join(',');
        const last = groups[groups.length - 1];
        if (last && last.key === key && last.end === h) {
            last.end = h + 1;
            last.hours.push(h);
        } else {
            groups.push({ key: key, courts: courts, start: h, end: h + 1, hours: [h] });
        }
    });
    groups.forEach(g => {
        g.rangeLabel = formatHour(g.start) + ' – ' + formatHour(g.end);
        g.label = g.rangeLabel + ' · ' + courtsLabel(g.courts);
        g.fee = g.hours.reduce((sum, h) => sum + getSlotRate(formatHour(h).replace(' ', '')), 0) * g.courts.length;
    });
    return groups;
}
// "2 hours" for one court, or "Court 1: 2 hours, Court 2: 1 hour"
function courtHoursLabel(slotObjs) {
    const perCourt = {};
    slotObjs.forEach(s => { perCourt[s.court] = (perCourt[s.court] || 0) + 1; });
    const courts = Object.keys(perCourt).sort();
    const hrs = n => n + (n === 1 ? ' hour' : ' hours');
    if (courts.length === 1) return hrs(perCourt[courts[0]]);
    return courts.map(c => 'Court ' + c + ': ' + hrs(perCourt[c])).join(', ');
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

// ===== Step 2 (schedule.html): Booking Details =====
// The date, courts and hours picked on Step 1 are passed here as a "draft" in localStorage:
// { year, month, day, selections: { '1': ['7:00AM', ...], '2': [...] } }
function getBookingDraft() {
    try {
        const draft = JSON.parse(localStorage.getItem('pickleGroveBookingDraft'));
        if (!draft) return null;
        if (!draft.selections && Array.isArray(draft.slots)) {
            draft.selections = { [draft.court || 1]: draft.slots }; // older one-court draft
        }
        if (draftSlotObjs(draft).length) return draft;
    } catch (e) { /* ignore */ }
    return null;
}

// Draft -> [{court, time}], sorted by time then court
function draftSlotObjs(draft) {
    const objs = [];
    Object.keys(draft.selections || {}).forEach(court => {
        (draft.selections[court] || []).forEach(t => objs.push({ court: String(court), time: t }));
    });
    return objs.sort((a, b) => (slotSortHour(a.time) - slotSortHour(b.time)) || (parseInt(a.court) - parseInt(b.court)));
}

// Fills the "Your Schedule" card and recalculates the totals
function updateBookingSummary() {
    const totalEl = document.getElementById('totalPrice');
    const detailTime = document.getElementById('detailTime');
    if (!totalEl || !detailTime) return; // only run on schedule.html (Booking Details)

    const draft = getBookingDraft();
    let courtFee = 0;
    if (draft) {
        const objs = draftSlotObjs(draft);
        const groups = groupCourtSlots(objs);
        const allCourts = Array.from(new Set(objs.map(s => s.court)));
        // only repeat the court on each line when the lines have different courts
        const mixed = groups.some(g => g.key !== groups[0].key);
        const dateObj = new Date(draft.year, draft.month, draft.day);
        document.getElementById('detailCourt').textContent = courtsLabel(allCourts);
        document.getElementById('detailDate').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        detailTime.innerHTML = groups.map(g => mixed ? g.label : g.rangeLabel).join('<br>');
        document.getElementById('detailDuration').textContent = courtHoursLabel(objs);
        document.getElementById('selectedSlotsList').innerHTML = groups.map(g => {
            courtFee += g.fee;
            return '<div class="kv-row slot-line"><span>' + g.label + '</span><span>₱' + g.fee.toFixed(2) + '</span></div>';
        }).join('');
    }

    const paddleQty = parseInt(document.getElementById('paddleQty').textContent) || 0;
    const ballQty = parseInt(document.getElementById('ballQty').textContent) || 0;
    const equipmentTotal = (paddleQty * 50) + (ballQty * 20);

    document.getElementById('courtFee').textContent = '₱' + courtFee.toFixed(2);
    document.getElementById('equipmentFee').textContent = '₱' + equipmentTotal.toFixed(2);
    totalEl.textContent = '₱' + (courtFee + equipmentTotal).toFixed(2);

    document.querySelectorAll('.pay-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input').checked);
    });
}

// Runs when the Booking Details page opens
function initBookingDetails() {
    if (!document.getElementById('detailTime')) return; // only run on schedule.html
    const draft = getBookingDraft();
    if (!draft) {
        openModal('noSelectionModal'); // nothing picked yet -> send them back to Step 1
        return;
    }
    const nameInput = document.getElementById('bookingCustomerName');
    try {
        const profile = JSON.parse(localStorage.getItem('pickleGroveUserProfile')) || {};
        if (nameInput && !nameInput.value && profile.fullName) nameInput.value = profile.fullName;
    } catch (e) { /* ignore */ }
    updateBookingSummary();
}
document.addEventListener('DOMContentLoaded', initBookingDetails);

function handleConfirmClick() {
    if (!requireLogin()) return;
    const draft = getBookingDraft();
    if (!draft) {
        openModal('noSelectionModal');
        return;
    }
    const nameInput = document.getElementById('bookingCustomerName');
    if (nameInput && !nameInput.value.trim()) {
        nameInput.focus();
        nameInput.style.border = '1px solid #d9534f';
        return;
    }
    if (!document.querySelector('input[name="payment"]:checked')) {
        openModal('noPaymentModal');
        return;
    }
    const textEl = document.getElementById('confirmModalText');
    if (textEl) {
        const dateStr = new Date(draft.year, draft.month, draft.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const lines = groupCourtSlots(draftSlotObjs(draft)).map(g => g.label).join(', ');
        textEl.textContent = dateStr + ' · ' + lines + '. Confirm this booking?';
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
        const data = JSON.parse(localStorage.getItem('pickleGroveBookings'));
        // Older versions of the site stored bookings as an object, not an array.
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function saveBookingRecord(record) {
    const bookings = getBookings();
    bookings.push(record);
    localStorage.setItem('pickleGroveBookings', JSON.stringify(bookings));
}

// Builds a booking record from the Booking Details page and saves it.
// Also stashes the record for receipt.html to read.
function finalizeBooking() {
    const draft = getBookingDraft();
    if (!draft) return false;
    const objs = draftSlotObjs(draft);

    // Someone may have booked one of these hours since Step 1 - never double-book
    const taken = objs.filter(s => isExactSlotBooked(draft.year, draft.month, draft.day, s.court, s.time));
    if (taken.length) {
        alert('Sorry, ' + taken.map(s => slotRangeLabel(s.time) + ' (Court ' + s.court + ')').join(', ') + ' was just booked. Please pick another time.');
        window.location.href = 'availability.html';
        return false;
    }
    // The admin may have closed one of these hours since Step 1
    const closed = objs.filter(s => getSlotBlock(draft.year, draft.month, draft.day, s.court, s.time));
    if (closed.length) {
        const block = getSlotBlock(draft.year, draft.month, draft.day, closed[0].court, closed[0].time);
        alert('Sorry, ' + closed.map(s => slotRangeLabel(s.time) + ' (Court ' + s.court + ')').join(', ') + ' is now ' + closedLabel(block) + '. Please pick another time.');
        window.location.href = 'availability.html';
        return false;
    }

    const nameInput = document.getElementById('bookingCustomerName');
    const name = nameInput ? nameInput.value.trim() : 'Guest';
    const subtotal = objs.reduce((sum, s) => sum + getSlotRate(s.time), 0);
    const paddleQty = parseInt(document.getElementById('paddleQty').textContent) || 0;
    const ballQty = parseInt(document.getElementById('ballQty').textContent) || 0;
    const total = subtotal + (paddleQty * 50) + (ballQty * 20);
    const paymentInput = document.querySelector('input[name="payment"]:checked');

    const record = {
        id: Date.now(),
        name: name,
        year: draft.year,
        month: draft.month,
        day: draft.day,
        slots: objs,
        paddles: paddleQty,
        balls: ballQty,
        total: total,
        payment: paymentInput ? paymentInput.value : '',
        userEmail: localStorage.getItem('pickleGroveCurrentUser') || '', // who booked it - My Bookings only shows your own
        createdAt: Date.now()
    };

    saveBookingRecord(record);
    localStorage.setItem('pickleGroveLastBooking', JSON.stringify(record));
    localStorage.removeItem('pickleGroveBookingDraft');
    return true;
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

// ===== Admin blocks: dates/hours the owner closes (private event, maintenance, etc.) =====
// A block looks like: { id, year, month, day, courts: ['1','2'], allDay: true/false, slots: ['1:00PM', ...], reason, createdAt }
function getBlocks() {
    try {
        const data = JSON.parse(localStorage.getItem('pickleGroveBlocks'));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}
function saveBlocks(list) {
    localStorage.setItem('pickleGroveBlocks', JSON.stringify(list));
}
// The block covering this court + hour on this date, or null if it is open
function getSlotBlock(year, month, day, court, time) {
    return getBlocks().find(b =>
        b.year === year && b.month === month && b.day === day &&
        b.courts.includes(String(court)) && (b.allDay || b.slots.includes(time))
    ) || null;
}
function getDayBlocks(year, month, day, court) {
    return getBlocks().filter(b => b.year === year && b.month === month && b.day === day &&
        (court == null || b.courts.includes(String(court))));
}
// True when every hour of the day is closed for this court
function isWholeDayClosed(year, month, day, court) {
    return ALL_TIME_SLOTS.every(t => getSlotBlock(year, month, day, court, t));
}
// "Closed" or "Closed – Private event"
function closedLabel(block) {
    return block && block.reason ? 'Closed – ' + block.reason : 'Closed';
}
// "Whole day" or "1:00 PM – 5:00 PM"
function blockTimeLabel(block) {
    return block.allDay ? 'Whole day' : slotsRangeLabel(block.slots);
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

// Dashboard "Available date this month": days from today to the end of the month that still have
// at least one open hour on either court (not fully booked, not closed by the admin, not already past)
function getAvailableDaysThisMonthCount(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        if (getOpenSlots(year, month, day, 1).length || getOpenSlots(year, month, day, 2).length) count++;
    }
    return count;
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

// ===== Login check (booking needs an account) =====
function isUserLoggedIn() {
    return localStorage.getItem('pickleGroveLoggedIn') === 'true';
}
// Shows the "Login Required" box (or goes to the login page) and returns false when nobody is logged in
function requireLogin() {
    if (isUserLoggedIn()) return true;
    if (document.getElementById('loginRequiredModal')) {
        openModal('loginRequiredModal');
    } else {
        window.location.href = 'login.html';
    }
    return false;
}
// "Book Your Court" on the landing page
function startBooking() {
    if (requireLogin()) window.location.href = 'availability.html';
}

// ===== Step 1 (availability.html): pick a court, a date, then back-to-back hours =====
// Picks are kept PER COURT, so switching from Court 1 to Court 2 does not erase what was picked.
let currentCourt = 1;
let selectedBookingDate = null;            // { year, month, day }
let courtSelections = { 1: [], 2: [] };    // e.g. { 1: ['7:00AM', '8:00AM'], 2: ['8:00AM'] } - each court back-to-back

function allSelectedSlotObjs() {
    const objs = [];
    [1, 2].forEach(c => courtSelections[c].forEach(t => objs.push({ court: String(c), time: t })));
    return objs.sort((a, b) => (slotSortHour(a.time) - slotSortHour(b.time)) || (parseInt(a.court) - parseInt(b.court)));
}

// Open (bookable) hours for a court on a date: not booked, and not already past if the date is today
function getOpenSlots(year, month, day, court) {
    if (isDateInThePast(year, month, day)) return [];
    const now = new Date();
    const isToday = isTodayDate(year, month, day);
    let currentHour = now.getHours();
    if (currentHour < 7) currentHour += 24;
    return ALL_TIME_SLOTS.filter(t => {
        if (isExactSlotBooked(year, month, day, court, t)) return false;
        if (getSlotBlock(year, month, day, court, t)) return false; // closed by the admin
        if (isToday && slotSortHour(t) < currentHour) return false;
        return true;
    });
}

// Clicking a calendar day
function pickDay(el, day, month, year) {
    if (!requireLogin()) return;
    const messageEl = document.getElementById('warningModalMessage');
    if (el.classList.contains('closed')) {
        const block = getDayBlocks(year, month, day, currentCourt).find(b => b.reason) || null;
        const otherCourt = currentCourt === 1 ? 2 : 1;
        const bothClosed = isWholeDayClosed(year, month, day, otherCourt);
        if (messageEl) messageEl.textContent = (bothClosed ? 'Both courts are' : 'Court ' + currentCourt + ' is') + ' closed on this date'
            + (block ? ' (' + block.reason + ')' : '') + '. Please ' + (bothClosed ? 'choose another date.' : 'try Court ' + otherCourt + ' or another date.');
        openModal('warningModal');
        return;
    }
    if (el.classList.contains('booked')) {
        if (messageEl) messageEl.textContent = 'This date has no open times left for Court ' + currentCourt + '. Please try another date.';
        openModal('warningModal');
        return;
    }
    if (el.classList.contains('past')) {
        if (messageEl) messageEl.textContent = 'This date has already passed. Please select a current or upcoming date.';
        openModal('warningModal');
        return;
    }
    const sameDay = selectedBookingDate && selectedBookingDate.year === year && selectedBookingDate.month === month && selectedBookingDate.day === day;
    selectedBookingDate = { year: year, month: month, day: day };
    if (!sameDay) courtSelections = { 1: [], 2: [] }; // a new date starts a new pick
    renderCalendar();
    renderTimeSlots();
}

// Court 1 / Court 2 toggle - keeps the hours already picked on the other court
function setCourt(num, btn) {
    if (!requireLogin()) return;
    currentCourt = num;
    document.querySelectorAll('.pill-group button').forEach(b => b.classList.remove('active-court'));
    btn.classList.add('active-court');
    renderCalendar();
    renderTimeSlots();
}

// Small "· 2 hrs" tag on each court button so users see what they picked on the other court
function updateCourtPills() {
    [1, 2].forEach(c => {
        const tag = document.getElementById('pillCount' + c);
        if (!tag) return;
        const n = courtSelections[c].length;
        tag.textContent = n ? ' · ' + n + (n === 1 ? ' hr' : ' hrs') : '';
    });
}

// Draws the list of open hours (as ranges, grouped by rate) for the selected date
function renderTimeSlots() {
    const list = document.getElementById('timeSlotList');
    if (!list) return; // only run on availability.html
    const title = document.getElementById('timePanelTitle');
    const hint = document.getElementById('timePanelHint');
    document.getElementById('slotNotice').textContent = '';

    if (!selectedBookingDate) {
        title.textContent = 'Select a date';
        hint.textContent = 'Pick a date on the calendar to see the open times.';
        list.innerHTML = '';
        updateSelectionSummary();
        return;
    }

    const { year, month, day } = selectedBookingDate;
    title.textContent = new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · Court ' + currentCourt;
    const open = getOpenSlots(year, month, day, currentCourt);

    // Hours the admin closed on this date/court, e.g. "Closed 1:00 PM – 5:00 PM · Private event"
    const closedNotes = getDayBlocks(year, month, day, currentCourt).map(b =>
        '<div class="closed-note">&#128683; ' + (b.allDay ? 'Closed all day' : 'Closed ' + slotsRangeLabel(b.slots)) + (b.reason ? ' · ' + b.reason : '') + '</div>'
    ).join('');

    if (!open.length) {
        hint.textContent = '';
        if (closedNotes) {
            list.innerHTML = closedNotes + '<div class="no-slots">No open times on this date for Court ' + currentCourt + '. Try the other court or another date.</div>';
            updateSelectionSummary();
            return;
        }
        list.innerHTML = '<div class="no-slots">No open times left on this date for Court ' + currentCourt + '. Try the other court or another date.</div>';
        updateSelectionSummary();
        return;
    }
    hint.textContent = 'Only open times are listed. Pick back-to-back hours. You can also switch courts to add the other court.';

    const groups = [
        { name: 'Daytime · ₱250 / hour', rate: 250 },
        { name: 'Peak · ₱350 / hour', rate: 350 },
        { name: 'Late night · ₱380 / hour', rate: 380 }
    ];
    const picks = courtSelections[currentCourt];
    let html = closedNotes;
    groups.forEach(g => {
        const slots = open.filter(t => getSlotRate(t) === g.rate);
        if (!slots.length) return;
        html += '<div class="slot-group">' + g.name + '</div>';
        slots.forEach(t => {
            const picked = picks.includes(t);
            html += '<button type="button" class="time-slot' + (picked ? ' picked' : '') + '" data-time="' + t + '" onclick="toggleTimeSlot(\'' + t + '\')">'
                  + '<span class="slot-left"><span class="slot-check">' + (picked ? '&#10003;' : '') + '</span>' + slotRangeLabel(t) + '</span>'
                  + '<span class="slot-rate">₱' + g.rate + '</span></button>';
        });
    });
    list.innerHTML = html;
    updateSelectionSummary();
}

// Selecting hours on the current court: only back-to-back hours can be combined
function toggleTimeSlot(label) {
    if (!requireLogin()) return;
    let picks = courtSelections[currentCourt];
    let message = '';
    const idx = ALL_TIME_SLOTS.indexOf(label);
    const pickedIdx = picks.map(t => ALL_TIME_SLOTS.indexOf(t)).sort((a, b) => a - b);

    if (picks.includes(label)) {
        if (idx === pickedIdx[0] || idx === pickedIdx[pickedIdx.length - 1]) {
            picks = picks.filter(t => t !== label);   // remove an end hour
        } else {
            picks = [label];                           // clicked the middle -> start over
        }
    } else if (!picks.length) {
        picks = [label];
    } else if (idx === pickedIdx[0] - 1 || idx === pickedIdx[pickedIdx.length - 1] + 1) {
        picks.push(label);                             // extends the block
    } else {
        picks = [label];                               // not back-to-back -> start over
        message = 'Only back-to-back hours can be booked together, so your Court ' + currentCourt + ' selection started over at ' + slotRangeLabel(label) + '.';
    }
    courtSelections[currentCourt] = sortSlotLabels(picks);
    renderTimeSlots();
    document.getElementById('slotNotice').textContent = message;
}

function updateSelectionSummary() {
    updateCourtPills();
    const box = document.getElementById('selectionSummary');
    const btn = document.getElementById('nextStepBtn');
    if (!box || !btn) return;
    const objs = allSelectedSlotObjs();
    if (!objs.length) {
        box.innerHTML = '';
        box.style.display = 'none';
        btn.disabled = true;
        return;
    }
    const groups = groupCourtSlots(objs);
    const fee = groups.reduce((sum, g) => sum + g.fee, 0);
    box.innerHTML = '<strong>Your selection</strong>'
                  + groups.map(g => '<div class="sum-line"><span>' + g.label + '</span><span>₱' + g.fee + '</span></div>').join('')
                  + '<div class="sum-total"><span>Court fee</span><span>₱' + fee.toFixed(2) + '</span></div>';
    box.style.display = 'block';
    btn.disabled = false;
}

// "Next: Booking Details" - saves the pick and opens Step 2
function goToBookingDetails() {
    if (!selectedBookingDate || !allSelectedSlotObjs().length) return;
    if (!requireLogin()) return;
    const selections = {};
    [1, 2].forEach(c => { if (courtSelections[c].length) selections[c] = courtSelections[c].slice(); });
    const draft = {
        year: selectedBookingDate.year,
        month: selectedBookingDate.month,
        day: selectedBookingDate.day,
        selections: selections
    };
    localStorage.setItem('pickleGroveBookingDraft', JSON.stringify(draft));
    window.location.href = 'schedule.html';
}

// When Step 1 opens: restore an unfinished pick (e.g. after "Change date or time"), or pre-select today
function initBookingStepOne() {
    if (!document.getElementById('timeSlotList')) return; // only run on availability.html
    const draft = getBookingDraft();
    if (draft && !isDateInThePast(draft.year, draft.month, draft.day)) {
        selectedBookingDate = { year: draft.year, month: draft.month, day: draft.day };
        [1, 2].forEach(c => {
            const open = getOpenSlots(draft.year, draft.month, draft.day, c);
            courtSelections[c] = (draft.selections[c] || []).filter(t => open.includes(t));
        });
        currentCourt = courtSelections[1].length ? 1 : (courtSelections[2].length ? 2 : 1);
        document.querySelectorAll('.pill-group button').forEach((b, i) => b.classList.toggle('active-court', i + 1 === currentCourt));
        calendarViewDate = new Date(draft.year, draft.month, 1);
    } else {
        const t = new Date();
        if (getOpenSlots(t.getFullYear(), t.getMonth(), t.getDate(), currentCourt).length) {
            selectedBookingDate = { year: t.getFullYear(), month: t.getMonth(), day: t.getDate() };
        }
    }
    renderCalendar();
    renderTimeSlots();
}
document.addEventListener('DOMContentLoaded', initBookingStepOne);

// Used on help.html - expanding FAQ answers
function toggleFaq(id) {
    document.getElementById(id).classList.toggle('show');
}

// Highlights the header item matching the current page (Home, Schedule, My Bookings, Help, Guide, Profile)
function setActiveNav() {
    let currentPage = window.location.pathname.split('/').pop() || 'landingpage.html';
    if (currentPage === 'schedule.html') currentPage = 'availability.html'; // Booking Details is part of Schedule
    document.querySelectorAll('.nav-links .link').forEach(link => {
        link.classList.toggle('active-link', link.getAttribute('href') === currentPage);
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

        // Closed by the admin (event / maintenance)
        const block = getSlotBlock(todayYear, todayMonth, todayDay, court, time);
        if (block) {
            slot.classList.remove('available', 'past');
            slot.classList.add('closed');
            slot.textContent = block.reason ? 'CLOSED – ' + block.reason : 'CLOSED';
            slot.title = closedLabel(block);
            return;
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
let calendarViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // starts on the current month
const CALENDAR_MIN_YEAR = new Date().getFullYear();
const CALENDAR_MIN_MONTH = new Date().getMonth(); // current month (0-indexed) - can't navigate earlier

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

        // "Fully booked" also covers today when every remaining hour is taken or already over
        const noOpenHours = !isPastDay && !isBooked && isTodayDate(year, month, day) && getOpenSlots(year, month, day, currentCourt).length === 0;
        if (!isPastDay && isWholeDayClosed(year, month, day, currentCourt)) {
            cell.className = 'day-cell closed'; // closed by the admin (event, maintenance...)
            const reasonBlock = getDayBlocks(year, month, day, currentCourt).find(b => b.reason);
            cell.title = closedLabel(reasonBlock);
        } else if (isBooked || noOpenHours) {
            cell.className = 'day-cell booked';
        } else if (isPastDay) {
            cell.className = 'day-cell past';
        } else {
            cell.className = 'day-cell';
        }
        if (selectedBookingDate && selectedBookingDate.year === year && selectedBookingDate.month === month && selectedBookingDate.day === day) {
            cell.classList.add('selected-day');
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
    if (delta < 0 && atMinimum) return; // block going earlier than the current month
    calendarViewDate.setMonth(calendarViewDate.getMonth() + delta);
    renderCalendar();
}

// (renderCalendar is started by initBookingStepOne once the court/date are known)

// ===== Login / Sign Up pages =====
function togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    field.type = (field.type === 'password') ? 'text' : 'password';
}

// ===== Accounts (basic form session) =====
// Per the concept paper scope there is no real authentication: accounts are only kept in this
// browser's localStorage, with no encryption. This is a front-end prototype, not a secure login.
// The single admin account below is how the owner/staff reach the admin pages from the same login form.
const ADMIN_ACCOUNT = { email: 'admin@picklegrove.com', password: 'admin123' };

// Ready-made player account so a teacher or tester can log in right away without signing up
const DEMO_ACCOUNT = { name: 'Demo Player', email: 'user@picklegrove.com', password: 'user123' };

function getAccounts() {
    let accounts = [];
    try {
        const data = JSON.parse(localStorage.getItem('pickleGroveAccounts'));
        if (Array.isArray(data)) accounts = data;
    } catch (e) {
        accounts = [];
    }
    // Make sure the demo account always exists in this browser (added once, then kept like any other account)
    if (!accounts.some(a => a.email === DEMO_ACCOUNT.email)) {
        accounts.push({ name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
        localStorage.setItem('pickleGroveAccounts', JSON.stringify(accounts));
    }
    return accounts;
}

function attemptLogin() {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        openModal('loginErrorModal');
        return;
    }

    if (email === ADMIN_ACCOUNT.email && password === ADMIN_ACCOUNT.password) {
        localStorage.setItem('pickleGroveLoggedIn', 'true');
        localStorage.setItem('pickleGroveRole', 'admin');
        localStorage.setItem('pickleGroveCurrentUser', email);
        openModal('loginSuccessModal');
        return;
    }

    const account = getAccounts().find(a => a.email === email && a.password === password);
    if (!account) {
        openModal('loginErrorModal');
        return;
    }

    localStorage.setItem('pickleGroveLoggedIn', 'true');
    localStorage.setItem('pickleGroveRole', 'user');
    localStorage.setItem('pickleGroveCurrentUser', account.email);

    // Make sure the Profile page shows this account's details (keeps contact/address if it is the same person)
    const profile = getUserProfile();
    if (profile.email !== account.email) {
        localStorage.setItem('pickleGroveUserProfile', JSON.stringify({
            fullName: account.name, email: account.email, contact: '', address: ''
        }));
    }
    openModal('loginSuccessModal');
}

// Called by the "Done" button on the login success modal
function goAfterLogin() {
    window.location.href = (localStorage.getItem('pickleGroveRole') === 'admin')
        ? 'admin-dashboard.html'
        : 'landingpage.html';
}

function attemptSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupErrorMessage');

    let error = '';
    if (password.length < 6) {
        error = 'Password must be at least 6 characters.';
    } else if (email === ADMIN_ACCOUNT.email || getAccounts().some(a => a.email === email)) {
        error = 'An account with this email already exists. Please log in instead.';
    }
    if (error) {
        if (errorEl) errorEl.textContent = error;
        openModal('signupErrorModal');
        return;
    }

    const accounts = getAccounts();
    accounts.push({ name: name, email: email, password: password });
    localStorage.setItem('pickleGroveAccounts', JSON.stringify(accounts));
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
function clearLoginSession() {
    localStorage.removeItem('pickleGroveLoggedIn');
    localStorage.removeItem('pickleGroveRole');
    localStorage.removeItem('pickleGroveCurrentUser');
}
function handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
        clearLoginSession();
        window.location.href = 'login.html';
    }
}

// Header button: shows "Login" for guests and "Logout" for logged-in users
function setupAuthButton() {
    const loggedIn = localStorage.getItem('pickleGroveLoggedIn') === 'true';
    document.querySelectorAll('nav .logout, .page-nav .logout').forEach(btn => {
        if (!loggedIn) {
            btn.textContent = 'Login';
            btn.onclick = () => { window.location.href = 'login.html'; };
            btn.classList.add('login-btn');
        }
    });
    // Help page uses its own "Log Out" popup - make sure it really logs the user out
    document.querySelectorAll('#logoutModal .btn-primary').forEach(btn => {
        btn.addEventListener('click', clearLoginSession);
    });
}
document.addEventListener('DOMContentLoaded', setupAuthButton);

// Used on schedule.html - blocks booking until the user has logged in
function requireLoginForBooking() {
    if (!document.getElementById('detailTime')) return; // only run on schedule.html (Booking Details)
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

        const blocks = isPastDay ? [] : getDayBlocks(year, month, day, court);
        const wholeClosed = !isPastDay && (court ? isWholeDayClosed(year, month, day, court)
            : (isWholeDayClosed(year, month, day, 1) && isWholeDayClosed(year, month, day, 2)));
        if (wholeClosed) {
            cell.className = 'day-cell closed';
        } else if (isBooked) {
            cell.className = 'day-cell booked';
        } else if (isPastDay) {
            cell.className = 'day-cell past';
        } else {
            cell.className = 'day-cell';
        }
        if (blocks.length && !wholeClosed) cell.classList.add('partly-closed'); // some hours closed
        if (blocks.length) cell.title = blocks.map(b => 'Court ' + b.courts.join(' & ') + ': ' + blockTimeLabel(b) + (b.reason ? ' (' + b.reason + ')' : '')).join('\n');
        cell.textContent = day;
        if (gridId === 'adminCalendarGrid') {
            if (adminSelectedDay && adminSelectedDay.year === year && adminSelectedDay.month === month && adminSelectedDay.day === day) {
                cell.classList.add('selected-day');
            }
            cell.onclick = () => selectAdminBlockDay(year, month, day);
        }
        grid.appendChild(cell);
    }
}

// Dashboard mini calendar (starts on the current month), with its own Court 1/2 toggle like the user page
let dashboardCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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

// Full Calendar page (starts on the current month) - shows bookings across both courts combined
let adminCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function changeAdminCalendarMonth(delta) {
    adminCalendarDate.setMonth(adminCalendarDate.getMonth() + delta);
    renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
}
function initAdminCalendarPage() {
    if (document.getElementById('adminCalendarGrid')) {
        renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
        fillBlockHourOptions();
        renderBlockList();
    }
}

// ===== Admin: Block Date / Hours (Calendar page) =====
let adminSelectedDay = null; // { year, month, day }

function fillBlockHourOptions() {
    const from = document.getElementById('blockFrom');
    const to = document.getElementById('blockTo');
    if (!from || !to) return;
    from.innerHTML = ALL_TIME_SLOTS.map((t, i) => '<option value="' + i + '">' + formatHour(slotSortHour(t)) + '</option>').join('');
    to.innerHTML = ALL_TIME_SLOTS.map((t, i) => '<option value="' + i + '">' + formatHour(slotSortHour(t) + 1) + '</option>').join('');
    to.value = String(ALL_TIME_SLOTS.length - 1);
}

function selectAdminBlockDay(year, month, day) {
    const msg = document.getElementById('blockMessage');
    if (isDateInThePast(year, month, day)) {
        adminSelectedDay = null;
        document.getElementById('blockForm').classList.remove('show');
        document.getElementById('blockFormTitle').textContent = 'Pick a date on the calendar';
        msg.className = 'block-message error';
        msg.textContent = 'Past dates cannot be blocked.';
        renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
        return;
    }
    adminSelectedDay = { year: year, month: month, day: day };
    document.getElementById('blockFormTitle').textContent = 'Block ' + new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('blockForm').classList.add('show');
    msg.className = 'block-message';
    msg.textContent = '';
    renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
}

function toggleBlockHours() {
    const certain = document.querySelector('input[name="blockType"]:checked').value === 'hours';
    document.getElementById('blockHoursRow').style.display = certain ? 'flex' : 'none';
}

function saveBlock() {
    const msg = document.getElementById('blockMessage');
    msg.className = 'block-message';
    msg.textContent = '';
    if (!adminSelectedDay) return;
    const { year, month, day } = adminSelectedDay;
    const courtValue = document.getElementById('blockCourt').value;
    const courts = courtValue === 'both' ? ['1', '2'] : [courtValue];
    const allDay = document.querySelector('input[name="blockType"]:checked').value === 'day';
    let slots = ALL_TIME_SLOTS.slice();
    if (!allDay) {
        const fromIdx = parseInt(document.getElementById('blockFrom').value);
        const toIdx = parseInt(document.getElementById('blockTo').value);
        if (toIdx < fromIdx) {
            msg.className = 'block-message error';
            msg.textContent = 'The end time must be after the start time.';
            return;
        }
        slots = ALL_TIME_SLOTS.slice(fromIdx, toIdx + 1);
    }

    // Hours that are already booked cannot be closed - list who booked them so the owner can contact them
    const conflicts = [];
    getBookings().forEach(b => {
        if (b.year !== year || b.month !== month || b.day !== day) return;
        b.slots.forEach(s => {
            if (courts.includes(String(s.court)) && slots.includes(s.time)) {
                conflicts.push(b.name + ' – Court ' + s.court + ', ' + slotRangeLabel(s.time));
            }
        });
    });
    if (conflicts.length) {
        msg.className = 'block-message error';
        msg.innerHTML = '<strong>Cannot block: these hours are already booked.</strong><br>' + conflicts.join('<br>')
                      + '<br><small>Cancel or move these bookings first, or choose other hours.</small>';
        return;
    }

    const reason = document.getElementById('blockReason').value.trim();
    const blocks = getBlocks();
    blocks.push({ id: Date.now(), year, month, day, courts, allDay, slots: allDay ? [] : slots, reason, createdAt: Date.now() });
    saveBlocks(blocks);
    document.getElementById('blockReason').value = '';
    msg.className = 'block-message success';
    msg.textContent = 'Blocked: ' + (courts.length === 2 ? 'Courts 1 & 2' : 'Court ' + courts[0]) + ', ' + (allDay ? 'whole day' : slotsRangeLabel(slots)) + '. Players will see it as ' + closedLabel({ reason }) + '.';
    renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
    renderBlockList();
}

function removeBlock(id) {
    if (!confirm('Unblock this date/time? Players will be able to book it again.')) return;
    saveBlocks(getBlocks().filter(b => b.id !== id));
    renderAdminCalendarGeneric('adminCalendarGrid', 'adminCalendarLabel', adminCalendarDate, null);
    renderBlockList();
}

// Upcoming blocks (past ones are hidden)
function renderBlockList() {
    const list = document.getElementById('blockList');
    if (!list) return;
    const rows = getBlocks()
        .filter(b => !isDateInThePast(b.year, b.month, b.day))
        .sort((a, b) => new Date(a.year, a.month, a.day) - new Date(b.year, b.month, b.day) || a.createdAt - b.createdAt);
    if (!rows.length) {
        list.innerHTML = '<p class="block-empty">No blocked dates or hours yet.</p>';
        return;
    }
    list.innerHTML = rows.map(b => '<div class="block-row">'
        + '<div><strong>' + new Date(b.year, b.month, b.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</strong>'
        + '<span>' + (b.courts.length === 2 ? 'Courts 1 & 2' : 'Court ' + b.courts[0]) + ' · ' + blockTimeLabel(b) + '</span>'
        + '<span class="block-reason">' + closedLabel(b) + '</span></div>'
        + '<button class="btn-secondary" onclick="removeBlock(' + b.id + ')">Unblock</button></div>').join('');
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
    document.getElementById('statCancelled').textContent = getCancelledCount();

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

    const groups = groupCourtSlots(record.slots);
    const allCourts = Array.from(new Set(record.slots.map(s => s.court)));
    const mixed = groups.some(g => g.key !== groups[0].key);
    const timeHtml = groups.map(g => mixed ? g.label : g.rangeLabel).join('<br>');
    const equipment = [];
    if (record.paddles) equipment.push(record.paddles + (record.paddles === 1 ? ' paddle' : ' paddles'));
    if (record.balls) equipment.push(record.balls + (record.balls === 1 ? ' ball' : ' balls'));
    let rows = `<div class="receipt-row"><span>Court:</span><span>${courtsLabel(allCourts)}</span></div>`
             + `<div class="receipt-row"><span>Date:</span><span>${bookingDateStr}</span></div>`
             + `<div class="receipt-row"><span>Time:</span><span style="text-align:right;">${timeHtml}</span></div>`
             + `<div class="receipt-row"><span>Duration:</span><span style="text-align:right;">${courtHoursLabel(record.slots)}</span></div>`
             + `<div class="receipt-row"><span>Equipment:</span><span>${equipment.length ? equipment.join(', ') : 'None'}</span></div>`;
    if (record.payment) rows += `<div class="receipt-row"><span>Payment:</span><span>${record.payment}</span></div>`;
    document.getElementById('receiptBookingRows').innerHTML = rows;
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
    const email = localStorage.getItem('pickleGroveCurrentUser');
    const account = getAccounts().find(a => a.email === email);
    if (account) return account.password;
    return localStorage.getItem('pickleGroveUserPassword') || DEFAULT_PASSWORD;
}

// Saves a new password for the logged-in account (falls back to the old single-password key)
function saveNewPassword(newPassword) {
    const email = localStorage.getItem('pickleGroveCurrentUser');
    const accounts = getAccounts();
    const account = accounts.find(a => a.email === email);
    if (account) {
        account.password = newPassword;
        localStorage.setItem('pickleGroveAccounts', JSON.stringify(accounts));
    } else {
        localStorage.setItem('pickleGroveUserPassword', newPassword);
    }
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

    const savedPhoto = localStorage.getItem(getPhotoKey()) || localStorage.getItem('pickleGroveUserPhoto');
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

// Each account keeps its own photo (so two people signing up on the same phone don't share one)
function getPhotoKey() {
    const email = localStorage.getItem('pickleGroveCurrentUser');
    return email ? 'pickleGroveUserPhoto_' + email : 'pickleGroveUserPhoto';
}

// Reads the chosen image, shrinks it to a small square (phone camera photos are several MB,
// too big for the browser's storage), saves it, and shows it right away
function handleProfilePhotoUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const SIZE = 240;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            // crop the middle square of the photo, then scale it down
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            try {
                localStorage.setItem(getPhotoKey(), dataUrl);
            } catch (err) {
                alert('Sorry, the photo could not be saved. Please try a different picture.');
                return;
            }

            const preview = document.getElementById('profileAvatarPreview');
            preview.innerHTML = '';
            preview.style.backgroundImage = "url('" + dataUrl + "')";
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
        };
        img.onerror = function () {
            alert('This file could not be opened as a picture. Please choose a JPG or PNG photo.');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = ''; // lets the same file be picked again later
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

    saveNewPassword(newInput.value);
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
    // Only the logged-in account's own bookings (older bookings saved without an account are hidden)
    const me = localStorage.getItem('pickleGroveCurrentUser');
    const bookings = getBookings().filter(b => me && b.userEmail === me);
    const cards = [];
    bookings.forEach(b => {
        const courts = Array.from(new Set(b.slots.map(s => s.court)));
        courts.forEach(court => {
            // 12AM-2AM slots belong to the night that started on the booking date, so they sort last
            const hours = b.slots.filter(s => s.court === court)
                .map(s => { const h = timeLabelToHour24(s.time); return h < 7 ? h + 24 : h; })
                .sort((a, c) => a - c);
            const startHour = hours[0];
            const endHour = hours[hours.length - 1] + 1;
            const dateObj = new Date(b.year, b.month, b.day);
            const startDateTime = new Date(b.year, b.month, b.day, startHour); // an hour above 23 rolls into the next day
            const msUntilStart = startDateTime - new Date();
            cards.push({
                recordId: b.id,
                court: court,
                dateObj: dateObj,
                isPast: msUntilStart < 0,
                canCancel: msUntilStart >= 24 * 60 * 60 * 1000, // 24-hour cancellation policy (see Court Rules)
                dateStr: dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                timeRangeStr: hour24ToLabel(startHour) + ' - ' + hour24ToLabel(endHour),
                paddles: b.paddles,
                total: b.total
            });
        });
    });
    return cards;
}

// Cancel button area: cancel only while the booking is at least 24 hours away (matches the Court Rules)
function renderCancelArea(c) {
    if (c.canCancel) {
        return `<button class="cancel-btn" onclick="openCancelModal(${c.recordId}, '${c.court}')">Cancel Booking</button>`;
    }
    if (c.isPast) {
        return '<span style="color:#888; font-size:13px;">Completed</span>';
    }
    return '<div style="text-align:right;"><button class="cancel-btn" disabled style="opacity:0.45; cursor:not-allowed;">Cancel Booking</button>'
         + '<div style="color:#888; font-size:12px; margin-top:6px;">Cancellation closes 24 hours before the booking.</div></div>';
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
    if (!isUserLoggedIn()) {
        list.innerHTML = '<p style="color:#888; text-align:center; padding:30px 0;">Please <a href="login.html">log in</a> to see your bookings.</p>';
        return;
    }

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
            ${renderCancelArea(c)}
        </div>
    `).join('');
}
document.addEventListener('DOMContentLoaded', renderMyBookings);

// Counts cancellations so the admin dashboard's "Cancelled" card is not always 0
function getCancelledCount() {
    return parseInt(localStorage.getItem('pickleGroveCancelledCount')) || 0;
}

let pendingCancelRecordId = null;
let pendingCancelCourt = null;
function openCancelModal(recordId, court) {
    pendingCancelRecordId = recordId;
    pendingCancelCourt = court;
    openModal('cancelBookingModal');
}

function confirmCancelBooking() {
    const bookings = getBookings();
    const me = localStorage.getItem('pickleGroveCurrentUser');
    const idx = bookings.findIndex(b => b.id === pendingCancelRecordId && b.userEmail === me); // can only cancel your own
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
    localStorage.setItem('pickleGroveCancelledCount', String(getCancelledCount() + 1));
    closeModal('cancelBookingModal');
    openModal('cancelSuccessModal');
    renderMyBookings();
}

// ===== Admin access =====
// Every admin page uses the .admin-layout sidebar. The sidebar Logout button had no action, so hook it up here.
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.sidebar-logout').forEach(btn => btn.addEventListener('click', handleLogout));
});

// Admin pages are only for the admin account - anyone else is sent to the login page
function requireAdmin() {
    if (!document.querySelector('.admin-layout')) return; // only run on admin pages
    if (localStorage.getItem('pickleGroveRole') !== 'admin') {
        window.location.href = 'login.html';
    }
}
document.addEventListener('DOMContentLoaded', requireAdmin);


// Landing page: show which day the Live Availability table is for (e.g. "Today, Saturday, October 3, 2026")
document.addEventListener('DOMContentLoaded', function () {
    const el = document.getElementById('liveAvailabilityDate');
    if (!el) return;
    el.textContent = 'Today, ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
});
