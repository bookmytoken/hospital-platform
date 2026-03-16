from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.models.appointment import Appointment
from backend.models.schedule import DoctorSchedule
import datetime

def get_next_token(db: Session, doctor_id: int, schedule_id: int, appointment_date: datetime.date) -> int:
    """
    Checks if a token can be assigned for the given schedule on the given date.
    Returns the assigned token number or raises a ValueError if max_tokens is reached.
    """
    schedule = db.query(DoctorSchedule).filter(
        DoctorSchedule.id == schedule_id,
        DoctorSchedule.doctor_id == doctor_id
    ).first()
    
    if not schedule:
        raise ValueError("Schedule not found for the given doctor")

    # Count existing appointments to check limit
    current_count = db.query(Appointment).filter(
        Appointment.schedule_id == schedule_id,
        Appointment.appointment_date == appointment_date
    ).count()

    if current_count >= schedule.max_tokens:
        raise ValueError("Doctor fully booked")

    # Get the highest token number for that day
    max_token_result = db.query(func.max(Appointment.token_number)).filter(
        Appointment.schedule_id == schedule_id,
        Appointment.appointment_date == appointment_date
    ).scalar()

    next_token = 1 if max_token_result is None else max_token_result + 1
    return next_token
