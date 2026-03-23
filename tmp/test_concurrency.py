import threading
import requests
import time

# Update this to your Render URL or local URL
API_URL = "https://hospital-platform.onrender.com/appointments/public-book"

def book_appointment(patient_name, patient_phone):
    payload = {
        "hospital_id": 1,
        "doctor_id": 1,
        "schedule_id": 18,
        "patient_name": patient_name,
        "patient_age": 25,
        "patient_phone": patient_phone,
        "appointment_date": "2026-03-30",
        "booking_source": "concurrency_test"
    }
    try:
        response = requests.post(API_URL, json=payload)
        print(f"Patient {patient_name}: Status {response.status_code}, Token {response.json().get('token_number')}")
    except Exception as e:
        print(f"Patient {patient_name} failed: {e}")

if __name__ == "__main__":
    t1 = threading.Thread(target=book_appointment, args=("Test A", "1111111111"))
    t2 = threading.Thread(target=book_appointment, args=("Test B", "2222222222"))
    
    print("Starting simultaneous bookings...")
    t1.start()
    t2.start()
    
    t1.join()
    t2.join()
    print("Done.")
