const STORAGE_KEY = 'TT_PRO_OBSIDIAN_DB_V1';
        const SESSION_KEY = 'TT_PRO_SESSION_V1';
if (!localStorage.getItem('TT_SUPABASE_CLEANUP_V1')) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SESSION_KEY); localStorage.setItem('TT_SUPABASE_CLEANUP_V1','1'); }

        const SEED_DATA = { users: [], tasks: [], logs: [], timesheets: [] };

        const MockAPI = {
            getDB() {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
                    return JSON.parse(JSON.stringify(SEED_DATA));
                }
                return JSON.parse(raw);
            },
            saveDB(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); },
            getTasks() { return this.getDB().tasks; },
            createTask(taskObj) {
                const db = this.getDB();
                db.tasks.unshift(taskObj);
                this.saveDB(db);
                this.postLog(currentUser.name, `Created task: ${taskObj.description}`, `${taskObj.hours_completed}h`);
                return taskObj;
            },
            updateTask(id, updates) {
                const db = this.getDB();
                const idx = db.tasks.findIndex(t => t.id === id);
                if (idx !== -1) {
                    db.tasks[idx] = { ...db.tasks[idx], ...updates };
                    this.saveDB(db);
                }
            },
            deleteTaskPermanent(id) {
                const db = this.getDB();
                db.tasks = db.tasks.filter(t => t.id !== id);
                this.saveDB(db);
                this.postLog(currentUser.name, 'Permanently deleted task entry', 'Deleted');
            },
            postLog(userName, action, meta = '') {
                const db = this.getDB();
                const now = new Date();
                const timeStr = now.toLocaleDateString('en-CA') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                db.logs.unshift({ id: 'l' + Date.now(), timestamp: timeStr, user_name: userName, action, meta });
                if (db.logs.length > 40) db.logs.pop();
                this.saveDB(db);
            }
        };

        let currentUser = { id: null, name: 'Guest', email: '', role: 'Employee' };

        let shiftState = (() => { try { const saved = JSON.parse(localStorage.getItem('trackerProShiftState') || 'null'); return saved ? { ...saved, startTime: saved.startTime ? new Date(saved.startTime) : null, breakStart: saved.breakStart ? new Date(saved.breakStart) : null } : { status: 'CLOCKED_OUT', startTime: null, breakStart: null, accumulatedBreakMs: 0 }; } catch { return { status: 'CLOCKED_OUT', startTime: null, breakStart: null, accumulatedBreakMs: 0 }; } })();
function persistShiftState() { localStorage.setItem('trackerProShiftState', JSON.stringify(shiftState)); }
        let currentFilter = 'all';
        let isSignUpMode = false;
        let weeklyChart = null;
        let distChart = null;

        let payrollState = {
            year: 2026, month: 10, cutoff: 'second', hourlyRate: 350, otMultiplier: 1.25, currency: 'PHP', approvedPeriods: {}
        };

        window.addEventListener('DOMContentLoaded', () => {
            syncUserUI();
            renderAll();
            updateShiftBadges();
            initCharts();
            setInterval(tickClocks, 1000);
            tickClocks();

            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    document.getElementById('globalSearchInput').focus();
                }
            });
        });

        function renderAll() {
            renderDashboardPreview();
            renderFullLedger();
            renderPayrollAndCalendar();
            renderRightActivity();
            renderAnalyticsLogs();
            renderTeamAndTimesheets();
            updateMetricCards();
        }

        function syncUserUI() {
            if (currentUser?.id) localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
            else localStorage.removeItem(SESSION_KEY);
            const initial = currentUser.name.charAt(0).toUpperCase();
            document.getElementById('headerUserName').textContent = currentUser.name;
            document.getElementById('pillUserName').textContent = currentUser.name;
            document.getElementById('pillUserRole').innerHTML = `${currentUser.role} <i class="fa-solid fa-repeat" style="font-size: 9px; margin-left: 3px;"></i>`;
            document.getElementById('headerAvatar').textContent = initial;
            document.getElementById('sidebarName').textContent = currentUser.name;
            document.getElementById('sidebarRole').textContent = currentUser.role;
            const sidebarAvatar = document.getElementById('sidebarAvatar');
            const headerAvatar = document.getElementById('headerAvatar');
            [sidebarAvatar, headerAvatar].forEach(avatar => {
                if (!avatar) return;
                if (currentUser.profilePhoto) {
                    avatar.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = currentUser.profilePhoto;
                    img.alt = 'Profile photo';
                    avatar.appendChild(img);
                } else {
                    avatar.textContent = initial;
                }
            });
        }

        function quickToggleRole() { showToast('Roles are assigned by an administrator and cannot be changed here.'); }

        function openAuthModal() { document.getElementById('authModal').classList.add('open'); }
        function closeAuthModal() { document.getElementById('authModal').classList.remove('open'); }

        function toggleAuthMode() {
            isSignUpMode = !isSignUpMode;
            document.getElementById('authModalHeading').textContent = isSignUpMode ? 'Create Tracker Pro Account' : 'Sign In to Tracker Pro';
            document.getElementById('authNameGroup').style.display = isSignUpMode ? 'block' : 'none';
            document.getElementById('authSubmitBtn').textContent = isSignUpMode ? 'Sign Up' : 'Log In';
            document.getElementById('authSwitchPrompt').textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
            document.getElementById('authSwitchLink').textContent = isSignUpMode ? 'Log In' : 'Sign Up';
        }

        function handleAuthSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('authEmail').value.trim();
            const role = 'Employee'; // Public sign-up must never assign privileged roles.
            const customName = document.getElementById('authName').value.trim();
            const derivedName = isSignUpMode && customName ? customName : email.split('@')[0].replace(/^\w/, c => c.toUpperCase());
            currentUser = { id: 'u-' + Date.now(), name: derivedName, email, role };
            syncUserUI();
            renderAll();
            closeAuthModal();
            MockAPI.postLog(currentUser.name, `Authenticated as ${role}`, 'Session');
            showToast(`Welcome back, ${currentUser.name} (${role})!`);
        }

        function tickClocks() {
            const now = new Date();
            document.getElementById('liveDigitalClock').textContent = now.toLocaleTimeString();
            if (shiftState.status === 'CLOCKED_IN' && shiftState.startTime) {
                const elapsed = now - shiftState.startTime - shiftState.accumulatedBreakMs;
                const formatted = formatMs(elapsed);
                document.getElementById('mainShiftTimer').textContent = formatted;
                document.getElementById('metricShiftTimer').textContent = formatted;
            }
        }

        function formatMs(ms) {
            const safeMs = Math.max(0, ms);
            const totalSec = Math.floor(safeMs / 1000);
            const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            const secs = String(totalSec % 60).padStart(2, '0');
            return `${hrs}:${mins}:${secs}`;
        }

        function clockIn() {
            if (shiftState.status !== 'CLOCKED_OUT') return showToast('You already have an active shift.');
            shiftState.status = 'CLOCKED_IN';
            shiftState.startTime = new Date();
            shiftState.accumulatedBreakMs = 0;
            persistShiftState();
            updateShiftBadges();
            MockAPI.postLog(currentUser.name, 'Clocked In to active shift', 'Live');
            renderRightActivity();
            showToast('Shift started! Live timer is running.');
        }

        function toggleBreak() {
            if (shiftState.status === 'CLOCKED_IN') {
                shiftState.status = 'ON_BREAK';
                shiftState.breakStart = new Date();
                persistShiftState();
                MockAPI.postLog(currentUser.name, 'Started shift break', 'Pause');
                showToast('Break started. Shift timer paused.');
            } else if (shiftState.status === 'ON_BREAK') {
                shiftState.status = 'CLOCKED_IN';
                shiftState.accumulatedBreakMs += (new Date() - shiftState.breakStart);
                shiftState.breakStart = null;
                persistShiftState();
                MockAPI.postLog(currentUser.name, 'Ended shift break', 'Resume');
                showToast('Welcome back! Shift timer resumed.');
            }
            updateShiftBadges();
            renderRightActivity();
        }

        function clockOut() {
            const now = new Date();
            const activeBreakMs = shiftState.status === 'ON_BREAK' && shiftState.breakStart ? (now - shiftState.breakStart) : 0;
            const elapsedMs = now - shiftState.startTime - shiftState.accumulatedBreakMs - activeBreakMs;
            const hrsDecimal = Math.max(0.1, +(elapsedMs / 3600000).toFixed(2));
            const timeInStr = shiftState.startTime.toTimeString().slice(0, 5);
            const timeOutStr = now.toTimeString().slice(0, 5);

            shiftState.status = 'CLOCKED_OUT';
            shiftState.startTime = null;
            shiftState.breakStart = null;
            shiftState.accumulatedBreakMs = 0;
            persistShiftState();
            document.getElementById('mainShiftTimer').textContent = '00:00:00';
            document.getElementById('metricShiftTimer').textContent = '00:00:00';
            updateShiftBadges();

            MockAPI.postLog(currentUser.name, `Clocked Out (${hrsDecimal} hrs recorded)`, `${hrsDecimal}h`);
            renderRightActivity();
            showToast(`Clocked out! Pre-filling task ledger with ${hrsDecimal} hrs.`);

            openTaskModal();
            document.getElementById('fTimeIn').value = timeInStr;
            document.getElementById('fTimeOut').value = timeOutStr;
            document.getElementById('fHours').value = hrsDecimal;
        }

        function updateShiftBadges() {
            const headerPill = document.getElementById('headerShiftPill');
            const headerText = document.getElementById('headerShiftText');
            const cardBadge = document.getElementById('cardShiftBadge');
            const cardStatus = document.getElementById('cardShiftStatus');
            const metricSub = document.getElementById('metricShiftSub');
            const btnIn = document.getElementById('btnClockIn');
            const btnBreak = document.getElementById('btnBreak');
            const btnBreakLabel = document.getElementById('btnBreakLabel');
            const btnOut = document.getElementById('btnClockOut');

            headerPill.className = 'live-status-pill';
            cardBadge.className = 'live-status-pill';

            if (shiftState.status === 'CLOCKED_IN') {
                headerText.textContent = 'Live Online • Clocked In';
                cardStatus.textContent = 'CLOCKED IN • LIVE';
                metricSub.textContent = 'Active shift running';
                btnIn.disabled = true; btnBreak.disabled = false; btnBreakLabel.textContent = 'Start Break'; btnOut.disabled = false;
            } else if (shiftState.status === 'ON_BREAK') {
                headerPill.classList.add('on-break'); cardBadge.classList.add('on-break');
                headerText.textContent = 'On Break • Paused';
                cardStatus.textContent = 'ON BREAK';
                metricSub.textContent = 'Timer paused for break';
                btnIn.disabled = true; btnBreak.disabled = false; btnBreakLabel.textContent = 'End Break'; btnOut.disabled = true;
            } else {
                headerPill.classList.add('clocked-out'); cardBadge.classList.add('clocked-out');
                headerText.textContent = 'Clocked Out • 0 Online';
                cardStatus.textContent = 'CLOCKED OUT';
                metricSub.textContent = 'Ready to clock in';
                btnIn.disabled = false; btnBreak.disabled = true; btnBreakLabel.textContent = 'Start Break'; btnOut.disabled = true;
            }
        }

        function isManager() { return currentUser.role === 'Manager / Admin'; }

        function updateMetricCards() {
            const tasks = MockAPI.getTasks().filter(t => t.status !== 'trash');
            const totalHrs = tasks.reduce((sum, t) => sum + Number(t.hours_completed || 0), 0);
            const targetPct = Math.min(100, Math.round((totalHrs / 40) * 1000) / 10);
            document.getElementById('metricTotalHours').textContent = `${totalHrs.toFixed(1)} / 40h`;
            document.getElementById('metricCompletedTasks').textContent = `${tasks.length} Tasks`;
            document.getElementById('metricCompletionPct').textContent = `${targetPct}%`;
            document.getElementById('rightSummaryHours').textContent = `${totalHrs.toFixed(2)} hrs`;
        }

        function renderDashboardPreview() {
            const tasks = MockAPI.getTasks().filter(t => t.status === 'active').slice(0, 4);
            document.getElementById('dashboardPreviewBody').innerHTML = tasks.map(t => `
                <tr>
                    <td style="font-family:'JetBrains Mono',monospace;">${t.date}</td>
                    <td style="font-family:'JetBrains Mono',monospace; color:var(--text-secondary);">${t.time_in} - ${t.time_out}</td>
                    <td><span class="tag-set">${t.location_set}</span></td>
                    <td style="font-weight:600; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.description}</td>
                    <td style="font-weight:700; color:var(--gold-mid);">${t.hours_completed}h</td>
                    <td>${renderOpsNoteCell(t.ops_notes)}</td>
                </tr>
            `).join('') || `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No active tasks logged yet.</td></tr>`;
        }

        function renderOpsNoteCell(opsNote) {
            if (isManager()) return `<span class="ops-unlocked">${opsNote || '<em style="color:var(--text-muted);">No ops note</em>'}</span>`;
            return `<span class="ops-restricted"><i class="fa-solid fa-lock"></i> Manager Only</span>`;
        }

        function setTaskFilter(filter, btnEl) {
            currentFilter = filter;
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
            renderFullLedger();
        }

        function renderFullLedger() {
            const allTasks = MockAPI.getTasks();
            const query = (document.getElementById('ledgerSearchInput').value || '').toLowerCase();

            document.getElementById('countAll').textContent = allTasks.filter(t => t.status !== 'trash').length;
            document.getElementById('countActive').textContent = allTasks.filter(t => t.status === 'active').length;
            document.getElementById('countArchived').textContent = allTasks.filter(t => t.status === 'archived').length;
            document.getElementById('countTrash').textContent = allTasks.filter(t => t.status === 'trash').length;

            const filtered = allTasks.filter(t => {
                const matchesTab = currentFilter === 'all' ? t.status !== 'trash' : t.status === currentFilter;
                const matchesQuery = !query || t.description.toLowerCase().includes(query) || t.location_set.toLowerCase().includes(query) || (t.notes && t.notes.toLowerCase().includes(query));
                return matchesTab && matchesQuery;
            });

            document.getElementById('fullLedgerBody').innerHTML = filtered.map(t => `
                <tr>
                    <td style="font-family:'JetBrains Mono',monospace; white-space:nowrap;">${t.date}</td>
                    <td style="font-family:'JetBrains Mono',monospace; color:var(--text-secondary); white-space:nowrap;">${t.time_in} - ${t.time_out}</td>
                    <td><span class="tag-set">${t.location_set}</span></td>
                    <td style="font-weight:600; min-width:190px;">${t.description}</td>
                    <td>${t.task_link ? `<a href="${t.task_link}" target="_blank" class="pr-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> PR / Link</a>` : `<span style="color:var(--text-muted);">—</span>`}</td>
                    <td style="font-weight:700; color:var(--gold-mid);">${t.hours_completed} hrs</td>
                    <td style="color:var(--text-secondary); max-width:180px;">${t.notes || '—'}</td>
                    <td>${renderOpsNoteCell(t.ops_notes)}</td>
                    <td style="text-align:right; white-space:nowrap;">
                        ${t.status !== 'trash' ? `
                            <button class="action-icon-btn" onclick="openTaskModal('${t.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-icon-btn" onclick="changeTaskStatus('${t.id}', '${t.status === 'archived' ? 'active' : 'archived'}')" title="${t.status === 'archived' ? 'Unarchive' : 'Archive'}"><i class="fa-solid ${t.status === 'archived' ? 'fa-box-open' : 'fa-box-archive'}"></i></button>
                            <button class="action-icon-btn del" onclick="changeTaskStatus('${t.id}', 'trash')" title="Move to Trash"><i class="fa-solid fa-trash"></i></button>
                        ` : `
                            <button class="action-icon-btn" onclick="changeTaskStatus('${t.id}', 'active')" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
                            <button class="action-icon-btn del" onclick="hardDeleteTask('${t.id}')" title="Delete Permanently"><i class="fa-solid fa-xmark"></i></button>
                        `}
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No task entries match the current filter.</td></tr>`;
        }

        function openTaskModal(taskId = null) {
            const modal = document.getElementById('taskModal');
            document.getElementById('taskForm').reset();
            document.getElementById('editTaskId').value = '';
            const opsTextarea = document.getElementById('fOpsNotes');
            const opsHint = document.getElementById('opsAccessHint');

            if (isManager()) { opsTextarea.disabled = false; opsHint.textContent = '(Manager / Admin Editable)'; }
            else { opsTextarea.disabled = true; opsHint.textContent = '(Locked — Manager / Admin Access Only)'; }

            if (taskId) {
                const task = MockAPI.getTasks().find(t => t.id === taskId);
                if (task) {
                    document.getElementById('taskModalTitle').textContent = 'Edit Task & Shift Entry';
                    document.getElementById('editTaskId').value = task.id;
                    document.getElementById('fDate').value = task.date;
                    document.getElementById('fLocationSet').value = task.location_set;
                    document.getElementById('fTimeIn').value = task.time_in;
                    document.getElementById('fTimeOut').value = task.time_out;
                    document.getElementById('fHours').value = task.hours_completed;
                    document.getElementById('fDescription').value = task.description;
                    document.getElementById('fTaskLink').value = task.task_link || '';
                    document.getElementById('fNotes').value = task.notes || '';
                    document.getElementById('fOpsNotes').value = isManager() ? (task.ops_notes || '') : 'Restricted to Manager / Admin';
                }
            } else {
                document.getElementById('taskModalTitle').textContent = 'Log New Task Entry';
                document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            }
            modal.classList.add('open');
        }

        function closeTaskModal() { document.getElementById('taskModal').classList.remove('open'); }

        function saveTaskEntry(e) {
            e.preventDefault();
            const existingId = document.getElementById('editTaskId').value;
            const entryData = {
                date: document.getElementById('fDate').value,
                location_set: document.getElementById('fLocationSet').value,
                time_in: document.getElementById('fTimeIn').value,
                time_out: document.getElementById('fTimeOut').value,
                hours_completed: parseFloat(document.getElementById('fHours').value),
                description: document.getElementById('fDescription').value,
                task_link: document.getElementById('fTaskLink').value,
                notes: document.getElementById('fNotes').value
            };
            if (isManager()) entryData.ops_notes = document.getElementById('fOpsNotes').value;

            if (existingId) {
                MockAPI.updateTask(existingId, entryData);
                MockAPI.postLog(currentUser.name, `Updated task: ${entryData.description}`, `${entryData.hours_completed}h`);
                showToast('Task entry updated.');
            } else {
                MockAPI.createTask({ id: 't-' + Date.now(), user_id: currentUser.id, status: 'active', ops_notes: isManager() ? (entryData.ops_notes || '') : '', ...entryData });
                showToast('New task logged to ledger.');
            }
            closeTaskModal();
            renderAll();
        }

        function changeTaskStatus(id, newStatus) {
            MockAPI.updateTask(id, { status: newStatus });
            MockAPI.postLog(currentUser.name, `Moved task to ${newStatus.toUpperCase()}`, newStatus);
            renderAll();
            showToast(`Task moved to ${newStatus}.`);
        }

        function hardDeleteTask(id) {
            MockAPI.deleteTaskPermanent(id);
            renderAll();
            showToast('Task permanently deleted.');
        }

        function changePayrollMonth(delta) {
            payrollState.month += delta;
            if (payrollState.month < 0) { payrollState.month = 11; payrollState.year -= 1; }
            else if (payrollState.month > 11) { payrollState.month = 0; payrollState.year += 1; }
            renderPayrollAndCalendar();
        }

        function setPayCutoff(cutoffType, btnEl) {
            payrollState.cutoff = cutoffType;
            document.querySelectorAll('#cutoffPillsGroup .filter-pill').forEach(p => p.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
            renderPayrollAndCalendar();
        }

        function toggleCurrency() {
            const db = MockAPI.getDB();
            if (payrollState.currency === 'PHP') {
                payrollState.currency = 'USD';
                payrollState.hourlyRate = +(payrollState.hourlyRate / 56).toFixed(2);
                db.users.forEach(u => u.hourly_rate = +(u.hourly_rate / 56).toFixed(2));
                document.getElementById('currencyBtnLabel').textContent = 'USD ($)';
            } else {
                payrollState.currency = 'PHP';
                payrollState.hourlyRate = Math.round(payrollState.hourlyRate * 56);
                db.users.forEach(u => u.hourly_rate = Math.round(u.hourly_rate * 56));
                document.getElementById('currencyBtnLabel').textContent = 'PHP (₱)';
            }
            MockAPI.saveDB(db);
            document.getElementById('hourlyRateInput').value = payrollState.hourlyRate;
            renderAll();
        }

        function updateHourlyRate(newVal) {
            const parsed = parseFloat(newVal);
            if (!isNaN(parsed) && parsed > 0) {
                payrollState.hourlyRate = parsed;
                const db = MockAPI.getDB();
                const userRecord = db.users.find(u => u.id === 'u1');
                if (userRecord) userRecord.hourly_rate = parsed;
                MockAPI.saveDB(db);
                renderAll();
                MockAPI.postLog(currentUser.name, `Updated hourly rate to ${formatCurrency(parsed)}/hr`, 'Rate');
                showToast(`Hourly rate updated to ${formatCurrency(parsed)}/hr.`);
            }
        }

        function updateOtMultiplier(newMult) {
            const parsed = parseFloat(newMult);
            if (!isNaN(parsed) && parsed >= 1) {
                payrollState.otMultiplier = parsed;
                renderAll();
                showToast(`Overtime multiplier set to ${parsed.toFixed(2)}x.`);
            }
        }

        function formatCurrency(amount) {
            const symbol = payrollState.currency === 'PHP' ? '₱' : '$';
            return `${symbol}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        function getPayPeriodBounds() {
            const { year, month, cutoff } = payrollState;
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
            let startDay = 1, endDay = lastDayOfMonth;
            if (cutoff === 'first') { startDay = 1; endDay = 15; }
            else if (cutoff === 'second') { startDay = 16; endDay = lastDayOfMonth; }
            return { startDay, endDay, lastDayOfMonth };
        }

        function renderPayrollAndCalendar() {
            const { year, month, cutoff, hourlyRate, otMultiplier } = payrollState;
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const shortMonth = monthNames[month].slice(0, 3);
            const { startDay, endDay, lastDayOfMonth } = getPayPeriodBounds();
            const cutoffLabelText = cutoff === 'first' ? `1st Cutoff (${shortMonth} 1–15)` : cutoff === 'second' ? `2nd Cutoff (${shortMonth} 16–${endDay})` : `Full Month (${shortMonth} 1–${endDay})`;

            document.getElementById('payrollMonthLabel').textContent = `${monthNames[month]} ${year}`;
            document.getElementById('activeCutoffRangeBadge').textContent = `${shortMonth} ${startDay} – ${shortMonth} ${endDay}, ${year}`;
            const payoutDay = cutoff === 'first' ? 20 : lastDayOfMonth;
            document.getElementById('payPayoutDateSub').textContent = `Upcoming Payout: ${shortMonth} ${payoutDay}, ${year}`;

            const rateInput = document.getElementById('hourlyRateInput');
            if (rateInput && rateInput.disabled) {
                rateInput.value = hourlyRate;
            }
            document.getElementById('rateRoleHint').textContent = (rateInput && !rateInput.disabled)
                ? 'Editing rate — click Save to apply'
                : (isManager() ? 'Manager / Admin Rate Control' : 'Click Edit to adjust personal rate');
            document.getElementById('btnApprovePayroll').disabled = !isManager();

            const tasks = MockAPI.getTasks().filter(t => t.status !== 'trash');
            const tasksByDate = {};
            tasks.forEach(t => {
                if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
                tasksByDate[t.date].push(t);
            });

            let regularHours = 0;
            let overtimeHours = 0;
            let activeWorkDays = 0;

            for (let d = startDay; d <= endDay; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayHrs = (tasksByDate[dateStr] || []).reduce((s, item) => s + Number(item.hours_completed || 0), 0);
                if (dayHrs > 0) {
                    activeWorkDays++;
                    regularHours += Math.min(8, dayHrs);
                    overtimeHours += Math.max(0, dayHrs - 8);
                }
            }

            const totalPeriodHrs = regularHours + overtimeHours;
            const regularPay = regularHours * hourlyRate;
            const overtimePay = overtimeHours * hourlyRate * otMultiplier;
            const attendanceBonus = activeWorkDays >= 4 ? (payrollState.currency === 'PHP' ? 1000 : 20) : 0;
            const grossPay = regularPay + overtimePay + attendanceBonus;
            const deductions = document.getElementById('deductionsToggle').checked ? grossPay * 0.085 : 0;
            const netPay = Math.max(0, grossPay - deductions);

            if (document.getElementById('dashPeriodLabel')) document.getElementById('dashPeriodLabel').textContent = cutoffLabelText;
            if (document.getElementById('dashRateBadge')) document.getElementById('dashRateBadge').textContent = `${formatCurrency(hourlyRate)}/hr`;
            if (document.getElementById('dashPeriodNetPay')) document.getElementById('dashPeriodNetPay').textContent = formatCurrency(netPay);
            if (document.getElementById('ledgerPeriodEstPay')) document.getElementById('ledgerPeriodEstPay').textContent = formatCurrency(netPay);
            if (document.getElementById('ledgerRateText')) document.getElementById('ledgerRateText').textContent = `${formatCurrency(hourlyRate)}/hr`;
            if (document.getElementById('sysActiveRate')) document.getElementById('sysActiveRate').textContent = `${formatCurrency(hourlyRate)}/hr`;

            document.getElementById('payTotalHours').textContent = `${totalPeriodHrs.toFixed(1)} hrs`;
            document.getElementById('payHoursBreakdown').textContent = `${regularHours.toFixed(1)}h Reg • ${overtimeHours.toFixed(1)}h OT`;
            document.getElementById('payRegularAmount').textContent = formatCurrency(regularPay);
            document.getElementById('payRateSub').textContent = `Rate: ${formatCurrency(hourlyRate)} / hr`;
            document.getElementById('payOvertimeAmount').textContent = formatCurrency(overtimePay + attendanceBonus);
            document.getElementById('payNetAmount').textContent = formatCurrency(netPay);

            document.getElementById('slipRegHrs').textContent = regularHours.toFixed(1);
            document.getElementById('slipRegPay').textContent = formatCurrency(regularPay);
            document.getElementById('slipOtMultLabel').textContent = `${otMultiplier.toFixed(2)}x`;
            document.getElementById('slipOtHrs').textContent = overtimeHours.toFixed(1);
            document.getElementById('slipOtPay').textContent = formatCurrency(overtimePay);
            document.getElementById('slipBonusPay').textContent = formatCurrency(attendanceBonus);
            document.getElementById('slipGrossPay').textContent = formatCurrency(grossPay);
            document.getElementById('slipDeductions').textContent = `-${formatCurrency(deductions)}`;
            document.getElementById('slipNetTotal').textContent = formatCurrency(netPay);

            const periodKey = `${year}-${month}-${cutoff}`;
            const isPaid = payrollState.approvedPeriods[periodKey] === 'Paid';
            const statusBadge = document.getElementById('payrollStatusBadge');
            const statusText = document.getElementById('payrollStatusText');
            const approveBtnText = document.getElementById('btnApprovePayrollText');

            if (isPaid) { statusBadge.className = 'live-status-pill'; statusText.textContent = 'Paid & Verified'; approveBtnText.textContent = 'Reopen Period'; }
            else { statusBadge.className = 'live-status-pill on-break'; statusText.textContent = 'Pending Payout'; approveBtnText.textContent = 'Mark Paid'; }

            const grid = document.getElementById('workCalendarGrid');
            const firstWeekday = new Date(year, month, 1).getDay();
            const todayStr = '2026-11-16';
            let cellsHTML = '';

            for (let blank = 0; blank < firstWeekday; blank++) cellsHTML += `<div class="cal-day-cell empty"></div>`;

            for (let day = 1; day <= lastDayOfMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayHrs = (tasksByDate[dateStr] || []).reduce((sum, item) => sum + Number(item.hours_completed || 0), 0);
                const inPeriod = day >= startDay && day <= endDay;
                const isToday = dateStr === todayStr;
                const isOT = dayHrs > 8;
                const dayEarnings = (Math.min(8, dayHrs) * hourlyRate) + (Math.max(0, dayHrs - 8) * hourlyRate * otMultiplier);

                let dotClass = 'off';
                let pillHTML = `<div class="cal-hours-pill rest">Rest / Off</div>`;
                let payTagHTML = '';

                if (dayHrs > 0) {
                    dotClass = isOT ? 'overtime' : 'completed';
                    pillHTML = `<div class="cal-hours-pill ${isOT ? 'ot' : ''}">${dayHrs.toFixed(1)}h ${isOT ? 'OT' : ''}</div>`;
                    payTagHTML = `<div class="cal-pay-tag">${formatCurrency(dayEarnings)}</div>`;
                }

                cellsHTML += `
                    <div class="cal-day-cell ${inPeriod ? 'in-period' : 'outside-period'} ${isToday ? 'is-today' : ''}" onclick="openDayBreakdownModal('${dateStr}')">
                        <div class="cal-day-top">
                            <span class="cal-day-num">${day}</span>
                            <span class="cal-status-dot ${dotClass}"></span>
                        </div>
                        <div>${pillHTML}${payTagHTML}</div>
                    </div>
                `;
            }
            grid.innerHTML = cellsHTML;
        }

        function enableHourlyRateEdit() {
            const input = document.getElementById('hourlyRateInput');
            const editBtn = document.getElementById('btnEditHourlyRate');
            const saveBtn = document.getElementById('btnSaveHourlyRate');
            const hint = document.getElementById('rateRoleHint');

            input.disabled = false;
            input.focus();
            input.select();
            editBtn.style.display = 'none';
            saveBtn.style.display = 'inline-flex';
            hint.textContent = 'Editing rate — click Save to apply';
        }

        function saveHourlyRateEdit() {
            const input = document.getElementById('hourlyRateInput');
            const editBtn = document.getElementById('btnEditHourlyRate');
            const saveBtn = document.getElementById('btnSaveHourlyRate');
            const parsed = parseFloat(input.value);

            if (isNaN(parsed) || parsed <= 0) {
                showToast('Please enter a valid hourly rate greater than 0.');
                input.focus();
                return;
            }

            input.disabled = true;
            saveBtn.style.display = 'none';
            editBtn.style.display = 'inline-flex';
            updateHourlyRate(parsed);
        }

        function openDayBreakdownModal(dateStr) {
            const tasks = MockAPI.getTasks().filter(t => t.status !== 'trash' && t.date === dateStr);
            const totalHrs = tasks.reduce((sum, t) => sum + Number(t.hours_completed || 0), 0);
            const dayEarnings = (Math.min(8, totalHrs) * payrollState.hourlyRate) + (Math.max(0, totalHrs - 8) * payrollState.hourlyRate * payrollState.otMultiplier);

            document.getElementById('dayModalTitle').textContent = `Shifts & Earnings — ${dateStr}`;
            document.getElementById('dayModalSub').textContent = `Logged: ${totalHrs.toFixed(2)} hrs • Rate: ${formatCurrency(payrollState.hourlyRate)}/hr • Day Earnings: ${formatCurrency(dayEarnings)}`;

            const listEl = document.getElementById('dayModalEntriesList');
            listEl.innerHTML = tasks.length === 0
                ? `<div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-input); border-radius: 12px;">No shifts or tasks logged on ${dateStr}.</div>`
                : tasks.map(t => `
                    <div class="activity-item" style="margin-bottom: 0;">
                        <div class="activity-left">
                            <div class="activity-badge-icon"><i class="fa-solid fa-clock"></i></div>
                            <div>
                                <strong style="font-size: 13px; display: block;">${t.description}</strong>
                                <span style="font-size: 11px; color: var(--text-secondary);">${t.time_in} - ${t.time_out} • ${t.location_set}</span>
                            </div>
                        </div>
                        <span class="tag-set" style="background: rgba(230,184,92,0.14); border-color: var(--border-gold); color: var(--gold-light);">${t.hours_completed}h</span>
                    </div>
                `).join('');

            document.getElementById('btnLogForSelectedDay').onclick = () => {
                closeDayBreakdownModal();
                openTaskModal();
                document.getElementById('fDate').value = dateStr;
            };
            document.getElementById('dayBreakdownModal').classList.add('open');
        }

        function closeDayBreakdownModal() { document.getElementById('dayBreakdownModal').classList.remove('open'); }

        function togglePayrollApproval() {
            if (!isManager()) { showToast('Permission Denied: Only Manager / Admin can mark pay periods as Paid.'); return; }
            const { year, month, cutoff } = payrollState;
            const periodKey = `${year}-${month}-${cutoff}`;
            payrollState.approvedPeriods[periodKey] = payrollState.approvedPeriods[periodKey] === 'Paid' ? 'Pending' : 'Paid';
            renderPayrollAndCalendar();
            MockAPI.postLog(currentUser.name, `Marked ${periodKey} payroll as ${payrollState.approvedPeriods[periodKey]}`, 'Payroll');
            showToast(`Pay period marked as ${payrollState.approvedPeriods[periodKey]}.`);
        }

        function downloadPayslipSummary() {
            const range = document.getElementById('activeCutoffRangeBadge').textContent;
            const net = document.getElementById('slipNetTotal').textContent;
            const hrs = document.getElementById('payTotalHours').textContent;
            showToast(`Payslip generated for ${range} (${hrs} • Net: ${net}).`);
        }

        function renderRightActivity() {
            const logs = MockAPI.getDB().logs.slice(0, 4);
            document.getElementById('rightActivityList').innerHTML = logs.map(l => `
                <div class="activity-item">
                    <div class="activity-left">
                        <div class="activity-badge-icon"><i class="fa-solid fa-bolt"></i></div>
                        <div class="activity-text">
                            <p title="${l.action}">${l.action}</p>
                            <span>${l.timestamp}</span>
                        </div>
                    </div>
                    <span style="font-size: 11px; font-weight: 700; color: var(--gold-mid);">${l.meta}</span>
                </div>
            `).join('');
        }

        function renderAnalyticsLogs() {
            const logs = MockAPI.getDB().logs;
            document.getElementById('fullActivityLogList').innerHTML = logs.map(l => `
                <div class="activity-item">
                    <div class="activity-left">
                        <div class="activity-badge-icon"><i class="fa-solid fa-clock"></i></div>
                        <div>
                            <strong style="font-size: 12.5px;">${l.user_name}</strong>
                            <span style="font-size: 12.5px; color: var(--text-secondary);"> — ${l.action}</span>
                            <div style="font-size: 11px; color: var(--text-muted);">${l.timestamp}</div>
                        </div>
                    </div>
                    <span class="tag-set">${l.meta || 'Logged'}</span>
                </div>
            `).join('');
        }

        function renderTeamAndTimesheets() {
            const db = MockAPI.getDB();
            const { year, month, otMultiplier } = payrollState;
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const { startDay, endDay } = getPayPeriodBounds();

            document.getElementById('teamRosterPeriodLabel').textContent = `${monthNames[month]} ${startDay} – ${monthNames[month]} ${endDay}, ${year}`;
            document.getElementById('teamRosterRoleBadge').textContent = isManager() ? 'Manager / Admin Rate Editor Active' : 'Employee View (Switch Role to Edit Rates)';

            const tasks = MockAPI.getTasks().filter(t => t.status !== 'trash');
            let u1Reg = 0, u1Ot = 0;
            for (let d = startDay; d <= endDay; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayHrs = tasks.filter(t => t.date === dateStr).reduce((s, x) => s + Number(x.hours_completed || 0), 0);
                if (dayHrs > 0) { u1Reg += Math.min(8, dayHrs); u1Ot += Math.max(0, dayHrs - 8); }
            }

            document.getElementById('teamMembersGrid').innerHTML = db.users.map(u => {
                const rate = u.id === 'u1' ? payrollState.hourlyRate : (u.hourly_rate || 350);
                return `
                <div class="glass-card" style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="avatar-circle">${u.name.charAt(0)}</div>
                        <div>
                            <strong style="font-size:14px; display:block;">${u.name}</strong>
                            <span style="font-size:11.5px; color:var(--gold-mid);">${u.role} • ${formatCurrency(rate)}/hr</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <strong style="font-size:15px; display:block;">${u.total_hours}h</strong>
                        <span style="font-size:11px; color:#10b981;">Active</span>
                    </div>
                </div>
            `}).join('');

            document.getElementById('teamPayrollRosterBody').innerHTML = db.users.map(u => {
                const rate = u.id === 'u1' ? payrollState.hourlyRate : (u.hourly_rate || 350);
                const regH = u.id === 'u1' ? u1Reg : (u.period_hours || 12);
                const otH = u.id === 'u1' ? u1Ot : (u.ot_hours || 0);
                const gross = (regH * rate) + (otH * rate * otMultiplier);
                const net = gross * 0.915;
                const pStatus = u.payroll_status || 'Pending';

                return `
                    <tr>
                        <td style="font-weight:700;">${u.name}</td>
                        <td>${u.role}</td>
                        <td>${isManager() ? `<input type="number" class="form-control" style="width:95px; padding:5px 8px; font-weight:700;" value="${rate}" min="1" step="5" onchange="updateMemberHourlyRate('${u.id}', this.value)">` : `<span style="font-family:'JetBrains Mono',monospace; font-weight:700;">${formatCurrency(rate)}/hr</span>`}</td>
                        <td style="font-family:'JetBrains Mono',monospace;">${regH.toFixed(1)}h Reg / <span style="color:#fbbf24;">${otH.toFixed(1)}h OT</span></td>
                        <td style="font-weight:600;">${formatCurrency(gross)}</td>
                        <td style="font-weight:800; color:var(--gold-light);">${formatCurrency(net)}</td>
                        <td><span class="live-status-pill ${pStatus === 'Pending' ? 'on-break' : ''}">${pStatus}</span></td>
                        <td style="text-align:right;">${pStatus === 'Pending' ? `<button class="btn btn-gold btn-sm" onclick="markMemberPayrollPaid('${u.id}')">Mark Paid</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Disbursed</span>`}</td>
                    </tr>
                `;
            }).join('');

            document.getElementById('timesheetsTableBody').innerHTML = db.timesheets.map(ts => `
                <tr>
                    <td style="font-weight:600;">${ts.user_name}</td>
                    <td>${ts.role}</td>
                    <td style="font-family:'JetBrains Mono',monospace;">${ts.week_ending}</td>
                    <td style="font-weight:700; color:var(--gold-mid);">${ts.hours} hrs</td>
                    <td><span class="live-status-pill ${ts.status === 'Pending' ? 'on-break' : ''}">${ts.status}</span></td>
                    <td style="text-align:right;">${ts.status === 'Pending' ? `<button class="btn btn-gold btn-sm" onclick="approveTimesheet('${ts.id}')">Approve</button>` : `<span style="font-size:11.5px; color:var(--text-muted);">Verified</span>`}</td>
                </tr>
            `).join('');
        }

        function approveTimesheet(tsId) {
            if (!isManager()) { showToast('Permission Denied: Only Manager / Admin can approve timesheets.'); return; }
            const db = MockAPI.getDB();
            const item = db.timesheets.find(t => t.id === tsId);
            if (item) {
                item.status = 'Approved';
                MockAPI.saveDB(db);
                MockAPI.postLog(currentUser.name, `Approved weekly timesheet for ${item.user_name}`, 'Approved');
                renderAll();
                showToast(`Timesheet approved for ${item.user_name}!`);
            }
        }

        function updateMemberHourlyRate(userId, newRateVal) {
            if (!isManager()) { showToast('Permission Denied: Only Manager / Admin can edit team hourly rates.'); return; }
            const parsed = parseFloat(newRateVal);
            if (isNaN(parsed) || parsed <= 0) return;
            const db = MockAPI.getDB();
            const member = db.users.find(u => u.id === userId);
            if (member) {
                member.hourly_rate = parsed;
                if (userId === 'u1') payrollState.hourlyRate = parsed;
                MockAPI.saveDB(db);
                MockAPI.postLog(currentUser.name, `Updated ${member.name}'s hourly rate to ${formatCurrency(parsed)}/hr`, 'Rate');
                renderAll();
                showToast(`Updated ${member.name}'s rate to ${formatCurrency(parsed)}/hr.`);
            }
        }

        function markMemberPayrollPaid(userId) {
            if (!isManager()) { showToast('Permission Denied: Only Manager / Admin can disburse payroll.'); return; }
            const db = MockAPI.getDB();
            const member = db.users.find(u => u.id === userId);
            if (member) {
                member.payroll_status = 'Paid';
                MockAPI.saveDB(db);
                MockAPI.postLog(currentUser.name, `Disbursed pay period payout for ${member.name}`, 'Paid');
                renderAll();
                showToast(`Payroll marked as Paid for ${member.name}!`);
            }
        }

        function toggleTheme() {
            const html = document.documentElement;
            const isDark = html.getAttribute('data-theme') === 'dark';
            html.setAttribute('data-theme', isDark ? 'light' : 'dark');
            document.getElementById('themeIcon').className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        }

        function navigateTo(viewName) {
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            const target = document.getElementById(`view-${viewName}`);
            if (target) target.classList.add('active');
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
            if (viewName === 'analytics') initCharts();
            else if (viewName === 'payroll') renderPayrollAndCalendar();
            else if (viewName === 'account') loadAccountDetails();
            document.getElementById('sidebar').classList.remove('open');
        }

        function handleGlobalSearch(query) {
            const ledgerInput = document.getElementById('ledgerSearchInput');
            if (ledgerInput) ledgerInput.value = query;
            if (query.trim().length > 0) navigateTo('tasks');
            renderFullLedger();
        }

        function initCharts() {
            if (typeof Chart === 'undefined') return;
            const ctxWeekly = document.getElementById('weeklyHoursChart');
            const ctxDist = document.getElementById('taskDistChart');
            if (!ctxWeekly || !ctxDist) return;
            if (weeklyChart) weeklyChart.destroy();
            if (distChart) distChart.destroy();

            weeklyChart = new Chart(ctxWeekly, {
                type: 'bar',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                    datasets: [{
                        label: 'Hours Logged', data: [8.0, 8.5, 9.5, 8.0, 4.5, 0],
                        backgroundColor: 'rgba(230, 184, 92, 0.78)', borderColor: '#fce694', borderWidth: 1, borderRadius: 8
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af' } },
                        x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                    }
                }
            });

            distChart = new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: ['Set-A (Frontend/UI)', 'Set-B (Backend/API)', 'Set-C (Payroll Sprint)'],
                    datasets: [{
                        data: [24.5, 12.5, 8.0],
                        backgroundColor: ['#e6b85c', '#8b5cf6', '#10b981'], borderColor: '#151519', borderWidth: 2
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', padding: 14 } } }
                }
            });
        }

        function toggleMobileSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
        function resetDatabase() { localStorage.removeItem(STORAGE_KEY); renderAll(); showToast('Database reset to initial seed state.'); }

        function showToast(msg) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<i class="fa-solid fa-sparkles" style="color: var(--gold-mid);"></i><span>${msg}</span>`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3400);
        }


/* ======================================================================
   MY ACCOUNT + AI ASSISTANT
   Demo profile fields are local-only. Use Supabase for production storage.
   ====================================================================== */
function loadAccountDetails() {
    const name = document.getElementById('accountName');
    if (!name) return;
    name.value = currentUser.name || '';
    document.getElementById('accountEmail').value = currentUser.email || '';
    document.getElementById('accountMobile').value = currentUser.mobile || '';
    document.getElementById('accountPhotoPreview').src = currentUser.profilePhoto || 'data:,';
    document.getElementById('accountPhotoInput').value = '';
}

function saveAccountDetails(event) {
    event.preventDefault();
    const name = document.getElementById('accountName').value.trim();
    const email = document.getElementById('accountEmail').value.trim();
    const mobile = document.getElementById('accountMobile').value.trim();
    if (!name || !email) return showToast('Name and email are required.');
    currentUser.name = name;
    currentUser.email = email;
    currentUser.mobile = mobile;
    syncUserUI();
    showToast('Profile saved in this browser. Configure Supabase for online account sync.');
}

function removeAccountPhoto() {
    currentUser.profilePhoto = '';
    syncUserUI();
    const preview = document.getElementById('accountPhotoPreview');
    if (preview) preview.src = 'data:,';
    const input = document.getElementById('accountPhotoInput');
    if (input) input.value = '';
    showToast('Profile photo removed from this browser.');
}

function handleAccountPhoto(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        event.target.value = '';
        return showToast('Choose a JPG, PNG, or WebP image.');
    }
    if (file.size > 1.5 * 1024 * 1024) {
        event.target.value = '';
        return showToast('The photo must be 1.5 MB or smaller.');
    }
    const reader = new FileReader();
    reader.onload = () => {
        currentUser.profilePhoto = reader.result;
        syncUserUI();
        document.getElementById('accountPhotoPreview').src = reader.result;
        showToast('Profile photo saved in this browser.');
    };
    reader.onerror = () => showToast('Could not read that image.');
    reader.readAsDataURL(file);
}

function appendAssistantMessage(role, message) {
    const list = document.getElementById('assistantMessages');
    const item = document.createElement('div');
    item.className = `assistant-message ${role}`;
    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? 'You' : 'Assistant';
    const body = document.createElement('p');
    body.textContent = message;
    item.append(heading, body);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
}

function useAssistantPrompt(prompt) {
    document.getElementById('assistantInput').value = prompt;
    document.getElementById('assistantInput').focus();
}

function clearAssistantChat() {
    const list = document.getElementById('assistantMessages');
    list.replaceChildren();
    appendAssistantMessage('assistant', 'Conversation cleared. What would you like help with?');
    document.getElementById('assistantStatus').textContent = 'Conversation cleared.';
}

async function sendAssistantMessage(event) {
    event.preventDefault();
    const input = document.getElementById('assistantInput');
    const button = document.getElementById('assistantSendBtn');
    const status = document.getElementById('assistantStatus');
    const message = input.value.trim();
    if (!message) return;
    appendAssistantMessage('user', message);
    input.value = '';
    button.disabled = true;
    status.textContent = 'Sending request…';
    try {
        // In production, this token must come from the authenticated Supabase session.
        const token = window.trackerSupabaseSession?.access_token;
        if (!token) throw new Error('AI is not connected. Set up Supabase Authentication and the Vercel API first.');
        const response = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ message })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
        appendAssistantMessage('assistant', data.reply || 'The assistant returned an empty response.');
        status.textContent = 'Response received.';
    } catch (error) {
        appendAssistantMessage('assistant', error.message || 'Unable to contact the AI service.');
        status.textContent = 'AI request was not completed.';
    } finally {
        button.disabled = false;
    }
}

function handlePasswordChange(event) {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (password.length < 8) return showToast('Use at least 8 characters for your new password.');
    if (password !== confirm) return showToast('The passwords do not match.');
    showToast('Password changes are disabled in demo mode. Configure Supabase Auth to enable secure password updates.');
    event.target.reset();
}


let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
});
async function installPWA() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        return;
    }
    showToast('If installation is supported, use your browser menu and choose Install App or Add to Home Screen.');
}
function showIOSInstallHelp() {
    alert('To install on iPhone or iPad:\n1. Open this site in Safari.\n2. Tap Share.\n3. Choose Add to Home Screen.\n4. Tap Add.');
}

document.addEventListener('DOMContentLoaded', () => {
    const photoInput = document.getElementById('accountPhotoInput');
    const accountForm = document.getElementById('accountForm');
    const passwordForm = document.getElementById('passwordForm');
    const assistantForm = document.getElementById('assistantForm');
    if (photoInput) photoInput.addEventListener('change', handleAccountPhoto);
    if (accountForm) accountForm.addEventListener('submit', saveAccountDetails);
    if (passwordForm) passwordForm.addEventListener('submit', handlePasswordChange);
    if (assistantForm) assistantForm.addEventListener('submit', sendAssistantMessage);
});


/* ============================================================
   SUPABASE PRODUCTION BRIDGE
   Authentication + profile + attendance + breaks + live count.
   Task/analytics screens retain their original UI; task CRUD
   migration is documented in README and is not represented as
   cloud-synced until connected to the tasks table.
============================================================ */
const TT = {
  client: window.supabaseClient,
  attendanceId: null,
  count: 0,
  countChannel: null,
  countTimer: null,
  busy: false
};

function ttRoleLabel(role) {
  return (role === 'admin' || role === 'manager') ? 'Manager / Admin' : 'Employee';
}
function ttShowError(error) {
  console.error(error);
  const msg = error?.message || 'Something went wrong. Please try again.';
  if (typeof showToast === 'function') showToast(msg);
  else alert(msg);
}
async function ttLog(action, details = {}) {
  if (!currentUser?.id) return;
  const { error } = await TT.client.from('activity_logs').insert({
    user_id: currentUser.id, action, details
  });
  if (error) console.warn('Activity log:', error.message);
}
async function ttLoadProfile(user) {
  const { data: profile, error } = await TT.client
    .from('profiles').select('id,full_name,mobile_number,avatar_path,role,is_active')
    .eq('id', user.id).single();
  if (error) throw error;
  if (!profile.is_active) {
    await TT.client.auth.signOut();
    throw new Error('Your account is currently disabled. Contact an administrator.');
  }
  currentUser = {
    id: user.id,
    name: profile.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
    email: user.email,
    role: ttRoleLabel(profile.role),
    dbRole: profile.role,
    mobile: profile.mobile_number || '',
    avatar_path: profile.avatar_path || '',
    profilePhoto: profile.avatar_path ? TT.client.storage.from('profile-photos').getPublicUrl(profile.avatar_path).data.publicUrl : ''
  };
  syncUserUI();
  return profile;
}
async function ttLoadAttendance() {
  if (!currentUser?.id) return;
  const { data, error } = await TT.client.from('attendance')
    .select('id,clock_in,clock_out,total_break_seconds,status')
    .eq('user_id', currentUser.id).is('clock_out', null)
    .order('clock_in', { ascending: false }).limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) {
    TT.attendanceId = null;
    shiftState = { status:'CLOCKED_OUT', startTime:null, breakStart:null, accumulatedBreakMs:0 };
  } else {
    TT.attendanceId = row.id;
    const { data: activeBreak, error: breakError } = await TT.client.from('breaks')
      .select('id,break_start').eq('attendance_id', row.id).is('break_end', null)
      .order('break_start', {ascending:false}).limit(1);
    if (breakError) throw breakError;
    const onBreak = !!activeBreak?.[0];
    shiftState = {
      status: onBreak ? 'ON_BREAK' : 'CLOCKED_IN',
      startTime: new Date(row.clock_in),
      breakStart: onBreak ? new Date(activeBreak[0].break_start) : null,
      accumulatedBreakMs: Number(row.total_break_seconds || 0) * 1000
    };
  }
  persistShiftState();
  updateShiftBadges();
  tickClocks();
}
async function ttRefreshOnlineCount() {
  const { data, error } = await TT.client.rpc('get_active_shift_count');
  if (error) {
    console.warn('Online count:', error.message);
    return;
  }
  TT.count = Number(data || 0);
  updateShiftBadges();
}
function ttStartLiveCount() {
  // Startup can be triggered more than once; never add listeners to a
  // Realtime channel after it has already been subscribed.
  if (TT.countChannel) return;
  ttRefreshOnlineCount();
  if (!TT.countTimer) TT.countTimer = setInterval(ttRefreshOnlineCount, 15000);
  TT.countChannel = TT.client.channel('tt-attendance-live')
    .on('postgres_changes', {event:'*', schema:'public', table:'attendance'}, () => ttRefreshOnlineCount())
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Attendance realtime status:', status);
      }
    });
}
async function ttAuthSubmit(e) {
  e.preventDefault();
  if (TT.busy) return;
  TT.busy = true;
  const button = document.getElementById('authSubmitBtn');
  const oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';
  try {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (isSignUpMode) {
      const fullName = document.getElementById('authName').value.trim();
      if (!fullName) throw new Error('Please enter your full name.');
      const { data, error } = await TT.client.auth.signUp({
        email, password, options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      if (data.session) {
        await ttLoadProfile(data.user);
        await ttLoadAttendance();
        closeAuthModal();
        showToast('Account created. You are signed in as Employee.');
      } else {
        showToast('Account created. Check your email to confirm your address, then log in.');
        isSignUpMode = true;
        toggleAuthMode();
      }
    } else {
      const { data, error } = await TT.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await ttLoadProfile(data.user);
      await ttLoadAttendance();
      closeAuthModal();
      renderAll();
      showToast(`Welcome, ${currentUser.name}!`);
    }
  } catch (error) { ttShowError(error); }
  finally {
    TT.busy = false;
    button.disabled = false;
    button.textContent = oldLabel;
  }
}
async function ttClockIn() {
  if (!currentUser?.id) return openAuthModal();
  if (TT.busy || TT.attendanceId) return;
  TT.busy = true;
  try {
    const { data, error } = await TT.client.from('attendance').insert({
      user_id: currentUser.id, status: 'working'
    }).select('id,clock_in').single();
    if (error) throw error;
    TT.attendanceId = data.id;
    shiftState = {status:'CLOCKED_IN', startTime:new Date(data.clock_in), breakStart:null, accumulatedBreakMs:0};
    persistShiftState(); updateShiftBadges(); tickClocks();
    await ttLog('Clocked in', {attendance_id:data.id});
    await ttRefreshOnlineCount();
    showToast('Clock-in saved to Supabase.');
  } catch (error) { ttShowError(error); }
  finally { TT.busy = false; }
}
async function ttToggleBreak() {
  if (!currentUser?.id || !TT.attendanceId || TT.busy) return;
  TT.busy = true;
  try {
    if (shiftState.status === 'CLOCKED_IN') {
      const { error } = await TT.client.from('breaks').insert({
        attendance_id:TT.attendanceId, user_id:currentUser.id
      });
      if (error) throw error;
      const { error: updateError } = await TT.client.from('attendance')
        .update({status:'on_break'}).eq('id',TT.attendanceId);
      if (updateError) throw updateError;
      shiftState.status='ON_BREAK'; shiftState.breakStart=new Date();
      showToast('Break started and saved.');
      await ttLog('Started break', {attendance_id:TT.attendanceId});
    } else if (shiftState.status === 'ON_BREAK') {
      const { data: rows, error } = await TT.client.from('breaks')
        .select('id,break_start').eq('attendance_id',TT.attendanceId)
        .is('break_end',null).order('break_start',{ascending:false}).limit(1);
      if (error) throw error;
      if (!rows?.[0]) throw new Error('No active break was found.');
      const endedAt = new Date();
      const { error: endError } = await TT.client.from('breaks')
        .update({break_end:endedAt.toISOString()}).eq('id',rows[0].id);
      if (endError) throw endError;
      const extra = Math.max(0, Math.floor((endedAt - new Date(rows[0].break_start))/1000));
      const { data: attendance, error: getError } = await TT.client.from('attendance')
        .select('total_break_seconds').eq('id',TT.attendanceId).single();
      if (getError) throw getError;
      const { error: updateError } = await TT.client.from('attendance')
        .update({status:'working',total_break_seconds:Number(attendance.total_break_seconds||0)+extra})
        .eq('id',TT.attendanceId);
      if (updateError) throw updateError;
      shiftState.accumulatedBreakMs += extra*1000;
      shiftState.breakStart=null; shiftState.status='CLOCKED_IN';
      showToast('Break ended. Shift timer resumed.');
      await ttLog('Ended break', {attendance_id:TT.attendanceId,break_seconds:extra});
    }
    persistShiftState(); updateShiftBadges(); tickClocks();
  } catch (error) { ttShowError(error); }
  finally { TT.busy=false; }
}
async function ttClockOut() {
  if (!currentUser?.id || !TT.attendanceId || TT.busy) return;
  TT.busy = true;
  try {
    const now = new Date();
    if (shiftState.status === 'ON_BREAK' && shiftState.breakStart) {
      const { data: rows, error } = await TT.client.from('breaks')
        .select('id,break_start').eq('attendance_id',TT.attendanceId)
        .is('break_end',null).order('break_start',{ascending:false}).limit(1);
      if (error) throw error;
      if (rows?.[0]) {
        const extra = Math.max(0,Math.floor((now-new Date(rows[0].break_start))/1000));
        const {error:be}=await TT.client.from('breaks').update({break_end:now.toISOString()}).eq('id',rows[0].id);
        if(be) throw be;
        const {data:a,error:ae}=await TT.client.from('attendance').select('total_break_seconds').eq('id',TT.attendanceId).single();
        if(ae) throw ae;
        const {error:ue}=await TT.client.from('attendance').update({total_break_seconds:Number(a.total_break_seconds||0)+extra}).eq('id',TT.attendanceId);
        if(ue) throw ue;
      }
    }
    const {error}=await TT.client.from('attendance').update({
      clock_out:now.toISOString(), status:'completed'
    }).eq('id',TT.attendanceId);
    if(error) throw error;
    const start = new Date(shiftState.startTime);
    const {data:att,error:readError}=await TT.client.from('attendance')
      .select('clock_in,total_break_seconds').eq('id',TT.attendanceId).single();
    if(readError) throw readError;
    const hours = Math.max(0,((now-new Date(att.clock_in))/3600000)-(Number(att.total_break_seconds||0)/3600));
    const timeIn = new Date(att.clock_in).toTimeString().slice(0,5);
    const timeOut = now.toTimeString().slice(0,5);
    const hoursRounded = Number(hours.toFixed(2));
    TT.attendanceId=null;
    shiftState={status:'CLOCKED_OUT',startTime:null,breakStart:null,accumulatedBreakMs:0};
    persistShiftState(); document.getElementById('mainShiftTimer').textContent='00:00:00';
    document.getElementById('metricShiftTimer').textContent='00:00:00';
    updateShiftBadges(); await ttLog('Clocked out',{hours:hoursRounded});
    await ttRefreshOnlineCount();
    showToast(`Clock-out saved. ${hoursRounded} hours recorded.`);
    if (typeof openTaskModal==='function') {
      openTaskModal();
      document.getElementById('fTimeIn').value=timeIn;
      document.getElementById('fTimeOut').value=timeOut;
      document.getElementById('fHours').value=hoursRounded;
    }
  } catch(error){ttShowError(error);}
  finally{TT.busy=false;}
}
// Replace demo-only handlers with database-backed operations.
handleAuthSubmit = ttAuthSubmit;
clockIn = ttClockIn;
toggleBreak = ttToggleBreak;
clockOut = ttClockOut;

// Override the hard-coded online figure while retaining the existing pill UI.
const ttOriginalUpdateShiftBadges = updateShiftBadges;
updateShiftBadges = function() {
  ttOriginalUpdateShiftBadges();
  const el=document.getElementById('headerShiftText');
  if (!el) return;
  const n=Number(TT.count||0);
  const countText=`${n.toLocaleString()} Online`;
  if (shiftState.status==='CLOCKED_OUT') el.textContent=`Clocked Out • ${countText}`;
  else if (shiftState.status==='ON_BREAK') el.textContent=`On Break • ${countText}`;
  else el.textContent=`Clocked In • ${countText}`;
};

// A single startup handler below owns Supabase session hydration, realtime setup,
// and auth-state changes. The older duplicate bootstrap was removed because it
// subscribed to the same Realtime channel a second time.

// Profile changes, photo uploads and password updates use Supabase services.
async function saveAccountDetails(event){
  event.preventDefault(); if(!currentUser?.id) return openAuthModal();
  const full_name=document.getElementById('accountName').value.trim();
  const mobile_number=document.getElementById('accountMobile').value.trim();
  const email=document.getElementById('accountEmail').value.trim();
  if(!full_name||!email) return showToast('Name and email are required.');
  try{
    const {error}=await TT.client.from('profiles').update({full_name,mobile_number}).eq('id',currentUser.id); if(error) throw error;
    if(email!==currentUser.email){const {error:authError}=await TT.client.auth.updateUser({email});if(authError)throw authError;}
    currentUser.name=full_name;currentUser.mobile=mobile_number;currentUser.email=email;syncUserUI();showToast('Your profile has been saved to Supabase.');
  }catch(err){ttShowError(err);}
}
async function handleAccountPhoto(event){
  const file=event.target.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return showToast('Choose a JPG, PNG, or WebP image.');
  if(file.size>1.5*1024*1024)return showToast('The photo must be 1.5 MB or smaller.');
  try{
    const path=`${currentUser.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const {error:uploadError}=await TT.client.storage.from('profile-photos').upload(path,file,{upsert:true,contentType:file.type});if(uploadError)throw uploadError;
    const {data}=TT.client.storage.from('profile-photos').getPublicUrl(path);
    const {error}=await TT.client.from('profiles').update({avatar_path:path}).eq('id',currentUser.id);if(error)throw error;
    currentUser.profilePhoto=data.publicUrl;syncUserUI();document.getElementById('accountPhotoPreview').src=data.publicUrl;showToast('Profile photo uploaded.');
  }catch(err){ttShowError(err);}
}
async function removeAccountPhoto(){
  try{if(currentUser.avatar_path){const {error}=await TT.client.storage.from('profile-photos').remove([currentUser.avatar_path]);if(error)throw error;}
    const {error}=await TT.client.from('profiles').update({avatar_path:null}).eq('id',currentUser.id);if(error)throw error;
    currentUser.avatar_path='';currentUser.profilePhoto='';syncUserUI();document.getElementById('accountPhotoPreview').src='data:,';document.getElementById('accountPhotoInput').value='';showToast('Profile photo removed.');
  }catch(err){ttShowError(err);}
}
async function handlePasswordChange(event){
  event.preventDefault();const password=document.getElementById('newPassword').value;const confirm=document.getElementById('confirmPassword').value;
  if(password.length<8)return showToast('Use at least 8 characters.');if(password!==confirm)return showToast('The passwords do not match.');
  try{const {error}=await TT.client.auth.updateUser({password});if(error)throw error;event.target.reset();showToast('Password updated successfully.');}catch(err){ttShowError(err);}
}
function loadAccountDetails(){
  const n=document.getElementById('accountName');if(!n)return;n.value=currentUser.name||'';document.getElementById('accountEmail').value=currentUser.email||'';
  document.getElementById('accountMobile').value=currentUser.mobile||'';
  let photo=currentUser.profilePhoto||'';
  if(!photo&&currentUser.avatar_path){photo=TT.client.storage.from('profile-photos').getPublicUrl(currentUser.avatar_path).data.publicUrl;currentUser.profilePhoto=photo;}
  document.getElementById('accountPhotoPreview').src=photo||'data:,';document.getElementById('accountPhotoInput').value='';
}

// Restore an existing Supabase session on page load and start exactly one
// attendance Realtime subscription. The login form is handled by ttAuthSubmit.
let ttAuthListener = null;
let ttSessionBootstrapStarted = false;
async function ttBootstrapSupabaseSession() {
  if (ttSessionBootstrapStarted || !TT.client) return;
  ttSessionBootstrapStarted = true;
  try {
    const { data, error } = await TT.client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) {
      await ttLoadProfile(data.session.user);
      await ttLoadAttendance();
      renderAll();
      loadAccountDetails();
    }
    ttStartLiveCount();
    if (!ttAuthListener) {
      const { data: listener } = TT.client.auth.onAuthStateChange((event, session) => {
        // Avoid awaiting Supabase calls inside the auth callback itself.
        if (event === 'SIGNED_OUT') {
          currentUser = { id:null, name:'Guest', email:'', role:'Employee' };
          TT.attendanceId = null;
          shiftState = {status:'CLOCKED_OUT',startTime:null,breakStart:null,accumulatedBreakMs:0};
          persistShiftState();
          syncUserUI();
          renderAll();
        } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          Promise.resolve().then(async () => {
            await ttLoadProfile(session.user);
            await ttLoadAttendance();
            renderAll();
            loadAccountDetails();
          }).catch(ttShowError);
        }
      });
      ttAuthListener = listener?.subscription || null;
    }
  } catch (error) {
    ttShowError(error);
  }
}
window.addEventListener('DOMContentLoaded', ttBootstrapSupabaseSession, { once:true });
