# Docker Swarm Multi-Node Development Environment

This directory contains a **Docker-in-Docker (DinD)** setup that simulates a 3-node Docker Swarm cluster on your local machine. This allows you to develop and test the multi-node deployment strategy without needing actual hardware.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Desktop (Host)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  hydra-node  │  │chimera-node  │  │cerberus-node │       │
│  │  (Manager)   │  │  (Worker)    │  │  (Worker)    │       │
│  │              │  │              │  │              │       │
│  │ 172.30.0.10  │  │ 172.30.0.20  │  │ 172.30.0.30  │       │
│  │              │  │              │  │              │       │
│  │ Labels:      │  │ Labels:      │  │ Labels:      │       │
│  │ role=manager │  │ role=worker  │  │ role=worker  │       │
│  │ storage=nfs  │  │ gpu=true     │  │ gpu=true     │       │
│  │              │  │ workload=    │  │ workload=    │       │
│  │              │  │  jupyter     │  │  ollama      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
│                  ┌────────▼────────┐                         │
│                  │  Overlay Net    │                         │
│                  │  172.30.0.0/16  │                         │
│                  └─────────────────┘                         │
│                                                               │
│  ┌──────────────┐                                            │
│  │ nfs-server   │  (Shared student volumes)                  │
│  │ 172.30.0.5   │                                            │
│  └──────────────┘                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Node Roles

### Hydra Node (Manager)
- **Role**: Swarm manager
- **IP**: 172.30.0.10
- **Responsibilities**:
  - Manage swarm orchestration
  - Run core services (Hydra auth, Traefik, SAML IdP)
  - Store swarm state
- **Labels**: `role=manager`, `storage=nfs`

### Chimera Node (Worker)
- **Role**: Worker with GPU capability
- **IP**: 172.30.0.20
- **Responsibilities**:
  - Run student Jupyter containers
  - GPU workloads (simulated in dev)
- **Labels**: `role=worker`, `gpu=true`, `workload=jupyter`

### Cerberus Node (Worker)
- **Role**: Worker with GPU capability
- **IP**: 172.30.0.30
- **Responsibilities**:
  - Run Ollama and OpenWebUI services
  - GPU workloads (simulated in dev)
- **Labels**: `role=worker`, `gpu=true`, `workload=ollama`

### NFS Server
- **IP**: 172.30.0.5
- **Purpose**: Shared storage for student volumes
- **Export**: `/exports/student-volumes`

## Quick Start

### 1. Start the Multi-Node Environment

```bash
cd dev
make swarm-up
```

This will:
1. Start 3 DinD containers (hydra, chimera, cerberus)
2. Start the NFS server
3. Initialize Docker Swarm on hydra-node
4. Join chimera and cerberus as workers
5. Label all nodes appropriately

### 2. Check Swarm Status

```bash
make swarm-status
```

This displays:
- Node list and status
- Node labels
- Running services
- Service placement
- NFS server status
- Resource usage

### 3. Deploy Services (Coming in Phase 3)

```bash
# Deploy core services stack
make deploy-stack STACK=core FILE=/path/to/stacks/core-services.yml

# Deploy GPU services stack
make deploy-stack STACK=gpu FILE=/path/to/stacks/gpu-services.yml
```

### 4. Stop and Clean Up

```bash
# Stop swarm but keep volumes
make swarm-down

# Stop swarm and remove all volumes
make swarm-clean
```

## Available Commands

### Basic Operations

| Command | Description |
|---------|-------------|
| `make swarm-up` | Start nodes and initialize swarm |
| `make swarm-down` | Stop swarm and nodes |
| `make swarm-status` | Show comprehensive swarm status |
| `make swarm-clean` | Clean up swarm and remove volumes |

### Node Management

| Command | Description |
|---------|-------------|
| `make nodes-up` | Start DinD nodes only |
| `make nodes-down` | Stop DinD nodes |
| `make nodes-logs` | View node logs |
| `make exec-hydra` | Shell into hydra-node |
| `make exec-chimera` | Shell into chimera-node |
| `make exec-cerberus` | Shell into cerberus-node |

### Testing & Debugging

| Command | Description |
|---------|-------------|
| `make test-failure NODE=chimera` | Simulate node failure |
| `make restore-node NODE=chimera` | Restore a drained node |
| `make nfs-status` | Check NFS server status |

## Manual Operations

### Run Commands on Manager Node

All swarm management commands should be run on the manager node:

```bash
# Via make
make exec-hydra

# Or directly
docker exec -it hydra-node sh
```

Then inside the node:

```bash
# View nodes
docker node ls

# View services
docker service ls

# View service tasks
docker service ps <service-name>

# View service logs
docker service logs <service-name>

# Scale a service
docker service scale <service-name>=3

# Update a service
docker service update <service-name> --image new-image:tag
```

### Access Worker Nodes

```bash
# Chimera node
make exec-chimera
# Or: docker exec -it chimera-node sh

# Cerberus node
make exec-cerberus
# Or: docker exec -it cerberus-node sh
```

## Testing Node Failure and Resilience

### Simulate Node Failure

Drain a node to simulate failure:

```bash
# Drain chimera node
make test-failure NODE=chimera

# Watch services redistribute
make swarm-status
```

Services running on the drained node will automatically move to other available nodes based on placement constraints.

### Restore a Node

```bash
make restore-node NODE=chimera
```

### Manual Failure Testing

```bash
# Stop a node completely
docker stop chimera-node

# Watch swarm detect failure and redistribute
make swarm-status

# Restart the node
docker start chimera-node

# Node will automatically rejoin
```

## Service Placement Strategy

Services use placement constraints to control where they run:

### Core Services (Hydra Only)
```yaml
deploy:
  placement:
    constraints:
      - node.labels.role == manager
```

### GPU Services (Chimera or Cerberus)
```yaml
deploy:
  placement:
    constraints:
      - node.labels.gpu == true
    preferences:
      - spread: node.labels.workload
```

### Student Jupyter (Prefer Chimera)
```yaml
deploy:
  placement:
    constraints:
      - node.labels.workload == jupyter
```

### Ollama/OpenWebUI (Prefer Cerberus)
```yaml
deploy:
  placement:
    constraints:
      - node.labels.workload == ollama
```

## NFS Shared Storage

### Accessing NFS Exports

```bash
# Check NFS exports
make nfs-status

# Or manually
docker exec nfs-server exportfs -v
```

### Creating NFS Volumes in Swarm

```bash
docker exec hydra-node docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=172.30.0.5,rw,nolock \
  --opt device=:/exports/student-volumes/student1 \
  student1-volume
```

## Networking

### Overlay Networks

The swarm uses overlay networks for multi-host communication:

- **hydra_public**: Public-facing services (with Traefik)
- **hydra_students_net**: Student containers (isolated)

Services on different nodes can communicate using service names.

### Accessing Services from Host

Services can be accessed via published ports on any node:

```bash
# Access via hydra node
curl http://localhost:6969

# Or via service VIP (from inside any node)
docker exec hydra-node curl http://hydra-saml-auth:6969
```

## Troubleshooting

### Nodes Not Starting

```bash
# Check if containers are running
docker ps -a | grep node

# Check logs
make nodes-logs

# Or specific node
docker logs hydra-node
```

### Swarm Not Initializing

```bash
# Check if Docker daemon is ready in nodes
docker exec hydra-node docker info

# Manually initialize if needed
docker exec hydra-node docker swarm init --advertise-addr 172.30.0.10
```

### Services Not Deploying

```bash
# Check service status
docker exec hydra-node docker service ps <service-name> --no-trunc

# Check service logs
docker exec hydra-node docker service logs <service-name>

# Inspect service
docker exec hydra-node docker service inspect <service-name>
```

### NFS Issues

```bash
# Check if NFS server is running
docker ps | grep nfs-server

# Check NFS logs
docker logs nfs-server

# Test NFS mount from a node
docker exec hydra-node mount -t nfs 172.30.0.5:/exports/student-volumes /mnt/test
```

### Network Issues

```bash
# Check overlay networks
docker exec hydra-node docker network ls

# Inspect network
docker exec hydra-node docker network inspect <network-name>

# Test connectivity between nodes
docker exec chimera-node ping 172.30.0.10
```

## Development Workflow

### Typical Development Session

1. **Start environment**
   ```bash
   make swarm-up
   ```

2. **Deploy your stacks**
   ```bash
   # Deploy core services
   make deploy-stack STACK=core FILE=stacks/core-services.yml

   # Deploy GPU services
   make deploy-stack STACK=gpu FILE=stacks/gpu-services.yml
   ```

3. **Make code changes**
   - Edit your application code
   - Rebuild services as needed

4. **Update running services**
   ```bash
   # Rebuild and update a service
   docker exec hydra-node docker service update \
     --image hydra-saml-auth:latest \
     --force \
     core_hydra-saml-auth
   ```

5. **Test failure scenarios**
   ```bash
   make test-failure NODE=chimera
   make swarm-status
   make restore-node NODE=chimera
   ```

6. **View logs**
   ```bash
   docker exec hydra-node docker service logs core_hydra-saml-auth -f
   ```

7. **Clean up**
   ```bash
   make swarm-down
   ```

## Next Steps

This setup provides the foundation for Phase 1-2 of the Swarm migration:

- ✅ Multi-node simulation
- ✅ NFS server
- ✅ Swarm initialization
- ✅ Node labeling

**Coming Next** (Phase 3-4):
- Convert services to stack files
- Implement placement constraints
- Set up overlay networks
- Configure Traefik for Swarm mode

See the main [TODO list](../setup-dev.sh) for complete migration roadmap.

## Resources

- [Docker Swarm Documentation](https://docs.docker.com/engine/swarm/)
- [Docker Service Placement](https://docs.docker.com/engine/swarm/services/#control-service-placement)
- [Overlay Networks](https://docs.docker.com/network/overlay/)
- [Docker NFS Volumes](https://docs.docker.com/storage/volumes/#use-a-volume-driver)

## Differences from Production

This DinD setup differs from production deployment:

| Aspect | Development (DinD) | Production (Hardware) |
|--------|-------------------|----------------------|
| Nodes | Docker containers | Physical/VM servers |
| GPU | Simulated (labels) | Actual NVIDIA GPUs |
| NFS | Alpine container | Dedicated NFS server |
| Network | Bridge + Overlay | Physical network + Overlay |
| Performance | Slower (nested) | Native performance |
| Persistence | Docker volumes | Dedicated storage |

Despite these differences, the DinD setup accurately simulates swarm behavior, service placement, failover, and network topology for development and testing.
