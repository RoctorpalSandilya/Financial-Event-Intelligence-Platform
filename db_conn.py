import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def create_db_if_not_exists():
    conn = psycopg2.connect(
        host=os.getenv("host"),
        database=os.getenv("database"),
        user=os.getenv("user"),
        password=os.getenv("password"),
        port=os.getenv("port")
        )
    conn.autocommit = True
    cursor = conn.cursor()
    db_name = os.getenv("mydb").lower()

    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
    exists = cursor.fetchone()

    if not exists:
        cursor.execute(f"CREATE DATABASE {db_name}")
        print(f"Database '{db_name}' created successfully.")
    else:
        print(f"Database '{db_name}' already exists.")
    return conn, cursor
