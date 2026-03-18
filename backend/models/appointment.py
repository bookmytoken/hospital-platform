from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import datetime
from backend.database import Base

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    doctor_id = Column(Integer, ForeignKey("doctors.id"))
    schedule_id = Column(Integer, ForeignKey("doctor_schedules.id"))
    patient_name = Column(String, nullable=False)
    patient_age = Column(Integer, nullable=True)
    patient_phone = Column(String, nullable=True) # Making it nullable true first so we don't crash old rows
    appointment_date = Column(Date, nullable=False)
    token_number = Column(Integer, nullable=False)
    booking_source = Column(String, nullable=False) # call, whatsapp, dashboard
    status = Column(String, default="pending") # pending, visited, cancelled
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    hospital = relationship("Hospital")
    doctor = relationship("Doctor")
    schedule = relationship("DoctorSchedule")

    @property
    def doctor_name(self):
        return self.doctor.name if self.doctor else "Unknown"
