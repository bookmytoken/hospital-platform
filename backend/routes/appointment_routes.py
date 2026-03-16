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
    patient_phone: str
    appointment_date: datetime.date
    token_number: int
    booking_source: str

    class Config:
        from_attributes = True

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
        patient_phone=appt.patient_phone,
        appointment_date=appt.appointment_date,
        token_number=token_num,
        booking_source="website" # Enforce online source
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
             .filter(Appointment.patient_name.ilike(f"%{name}%")) \
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
