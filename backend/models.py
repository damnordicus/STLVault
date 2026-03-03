from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import BigInteger, Column, Integer, String, Text

from database import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    display_name = Column(String, nullable=True)


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    parentId = Column(String, nullable=True)


class STLModel(Base):
    __tablename__ = "models"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    folderId = Column(String, nullable=False)
    url = Column(String, nullable=False)
    size = Column(Integer)
    dateAdded = Column(BigInteger)
    tags = Column(Text)
    description = Column(Text)
    thumbnail = Column(Text)
    uploaded_by = Column(String, nullable=True)
    status = Column(String, default="pending")
    denial_reason = Column(Text, nullable=True)
