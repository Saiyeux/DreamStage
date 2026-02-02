
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "data" / "database.sqlite"

if not db_path.exists():
    print(f"Database not found at {db_path}")
    exit(0)

print(f"Migrating database at {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check and add columns for characters
columns_to_add = [
    ("characters", "is_finalized", "BOOLEAN DEFAULT 0"),
    ("characters", "finalized_metadata", "JSON"),
    ("scenes", "is_finalized", "BOOLEAN DEFAULT 0"),
    ("scenes", "finalized_metadata", "JSON"),
]

for table, col, type_def in columns_to_add:
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {type_def}")
        print(f"Success: Added {col} to {table}")
    except sqlite3.OperationalError as e:
        print(f"Skipped: {col} in {table} ({e})")

conn.commit()
conn.close()
print("Migration completed.")
