#!/bin/bash

#########################################
# Cleanup Docker Swarm and DinD nodes
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
║      Docker Swarm Cleanup (3-Node Dev)    ║
╔════════════════════════════════════════════╗
${NC}"

# Check if nodes are running
check_nodes() {
    echo -e "${GREEN}Checking for running DinD nodes...${NC}"
    RUNNING_NODES=0

    for node in hydra-node chimera-node cerberus-node; do
        if docker ps --filter "name=$node" --format '{{.Names}}' | grep -q "$node"; then
            echo -e "${YELLOW}  Found: $node${NC}"
            RUNNING_NODES=$((RUNNING_NODES + 1))
        fi
    done

    if [ $RUNNING_NODES -eq 0 ]; then
        echo -e "${YELLOW}No DinD nodes are running${NC}"
        return 1
    fi

    return 0
}

# Leave swarm on worker nodes
leave_workers() {
    echo -e "${GREEN}Removing worker nodes from swarm...${NC}"

    for node in chimera-node cerberus-node; do
        if docker ps --filter "name=$node" --format '{{.Names}}' | grep -q "$node"; then
            if docker exec $node docker info 2>/dev/null | grep -q "Swarm: active"; then
                echo -e "${BLUE}  Removing $node from swarm...${NC}"
                docker exec $node docker swarm leave --force 2>/dev/null || true
                echo -e "${GREEN}  ✓ $node left swarm${NC}"
            else
                echo -e "${YELLOW}  $node is not part of swarm${NC}"
            fi
        fi
    done
}

# Leave swarm on manager node
leave_manager() {
    echo -e "${GREEN}Removing manager node from swarm...${NC}"

    if docker ps --filter "name=hydra-node" --format '{{.Names}}' | grep -q "hydra-node"; then
        if docker exec hydra-node docker info 2>/dev/null | grep -q "Swarm: active"; then
            echo -e "${BLUE}  Removing hydra-node from swarm...${NC}"
            docker exec hydra-node docker swarm leave --force 2>/dev/null || true
            echo -e "${GREEN}  ✓ hydra-node left swarm${NC}"
        else
            echo -e "${YELLOW}  hydra-node is not part of swarm${NC}"
        fi
    fi
}

# Stop all DinD nodes
stop_nodes() {
    echo -e "${GREEN}Stopping DinD nodes...${NC}"

    cd "$(dirname "$0")"
    if [ -f "docker-compose.nodes.yml" ]; then
        if docker compose -f docker-compose.nodes.yml down; then
            echo -e "${GREEN}  ✓ DinD nodes stopped${NC}"
        else
            echo -e "${RED}Error: Failed to stop DinD nodes${NC}"
            return 1
        fi
    else
        echo -e "${RED}Error: docker-compose.nodes.yml not found${NC}"
        return 1
    fi
}

# Remove volumes (optional)
remove_volumes() {
    echo -e "${YELLOW}
Do you want to remove all volumes? This will delete all data.${NC}"
    read -p "Remove volumes? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Removing volumes...${NC}"
        cd "$(dirname "$0")"
        if docker compose -f docker-compose.nodes.yml down -v; then
            echo -e "${GREEN}  ✓ Volumes removed${NC}"
        else
            echo -e "${RED}Warning: Some volumes may not have been removed${NC}"
        fi
    else
        echo -e "${YELLOW}  Volumes preserved${NC}"
    fi
}

# Main execution
main() {
    if check_nodes; then
        leave_workers
        leave_manager
        stop_nodes
        remove_volumes
    else
        echo -e "${YELLOW}Nothing to clean up${NC}"
    fi

    echo -e "${GREEN}
╔════════════════════════════════════════════╗
║         Cleanup Complete! 🧹               ║
╔════════════════════════════════════════════╗

To start fresh:
1. Start nodes:
   ${YELLOW}docker compose -f dev/swarm/docker-compose.nodes.yml up -d${NC}

2. Initialize swarm:
   ${YELLOW}./dev/swarm/init-swarm.sh${NC}

${NC}"
}

# Run main
main "$@"
