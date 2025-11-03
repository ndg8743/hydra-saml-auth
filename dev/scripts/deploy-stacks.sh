#!/bin/bash

#########################################
# Deploy all stacks to Docker Swarm
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
║      Deploying Stacks to Swarm            ║
╔════════════════════════════════════════════╗
${NC}"

# Check if swarm is initialized
check_swarm() {
    echo -e "${GREEN}Checking swarm status...${NC}"
    if ! docker exec hydra-node docker info 2>/dev/null | grep -q "Swarm: active"; then
        echo -e "${RED}Error: Swarm is not initialized${NC}"
        echo -e "${YELLOW}Run: make swarm-up${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Swarm is active${NC}"
}

# Build custom images
build_images() {
    echo -e "${GREEN}Building custom images...${NC}"

    # Build hydra-saml-auth image
    echo -e "${BLUE}  Building hydra-saml-auth...${NC}"
    if ! docker build -t hydra-saml-auth:latest -f Dockerfile.hydra ..; then
        echo -e "${RED}Error: Failed to build hydra-saml-auth image${NC}"
        exit 1
    fi

    # Build openwebui-middleman image
    echo -e "${BLUE}  Building openwebui-middleman...${NC}"
    if ! docker build -t hydra-openwebui-middleman:latest -f Dockerfile.middleman ..; then
        echo -e "${RED}Error: Failed to build openwebui-middleman image${NC}"
        exit 1
    fi

    echo -e "${GREEN}  ✓ Images built successfully${NC}"
}

# Load images into swarm nodes
load_images() {
    echo -e "${GREEN}Loading images into swarm nodes...${NC}"

    # Save images to tar files
    echo -e "${BLUE}  Saving images...${NC}"
    if ! docker save hydra-saml-auth:latest | gzip > /tmp/hydra-saml-auth.tar.gz; then
        echo -e "${RED}Error: Failed to save hydra-saml-auth image${NC}"
        exit 1
    fi
    if ! docker save hydra-openwebui-middleman:latest | gzip > /tmp/hydra-openwebui-middleman.tar.gz; then
        echo -e "${RED}Error: Failed to save openwebui-middleman image${NC}"
        rm -f /tmp/hydra-saml-auth.tar.gz
        exit 1
    fi

    # Load into hydra-node
    echo -e "${BLUE}  Loading into hydra-node...${NC}"
    if ! gunzip -c /tmp/hydra-saml-auth.tar.gz | docker exec -i hydra-node docker load; then
        echo -e "${RED}Error: Failed to load hydra-saml-auth into swarm${NC}"
        rm -f /tmp/hydra-saml-auth.tar.gz /tmp/hydra-openwebui-middleman.tar.gz
        exit 1
    fi
    if ! gunzip -c /tmp/hydra-openwebui-middleman.tar.gz | docker exec -i hydra-node docker load; then
        echo -e "${RED}Error: Failed to load openwebui-middleman into swarm${NC}"
        rm -f /tmp/hydra-saml-auth.tar.gz /tmp/hydra-openwebui-middleman.tar.gz
        exit 1
    fi

    # Cleanup
    rm -f /tmp/hydra-saml-auth.tar.gz /tmp/hydra-openwebui-middleman.tar.gz

    echo -e "${GREEN}  ✓ Images loaded successfully into swarm${NC}"
}

# Create overlay networks
create_networks() {
    echo -e "${GREEN}Creating overlay networks...${NC}"

    # Check if networks already exist
    if docker exec hydra-node docker network ls | grep -q "hydra_public"; then
        echo -e "${YELLOW}  Networks already exist, skipping...${NC}"
        return 0
    fi

    # Networks will be created automatically by stack deployment
    echo -e "${GREEN}  Networks will be created by stack deployment${NC}"
}

# Deploy core services stack
deploy_core() {
    echo -e "${GREEN}Deploying core services stack...${NC}"

    # Copy stack file to hydra-node
    if ! docker cp ../stacks/core-services.yml hydra-node:/tmp/; then
        echo -e "${RED}Error: Failed to copy core-services.yml to swarm node${NC}"
        exit 1
    fi

    # Deploy stack
    if ! docker exec hydra-node docker stack deploy -c /tmp/core-services.yml core; then
        echo -e "${RED}Error: Failed to deploy core services stack${NC}"
        exit 1
    fi

    echo -e "${GREEN}  ✓ Core services deployed${NC}"
}

# Deploy GPU services stack
deploy_gpu() {
    echo -e "${GREEN}Deploying GPU services stack...${NC}"

    # Copy stack file to hydra-node
    if ! docker cp ../stacks/gpu-services.yml hydra-node:/tmp/; then
        echo -e "${RED}Error: Failed to copy gpu-services.yml to swarm node${NC}"
        exit 1
    fi

    # Deploy stack
    if ! docker exec hydra-node docker stack deploy -c /tmp/gpu-services.yml gpu; then
        echo -e "${RED}Error: Failed to deploy GPU services stack${NC}"
        exit 1
    fi

    echo -e "${GREEN}  ✓ GPU services deployed${NC}"
}

# Wait for services to be ready
wait_for_services() {
    echo -e "${GREEN}Waiting for services to be ready...${NC}"

    # Give services time to start
    for i in {1..30}; do
        READY=$(docker exec hydra-node docker service ls --filter "label=com.docker.stack.namespace=core" --format "{{.Replicas}}" | grep -c "1/1" || true)
        if [ "$READY" -ge 4 ]; then
            echo -e "${GREEN}  ✓ Services are ready${NC}"
            return 0
        fi
        echo -e "${YELLOW}  Waiting... ($i/30)${NC}"
        sleep 2
    done

    echo -e "${YELLOW}  Warning: Some services may still be starting${NC}"
}

# Show deployment status
show_status() {
    echo -e "${BLUE}
╔════════════════════════════════════════════╗
║          Deployment Status                 ║
╔════════════════════════════════════════════╗
${NC}"

    echo -e "${GREEN}Services:${NC}"
    docker exec hydra-node docker service ls

    echo ""
    echo -e "${GREEN}Service Placement:${NC}"
    docker exec hydra-node docker service ps --filter "desired-state=running" \
        --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}" \
        $(docker exec hydra-node docker service ls -q)
}

# Main execution
main() {
    check_swarm

    # Ask user if they want to build images
    read -p "Build custom images? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        build_images
        load_images
    else
        echo -e "${YELLOW}Skipping image build. Make sure images exist in swarm nodes.${NC}"
    fi

    create_networks
    deploy_core

    echo -e "${YELLOW}Waiting for core services to initialize...${NC}"
    sleep 10

    deploy_gpu
    wait_for_services
    show_status

    echo -e "${GREEN}
╔════════════════════════════════════════════╗
║      Deployment Complete! 🎉               ║
╔════════════════════════════════════════════╗

Access Points:
  - Hydra Auth:     ${YELLOW}http://hydra.local:6969${NC}
  - OpenWebUI:      ${YELLOW}http://gpt.hydra.local${NC}
  - Traefik:        ${YELLOW}http://traefik.hydra.local:8081${NC}
  - Mock SAML IdP:  ${YELLOW}http://localhost:8080${NC}
  - n8n:            ${YELLOW}http://n8n.hydra.local${NC}

Check status:
  ${YELLOW}make swarm-status${NC}

View service logs:
  ${YELLOW}docker exec hydra-node docker service logs <service-name>${NC}

${NC}"
}

# Run main
main "$@"
