# Docker Swarm Stack Files

This directory contains Docker Swarm stack definitions for deploying Hydra SAML Auth in a multi-node cluster.

## Stack Files

### [core-services.yml](core-services.yml)
**Runs on: hydra-node (manager)**

Core infrastructure services that must run on the manager node:
- **traefik** - Reverse proxy with Swarm mode enabled
- **hydra-saml-auth** - Main authentication service (needs Docker socket access)
- **openwebui-middleman** - Database API for OpenWebUI
- **mock-saml-idp** - SAML identity provider (dev only)
- **n8n** - Workflow automation

**Placement:** All services constrained to `node.role == manager`

### [gpu-services.yml](gpu-services.yml)
**Runs on: chimera-node or cerberus-node (GPU workers)**

GPU-intensive services that run on worker nodes:
- **ollama** - AI model runtime (prefers cerberus)
- **open-webui** - AI chat interface

**Placement:** Constrained to `node.labels.gpu == true`

### [student-template.yml](student-template.yml)
**Template for dynamic student containers**

This is a documentation/template file, not deployed directly. Student containers are created dynamically by the hydra-saml-auth service using the Docker Swarm API.

**Features:**
- Jupyter notebook environments
- NFS-backed persistent storage
- Resource limits per student
- Automatic Traefik routing
- Placement on chimera node (jupyter workload)

## Networks

### hydra_public (overlay)
- Public-facing services
- Attached to Traefik
- Allows internet access

### hydra_students (overlay)
- Student container isolation
- Attached to Traefik for routing
- Students can access internet but isolated from each other

## Volumes

### Local Volumes
- `openwebui-data` - OpenWebUI database (shared via middleman)
- `ollama-data` - Ollama models
- `jwt-keys` - JWT signing keys
- `n8n-data` - n8n workflows

### NFS Volumes (Students)
Created dynamically for each student/project:
```bash
docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=172.30.0.5,rw,nolock \
  --opt device=:/exports/student-volumes/${username}/${project} \
  student-${username}-${project}
```

## Deployment

### Quick Start

```bash
# 1. Start swarm
cd dev
make swarm-up

# 2. Build images
make build-swarm-images

# 3. Deploy all stacks
make deploy-all-stacks

# 4. Check status
make swarm-status
```

### Manual Deployment

```bash
# Build images
./scripts/build-images.sh

# Deploy stacks individually
docker exec hydra-node docker stack deploy -c stacks/core-services.yml core
docker exec hydra-node docker stack deploy -c stacks/gpu-services.yml gpu

# View services
docker exec hydra-node docker service ls

# View service logs
docker exec hydra-node docker service logs core_hydra-saml-auth -f
```

### Updating Services

```bash
# Update a service image
docker exec hydra-node docker service update \
  --image hydra-saml-auth:latest \
  --force \
  core_hydra-saml-auth

# Scale a service
docker exec hydra-node docker service scale core_traefik=2

# Rollback an update
docker exec hydra-node docker service rollback core_hydra-saml-auth
```

## Service Placement Strategy

| Service | Nodes | Reason |
|---------|-------|--------|
| traefik | hydra (manager) | Needs Docker socket access |
| hydra-saml-auth | hydra (manager) | Creates containers via Docker API |
| openwebui-middleman | hydra (manager) | Access to OpenWebUI database |
| mock-saml-idp | hydra (manager) | Low resource, always available |
| n8n | hydra (manager) | Workflow orchestration |
| ollama | cerberus (GPU worker) | GPU workload |
| open-webui | cerberus (GPU worker) | Co-located with ollama |
| student-jupyter | chimera (jupyter worker) | Student workloads, failover to cerberus |

## Failover Behavior

### Node Failure Scenarios

**Chimera fails:**
- Student Jupyter containers redistribute to cerberus (if available)
- Services respect `workload=jupyter` label preference

**Cerberus fails:**
- Ollama and OpenWebUI stay on cerberus (only node with `workload=ollama`)
- If cerberus is permanently down, manually update placement or drain node

**Hydra fails:**
- Swarm loses manager → cluster becomes unavailable
- In production, promote chimera/cerberus to manager for HA:
  ```bash
  docker exec hydra-node docker node promote chimera-node
  docker exec hydra-node docker node promote cerberus-node
  ```

### Testing Failover

```bash
# Drain chimera (simulate failure)
make test-failure NODE=chimera

# Watch services redistribute
make swarm-status

# Restore chimera
make restore-node NODE=chimera
```

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker exec hydra-node docker service ps core_hydra-saml-auth --no-trunc

# View logs
docker exec hydra-node docker service logs core_hydra-saml-auth

# Inspect service
docker exec hydra-node docker service inspect core_hydra-saml-auth
```

### Network Issues

```bash
# Verify overlay networks
docker exec hydra-node docker network ls --filter driver=overlay

# Inspect network
docker exec hydra-node docker network inspect hydra_public

# Test connectivity between services
docker exec $(docker exec hydra-node docker ps -q -f name=core_traefik) \
  ping hydra-saml-auth
```

### Image Not Found

```bash
# Check images on hydra-node
docker exec hydra-node docker images

# Load image manually
docker save hydra-saml-auth:latest | \
  docker exec -i hydra-node docker load
```

### Volume Issues

```bash
# List volumes
docker exec hydra-node docker volume ls

# Inspect volume
docker exec hydra-node docker volume inspect student-john-ml-project

# Check NFS mount
docker exec hydra-node mount | grep nfs
```

## Production Differences

For production deployment on actual hardware:

1. **GPU Support**
   - Uncomment GPU resource reservations in [gpu-services.yml](gpu-services.yml)
   - Ensure NVIDIA Docker runtime is installed

2. **TLS/HTTPS**
   - Add TLS configuration to Traefik
   - Use Let's Encrypt for certificates

3. **High Availability**
   - Promote all 3 nodes to managers
   - Use odd number of managers (3 or 5)

4. **Persistent Storage**
   - Use dedicated NFS server or cloud storage
   - Set up backup strategy for volumes

5. **Resource Limits**
   - Adjust CPU/memory limits in student-template
   - Implement quotas per user tier

6. **Monitoring**
   - Add Prometheus/Grafana stack
   - Set up log aggregation

## Next Steps

After deploying stacks:
1. Test student container creation via Hydra API
2. Implement NFS volume creation in hydra-saml-auth code
3. Update routes/containers.js to use Swarm service API
4. Test failover scenarios
5. Performance testing with multiple student containers

See [../SWARM.md](../SWARM.md) for complete documentation.
