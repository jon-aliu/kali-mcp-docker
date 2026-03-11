# kali/Dockerfile
# Base image: Kali Linux rolling release
FROM kalilinux/kali-rolling:latest

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install all tools in a single layer
# to minimise image size and layer count
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Recon tools
    nmap \
    whois \
    dnsrecon \
    dnsenum \
    theharvester \
    # Web tools
    nikto \
    gobuster \
    wfuzz \
    whatweb \
    sqlmap \
    # Exploitation
    metasploit-framework \
    exploitdb \
    # Password tools
    hydra \
    john \
    hashcat \
    crunch \
    # Network tools
    netcat-openbsd \
    tcpdump \
    wireshark-common \
    hping3 \
    # Utilities
    curl \
    wget \
    python3 \
    python3-pip \
    git \
    vim \
    bash \
    jq \
    # Clean up apt cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user with UID 1001 for security
RUN groupadd --gid 1001 kaliuser && \
    useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash kaliuser

# Create the results volume directory and set ownership
RUN mkdir -p /home/kaliuser/results && \
    chown -R kaliuser:kaliuser /home/kaliuser

# Switch to non-root user
USER kaliuser

# Set working directory
WORKDIR /home/kaliuser

# Expose the results directory as a volume
VOLUME ["/home/kaliuser/results"]

# Health check: verify the kali sidecar API is running and healthy
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://kali-sidecar:5000/health || exit 1

# Default command: keep container alive for sidecar to interact with
CMD ["tail", "-f", "/dev/null"]
