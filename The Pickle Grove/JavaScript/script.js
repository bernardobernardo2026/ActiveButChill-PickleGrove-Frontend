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
