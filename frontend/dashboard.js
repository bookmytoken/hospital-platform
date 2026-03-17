const API_URL = 'http://127.0.0.1:8000';
const token = localStorage.getItem('hospital_token');
const currentHospitalId = localStorage.getItem('hospital_id');

// Redirect to login if no token is found
if (!token) {
    window.location.href = 'login.html';
}

let hospitalConfig = null;

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
        if (appt.status === 'pending') {
            actionButtons = `
                <button class="btn-sm" style="background:var(--success); margin-right:5px;" onclick="markVisited(${appt.id})">Mark Visited</button>
                <button class="btn-sm btn-danger" onclick="deleteAppointment(${appt.id})">Cancel</button>
            `;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>#${appt.token_number}</strong></td>
                <td>${appt.patient_name} <br><small style="color:var(--text-light)">${appt.patient_phone || ''}</small></td>
                <td>${appt.doctor_name}</td>
                <td>${appt.appointment_date}</td>
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
        filtered = filtered.filter(a => a.status === statusFilter);
    }

    // Date Filter Logic
    if (specDateInput && specDateInput.value) {
        filtered = filtered.filter(a => a.appointment_date === specDateInput.value);
    }

    renderAppointments(filtered);
    renderCancelled(allAppointments.filter(a => a.status === 'cancelled'));
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
                <td>${a.doctor_name}</td>
                <td>${a.appointment_date}</td>
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

        if (select) select.innerHTML = '<option value="" disabled selected>Select Doctor</option>';
        if (filterSelect) filterSelect.innerHTML = '<option value="all">All Doctors</option>';

        doctors.forEach(doc => {
            // Only active doctors in booking dropdown
            if (doc.active && select) {
                select.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
            // All doctors in filter dropdown (so we can see history of inactive ones too)
            if (filterSelect) {
                filterSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
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
        const tbody = document.querySelector('#schedulesTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        data.forEach(sched => {
            tbody.innerHTML += `
                <tr>
                    <td>${sched.id}</td>
                    <td>${sched.doctor_id}</td>
                    <td>${sched.day_of_week}</td>
                    <td>${sched.start_time.substring(0, 5)}</td>
                    <td>${sched.end_time.substring(0, 5)}</td>
                    <td>${sched.max_tokens}</td>
                    <td>
                        <button class="btn-sm btn-warning" onclick="openEditSchedule(${sched.id}, '${sched.start_time}', '${sched.end_time}', ${sched.max_tokens})">Edit</button>
                        <button class="btn-sm btn-danger" onclick="deleteSchedule(${sched.id})">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error fetching schedules:', error);
    }
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

document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const schedData = {
        doctor_id: document.getElementById('schedDocId').value,
        day_of_week: document.getElementById('schedDay').value,
        start_time: document.getElementById('schedStart').value + ":00",
        end_time: document.getElementById('schedEnd').value + ":00",
        max_tokens: document.getElementById('schedTokens').value
    };
    await fetch(`${API_URL}/doctors/add-schedule`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(schedData)
    });
    closeModal('scheduleModal');
    fetchSchedules();
});

// Edit Schedule Logic
function openEditSchedule(id, start, end, tokens) {
    document.getElementById('editSchedId').value = id;
    document.getElementById('editSchedStart').value = start.substring(0, 5); // Format HH:MM
    document.getElementById('editSchedEnd').value = end.substring(0, 5);
    document.getElementById('editSchedTokens').value = tokens;
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
                    schedSelect.innerHTML += `<option value="${s.id}">${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)} (Max: ${s.max_tokens})</option>`;
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
    const schedData = {
        start_time: document.getElementById('editSchedStart').value + ":00",
        end_time: document.getElementById('editSchedEnd').value + ":00",
        max_tokens: document.getElementById('editSchedTokens').value
    };

    try {
        const res = await fetch(`${API_URL}/doctors/schedules/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(schedData)
        });
        if (!res.ok) {
            const err = await res.json();
            alert("Error: " + err.detail);
        } else {
            closeModal('editScheduleModal');
            fetchSchedules();
        }
    } catch (e) { console.error(e); }
});

document.getElementById('appointmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const aptData = {
        hospital_id: currentHospitalId,
        doctor_id: document.getElementById('aptDocId').value,
        patient_name: document.getElementById('aptPatientName').value,
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
    
    if (aptDateInput && !aptDateInput.value) aptDateInput.value = todayStr;
    if (cancelDateInput && !cancelDateInput.value) cancelDateInput.value = todayStr;

    // Apply max limit to filters if hospitalConfig is already fetched
    updatePickerLimits();
}

// Load default active section on init
fetchHospitalName();
initFilters();
fetchAppointments();
populateDoctorDropdown(); // Pre-load doctors for the filter
