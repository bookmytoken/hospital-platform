from sqlalchemy import Column, Integer, String, Time, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class DoctorSchedule(Base):
    __tablename__ = "doctor_schedules"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"))
    day_of_week = Column(String, nullable=False) # e.g. "Monday"
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    max_tokens = Column(Integer, nullable=False)

    doctor = relationship("Doctor")
