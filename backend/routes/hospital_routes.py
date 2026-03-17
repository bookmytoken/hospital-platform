from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from backend.database import get_db
from backend.models.hospital import Hospital

router = APIRouter(prefix="/hospitals", tags=["hospitals"])

class HospitalCreate(BaseModel):
    name: str
    city: str
    phone_number: str
    booking_window_days: int = 7

class HospitalResponse(HospitalCreate):
    id: int

    class Config:
        from_attributes = True

@router.post("/add-hospital", response_model=HospitalResponse)
def add_hospital(hospital: HospitalCreate, db: Session = Depends(get_db)):
    db_hospital = Hospital(
        name=hospital.name,
        city=hospital.city,
        phone_number=hospital.phone_number,
        booking_window_days=hospital.booking_window_days
    )
    db.add(db_hospital)
    db.commit()
    db.refresh(db_hospital)
    return db_hospital

@router.get("/", response_model=List[HospitalResponse])
def get_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).all()

@router.get("/{hospital_id}", response_model=HospitalResponse)
def get_hospital(hospital_id: int, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return hospital
