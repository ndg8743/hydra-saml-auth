#!/bin/bash

#########################################
# Initialize Docker Swarm on DinD nodes
#########################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}
╔════════════════════════════════════════════╗
║  Docker Swarm Initialization (3-Node Dev) ║
╔════════════════════════════════════════════╗
${NC}"

# Check if nodes are running
check_nodes() {
    echo -e "${GREEN}Checking if DinD nodes are running...${NC}"

    for node in hydra-node chimera-node cerberus-node; do
        if ! docker exec $node docker info >/dev/null 2>&1; then
            echo -e "${RED}Error: $node is not running or Docker daemon is not ready${NC}"
            echo -e "${YELLOW}Please start nodes with: docker compose -f dev/swarm/docker-compose.nodes.yml up -d${NC}"
            exit 1
        fi
        echo -e "${GREEN}  ✓ $node is running${NC}"
    done
}

# Initialize swarm on hydra node (manager)
init_swarm() {
    echo -e "${GREEN}Initializing swarm on hydra-node (manager)...${NC}"

    # Check if already initialized
    if docker exec hydra-node docker info 2>/dev/null | grep -q "Swarm: active"; then
        echo -e "${YELLOW}Swarm already initialized on hydra-node${NC}"
        return 0
    fi

    # Initialize swarm
    docker exec hydra-node docker swarm init \
        --advertise-addr 172.30.0.10 \
        --listen-addr 172.30.0.10:2377

    echo -e "${GREEN}  ✓ Swarm initialized on hydra-node${NC}"
}

# Get worker join token
get_worker_token() {
    echo -e "${GREEN}Getting worker join token...${NC}"
    WORKER_TOKEN=$(docker exec hydra-node docker swarm join-token worker -q)
    echo -e "${GREEN}  ✓ Worker token obtained${NC}"
}

# Join worker nodes to swarm
join_workers() {
    echo -e "${GREEN}Joining worker nodes to swarm...${NC}"

    for node in chimera-node cerberus-node; do
        # Check if already joined
        if docker exec $node docker info 2>/dev/null | grep -q "Swarm: active"; then
            echo -e "${YELLOW}  $node is already part of swarm${NC}"
            continue
        fi

        echo -e "${BLUE}  Joining $node...${NC}"
        docker exec $node docker swarm join \
            --token $WORKER_TOKEN \
            172.30.0.10:2377

        echo -e "${GREEN}  ✓ $node joined swarm${NC}"
    done
}

# Label nodes with their roles
label_nodes() {
    echo -e "${GREEN}Labeling nodes with roles...${NC}"

    # Label hydra as manager with NFS storage
    docker exec hydra-node docker node update \
        --label-add role=manager \
        --label-add storage=nfs \
        hydra-node
    echo -e "${GREEN}  ✓ hydra-node: role=manager, storage=nfs${NC}"

    # Label chimera as worker with GPU (for Jupyter)
    CHIMERA_ID=$(docker exec hydra-node docker node ls --filter "name=chimera-node" -q)
    if [ -n "$CHIMERA_ID" ]; then
        docker exec hydra-node docker node update \
            --label-add role=worker \
            --label-add gpu=true \
            --label-add workload=jupyter \
            $CHIMERA_ID
        echo -e "${GREEN}  ✓ chimera-node: role=worker, gpu=true, workload=jupyter${NC}"
    fi

    # Label cerberus as worker with GPU (for Ollama)
    CERBERUS_ID=$(docker exec hydra-node docker node ls --filter "name=cerberus-node" -q)
    if [ -n "$CERBERUS_ID" ]; then
        docker exec hydra-node docker node update \
            --label-add role=worker \
            --label-add gpu=true \
            --label-add workload=ollama \
            $CERBERUS_ID
        echo -e "${GREEN}  ✓ cerberus-node: role=worker, gpu=true, workload=ollama${NC}"
    fi
}

# Show swarm status
show_status() {
    echo -e "${BLUE}
╔════════════════════════════════════════════╗
║           Swarm Status                     ║
╔════════════════════════════════════════════╗
${NC}"

    echo -e "${GREEN}Nodes:${NC}"
    docker exec hydra-node docker node ls

    echo ""
    echo -e "${GREEN}Node Labels:${NC}"
    for node in hydra-node chimera-node cerberus-node; do
        echo -e "${BLUE}$node:${NC}"
        NODE_ID=$(docker exec hydra-node docker node ls --filter "name=$node" -q)
        if [ -n "$NODE_ID" ]; then
            docker exec hydra-node docker node inspect $NODE_ID \
                --format '{{range $k, $v := .Spec.Labels}}  {{$k}}={{$v}}{{println}}{{end}}'
        fi
    done
}

# Main execution
main() {
    check_nodes
    init_swarm
    get_worker_token
    join_workers
    label_nodes
    show_status

    echo -e "${GREEN}
╔════════════════════════════════════════════╗
║     Swarm Initialization Complete! 🎉     ║
╔════════════════════════════════════════════╗

Next steps:
1. Deploy services to the swarm:
   ${YELLOW}docker exec hydra-node docker stack deploy -c /path/to/stack.yml mystack${NC}

2. Check swarm status anytime:
   ${YELLOW}./dev/scripts/swarm-status.sh${NC}

3. View service logs:
   ${YELLOW}docker exec hydra-node docker service logs <service-name>${NC}

${BLUE}Tip: All swarm commands should be run on hydra-node (manager)${NC}
${NC}"
}

# Run main
main "$@"
