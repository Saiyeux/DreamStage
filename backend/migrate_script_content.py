
import sqlite3
from pathlib import Path

# Fix path to point to backend/data/database.sqlite explicitly if needed, 
# or use relative path assuming script is run from backend root.
# Based on migrate_v2.py, it expects to be in backend/
db_path = Path(__file__).parent / "data" / "database.sqlite"

if not db_path.exists():
    print(f"Database not found at {db_path}")
    exit(0)

print(f"Migrating database at {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check and add columns
columns_to_add = [
    ("scenes", "script_content", "TEXT"),
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
