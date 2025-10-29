#!/bin/bash

#########################################
# Display Docker Swarm status
#########################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}
╔════════════════════════════════════════════╗
║       Docker Swarm Status Dashboard        ║
╔════════════════════════════════════════════╗
${NC}"

# Check if hydra-node is running
if ! docker ps --filter "name=hydra-node" --format '{{.Names}}' | grep -q "hydra-node"; then
    echo -e "${RED}Error: hydra-node is not running${NC}"
    echo -e "${YELLOW}Start nodes with: docker compose -f dev/swarm/docker-compose.nodes.yml up -d${NC}"
    exit 1
fi

# Check if swarm is initialized
if ! docker exec hydra-node docker info 2>/dev/null | grep -q "Swarm: active"; then
    echo -e "${YELLOW}Warning: Swarm is not initialized on hydra-node${NC}"
    echo -e "${YELLOW}Initialize with: ./dev/swarm/init-swarm.sh${NC}"
    exit 1
fi

# Display nodes
echo -e "${GREEN}═══════════════════ Swarm Nodes ═══════════════════${NC}"
docker exec hydra-node docker node ls
echo ""

# Display node details with labels
echo -e "${GREEN}════════════════ Node Labels & Roles ══════════════${NC}"
for node in hydra-node chimera-node cerberus-node; do
    NODE_ID=$(docker exec hydra-node docker node ls --filter "name=$node" -q 2>/dev/null)
    if [ -n "$NODE_ID" ]; then
        echo -e "${CYAN}$node:${NC}"

        # Get node status
        STATUS=$(docker exec hydra-node docker node inspect $NODE_ID --format '{{.Status.State}}')
        AVAILABILITY=$(docker exec hydra-node docker node inspect $NODE_ID --format '{{.Spec.Availability}}')
        ROLE=$(docker exec hydra-node docker node inspect $NODE_ID --format '{{.Spec.Role}}')

        echo -e "  Status: ${GREEN}$STATUS${NC}"
        echo -e "  Availability: ${GREEN}$AVAILABILITY${NC}"
        echo -e "  Role: ${GREEN}$ROLE${NC}"

        # Get labels
        echo -e "  Labels:"
        docker exec hydra-node docker node inspect $NODE_ID \
            --format '{{range $k, $v := .Spec.Labels}}    {{$k}}={{$v}}{{println}}{{end}}' || echo "    (none)"
        echo ""
    fi
done

# Display services
echo -e "${GREEN}═══════════════════ Services ══════════════════════${NC}"
SERVICES=$(docker exec hydra-node docker service ls --format '{{.Name}}' 2>/dev/null)
if [ -z "$SERVICES" ]; then
    echo -e "${YELLOW}No services deployed${NC}"
else
    docker exec hydra-node docker service ls
    echo ""

    # Show service placement
    echo -e "${GREEN}════════════════ Service Placement ════════════════${NC}"
    for service in $SERVICES; do
        echo -e "${CYAN}$service:${NC}"
        docker exec hydra-node docker service ps $service --format "  {{.Node}} ({{.CurrentState}})"
        echo ""
    done
fi

# Display networks
echo -e "${GREEN}═══════════════════ Networks ══════════════════════${NC}"
docker exec hydra-node docker network ls --filter driver=overlay
echo ""

# Display volumes
echo -e "${GREEN}═══════════════════ Volumes ═══════════════════════${NC}"
docker exec hydra-node docker volume ls
echo ""

# NFS server status
echo -e "${GREEN}═══════════════ NFS Server Status ═════════════════${NC}"
if docker ps --filter "name=nfs-server" --format '{{.Names}}' | grep -q "nfs-server"; then
    echo -e "${GREEN}NFS Server: Running${NC}"
    echo "Exports:"
    docker exec nfs-server exportfs -v 2>/dev/null || echo "  (unable to retrieve)"
else
    echo -e "${RED}NFS Server: Not running${NC}"
fi
echo ""

# Resource usage summary
echo -e "${GREEN}════════════════ Resource Usage ═══════════════════${NC}"
for node in hydra-node chimera-node cerberus-node; do
    if docker ps --filter "name=$node" --format '{{.Names}}' | grep -q "$node"; then
        echo -e "${CYAN}$node:${NC}"
        docker exec $node docker system df 2>/dev/null | tail -n +2 || echo "  (unable to retrieve)"
        echo ""
    fi
done

echo -e "${BLUE}
╔════════════════════════════════════════════╗
║              Quick Commands                ║
╔════════════════════════════════════════════╗

View service logs:
  ${YELLOW}docker exec hydra-node docker service logs <service-name>${NC}

Scale a service:
  ${YELLOW}docker exec hydra-node docker service scale <service-name>=<replicas>${NC}

Update a service:
  ${YELLOW}docker exec hydra-node docker service update <service-name>${NC}

Inspect a node:
  ${YELLOW}docker exec hydra-node docker node inspect <node-name>${NC}

Drain a node (for maintenance):
  ${YELLOW}docker exec hydra-node docker node update --availability drain <node-name>${NC}

Activate a node:
  ${YELLOW}docker exec hydra-node docker node update --availability active <node-name>${NC}

${NC}"
