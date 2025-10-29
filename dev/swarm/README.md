# Docker Swarm 3-Node Development Setup

This directory contains the Docker-in-Docker (DinD) configuration for simulating a 3-node Docker Swarm cluster locally.

## Files in This Directory

- **`docker-compose.nodes.yml`** - Defines the 3 DinD nodes (hydra, chimera, cerberus) and NFS server
- **`init-swarm.sh`** - Initializes the swarm and configures node labels
- **`cleanup-swarm.sh`** - Tears down the swarm and optionally removes volumes

## Quick Start

### From the `dev` directory:

```bash
# Start everything (nodes + swarm initialization)
make swarm-up

# Check status
make swarm-status

# Stop everything
make swarm-down
```

### Manual Usage

```bash
# 1. Start the nodes
docker compose -f docker-compose.nodes.yml up -d

# 2. Wait for nodes to be ready (30 seconds)
sleep 30

# 3. Initialize swarm
./init-swarm.sh

# 4. Check status
docker exec hydra-node docker node ls

# 5. Clean up
./cleanup-swarm.sh
```

## What Gets Created

### Nodes
- **hydra-node** (172.30.0.10) - Swarm manager
- **chimera-node** (172.30.0.20) - Worker for Jupyter containers
- **cerberus-node** (172.30.0.30) - Worker for Ollama/OpenWebUI

### NFS Server
- **nfs-server** (172.30.0.5) - Shared storage for student volumes

### Network
- **swarm-net** (172.30.0.0/16) - Internal network for node communication

## Next Steps

After the swarm is initialized, you can:

1. **Deploy stacks** to the swarm (Phase 3)
2. **Test failover** by draining nodes
3. **Monitor services** with `make swarm-status`

See [../SWARM.md](../SWARM.md) for complete documentation.
