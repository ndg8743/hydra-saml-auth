#!/bin/bash

#########################################
# Build custom Docker images for swarm
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
║       Building Custom Images              ║
╔════════════════════════════════════════════╗
${NC}"

# Change to project root
cd "$(dirname "$0")/../.."

# Build hydra-saml-auth
build_hydra() {
    echo -e "${GREEN}Building hydra-saml-auth image...${NC}"

    docker build \
        -t hydra-saml-auth:latest \
        -f dev/Dockerfile.hydra \
        .

    echo -e "${GREEN}  ✓ hydra-saml-auth built${NC}"
}

# Build openwebui-middleman
build_middleman() {
    echo -e "${GREEN}Building openwebui-middleman image...${NC}"

    docker build \
        -t hydra-openwebui-middleman:latest \
        -f dev/Dockerfile.middleman \
        .

    echo -e "${GREEN}  ✓ openwebui-middleman built${NC}"
}

# Show built images
show_images() {
    echo -e "${BLUE}
╔════════════════════════════════════════════╗
║          Built Images                      ║
╔════════════════════════════════════════════╗
${NC}"

    docker images | grep -E "hydra-saml-auth|hydra-openwebui-middleman"
}

# Main execution
main() {
    build_hydra
    build_middleman
    show_images

    echo -e "${GREEN}
╔════════════════════════════════════════════╗
║       Build Complete! 🎉                   ║
╔════════════════════════════════════════════╗

Images ready for deployment:
  - hydra-saml-auth:latest
  - hydra-openwebui-middleman:latest

Next steps:
1. Deploy to swarm:
   ${YELLOW}./dev/scripts/deploy-stacks.sh${NC}

2. Or load into swarm manually:
   ${YELLOW}docker save hydra-saml-auth:latest | docker exec -i hydra-node docker load${NC}

${NC}"
}

# Run main
main "$@"
