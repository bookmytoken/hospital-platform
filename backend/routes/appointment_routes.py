from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import datetime
from typing import List
from backend.database import get_db
from backend.models.appointment import Appointment
from backend.models.patient import Patient
from backend.models.staff import HospitalStaff
from backend.models.doctor import Doctor
from backend.services.token_service import get_next_token
from backend.routes.auth_routes import get_current_user
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/appointments", tags=["appointments"])

class AppointmentCreate(BaseModel):
    hospital_id: int
    doctor_id: int
    schedule_id: int
    patient_name: str
    patient_age: int
    patient_phone: str
    appointment_date: datetime.date
    booking_source: str # e.g. "dashboard", "call", "whatsapp"

class AppointmentResponse(BaseModel):
    id: int
    hospital_id: int
    doctor_id: int
    doctor_name: str
    schedule_id: int
    patient_name: str
    patient_age: int | None
    patient_phone: str
    appointment_date: datetime.date
    token_number: int
    booking_source: str
    status: str

    class Config:
        from_attributes = True

@router.put("/{appointment_id}/status")
def update_appointment_status(appointment_id: int, status: str, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment or appointment.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized or appointment not found")
    
    if status not in ["pending", "visited", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    appointment.status = status
    db.commit()
    return {"message": f"Appointment status updated to {status}"}

@router.post("/book-appointment", response_model=AppointmentResponse)
def book_appointment(appt: AppointmentCreate, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # Verify the doctor is active
    doctor = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=400, detail="Doctor not found")
    if not doctor.active:
        raise HTTPException(status_code=400, detail="Cannot book appointment. Doctor is currently unavailable.")

    # Run token logic
    try:
        token_num = get_next_token(db, appt.doctor_id, appt.schedule_id, appt.appointment_date)
    except ValueError as e:
        # e.g. "Doctor fully booked"
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if patient exists, if not create one to store phone
    patient = db.query(Patient).filter(Patient.phone == appt.patient_phone).first()
    if not patient:
        patient = Patient(name=appt.patient_name, phone=appt.patient_phone)
        db.add(patient)
        db.commit()

    # Store appointment
    new_appt = Appointment(
        hospital_id=appt.hospital_id,
        doctor_id=appt.doctor_id,
        schedule_id=appt.schedule_id,
        patient_name=appt.patient_name,
        patient_age=appt.patient_age,
        patient_phone=appt.patient_phone,
        appointment_date=appt.appointment_date,
        token_number=token_num,
        booking_source=appt.booking_source
    )
    
    db.add(new_appt)
    db.commit()
    db.refresh(new_appt)
    
    return new_appt

@router.get("/", response_model=List[AppointmentResponse])
def get_appointments(db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # Only return appointments that belong to this staff member's hospital
    return db.query(Appointment).filter(Appointment.hospital_id == current_user.hospital_id).all()

@router.delete("/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment or appointment.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized or appointment not found")
    
    db.delete(appointment)
    db.commit()
    return {"message": "Appointment deleted successfully"}

# --- Public Endpoints ---

@router.post("/public-book", response_model=AppointmentResponse)
def public_book_appointment(appt: AppointmentCreate, db: Session = Depends(get_db)):
    # Verify the doctor is active
    doctor = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
    if not doctor or doctor.hospital_id != appt.hospital_id:
        raise HTTPException(status_code=400, detail="Doctor not found or hospital mismatch")
    if not doctor.active:
        raise HTTPException(status_code=400, detail="Cannot book appointment. Doctor is currently unavailable.")

    # Run token logic
    try:
        token_num = get_next_token(db, appt.doctor_id, appt.schedule_id, appt.appointment_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if patient exists, if not, create simple patient record
    patient = db.query(Patient).filter(Patient.phone == appt.patient_phone).first()
    if not patient:
        patient = Patient(name=appt.patient_name, phone=appt.patient_phone)
        db.add(patient)
        db.commit()
    
    # Store appointment
    new_appt = Appointment(
        hospital_id=appt.hospital_id,
        doctor_id=appt.doctor_id,
        schedule_id=appt.schedule_id,
        patient_name=appt.patient_name,
        patient_age=appt.patient_age,
        patient_phone=appt.patient_phone,
        appointment_date=appt.appointment_date,
        token_number=token_num,
        booking_source=appt.booking_source
    )
    
    db.add(new_appt)
    db.commit()
    db.refresh(new_appt)
    
    return new_appt

@router.get("/patient/{phone}", response_model=List[AppointmentResponse])
def get_patient_appointments(phone: str, name: str, db: Session = Depends(get_db)):
    # We shouldn't strictly block simply because the Patient record isn't found exactly by phone, 
    # since we just added patient_phone to the Appointment model directly.
    # Return appointments matching the exact name AND exact phone number

    # Return appointments matching the exact name AND exact phone number
    return db.query(Appointment).options(joinedload(Appointment.doctor)) \
             .filter(Appointment.patient_name.ilike(name)) \
             .filter(Appointment.patient_phone == phone) \
             .all()

@router.delete("/public-cancel/{appointment_id}")
def public_cancel_appointment(appointment_id: int, phone: str, name: str, db: Session = Depends(get_db)):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Verify BOTH name and phone match
    if appointment.patient_name.lower() != name.lower() or appointment.patient_phone != phone:
        raise HTTPException(status_code=403, detail="Name or phone mismatch. Cannot cancel this appointment.")
        
    db.delete(appointment)
    db.commit()
    return {"message": "Appointment cancelled successfully"}

@router.post("/doctor/{doctor_id}/call-next")
def call_next_token(doctor_id: int, date: str = None, action: str = "complete", db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # 1. Verify doctor belongs to hospital
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id, Doctor.hospital_id == current_user.hospital_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if date:
        try:
            target_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = datetime.date.today()

    # 2. Find if there's a currently "calling" appointment for this doctor today
    current_calling = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status == "calling"
    ).first()

    if current_calling:
        if action == "skip":
            current_calling.status = "skipped_0" # Will become skipped_1 in the next step
        else:
            current_calling.status = "visited"

    # 3. Process existing skipped patients before calling the next one
    skipped_appts = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status.like("skipped_%")
    ).all()
    
    for appt in skipped_appts:
        try:
            skip_count = int(appt.status.split("_")[1])
            skip_count += 1
            if skip_count >= 5:
                appt.status = "pending" # Bring them back into the queue
            else:
                appt.status = f"skipped_{skip_count}"
        except ValueError:
            pass

    # 4. Find the next pending appointment (smallest token number)
    next_appt = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.appointment_date == target_date,
        Appointment.status == "pending"
    ).order_by(Appointment.token_number.asc()).first()

    if not next_appt:
        # If no pending appointments but there are skipped ones, bring them back instantly
        if skipped_appts:
            for appt in skipped_appts:
                appt.status = "pending"
            db.commit()
            
            # Re-fetch the next appointment now that they are pending
            next_appt = db.query(Appointment).filter(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == target_date,
                Appointment.status == "pending"
            ).order_by(Appointment.token_number.asc()).first()

        if not next_appt:
            db.commit() # Save the visited/skipped status if it was changed
            return {"message": "No more pending appointments", "next_token": None}

    next_appt.status = "calling"
    db.commit()
    db.refresh(next_appt)

    return {
        "message": f"Calling token {next_appt.token_number}",
        "appointment_id": next_appt.id,
        "token_number": next_appt.token_number,
        "patient_name": next_appt.patient_name
    }


@router.post("/{appointment_id}/defer")
def defer_appointment(appointment_id: int, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment or appointment.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized or appointment not found")

    if appointment.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending appointments can be deferred")

    # Find the current max token for this doctor/date to put this person at the end
    from sqlalchemy import func
    max_token = db.query(func.max(Appointment.token_number)).filter(
        Appointment.doctor_id == appointment.doctor_id,
        Appointment.appointment_date == appointment.appointment_date
    ).scalar() or 0

    appointment.token_number = max_token + 1
    db.commit()
    
    return {"message": f"Patient deferred. New token number: {appointment.token_number}"}
