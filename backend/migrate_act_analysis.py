import sqlite3
from pathlib import Path

db_path = Path("data/database.sqlite")

if not db_path.exists():
    print(f"Database not found at {db_path}")
    exit(1)

print(f"Adding act_analysis column to projects table at {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE projects ADD COLUMN act_analysis JSON")
    print("Success: Added act_analysis column to projects table")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e).lower():
        print("Skipped: act_analysis column already exists")
    else:
        print(f"Error: {e}")

conn.commit()
conn.close()
print("Migration completed.")
