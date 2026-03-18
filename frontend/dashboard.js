const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:8000'
    : 'https://hospital-platform.onrender.com';
const token = localStorage.getItem('hospital_token');
const currentHospitalId = localStorage.getItem('hospital_id');

// Redirect to login if no token is found
if (!token) {
    window.location.href = 'login.html';
}

let hospitalConfig = null;

// Mobile Sidebar Toggle
window.toggleSidebar = function() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('open');
};

// Helper: Convert YYYY-MM-DD to DD/MM/YYYY
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Helper: Convert 24h to 12h AM/PM
function formatTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${minute} ${ampm}`;
}

async function fetchHospitalName() {
    try {
        const res = await fetch(`${API_URL}/hospitals/${currentHospitalId}`);
        hospitalConfig = await res.json();
        document.getElementById('hospitalName').innerText = hospitalConfig.name;
        
        // After fetching config, update picker limits if they exist
        updatePickerLimits();
    } catch (e) { console.error(e); }
}

function updatePickerLimits() {
    if (!hospitalConfig) return;
    
    const today = new Date();
    const maxDate = new Date();
    // hospitalConfig.booking_window_days: 1 means today only, 2 means today + tomorrow
    maxDate.setDate(today.getDate() + (hospitalConfig.booking_window_days - 1));
    
    const maxStr = maxDate.toISOString().split('T')[0];
    
    // Limits for booking and checking
    const aptDate = document.getElementById('aptDate'); // Modal
    const specDate = document.getElementById('appointmentSpecificDate'); // Main filter
    
    if (aptDate) aptDate.max = maxStr;
    if (specDate) specDate.max = maxStr;
}

// Function to handle switching tabs
function switchTab(sectionId) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + sectionId);
    if (tabEl) tabEl.classList.add('active');
    
    showSection(sectionId);

    // Auto-close mobile sidebar if open
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
        document.querySelector('.sidebar-overlay').classList.remove('open');
    }
}

function showSection(sectionId) {
    document.querySelectorAll('section').forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active-section');
    });
    const targetSection = document.getElementById(`${sectionId}Section`);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active-section');
    }

    // Fetch fresh data when switching tabs
    if (sectionId === 'queue') { fetchAppointments(); fetchQueueControl(); }
    if (sectionId === 'appointments') fetchAppointments();
    if (sectionId === 'doctors') fetchDoctors();
    if (sectionId === 'schedules') fetchSchedules();
    if (sectionId === 'cancelled') fetchAppointments(); // Reuse fetch to populate cancelled
}

// Modal Logic
function openModal(modalId) {
    if (modalId === 'appointmentModal') {
        populateDoctorDropdown();
        // Reset the schedule dropdown
        const schedSelect = document.getElementById('aptScheduleId');
        if (schedSelect) {
            schedSelect.innerHTML = '<option value="" disabled selected>Select Date First</option>';
            schedSelect.disabled = true;
        }

        // Set min date to today (Local Time)
        const dateInput = document.getElementById('aptDate');
        if (dateInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.min = `${yyyy}-${mm}-${dd}`;
            
            // Apply max limit from hospital config if available
            if (hospitalConfig) {
                const maxDate = new Date();
                maxDate.setDate(today.getDate() + (hospitalConfig.booking_window_days - 1));
                dateInput.max = maxDate.toISOString().split('T')[0];
            }
        }
    }
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "flex";
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "none";
}

// Close modal when clicking outside
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}

let allAppointments = []; // Store appointments globally for filtering

async function fetchAppointments() {
    try {
        const response = await fetch(`${API_URL}/appointments/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        allAppointments = await response.json();
        filterAppointments(); // Use the filter logic to apply initial "Today" and "Pending" views
    } catch (error) {
        console.error('Error fetching appointments:', error);
    }
}

function renderAppointments(appointments) {
    const tbody = document.querySelector('#appointmentsTable tbody');
    if (!tbody) {
        console.error("Could not find appointments table body");
        return;
    }
    tbody.innerHTML = '';

    if (appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-light);">No appointments found</td></tr>';
        return;
    }

    appointments.forEach(appt => {
        let actionButtons = '';
        let statusClass = appt.status;
        let statusText = appt.status;

        if (appt.status === 'pending') {
            statusText = 'Pending';
        } else if (appt.status === 'visited') {
            statusText = 'Visited';
        } else if (appt.status === 'cancelled') {
            statusText = 'Cancelled';
        } else if (appt.status === 'calling') {
            statusText = 'Currently Calling';
        } else if (appt.status.startsWith('skipped')) {
            statusClass = 'cancelled'; // Use cancelled style for skipped
            statusText = 'Skipped (Waiting)';
        }

        if (appt.status === 'pending' || appt.status === 'calling' || appt.status.startsWith('skipped')) {
            actionButtons = `
                <button class="btn-sm" style="background:var(--success); margin-right:5px;" onclick="markVisited(${appt.id})">Mark Visited</button>
                <button class="btn-sm btn-warning" style="margin-right:5px;" onclick="deferAppointment(${appt.id})">Defer</button>
                <button class="btn-sm btn-danger" onclick="deleteAppointment(${appt.id})">Cancel</button>
            `;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>#${appt.token_number}</strong></td>
                <td>${appt.patient_name} <br><small style="color:var(--text-light)">${appt.patient_phone || ''}</small></td>
                <td>${appt.patient_age || '--'}</td>
                <td>${appt.doctor_name}</td>
                <td>${formatDate(appt.appointment_date)}</td>
                <td><span class="status ${appt.status}">${appt.status}</span></td>
                <td>
                    ${actionButtons}
                </td>
            </tr>
        `;
    });
}

function filterAppointments() {
    const drFilter = document.getElementById('appointmentDoctorFilter').value;
    const statusFilter = document.getElementById('appointmentStatusFilter').value;
    const specDateInput = document.getElementById('appointmentSpecificDate');

    let filtered = allAppointments;

    // Doctor Filter
    if (drFilter !== 'all') {
        filtered = filtered.filter(a => a.doctor_id.toString() === drFilter);
    }

    // Status Filter
    if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
            filtered = filtered.filter(a => a.status === 'pending' || a.status === 'calling' || a.status.startsWith('skipped'));
        } else {
            filtered = filtered.filter(a => a.status === statusFilter);
        }
    }

    // Date Filter Logic
    if (specDateInput && specDateInput.value) {
        filtered = filtered.filter(a => a.appointment_date === specDateInput.value);
    }

    renderAppointments(filtered);
    renderCancelled(allAppointments.filter(a => a.status === 'cancelled'));
    
    // Also update queue if we are on that tab (uses the global appointments)
    fetchQueueControl();
}

// Removed old updateQueueControl and callNextTokenAction


async function deferAppointment(id) {
    if (!confirm("Move this patient to the end of the queue?")) return;
    try {
        const res = await fetch(`${API_URL}/appointments/${id}/defer`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            fetchAppointments();
        } else {
            const err = await res.json();
            alert("Error: " + err.detail);
        }
    } catch (e) { console.error(e); }
}

function renderCancelled(appointments) {
    const tbody = document.querySelector('#cancelledTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Apply date filter from cancelled section
    const specDateInput = document.getElementById('cancelledSpecificDate');
    
    let filtered = appointments;

    if (specDateInput && specDateInput.value) {
        filtered = filtered.filter(a => a.appointment_date === specDateInput.value);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-light);">No cancelled appointments</td></tr>';
        return;
    }

    filtered.forEach(a => {
        tbody.innerHTML += `
            <tr>
                <td>#${a.token_number}</td>
                <td>${a.patient_name}</td>
                <td>${a.patient_age || '--'}</td>
                <td>${a.doctor_name}</td>
                <td>${formatDate(a.appointment_date)}</td>
                <td><span class="status cancelled">Cancelled</span></td>
            </tr>
        `;
    });
}

function filterCancelled() {
    renderCancelled(allAppointments.filter(a => a.status === 'cancelled'));
}

async function populateDoctorDropdown() {
    try {
        const response = await fetch(`${API_URL}/doctors/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const doctors = await response.json();
        const select = document.getElementById('aptDocId');
        const filterSelect = document.getElementById('appointmentDoctorFilter');
        const queueSelect = document.getElementById('queueDoctorSelect');

        const schedSelect = document.getElementById('schedDocId');

        if (select) select.innerHTML = '<option value="" disabled selected>Select Doctor</option>';
        if (filterSelect) filterSelect.innerHTML = '<option value="all">All Doctors</option>';
        if (queueSelect) queueSelect.innerHTML = '<option value="" disabled selected>Select Doctor</option>';
        if (schedSelect) schedSelect.innerHTML = '<option value="" disabled selected>Select Doctor</option>';

        window.doctorsMap = {};

        doctors.forEach(doc => {
            window.doctorsMap[doc.id] = doc.name;
            // Only active doctors in booking dropdown
            if (doc.active && select) {
                select.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
            if (doc.active && schedSelect) {
                schedSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
            // All doctors in filter dropdown (so we can see history of inactive ones too)
            if (filterSelect) {
                filterSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
            if (queueSelect) {
                queueSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
        });
    } catch (e) { console.error(e); }
}

async function fetchDoctors() {
    try {
        const response = await fetch(`${API_URL}/doctors/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        const data = await response.json();
        const tbody = document.querySelector('#doctorsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        data.forEach(doc => {
            tbody.innerHTML += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${doc.name}</td>
                    <td>${doc.specialization}</td>
                    <td><span class="status ${doc.active ? 'active' : 'inactive'}">${doc.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn-sm btn-warning" onclick="toggleDoctorStatus(${doc.id})">Toggle</button>
                        <button class="btn-sm btn-danger" onclick="deleteDoctor(${doc.id})">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error fetching doctors:', error);
    }
}

async function deleteDoctor(id) {
    if (!confirm("Are you sure you want to delete this doctor?")) return;
    try {
        const res = await fetch(`${API_URL}/doctors/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            fetchDoctors();
        }
    } catch (e) { console.error(e); }
}

async function toggleDoctorStatus(id) {
    try {
        const res = await fetch(`${API_URL}/doctors/${id}/toggle-status`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            fetchDoctors();
        }
    } catch (e) { console.error(e); }
}

async function fetchSchedules() {
    try {
        const response = await fetch(`${API_URL}/doctors/schedules/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        const data = await response.json();
        window.allSchedules = data; // Store globally for 'Apply to All' edits

        const tbody = document.querySelector('#schedulesTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Group schedules by doctor
        const groupedSchedules = {};
        data.forEach(sched => {
            if (!groupedSchedules[sched.doctor_id]) groupedSchedules[sched.doctor_id] = [];
            groupedSchedules[sched.doctor_id].push(sched);
        });

        // Map English days to numbers for standard week sorting
        const dayOrder = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
            'friday': 5, 'saturday': 6, 'sunday': 7
        };

        for (const [docId, schedules] of Object.entries(groupedSchedules)) {
            const docName = window.doctorsMap && window.doctorsMap[docId] ? window.doctorsMap[docId] : `Doc ID: ${docId}`;
            
            tbody.innerHTML += `
                <tr>
                    <td><strong>${docName}</strong></td>
                    <td style="text-align:left;">
                        <button class="btn btn-sm" onclick="openSchedulesView(${docId}, '${docName.replace(/'/g, "\\'")}')">View Schedules (${schedules.length})</button>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error fetching schedules:', error);
    }
}

function openSchedulesView(docId, docName) {
    document.getElementById('viewSchedulesTitle').innerText = `Schedules for ${docName}`;
    const container = document.getElementById('viewSchedulesContainer');
    container.innerHTML = '';
    
    // Filter globally cached schedules
    const schedules = window.allSchedules.filter(s => s.doctor_id == docId);
    
    // Sort
    const dayOrder = {
        'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
        'friday': 5, 'saturday': 6, 'sunday': 7
    };
    schedules.sort((a,b) => dayOrder[a.day_of_week.toLowerCase()] - dayOrder[b.day_of_week.toLowerCase()]);
    
    if(schedules.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:gray;">No schedules found.</p>';
    } else {
        schedules.forEach(sched => {
            container.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-grey); padding:10px 15px; border-radius:6px; border:1px solid var(--border);">
                    <span><strong>${sched.day_of_week}</strong>: ${formatTime(sched.start_time)} - ${formatTime(sched.end_time)} (Max: ${sched.max_tokens})</span>
                    <div style="flex-shrink:0; margin-left:15px;">
                        <button class="btn-sm btn-warning" style="margin-right:5px;" onclick="openEditSchedule(${sched.id}, '${sched.start_time}', '${sched.end_time}', ${sched.max_tokens}, ${sched.doctor_id})">Edit</button>
                        <button class="btn-sm btn-danger" onclick="deleteSchedule(${sched.id})">Del</button>
                    </div>
                </div>
            `;
        });
    }
    
    openModal('viewSchedulesModal');
}

// Form Submissions
document.getElementById('doctorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const docData = {
        hospital_id: currentHospitalId,
        name: document.getElementById('docName').value,
        specialization: document.getElementById('docSpec').value
    };
    await fetch(`${API_URL}/doctors/add-doctor`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(docData)
    });
    closeModal('doctorModal');
    fetchDoctors();
});

// Dynamic Schedule Inputs logic
document.querySelectorAll('#schedDaysGroup input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function() {
        const container = document.getElementById('dayTimingsContainer');
        const day = this.value;
        const rowId = `timing-row-${day}`;

        if (this.checked) {
            // Add row
            const row = document.createElement('div');
            row.id = rowId;
            row.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;";
            row.innerHTML = `
                <div style="width: 70px;">
                    <strong style="font-size:0.9rem;">${day}</strong><br>
                    <a href="#" onclick="copyTimings('${day}'); return false;" style="font-size:0.7rem; color:var(--accent-teal); text-decoration:underline;">Apply to All</a>
                </div>
                <div style="flex:1; min-width:0;">
                    <label style="font-size:0.75rem; margin-bottom:2px;">Start Time</label>
                    <input type="time" class="dyn-start" data-day="${day}" required style="margin-bottom:0; width:100%; min-width:0; padding:6px;">
                </div>
                <div style="flex:1; min-width:0;">
                    <label style="font-size:0.75rem; margin-bottom:2px;">End Time</label>
                    <input type="time" class="dyn-end" data-day="${day}" required style="margin-bottom:0; width:100%; min-width:0; padding:6px;">
                </div>
                <div style="flex:1; min-width:0;">
                    <label style="font-size:0.75rem; margin-bottom:2px;">Tokens</label>
                    <input type="number" class="dyn-tokens" data-day="${day}" placeholder="Max" required style="margin-bottom:0; width:100%; min-width:0; padding:6px;">
                </div>
            `;
            container.appendChild(row);
        } else {
            // Remove row
            const existingRow = document.getElementById(rowId);
            if (existingRow) existingRow.remove();
        }
    });
});

document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const dayCheckboxes = document.querySelectorAll('#schedDaysGroup input[type="checkbox"]:checked');
    const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);
    
    if (selectedDays.length === 0) {
        alert("Please select at least one day for the schedule.");
        return;
    }

    const doctor_id = document.getElementById('schedDocId').value;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        let errors = [];
        let successCount = 0;

        // Save all schedules in parallel, but handle errors individually
        await Promise.all(selectedDays.map(async (day) => {
            try {
                // Extract the specific inputs for this day
                const startInput = document.querySelector(`.dyn-start[data-day="${day}"]`);
                const endInput = document.querySelector(`.dyn-end[data-day="${day}"]`);
                const tokensInput = document.querySelector(`.dyn-tokens[data-day="${day}"]`);

                const schedData = {
                    doctor_id: doctor_id,
                    day_of_week: day,
                    start_time: startInput.value + ":00",
                    end_time: endInput.value + ":00",
                    max_tokens: tokensInput.value
                };
                const res = await fetch(`${API_URL}/doctors/add-schedule`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(schedData)
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || `Failed to add schedule for ${day}`);
                }
                
                // If successful, visually uncheck and remove this specific row immediately
                const cb = document.querySelector(`#schedDaysGroup input[type="checkbox"][value="${day}"]`);
                if (cb) cb.checked = false;
                const row = document.getElementById(`timing-row-${day}`);
                if (row) row.remove();
                successCount++;

            } catch (dayErr) {
                errors.push(dayErr.message);
            }
        }));
        
        // Refresh the table to show any successful additions
        fetchSchedules();

        if (errors.length > 0) {
            alert("Some schedules could not be saved:\n\n" + errors.join("\n\n"));
        } else if (successCount > 0) {
            // Only completely close the modal and reset if EVERYTHING succeeded
            document.getElementById('scheduleForm').reset();
            closeModal('scheduleModal');
        }

    } catch (err) {
        console.error(err);
        alert("Error saving schedules: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Schedule';
    }
});

window.copyTimings = function(sourceDay) {
    const startObj = document.querySelector(`.dyn-start[data-day="${sourceDay}"]`);
    const endObj = document.querySelector(`.dyn-end[data-day="${sourceDay}"]`);
    const tokensObj = document.querySelector(`.dyn-tokens[data-day="${sourceDay}"]`);
    
    if (!startObj || !endObj || !tokensObj) return;

    document.querySelectorAll('.dyn-start').forEach(el => el.value = startObj.value);
    document.querySelectorAll('.dyn-end').forEach(el => el.value = endObj.value);
    document.querySelectorAll('.dyn-tokens').forEach(el => el.value = tokensObj.value);
};

// Edit Schedule Logic
function openEditSchedule(id, start, end, tokens, docId) {
    closeModal('viewSchedulesModal');
    document.getElementById('editSchedId').value = id;
    const docIdEl = document.getElementById('editSchedDocId');
    if (docIdEl) docIdEl.value = docId;
    
    document.getElementById('editSchedStart').value = start.substring(0, 5); // Format HH:MM
    document.getElementById('editSchedEnd').value = end.substring(0, 5);
    document.getElementById('editSchedTokens').value = tokens;
    
    const applyAllEl = document.getElementById('editApplyAll');
    if (applyAllEl) applyAllEl.checked = false;

    openModal('editScheduleModal');
}

// Booking Modal Dynamic Schedules
const docSelect = document.getElementById('aptDocId');
const dateSelect = document.getElementById('aptDate');
if (docSelect) docSelect.addEventListener('change', fetchAvailableSchedulesForBooking);
if (dateSelect) dateSelect.addEventListener('change', fetchAvailableSchedulesForBooking);

async function fetchAvailableSchedulesForBooking() {
    const doctorId = document.getElementById('aptDocId').value;
    const dateStr = document.getElementById('aptDate').value;
    const schedSelect = document.getElementById('aptScheduleId');
    
    if (!doctorId || !dateStr) {
        if (schedSelect) {
            schedSelect.innerHTML = '<option value="" disabled selected>Select Date First</option>';
            schedSelect.disabled = true;
        }
        return;
    }

    try {
        const response = await fetch(`${API_URL}/doctors/schedules/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const allSchedules = await response.json();
        
        // Find day of week for selected date (0 = Sunday, 1 = Monday, etc)
        const dateObj = new Date(dateStr);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const selectedDay = days[dateObj.getDay()];

        // Filter schedules for this doctor on this day
        const matchingSchedules = allSchedules.filter(s => 
            s.doctor_id == doctorId && 
            s.day_of_week.toLowerCase() === selectedDay.toLowerCase()
        );

        if (schedSelect) {
            if (matchingSchedules.length === 0) {
                schedSelect.innerHTML = `<option value="" disabled selected>No shifts on ${selectedDay}</option>`;
                schedSelect.disabled = true;
            } else {
                schedSelect.innerHTML = '<option value="" disabled selected>Select Time Slot</option>';
                matchingSchedules.forEach(s => {
                    schedSelect.innerHTML += `<option value="${s.id}">${formatTime(s.start_time)} - ${formatTime(s.end_time)} (Max: ${s.max_tokens})</option>`;
                });
                schedSelect.disabled = false;
            }
        }

    } catch (e) {
        console.error("Error fetching schedules for booking", e);
    }
}

document.getElementById('editScheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editSchedId').value;
    const docIdEl = document.getElementById('editSchedDocId');
    const docId = docIdEl ? docIdEl.value : null;
    const applyAllEl = document.getElementById('editApplyAll');
    const applyAll = applyAllEl ? applyAllEl.checked : false;

    const schedData = {
        start_time: document.getElementById('editSchedStart').value + ":00",
        end_time: document.getElementById('editSchedEnd').value + ":00",
        max_tokens: document.getElementById('editSchedTokens').value
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
        let schedulesToUpdate = [ { id: id } ];
        
        if (applyAll && docId && window.allSchedules) {
            // Find all schedules belonging to this doctor
            schedulesToUpdate = window.allSchedules.filter(s => s.doctor_id == docId);
        }

        // Run all updates in parallel
        await Promise.all(schedulesToUpdate.map(async (sched) => {
            const res = await fetch(`${API_URL}/doctors/schedules/${sched.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(schedData)
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to update schedule');
            }
        }));

        closeModal('editScheduleModal');
        fetchSchedules();
    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Schedule';
    }
});

document.getElementById('appointmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const aptData = {
        hospital_id: currentHospitalId,
        doctor_id: document.getElementById('aptDocId').value,
        patient_name: document.getElementById('aptPatientName').value,
        patient_age: parseInt(document.getElementById('aptPatientAge').value),
        patient_phone: document.getElementById('aptPatientPhone').value,
        schedule_id: document.getElementById('aptScheduleId').value,
        appointment_date: document.getElementById('aptDate').value,
        booking_source: "Dashboard"
    };

    try {
        const res = await fetch(`${API_URL}/appointments/book-appointment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(aptData)
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            alert("Booked successfully!");
            document.getElementById('appointmentForm').reset();
            document.getElementById('aptScheduleId').disabled = true;
            document.getElementById('aptScheduleId').innerHTML = '<option value="" disabled selected>Select Date First</option>';
            closeModal('appointmentModal');
            fetchAppointments();
        }
    } catch (e) { console.error(e); }
});

function logout() {
    localStorage.removeItem('hospital_token');
    localStorage.removeItem('hospital_id');
    window.location.href = 'login.html';
}

async function deleteSchedule(id) {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
        const res = await fetch(`${API_URL}/doctors/schedules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            closeModal('viewSchedulesModal');
            fetchSchedules();
        }
    } catch (e) { console.error(e); }
}

async function deleteAppointment(id) {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    try {
        const res = await fetch(`${API_URL}/appointments/${id}/status?status=cancelled`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            fetchAppointments();
        }
    } catch (e) { console.error(e); }
}

async function markVisited(id) {
    try {
        const res = await fetch(`${API_URL}/appointments/${id}/status?status=visited`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            fetchAppointments();
        }
    } catch (e) { console.error(e); }
}

// Set default dates for filters
function initFilters() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const aptDateInput = document.getElementById('appointmentSpecificDate');
    const cancelDateInput = document.getElementById('cancelledSpecificDate');
    const queueDateInput = document.getElementById('queueDate');
    
    if (aptDateInput && !aptDateInput.value) aptDateInput.value = todayStr;
    if (cancelDateInput && !cancelDateInput.value) cancelDateInput.value = todayStr;
    if (queueDateInput && !queueDateInput.value) queueDateInput.value = todayStr;

    // Apply max limit to filters if hospitalConfig is already fetched
    updatePickerLimits();
}

function fetchQueueControl() {
    const drSelect = document.getElementById('queueDoctorSelect');
    const dateInput = document.getElementById('queueDate');
    const prompt = document.getElementById('queueSelectPrompt');
    const panel = document.getElementById('queueControlPanel');
    
    if (!drSelect || !drSelect.value) {
        if(prompt) prompt.style.display = 'block';
        if(panel) panel.style.display = 'none';
        return;
    }
    
    if(prompt) prompt.style.display = 'none';
    if(panel) panel.style.display = 'block';
    
    const doctorId = drSelect.value;
    const targetDate = dateInput.value;
    const doctorName = drSelect.options[drSelect.selectedIndex].text;
    
    document.getElementById('queueDoctorNameDisplay').innerText = doctorName;
    
    // Filter appointments for this exact doctor and date
    const queueAppts = allAppointments.filter(a => 
        a.doctor_id.toString() === doctorId && 
        a.appointment_date === targetDate
    );
    
    const callingAppt = queueAppts.find(a => a.status === 'calling');
    
    if (callingAppt) {
        document.getElementById('queueTokenDisplay').innerText = callingAppt.token_number;
        document.getElementById('queuePatientDisplay').innerHTML = `Patient: <strong>${callingAppt.patient_name}</strong> (${callingAppt.patient_phone || 'No phone'})<br><span style="color:var(--success); font-size:0.9rem;">Status: Currently Calling</span>`;
    } else {
        // If no one is calling, find the next pending person
        const pendingAppts = queueAppts.filter(a => a.status === 'pending').sort((a,b) => a.token_number - b.token_number);
        if (pendingAppts.length > 0) {
            const nextUp = pendingAppts[0];
            document.getElementById('queueTokenDisplay').innerText = nextUp.token_number;
            document.getElementById('queuePatientDisplay').innerHTML = `Patient: <strong>${nextUp.patient_name}</strong> (${nextUp.patient_phone || 'No phone'})<br><span style="color:var(--warning-color); font-size:0.9rem;">Status: Waiting to be called</span>`;
        } else {
            document.getElementById('queueTokenDisplay').innerText = '--';
            document.getElementById('queuePatientDisplay').innerHTML = `Patient: -- <br><span style="color:var(--text-light); font-size:0.9rem;">Queue is empty or finished</span>`;
        }
    }
}

async function callNextTokenAction(action) {
    const drId = document.getElementById('queueDoctorSelect').value;
    const date = document.getElementById('queueDate').value;
    
    if (!drId || !date) {
        alert("Please select a specific doctor and date to call the next token.");
        return;
    }

    const buttons = document.querySelectorAll('#queueActionButtons button');
    buttons.forEach(btn => btn.disabled = true);

    try {
        const res = await fetch(`${API_URL}/appointments/doctor/${drId}/call-next?date=${date}&action=${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            if (!data.token_number) {
                alert(data.message);
            }
            await fetchAppointments(); // Will trigger fetchQueueControl automatically via filterAppointments
        } else {
            alert("Error: " + data.detail);
        }
    } catch (e) { console.error(e); }
    finally {
        buttons.forEach(btn => btn.disabled = false);
    }
}

// Load default active section on init
fetchHospitalName();
initFilters();
fetchAppointments();
populateDoctorDropdown(); // Pre-load doctors for the filter
