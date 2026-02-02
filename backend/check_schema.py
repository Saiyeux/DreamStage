import sqlite3
import os

db_path = "data/database.sqlite"
print(f"Checking database at: {os.path.abspath(db_path)}")

if not os.path.exists(db_path):
    print("Database file not found!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("PRAGMA table_info(projects)")
    columns = cursor.fetchall()
    print("Columns in 'projects' table:")
    for col in columns:
        print(col)
        
    print("-" * 20)
    
    cursor.execute("PRAGMA table_info(scenes)")
    columns = cursor.fetchall()
    print("Columns in 'scenes' table:")
    for col in columns:
        print(col)

except Exception as e:
    print(f"Error: {e}")

conn.close()
