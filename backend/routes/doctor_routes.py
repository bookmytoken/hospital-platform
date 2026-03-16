from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import time
from typing import List
from backend.database import get_db
from backend.models.doctor import Doctor
from backend.models.schedule import DoctorSchedule
from backend.models.staff import HospitalStaff
from backend.routes.auth_routes import get_current_user

router = APIRouter(prefix="/doctors", tags=["doctors"])

# Schemas
class DoctorCreate(BaseModel):
    hospital_id: int
    name: str
    specialization: str
    active: bool = True

class DoctorResponse(DoctorCreate):
    id: int
    class Config:
        orm_mode = True

class ScheduleCreate(BaseModel):
    doctor_id: int
    day_of_week: str
    start_time: time
    end_time: time
    max_tokens: int

class ScheduleResponse(ScheduleCreate):
    id: int
    class Config:
        orm_mode = True

# Endpoints
@router.post("/add-doctor", response_model=DoctorResponse)
def add_doctor(doctor: DoctorCreate, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # Ensure staff can only add to their own hospital
    if doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized to add doctor for this hospital")
        
    db_doctor = Doctor(**doctor.dict())
    db.add(db_doctor)
    db.commit()
    db.refresh(db_doctor)
    return db_doctor

@router.post("/add-schedule", response_model=ScheduleResponse)
def add_schedule(schedule: ScheduleCreate, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # Verify doctor exists and belongs to current user's hospital
    doctor = db.query(Doctor).filter(Doctor.id == schedule.doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Doctor not found or unauthorized")
        
    db_schedule = DoctorSchedule(**schedule.dict())
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    return db_schedule

@router.get("/", response_model=List[DoctorResponse])
def get_doctors(db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    return db.query(Doctor).filter(Doctor.hospital_id == current_user.hospital_id).all()

@router.get("/hospital/{hospital_id}", response_model=List[DoctorResponse])
def get_doctors_by_hospital(hospital_id: int, db: Session = Depends(get_db)):
    return db.query(Doctor).filter(Doctor.hospital_id == hospital_id, Doctor.active == True).all()

@router.get("/schedules/", response_model=List[ScheduleResponse])
def get_schedules(db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    # Join with Doctor to filter by hospital
    return db.query(DoctorSchedule).join(Doctor).filter(Doctor.hospital_id == current_user.hospital_id).all()

@router.get("/doctor-schedules/{doctor_id}", response_model=List[ScheduleResponse])
def get_schedules_by_doctor(doctor_id: int, db: Session = Depends(get_db)):
    # This endpoint is used by the public booking form, so it cannot require current_user
    return db.query(DoctorSchedule).filter(DoctorSchedule.doctor_id == doctor_id).all()

@router.delete("/{doctor_id}")
def delete_doctor(doctor_id: int, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized or doctor not found")
    
    # Optional: You could check if doctor has upcoming appointments here
    # and block deletion, or just let DB cascade handle it if configured.
    try:
        db.delete(doctor)
        db.commit()
        return {"message": "Doctor deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete doctor. They may have existing schedules or appointments. Try toggling status to Inactive instead.")

@router.put("/{doctor_id}/toggle-status")
def toggle_doctor_status(doctor_id: int, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized or doctor not found")
    
    doctor.active = not doctor.active
    db.commit()
    return {"message": f"Doctor status changed to {'Active' if doctor.active else 'Inactive'}"}

class ScheduleUpdate(BaseModel):
    start_time: time
    end_time: time
    max_tokens: int

@router.put("/schedules/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(schedule_id: int, schedule_update: ScheduleUpdate, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    doctor = db.query(Doctor).filter(Doctor.id == schedule.doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this schedule")
        
    schedule.start_time = schedule_update.start_time
    schedule.end_time = schedule_update.end_time
    schedule.max_tokens = schedule_update.max_tokens
    
    db.commit()
    db.refresh(schedule)
    return schedule

@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db), current_user: HospitalStaff = Depends(get_current_user)):
    schedule = db.query(DoctorSchedule).filter(DoctorSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    doctor = db.query(Doctor).filter(Doctor.id == schedule.doctor_id).first()
    if not doctor or doctor.hospital_id != current_user.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this schedule")
        
    try:
        db.delete(schedule)
        db.commit()
        return {"message": "Schedule deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete schedule. There might be existing appointments tied to it.")
