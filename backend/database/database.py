"""
Database setup using SQLAlchemy with SQLite.
Keeps database connection and session management separate from business logic.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

# SQLite database file path
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "nebula_mail.db")
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.abspath(DB_PATH)}"

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL debugging
    connect_args={"check_same_thread": False},
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        from database.models import User, EmailCache, AssistantMessage  # noqa
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency injection for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
