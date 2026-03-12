# kali/sidecar/Dockerfile
# Sidecar API — runs on Kali Linux base so all tools are available
FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install Kali tools + Python runtime in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Recon
    nmap whois dnsrecon dnsenum theharvester \
    # Web
    nikto gobuster wfuzz whatweb sqlmap \
    # Password
    hydra john hashcat \
    # Network
    netcat-openbsd tcpdump hping3 traceroute iputils-ping \
    # Utilities
    curl wget dnsutils iproute2 procps net-tools \
    # Python
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Force install ignoring any pre-installed system packages that conflict
RUN pip3 install --no-cache-dir --ignore-installed --break-system-packages -r requirements.txt

COPY main.py .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--log-level", "info"]
