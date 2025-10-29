#!/bin/bash

#########################################
# Remove all stacks from Docker Swarm
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
║      Removing Stacks from Swarm           ║
╔════════════════════════════════════════════╗
${NC}"

# Check if swarm is initialized
check_swarm() {
    echo -e "${GREEN}Checking swarm status...${NC}"
    if ! docker exec hydra-node docker info 2>/dev/null | grep -q "Swarm: active"; then
        echo -e "${YELLOW}Swarm is not active, nothing to remove${NC}"
        exit 0
    fi
    echo -e "${GREEN}  ✓ Swarm is active${NC}"
}

# List current stacks
list_stacks() {
    echo -e "${GREEN}Current stacks:${NC}"
    docker exec hydra-node docker stack ls
    echo ""
}

# Remove GPU services stack
remove_gpu() {
    echo -e "${GREEN}Removing GPU services stack...${NC}"

    if docker exec hydra-node docker stack ls | grep -q "gpu"; then
        docker exec hydra-node docker stack rm gpu
        echo -e "${GREEN}  ✓ GPU services stack removed${NC}"
    else
        echo -e "${YELLOW}  GPU stack not found${NC}"
    fi
}

# Remove core services stack
remove_core() {
    echo -e "${GREEN}Removing core services stack...${NC}"

    if docker exec hydra-node docker stack ls | grep -q "core"; then
        docker exec hydra-node docker stack rm core
        echo -e "${GREEN}  ✓ Core services stack removed${NC}"
    else
        echo -e "${YELLOW}  Core stack not found${NC}"
    fi
}

# Wait for services to be removed
wait_for_removal() {
    echo -e "${GREEN}Waiting for services to be removed...${NC}"

    for i in {1..30}; do
        REMAINING=$(docker exec hydra-node docker service ls -q 2>/dev/null | wc -l || echo "0")
        if [ "$REMAINING" -eq 0 ]; then
            echo -e "${GREEN}  ✓ All services removed${NC}"
            return 0
        fi
        echo -e "${YELLOW}  Waiting for $REMAINING services to stop... ($i/30)${NC}"
        sleep 2
    done

    echo -e "${YELLOW}  Warning: Some services may still be stopping${NC}"
}

# Remove volumes (optional)
remove_volumes() {
    echo -e "${YELLOW}
Do you want to remove volumes? This will delete all data.${NC}"
    read -p "Remove volumes? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Removing volumes...${NC}"

        # List and remove volumes
        VOLUMES=$(docker exec hydra-node docker volume ls -q | grep -E "core_|gpu_" || true)
        if [ -n "$VOLUMES" ]; then
            echo "$VOLUMES" | while read vol; do
                echo -e "${BLUE}  Removing volume: $vol${NC}"
                docker exec hydra-node docker volume rm "$vol" 2>/dev/null || true
            done
            echo -e "${GREEN}  ✓ Volumes removed${NC}"
        else
            echo -e "${YELLOW}  No volumes to remove${NC}"
        fi
    else
        echo -e "${YELLOW}  Volumes preserved${NC}"
    fi
}

# Remove networks (optional)
remove_networks() {
    echo -e "${YELLOW}
Do you want to remove overlay networks?${NC}"
    read -p "Remove networks? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Removing overlay networks...${NC}"

        for net in hydra_public hydra_students; do
            if docker exec hydra-node docker network ls | grep -q "$net"; then
                echo -e "${BLUE}  Removing network: $net${NC}"
                docker exec hydra-node docker network rm "$net" 2>/dev/null || true
            fi
        done

        echo -e "${GREEN}  ✓ Networks removed${NC}"
    else
        echo -e "${YELLOW}  Networks preserved${NC}"
    fi
}

# Show final status
show_status() {
    echo -e "${BLUE}
╔════════════════════════════════════════════╗
║          Removal Status                    ║
╔════════════════════════════════════════════╗
${NC}"

    echo -e "${GREEN}Remaining services:${NC}"
    docker exec hydra-node docker service ls || echo "  (none)"

    echo ""
    echo -e "${GREEN}Remaining volumes:${NC}"
    docker exec hydra-node docker volume ls | grep -E "core_|gpu_" || echo "  (none)"

    echo ""
    echo -e "${GREEN}Overlay networks:${NC}"
    docker exec hydra-node docker network ls --filter driver=overlay
}

# Main execution
main() {
    check_swarm
    list_stacks

    # Remove stacks
    remove_gpu
    remove_core

    wait_for_removal
    remove_volumes
    remove_networks
    show_status

    echo -e "${GREEN}
╔════════════════════════════════════════════╗
║       Stacks Removed! 🧹                   ║
╔════════════════════════════════════════════╗

To redeploy:
  ${YELLOW}./dev/scripts/deploy-stacks.sh${NC}

To check swarm status:
  ${YELLOW}make swarm-status${NC}

${NC}"
}

# Run main
main "$@"
