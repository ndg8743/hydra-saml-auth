#!/bin/bash
set -e

echo "Starting NFS server..."

# Start rpcbind (required for NFS)
rpcbind

# Create NFS state directory
mkdir -p /var/lib/nfs

# Start NFS server (all versions for compatibility)
rpc.nfsd 8

# Start statd
rpc.statd --no-notify

# Start mountd
rpc.mountd --foreground --no-nfs-version 4 &

# Give services time to start
sleep 2

# Export filesystems
exportfs -ra

# Show current exports
echo "NFS Server started with the following exports:"
exportfs -v

# Keep container running
echo "NFS server is ready for connections on port 2049"
tail -f /dev/null
