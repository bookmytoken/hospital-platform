const token = localStorage.getItem('hospital_token');
const currentHospitalId = localStorage.getItem('hospital_id');

// Redirect to login if no token is found
if (!token) {
    window.location.href = 'login.html';
}

async function fetchHospitalName() {
    try {
        const res = await fetch(`http://localhost:8000/hospitals/${currentHospitalId}`);
        const data = await res.json();
        document.getElementById('hospitalName').innerText = data.name + " Dashboard";
    } catch (e) { console.error(e); }
}

// Function to handle switching tabs
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(sec => {
        sec.style.display = 'none';
    });
    document.getElementById(`${sectionId}Section`).style.display = 'block';

    // Fetch fresh data when switching tabs
    if (sectionId === 'appointments') fetchAppointments();
    if (sectionId === 'doctors') fetchDoctors();
    if (sectionId === 'schedules') fetchSchedules();
}

// Modal Logic
function openModal(modalId) {
    if (modalId === 'appointmentModal') {
        populateDoctorDropdown();
        // Reset the schedule dropdown
        const schedSelect = document.getElementById('aptScheduleId');
        schedSelect.innerHTML = '<option value="" disabled selected>Select Date First</option>';
        schedSelect.disabled = true;
    }
    document.getElementById(modalId).style.display = "block";
}
function closeModal(modalId) { document.getElementById(modalId).style.display = "none"; }
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
}

let allAppointments = []; // Store appointments globally for filtering

async function fetchAppointments() {
    try {
        const response = await fetch('http://localhost:8000/appointments/', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        allAppointments = await response.json();
        renderAppointments(allAppointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
    }
}

function renderAppointments(appointments) {
    const tbody = document.querySelector('#appointmentsTable tbody');
    tbody.innerHTML = '';

    appointments.forEach(appt => {
        tbody.innerHTML += `
            <tr>
                <td><strong>#${appt.token_number}</strong></td>
                <td>${appt.patient_name}</td>
                <td>${appt.doctor_name}</td>
                <td>${appt.appointment_date}</td>
                <td>${appt.booking_source}</td>
                <td><button class="btn-sm btn-danger" onclick="deleteAppointment(${appt.id})">Delete</button></td>
            </tr>
        `;
    });
}

function filterAppointments() {
    const filterValue = document.getElementById('appointmentDoctorFilter').value;
    if (filterValue === 'all') {
        renderAppointments(allAppointments);
    } else {
        const filtered = allAppointments.filter(a => a.doctor_id.toString() === filterValue);
        renderAppointments(filtered);
    }
}

async function populateDoctorDropdown() {
    try {
        const response = await fetch('http://localhost:8000/doctors/', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const doctors = await response.json();
        const select = document.getElementById('aptDocId');
        const filterSelect = document.getElementById('appointmentDoctorFilter');

        select.innerHTML = '<option value="" disabled selected>Select Doctor</option>';
        filterSelect.innerHTML = '<option value="all">All Doctors</option>';

        doctors.forEach(doc => {
            // Only active doctors in booking dropdown
            if (doc.active) {
                select.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
            }
            // All doctors in filter dropdown (so we can see history of inactive ones too)
            filterSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
        });
    } catch (e) { console.error(e); }
}

async function fetchDoctors() {
    try {
        const response = await fetch('http://localhost:8000/doctors/', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        const data = await response.json();
        const tbody = document.querySelector('#doctorsTable tbody');
        tbody.innerHTML = '';

        data.forEach(doc => {
            tbody.innerHTML += `
                <tr>
                    <td>${doc.id}</td>
                    <td>${doc.name}</td>
                    <td>${doc.specialization}</td>
                    <td><span class="status ${doc.active ? 'active' : 'inactive'}">${doc.active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn-sm btn-warning" onclick="toggleDoctorStatus(${doc.id})">Toggle Status</button>
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
        const res = await fetch(`http://localhost:8000/doctors/${id}`, {
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
        const res = await fetch(`http://localhost:8000/doctors/${id}/toggle-status`, {
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
        const response = await fetch('http://localhost:8000/doctors/schedules/', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) return logout();

        const data = await response.json();
        const tbody = document.querySelector('#schedulesTable tbody');
        tbody.innerHTML = '';

        data.forEach(sched => {
            tbody.innerHTML += `
                <tr>
                    <td>${sched.id}</td>
                    <td>${sched.doctor_id}</td>
                    <td>${sched.day_of_week}</td>
                    <td>${sched.start_time}</td>
                    <td>${sched.end_time}</td>
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
    await fetch('http://localhost:8000/doctors/add-doctor', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(docData)
    });
    closeModal('doctorModal');
    if (document.getElementById('doctorsSection').style.display === 'block') fetchDoctors();
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
    await fetch('http://localhost:8000/doctors/add-schedule', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(schedData)
    });
    closeModal('scheduleModal');
    if (document.getElementById('schedulesSection').style.display === 'block') fetchSchedules();
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
document.getElementById('aptDocId').addEventListener('change', fetchAvailableSchedulesForBooking);
document.getElementById('aptDate').addEventListener('change', fetchAvailableSchedulesForBooking);

async function fetchAvailableSchedulesForBooking() {
    const doctorId = document.getElementById('aptDocId').value;
    const dateStr = document.getElementById('aptDate').value;
    const schedSelect = document.getElementById('aptScheduleId');
    
    if (!doctorId || !dateStr) {
        schedSelect.innerHTML = '<option value="" disabled selected>Select Date First</option>';
        schedSelect.disabled = true;
        return;
    }

    try {
        const response = await fetch('http://localhost:8000/doctors/schedules/', {
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
        const res = await fetch(`http://localhost:8000/doctors/schedules/${id}`, {
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
        schedule_id: document.getElementById('aptScheduleId').value,
        appointment_date: document.getElementById('aptDate').value,
        booking_source: "Dashboard"
    };

    try {
        const res = await fetch('http://localhost:8000/appointments/book-appointment', {
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
            if (document.getElementById('appointmentsSection').style.display === 'block') fetchAppointments();
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
        const res = await fetch(`http://localhost:8000/doctors/schedules/${id}`, {
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
        const res = await fetch(`http://localhost:8000/appointments/${id}`, {
            method: 'DELETE',
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

// Load default active section on init
fetchHospitalName();
fetchAppointments();
populateDoctorDropdown(); // Pre-load doctors for the filter
