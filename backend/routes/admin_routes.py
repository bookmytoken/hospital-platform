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

    class Config:
        from_attributes = True

# --- Endpoints ---

@router.get("/stats", response_model=StatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    hospitals = db.query(Hospital).count()
    doctors = db.query(Doctor).count()
    staff = db.query(HospitalStaff).filter(HospitalStaff.role != "super_admin").count()
    return {
        "total_hospitals": hospitals,
        "total_doctors": doctors,
        "total_staff": staff
    }

class HospitalCreateAdmin(BaseModel):
    name: str
    city: str
    phone_number: str

class HospitalUpdateAdmin(BaseModel):
    name: str
    city: str
    phone_number: str

class HospitalResponseAdmin(BaseModel):
    id: int
    name: str
    city: str
    phone_number: str
    
    class Config:
        from_attributes = True

@router.post("/hospitals", response_model=HospitalResponseAdmin)
def create_hospital(hosp_data: HospitalCreateAdmin, db: Session = Depends(get_db), current_admin: HospitalStaff = Depends(get_super_admin)):
    new_hospital = Hospital(
        name=hosp_data.name,
        city=hosp_data.city,
        phone_number=hosp_data.phone_number
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
        staff_data = {
            "id": staff.id,
            "hospital_id": staff.hospital_id,
            "hospital_name": staff.hospital.name if staff.hospital else None,
            "name": staff.name,
            "email": staff.email,
            "role": staff.role
        }
        result.append(staff_data)
        
    return result

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
