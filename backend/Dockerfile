FROM python:3.11-slim

WORKDIR /app

# Install system deps for Prophet, pandas, etc.
RUN apt-get update && apt-get install -y \
    gcc g++ libpq-dev libssl-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create temp upload dir
RUN mkdir -p /tmp/uploads && chmod 777 /tmp/uploads

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
