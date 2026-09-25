FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN mkdir -p /data/videos /voices && python -m piper.download_voices --data-dir /voices en_US-kristin-medium
ENV SIMI_VIDEO_DIR=/data/videos
ENV SIMI_PIPER_MODEL=/voices/en_US-kristin-medium.onnx
EXPOSE 8787
CMD ["sh", "-c", "gunicorn --workers 1 --threads 4 --bind 0.0.0.0:${PORT:-8787} --timeout 120 app:app"]
