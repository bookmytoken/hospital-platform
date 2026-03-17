from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from backend.database import get_db
from backend.models.staff import HospitalStaff
from backend.models.hospital import Hospital
from backend.models.doctor import Doctor
from backend.models.patient import Patient
from backend.models.appointment import Appointment
from backend.models.schedule import DoctorSchedule
from backend.routes.auth_routes import get_current_user
from backend.services.auth_service import hash_password, verify_password
from typing import Optional

router = APIRouter(prefix="/admin", tags=["super_admin"])

# --- Security Dependency ---
def get_super_admin(current_user: HospitalStaff = Depends(get_current_user)):
    """Ensures that the current user has the 'super_admin' role."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access restricted super admin resources."
        )
    return current_user

# --- Schemas ---
class StatsResponse(BaseModel):
    total_hospitals: int
    total_doctors: int
    total_staff: int
    total_appointments_today: int
    total_appointments: int
    most_active_hospital: str

class StaffCreateAdmin(BaseModel):
    hospital_id: int
    name: str
    email: str
    password: str
    role: str

class StaffResponse(BaseModel):
    id: int
    hospital_id: Optional[int]
    hospital_name: Optional[str] = "Super Admin"
    name: str
    email: str
    role: str
    is_active: bool = True

    class Config:
        from_attributes = True

# --- Endpoints ---

@router.get("/stats", response_model=StatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    import datetime
    hospitals = db.query(Hospital).count()
    doctors = db.query(Doctor).count()
    staff = db.query(HospitalStaff).filter(HospitalStaff.role != "super_admin").count()
    total_appointments = db.query(Appointment).count()
    today = datetime.date.today()
    today_appointments = db.query(Appointment).filter(Appointment.appointment_date == today).count()

    # Most active hospital by appointment count
    from sqlalchemy import func
    result = db.query(Appointment.hospital_id, func.count(Appointment.id).label('cnt')) \
               .group_by(Appointment.hospital_id).order_by(func.count(Appointment.id).desc()).first()
    most_active = "—"
    if result:
        h = db.query(Hospital).filter(Hospital.id == result.hospital_id).first()
        if h:
            most_active = h.name

    return {
        "total_hospitals": hospitals,
        "total_doctors": doctors,
        "total_staff": staff,
        "total_appointments_today": today_appointments,
        "total_appointments": total_appointments,
        "most_active_hospital": most_active
    }

class HospitalCreateAdmin(BaseModel):
    name: str
    city: str
    phone_number: str
    booking_window_days: int = 7

class HospitalUpdateAdmin(BaseModel):
    name: str
    city: str
    phone_number: str
    booking_window_days: int

class HospitalResponseAdmin(BaseModel):
    id: int
    name: str
    city: str
    phone_number: str
    booking_window_days: int
    is_active: bool = True
    doctor_count: int = 0

    class Config:
        from_attributes = True

@router.get("/hospitals", response_model=List[HospitalResponseAdmin])
def list_hospitals(db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    hospitals = db.query(Hospital).all()
    result = []
    for h in hospitals:
        doc_count = db.query(Doctor).filter(Doctor.hospital_id == h.id).count()
        result.append({
            "id": h.id, "name": h.name, "city": h.city,
            "phone_number": h.phone_number,
            "booking_window_days": h.booking_window_days,
            "is_active": h.is_active,
            "doctor_count": doc_count
        })
    return result

@router.put("/hospitals/{hospital_id}/toggle-status")
def toggle_hospital_status(hospital_id: int, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    hospital.is_active = not hospital.is_active
    # Cascade: deactivate all staff when hospital is deactivated
    if not hospital.is_active:
        db.query(HospitalStaff).filter(
            HospitalStaff.hospital_id == hospital_id,
            HospitalStaff.role != "super_admin"
        ).update({"is_active": False})
    db.commit()
    state = "Active" if hospital.is_active else "Inactive"
    return {"message": f"Hospital status changed to {state}", "is_active": hospital.is_active}

@router.post("/hospitals", response_model=HospitalResponseAdmin)
def create_hospital(hosp_data: HospitalCreateAdmin, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    new_hospital = Hospital(
        name=hosp_data.name,
        city=hosp_data.city,
        phone_number=hosp_data.phone_number,
        booking_window_days=hosp_data.booking_window_days
    )
    db.add(new_hospital)
    db.commit()
    db.refresh(new_hospital)
    return new_hospital

@router.get("/hospitals/{hospital_id}")
def get_hospital_details(hospital_id: int, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    doctors = db.query(Doctor).filter(Doctor.hospital_id == hospital_id).all()
    appointments = db.query(Appointment).filter(Appointment.hospital_id == hospital_id).all()
    staff = db.query(HospitalStaff).filter(HospitalStaff.hospital_id == hospital_id).all()
    
    return {
        "hospital": {"id": hospital.id, "name": hospital.name, "city": hospital.city, "phone_number": hospital.phone_number},
        "doctors": [{"id": d.id, "name": d.name, "specialization": d.specialization} for d in doctors],
        "appointments": [{"id": a.id, "patient_name": a.patient_name, "date": a.appointment_date, "doctor": a.doctor_name, "token": a.token_number} for a in appointments],
        "staff": [{"id": s.id, "name": s.name, "role": s.role, "email": s.email} for s in staff]
    }

@router.put("/hospitals/{hospital_id}", response_model=HospitalResponseAdmin)
def update_hospital(hospital_id: int, hosp_data: HospitalUpdateAdmin, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    hospital.name = hosp_data.name
    hospital.city = hosp_data.city
    hospital.phone_number = hosp_data.phone_number
    hospital.booking_window_days = hosp_data.booking_window_days
    
    db.commit()
    db.refresh(hospital)
    return hospital

class DeleteHospitalRequest(BaseModel):
    password: str

@router.delete("/hospitals/{hospital_id}")
def delete_hospital(hospital_id: int, payload: DeleteHospitalRequest, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    if not verify_password(payload.password, current_admin.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect Super Admin password. Deletion aborted.")
        
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    try:
        # Manually Cascade Delete: Appointments -> Schedules -> Doctors -> Staff -> Hospital
        db.query(Appointment).filter(Appointment.hospital_id == hospital_id).delete(synchronize_session=False)
        
        # Schedules are linked to Doctors, so we need to delete the schedules of all doctors in this hospital
        doctors = db.query(Doctor).filter(Doctor.hospital_id == hospital_id).all()
        for doctor in doctors:
            db.query(DoctorSchedule).filter(DoctorSchedule.doctor_id == doctor.id).delete(synchronize_session=False)
            
        db.query(Doctor).filter(Doctor.hospital_id == hospital_id).delete(synchronize_session=False)
        db.query(HospitalStaff).filter(HospitalStaff.hospital_id == hospital_id).delete(synchronize_session=False)
        
        db.delete(hospital)
        db.commit()
        return {"message": f"Hospital {hospital_id} and all its associated records deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Cannot delete hospital: {str(e)}")

@router.post("/staff", response_model=StaffResponse)
def create_staff(staff_data: StaffCreateAdmin, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    # Verify hospital exists
    hospital = db.query(Hospital).filter(Hospital.id == staff_data.hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
        
    # Check if email is already registered anywhere
    existing = db.query(HospitalStaff).filter(HospitalStaff.email == staff_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")
        
    new_staff = HospitalStaff(
        hospital_id=staff_data.hospital_id,
        name=staff_data.name,
        email=staff_data.email,
        password_hash=hash_password(staff_data.password),
        role=staff_data.role
    )
    
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)
    return new_staff

@router.get("/staff", response_model=List[StaffResponse])
def get_all_staff(db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    # Filter out super_admins so the admin table only shows regular staff
    staff_list = db.query(HospitalStaff).filter(HospitalStaff.role != "super_admin").all()
    
    # Map the ORM relationship data over so Pydantic can read it
    result = []
    for staff in staff_list:
        result.append({
            "id": staff.id,
            "hospital_id": staff.hospital_id,
            "hospital_name": staff.hospital.name if staff.hospital else None,
            "name": staff.name,
            "email": staff.email,
            "role": staff.role,
            "is_active": staff.is_active
        })
        
    return result

@router.put("/staff/{staff_id}/toggle-status")
def toggle_staff_status(staff_id: int, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    staff = db.query(HospitalStaff).filter(HospitalStaff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if staff.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    staff.is_active = not staff.is_active
    db.commit()
    state = "Active" if staff.is_active else "Inactive"
    return {"message": f"Staff status changed to {state}", "is_active": staff.is_active}

@router.delete("/staff/{staff_id}")
def delete_staff(staff_id: int, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    staff = db.query(HospitalStaff).filter(HospitalStaff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
        
    # Prevent a super admin from accidentally deleting themselves
    if staff.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
    db.delete(staff)
    db.commit()
    return {"message": "Staff account deleted successfully"}

class StaffUpdateAdmin(BaseModel):
    hospital_id: int
    name: str
    email: str
    role: str
    password: Optional[str] = None

@router.put("/staff/{staff_id}", response_model=StaffResponse)
def update_staff(staff_id: int, staff_data: StaffUpdateAdmin, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    staff = db.query(HospitalStaff).filter(HospitalStaff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
        
    # verify hospital
    hospital = db.query(Hospital).filter(Hospital.id == staff_data.hospital_id).first()
    if not hospital:
         raise HTTPException(status_code=404, detail="Hospital not found")
         
    # verify email not taken by someone else
    existing = db.query(HospitalStaff).filter(HospitalStaff.email == staff_data.email, HospitalStaff.id != staff_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already used by another account")
        
    staff.hospital_id = staff_data.hospital_id
    staff.name = staff_data.name
    staff.email = staff_data.email
    staff.role = staff_data.role
    
    if staff_data.password:
        staff.password_hash = hash_password(staff_data.password)
        
    db.commit()
    db.refresh(staff)
    return staff
