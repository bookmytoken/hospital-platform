from sqlalchemy import Column, Integer, String, DateTime, Boolean
import datetime
from backend.database import Base

class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    city = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    booking_window_days = Column(Integer, default=7)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
