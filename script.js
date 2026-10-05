// --- STATE & SESSION MANAGEMENT ---
let currentSession = localStorage.getItem('custom_time_tracker_session');
currentSession = currentSession ? JSON.parse(currentSession) : null;

let reportsData = localStorage.getItem('custom_time_tracker_reports');
reportsData = reportsData ? JSON.parse(reportsData) : [];

let publishData = localStorage.getItem('custom_publish_queue_data');
publishData = publishData ? JSON.parse(publishData) : [];

let activeTimerState = localStorage.getItem('custom_time_tracker_timer');
activeTimerState = activeTimerState ? JSON.parse(activeTimerState) : { status: 'idle', timeIn: null, timeOut: null };

window.addEventListener('DOMContentLoaded', () => {
    if (currentSession) {
        initAppSession();
    } else {
        document.getElementById('loginOverlay').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
    }
    
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('inputDate');
    if (dateInput) dateInput.value = today;
});

function revealPassword(inputId, iconId) {
    const inputField = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!inputField || !icon) return;

    if (inputField.type === "password") {
        inputField.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        inputField.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

function handlePasswordReset() {
    const emailInput = prompt("Enter your registered email address for password recovery:");
    if (emailInput) {
        alert(`Recovery instructions have been dispatched to ${emailInput}.`);
    }
}

function openSignupModal() {
    const overlay = document.getElementById("signupModalOverlay");
    if (overlay) overlay.style.display = "flex";
}

function closeSignupModal() {
    const overlay = document.getElementById("signupModalOverlay");
    if (overlay) overlay.style.display = "none";
}

function handleSignup(event) {
    event.preventDefault();
    const emailInput = document.getElementById("signupEmail");
    const roleInput = document.getElementById("signupRole");
    if (!emailInput || !roleInput) return;

    const email = emailInput.value.trim();
    const role = roleInput.value;
    
    let username = 'User';
    const parts = email.split('@');
    if (parts.length > 0 && parts[0]) {
        username = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    currentSession = { username: username, role: role };
    localStorage.setItem('custom_time_tracker_session', JSON.stringify(currentSession));
    
    alert("Account successfully created and logged in!");
    closeSignupModal();
    
    const signupForm = document.getElementById("signupForm");
    if (signupForm) signupForm.reset();

    initAppSession();
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const role = document.getElementById('loginRole').value;
    
    let username = 'User';
    const parts = email.split('@');
    if (parts.length > 0 && parts[0]) {
        username = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    currentSession = { username: username, role: role };
    localStorage.setItem('custom_time_tracker_session', JSON.stringify(currentSession));
    initAppSession();
}

function initAppSession() {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    document.getElementById('loggedInUserDisplay').textContent = currentSession.username;
    document.getElementById('loggedInRoleDisplay').textContent = currentSession.role.toUpperCase();

    const timerCard = document.getElementById('timerCard');
    const entryCard = document.getElementById('entryCard');
    const publishCard = document.getElementById('publishCard');

    if (currentSession.role === 'admin') {
        if (timerCard) timerCard.style.display = 'none';
        if (entryCard) entryCard.style.display = 'none';
        if (publishCard) publishCard.style.display = 'none';
        
        const grid = document.querySelector('.dashboard-grid');
        if (grid) grid.style.gridTemplateColumns = '1fr';
    } else {
        if (timerCard) timerCard.style.display = 'block';
        if (entryCard) entryCard.style.display = 'block';
        if (publishCard) publishCard.style.display = 'block';
        
        const grid = document.querySelector('.dashboard-grid');
        if (grid) grid.style.gridTemplateColumns = '350px 1fr';
    }

    const opsNoteBox = document.querySelector('.manager-only');
    if (currentSession.role === 'user') {
        if (opsNoteBox) opsNoteBox.style.display = 'none';
    } else {
        if (opsNoteBox) opsNoteBox.style.display = 'flex';
    }

    updateTimerUI();
    renderTable();
    renderPublishTable();
}

function logoutSession() {
    localStorage.removeItem('custom_time_tracker_session');
    location.reload();
}

// --- LIVE TIMER & AUTO LOGGING LOGIC ---
function handleTimer(action) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (action === 'timeIn') {
        activeTimerState.status = 'working';
        activeTimerState.timeIn = now;
        activeTimerState.timeOut = null;
    } else if (action === 'break') {
        activeTimerState.status = 'onbreak';
    } else if (action === 'back') {
        activeTimerState.status = 'working';
    } else if (action === 'timeOut') {
        activeTimerState.status = 'completed';
        activeTimerState.timeOut = now;

        // Automatically log an entry row into the spreadsheet upon Time Out
        autoLogShiftEntry(activeTimerState.timeIn, activeTimerState.timeOut);
    }

    localStorage.setItem('custom_time_tracker_timer', JSON.stringify(activeTimerState));
    updateTimerUI();
}

function autoLogShiftEntry(timeInVal, timeOutVal) {
    const today = new Date().toISOString().split('T')[0];
    const newRow = {
        id: Date.now(),
        author: currentSession.username,
        date: today,
        month: new Date().toLocaleString('default', { month: 'long' }),
        set: 'Shift Set',
        location: 'General Office / Remote',
        taskHeader: 'Completed Shift Timed Entry',
        taskDetails: 'Automatic shift logging recorded via Shift Timer.',
        taskLink: '',
        hours: '8 hours',
        notes: 'Auto-logged from timer',
        opsNote: '',
        timeIn: timeInVal || '--:--',
        timeOut: timeOutVal || '--:--'
    };

    reportsData.unshift(newRow);
    localStorage.setItem('custom_time_tracker_reports', JSON.stringify(reportsData));
    renderTable();
}

function updateTimerUI() {
    const pill = document.getElementById('statusPill');
    const btnIn = document.getElementById('btnTimeIn');
    const btnBreak = document.getElementById('btnBreak');
    const btnBack = document.getElementById('btnBack');
    const btnOut = document.getElementById('btnTimeOut');

    if (!pill) return;

    btnIn.disabled = false;
    btnBreak.disabled = true;
    btnBack.disabled = true;
    btnOut.disabled = true;

    pill.className = 'status-pill';

    if (activeTimerState.status === 'idle') {
        pill.textContent = 'Status: Idle';
        pill.classList.add('idle');
    } else if (activeTimerState.status === 'working') {
        pill.textContent = 'Status: Working';
        pill.classList.add('working');
        btnIn.disabled = true;
        btnBreak.disabled = false;
        btnOut.disabled = false;
    } else if (activeTimerState.status === 'onbreak') {
        pill.textContent = 'Status: On Break';
        pill.classList.add('onbreak');
        btnIn.disabled = true;
        btnBack.disabled = false;
        btnOut.disabled = false;
    } else if (activeTimerState.status === 'completed') {
        pill.textContent = 'Status: Completed';
        pill.classList.add('completed');
        btnBreak.disabled = true;
        btnBack.disabled = true;
        btnOut.disabled = true;
    }
}

// --- SPREADSHEET REPORT LOGIC ---
function addReport(e) {
    e.preventDefault();

    const newRow = {
        id: Date.now(),
        author: currentSession.username,
        date: document.getElementById('inputDate').value,
        month: document.getElementById('inputMonth').value,
        set: document.getElementById('inputSet').value,
        location: document.getElementById('inputLocation').value,
        taskHeader: document.getElementById('inputTaskHeader').value,
        taskDetails: document.getElementById('inputTaskDetails').value,
        taskLink: document.getElementById('inputTaskLink').value,
        hours: document.getElementById('inputHours').value,
        notes: document.getElementById('inputNotes').value,
        opsNote: currentSession.role !== 'user' ? document.getElementById('inputOpsNote').value : '',
        timeIn: activeTimerState.timeIn ? activeTimerState.timeIn : '--:--',
        timeOut: activeTimerState.timeOut ? activeTimerState.timeOut : '--:--'
    };

    reportsData.unshift(newRow);
    localStorage.setItem('custom_time_tracker_reports', JSON.stringify(reportsData));

    document.getElementById('reportForm').reset();
    document.getElementById('inputDate').value = new Date().toISOString().split('T')[0];
    
    renderTable();
    alert('Report row successfully saved to spreadsheet ledger!');
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    document.getElementById('recordCountBadge').textContent = reportsData.length + ' ENTRIES';

    if (reportsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 25px;">No spreadsheet entries found.</td></tr>';
        return;
    }

    let totalMinutesAccumulated = 0;

    reportsData.forEach(row => {
        const tr = document.createElement('tr');
        const canManage = currentSession.role === 'manager' || currentSession.role === 'admin';
        const isOwner = row.author === currentSession.username;
        const opsNoteVal = row.opsNote ? row.opsNote : '';
        const notesVal = row.notes ? row.notes : '<span style="color:var(--text-secondary);">-</span>';
        const linkVal = row.taskLink ? '<a href="' + row.taskLink + '" target="_blank" style="color:var(--accent-blue);"><i class="fa-solid fa-link"></i> Open</a>' : '<span style="color:var(--text-secondary);">None</span>';

        let hStr = String(row.hours || '').toLowerCase();
        let parsedMins = 0;
        if (hStr.includes('hr')) {
            let num = parseFloat(hStr);
            if (!isNaN(num)) parsedMins += num * 60;
        }
        if (hStr.includes('min')) {
            let num = parseFloat(hStr);
            if (!isNaN(num)) parsedMins += num;
        }
        if (!hStr.includes('hr') && !hStr.includes('min')) {
            let num = parseFloat(hStr);
            if (!isNaN(num)) parsedMins += num * 60;
        }
        totalMinutesAccumulated += parsedMins;

        let opsNoteHTML = '';
        if (canManage) {
            opsNoteHTML = '<input type="text" value="' + opsNoteVal + '" onchange="updateOpsNote(' + row.id + ', this.value)" style="width: 140px; margin: 0; padding: 4px 8px; font-size: 0.8rem;" placeholder="Ops note...">';
        } else {
            opsNoteHTML = row.opsNote ? row.opsNote : '<span style="color:var(--text-secondary);">-</span>';
        }

        let actionHTML = '';
        if (isOwner || canManage) {
            actionHTML = '<button onclick="openEditModal(' + row.id + ')" class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: var(--accent-blue); color: white;"><i class="fa-solid fa-pen"></i> Edit</button>';
        } else {
            actionHTML = '<span style="color:var(--text-secondary); font-size:0.75rem;">View Only</span>';
        }

        tr.innerHTML = 
            '<td>' + row.date + '<br><small style="color:var(--accent-purple); font-weight:600;"><i class="fa-solid fa-user"></i> ' + row.author + '</small></td>' +
            '<td><strong>' + row.timeIn + '</strong></td>' +
            '<td><strong>' + row.timeOut + '</strong></td>' +
            '<td>' + row.location + '<br><small style="color:var(--text-secondary);">' + row.month + ' | ' + row.set + '</small></td>' +
            '<td><strong>' + row.taskHeader + '</strong><div style="white-space: pre-wrap; font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">' + row.taskDetails + '</div></td>' +
            '<td>' + linkVal + '</td>' +
            '<td><span style="font-size:0.75rem; background:#27272a; padding:3px 6px; border-radius:4px; color:var(--accent-purple);">' + row.hours + '</span></td>' +
            '<td>' + notesVal + '</td>' +
            '<td>' + opsNoteHTML + '</td>' +
            '<td>' + actionHTML + '</td>';

        tbody.appendChild(tr);
    });

    let totalHrsCalc = Math.floor(totalMinutesAccumulated / 60);
    let totalMinsCalc = totalMinutesAccumulated % 60;
    let finalHoursText = '0 minutes';
    if (totalHrsCalc > 0 && totalMinsCalc > 0) {
        finalHoursText = totalHrsCalc + ' hours and ' + totalMinsCalc + ' minutes';
    } else if (totalHrsCalc > 0) {
        finalHoursText = totalHrsCalc + ' hours';
    } else if (totalMinsCalc > 0) {
        finalHoursText = totalMinsCalc + ' minutes';
    }

    const totalTr = document.createElement('tr');
    totalTr.style.background = '#064e3b';
    totalTr.style.fontWeight = 'bold';
    totalTr.style.color = '#ffffff';
    totalTr.innerHTML = 
        '<td colspan="6" style="text-align: right; padding: 12px;">Total Work Hours</td>' +
        '<td style="padding: 12px;" colspan="4">' + finalHoursText + '</td>';
    tbody.appendChild(totalTr);
}

function updateOpsNote(id, val) {
    let row = reportsData.find(r => r.id === id);
    if (row) {
        row.opsNote = val;
        localStorage.setItem('custom_time_tracker_reports', JSON.stringify(reportsData));
    }
}

// --- PUBLISH QUEUE LOGIC ---
function addPublishTask(e) {
    e.preventDefault();

    const isDone = document.getElementById('pubStatus').value === 'Done';
    const newPubRow = {
        id: Date.now(),
        location: document.getElementById('pubLocation').value,
        taskType: document.getElementById('pubType').value,
        link: document.getElementById('pubLink').value,
        status: document.getElementById('pubStatus').value,
        publishedDate: isDone ? new Date().toISOString().split('T')[0] : '',
        publishedBy: isDone ? currentSession.username : '',
        notes: document.getElementById('pubNotes').value
    };

    publishData.unshift(newPubRow);
    localStorage.setItem('custom_publish_queue_data', JSON.stringify(publishData));

    document.getElementById('publishForm').reset();
    renderPublishTable();
    alert('Publish task successfully added to queue!');
}

function renderPublishTable() {
    const tbody = document.getElementById('publishTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    document.getElementById('pubRecordCountBadge').textContent = publishData.length + ' ENTRIES';

    if (publishData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 25px;">No publish tasks found.</td></tr>';
        return;
    }

    publishData.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';

        let statusBg = '#3f3f46';
        if (row.status === 'Done') statusBg = '#059669';
        else if (row.status === 'For Review') statusBg = '#d97706';

        let linkHTML = row.link ? '<a href="' + row.link + '" target="_blank" style="color:var(--accent-blue);"><i class="fa-solid fa-link"></i> Open Doc</a>' : '-';

        tr.innerHTML = 
            '<td style="padding: 12px;"><strong>' + row.location + '</strong></td>' +
            '<td style="padding: 12px; color: var(--text-secondary);">' + row.taskType + '</td>' +
            '<td style="padding: 12px;">' + linkHTML + '</td>' +
            '<td style="padding: 12px;"><span style="background: ' + statusBg + '; padding: 3px 8px; border-radius: 4px; color: white; font-size: 0.75rem;">' + row.status + '</span></td>' +
            '<td style="padding: 12px;">' + (row.publishedDate || '-') + '</td>' +
            '<td style="padding: 12px; color: var(--accent-purple); font-weight:600;">' + (row.publishedBy || '-') + '</td>' +
            '<td style="padding: 12px; color: var(--text-secondary);">' + (row.notes || '-') + '</td>' +
            '<td style="padding: 12px; display: flex; gap: 6px;">' +
                '<button onclick="openEditPublishModal(' + row.id + ')" class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: var(--accent-blue); color: white; border-radius:4px;"><i class="fa-solid fa-pen"></i></button>' +
                '<button onclick="deletePublishTask(' + row.id + ')" class="btn" style="padding: 4px 8px; font-size: 0.75rem; background: #dc2626; color: white; border-radius:4px;"><i class="fa-solid fa-trash"></i></button>' +
            '</td>';

        tbody.appendChild(tr);
    });
}

function deletePublishTask(id) {
    if (confirm('Are you sure you want to delete this publish task?')) {
        publishData = publishData.filter(r => r.id !== id);
        localStorage.setItem('custom_publish_queue_data', JSON.stringify(publishData));
        renderPublishTable();
    }
}

// --- MODAL HELPERS ---
function openEditModal(id) {
    let row = reportsData.find(r => r.id === id);
    if (!row) return;

    document.getElementById('editRecordId').value = row.id;
    document.getElementById('editDate').value = row.date || '';
    document.getElementById('editTimeIn').value = row.timeIn || '--:--';
    document.getElementById('editTimeOut').value = row.timeOut || '--:--';
    document.getElementById('editMonth').value = row.month || '';
    document.getElementById('editSet').value = row.set || '';
    document.getElementById('editLocation').value = row.location || '';
    document.getElementById('editTaskHeader').value = row.taskHeader || '';
    document.getElementById('editTaskDetails').value = row.taskDetails || '';
    document.getElementById('editTaskLink').value = row.taskLink || '';
    document.getElementById('editHours').value = row.hours || '';
    document.getElementById('editNotes').value = row.notes || '';

    document.getElementById('editModalOverlay').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModalOverlay').style.display = 'none';
}

function saveEditedReport(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('editRecordId').value);
    let row = reportsData.find(r => r.id === id);

    if (row) {
        row.date = document.getElementById('editDate').value;
        row.timeIn = document.getElementById('editTimeIn').value;
        row.timeOut = document.getElementById('editTimeOut').value;
        row.month = document.getElementById('editMonth').value;
        row.set = document.getElementById('editSet').value;
        row.location = document.getElementById('editLocation').value;
        row.taskHeader = document.getElementById('editTaskHeader').value;
        row.taskDetails = document.getElementById('editTaskDetails').value;
        row.taskLink = document.getElementById('editTaskLink').value;
        row.hours = document.getElementById('editHours').value;
        row.notes = document.getElementById('editNotes').value;

        localStorage.setItem('custom_time_tracker_reports', JSON.stringify(reportsData));
        closeEditModal();
        renderTable();
        alert('Spreadsheet row successfully updated!');
    }
}

function modalDeleteRecord() {
    const id = parseInt(document.getElementById('editRecordId').value);
    if (confirm('Are you sure you want to permanently delete this task entry?')) {
        reportsData = reportsData.filter(row => row.id !== id);
        localStorage.setItem('custom_time_tracker_reports', JSON.stringify(reportsData));
        closeEditModal();
        renderTable();
        alert('Record permanently deleted.');
    }
}

// Publish Task Edit Modals
function openEditPublishModal(id) {
    let row = publishData.find(r => r.id === id);
    if (!row) return;

    document.getElementById('editPubId').value = row.id;
    document.getElementById('editPubLocation').value = row.location || '';
    document.getElementById('editPubType').value = row.taskType || '';
    document.getElementById('editPubLink').value = row.link || '';
    document.getElementById('editPubStatus').value = row.status || 'For publish';
    document.getElementById('editPubNotes').value = row.notes || '';

    document.getElementById('editPublishModalOverlay').style.display = 'flex';
}

function closeEditPublishModal() {
    document.getElementById('editPublishModalOverlay').style.display = 'none';
}

function saveEditedPublishTask(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('editPubId').value);
    let row = publishData.find(r => r.id === id);

    if (row) {
        row.location = document.getElementById('editPubLocation').value;
        row.taskType = document.getElementById('editPubType').value;
        row.link = document.getElementById('editPubLink').value;
        const newStatus = document.getElementById('editPubStatus').value;
        
        if (newStatus === 'Done' && row.status !== 'Done') {
            row.publishedDate = new Date().toISOString().split('T')[0];
            row.publishedBy = currentSession.username;
        }
        row.status = newStatus;
        row.notes = document.getElementById('editPubNotes').value;

        localStorage.setItem('custom_publish_queue_data', JSON.stringify(publishData));
        closeEditPublishModal();
        renderPublishTable();
        alert('Publish task successfully updated!');
    }
}

// Global Window Bindings
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEditedReport = saveEditedReport;
window.modalDeleteRecord = modalDeleteRecord;
window.openEditPublishModal = openEditPublishModal;
window.closeEditPublishModal = closeEditPublishModal;
window.saveEditedPublishTask = saveEditedPublishTask;
window.revealPassword = revealPassword;
window.handlePasswordReset = handlePasswordReset;
window.openSignupModal = openSignupModal;
window.closeSignupModal = closeSignupModal;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.addPublishTask = addPublishTask;
window.deletePublishTask = deletePublishTask;
