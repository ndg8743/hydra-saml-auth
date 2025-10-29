FROM alpine:3.18

# Install NFS server and utilities
RUN apk add --no-cache \
    nfs-utils \
    bash \
    && mkdir -p /exports/student-volumes \
    && chmod 777 /exports/student-volumes

# Copy NFS exports configuration
COPY exports /etc/exports

# Copy and set up entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 2049 111/tcp 111/udp

CMD ["/entrypoint.sh"]
