# Hydra SAML Auth - Development Makefile

.PHONY: help setup start stop restart logs clean reset shell test swarm-up swarm-init swarm-down swarm-status swarm-clean nodes-up nodes-down nodes-logs

# Default target
help:
	@echo "╔════════════════════════════════════════════╗"
	@echo "║   Hydra SAML Auth - Development Commands  ║"
	@echo "╔════════════════════════════════════════════╗"
	@echo ""
	@echo "Single-Node Development:"
	@echo "  make setup       - Initial setup (hosts, keys, etc)"
	@echo "  make start       - Start all services"
	@echo "  make stop        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View logs (all services)"
	@echo "  make logs-hydra  - View Hydra service logs"
	@echo "  make shell-hydra - Shell into Hydra container"
	@echo "  make shell-db    - SQLite shell for OpenWebUI DB"
	@echo "  make clean       - Stop and remove containers"
	@echo "  make reset       - Full reset (removes volumes too)"
	@echo "  make test-saml   - Test SAML authentication flow"
	@echo ""
	@echo "Docker Swarm (Multi-Node):"
	@echo "  make swarm-up      - Start nodes and initialize swarm"
	@echo "  make swarm-init    - Initialize swarm on running nodes"
	@echo "  make swarm-down    - Stop swarm and nodes"
	@echo "  make swarm-status  - Show swarm status dashboard"
	@echo "  make swarm-clean   - Clean up swarm and remove volumes"
	@echo "  make nodes-up      - Start DinD nodes only"
	@echo "  make nodes-down    - Stop DinD nodes"
	@echo "  make nodes-logs    - View node logs"
	@echo ""
	@echo "Swarm Stack Deployment:"
	@echo "  make build-swarm-images - Build custom images for swarm"
	@echo "  make deploy-all-stacks  - Deploy all stacks to swarm"
	@echo "  make remove-all-stacks  - Remove all stacks from swarm"
	@echo "  make swarm-logs SERVICE=<name> - View service logs"
	@echo ""
	@echo "Swarm Utilities:"
	@echo "  make nfs-status      - Check NFS server status"
	@echo "  make exec-hydra      - Shell on hydra-node"
	@echo "  make exec-chimera    - Shell on chimera-node"
	@echo "  make exec-cerberus   - Shell on cerberus-node"
	@echo "  make test-failure NODE=<name> - Simulate node failure"
	@echo "  make restore-node NODE=<name> - Restore drained node"
	@echo ""

# Cross-platform sleep - use powershell on Windows, sleep on Unix
ifeq ($(OS),Windows_NT)
    SLEEP_CMD=powershell -Command "Start-Sleep -Seconds 10"
else
    SLEEP_CMD=sleep 10
endif

# Initial setup
setup:
	@chmod +x setup-dev.sh
	@./setup-dev.sh

# Start services
start:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Services starting..."
	@echo "Waiting for services to be ready..."
	@$(SLEEP_CMD)
	@echo "✓ Services should be available at:"
	@echo "  - Main app:  http://hydra.local/dashboard"
	@echo "  - OpenWebUI: http://gpt.hydra.local"
	@echo "  - Mock SAML: http://mock-saml-idp"
	@echo "  - Traefik:   http://traefik.hydra.local"

# Start with logs
start-logs:
	docker compose -f docker-compose.dev.yml up

# Stop services
stop:
	docker compose -f docker-compose.dev.yml stop

# Restart services
restart:
	docker compose -f docker-compose.dev.yml restart

# View logs
logs:
	docker compose -f docker-compose.dev.yml logs -f

logs-hydra:
	docker compose -f docker-compose.dev.yml logs -f hydra-saml-auth

logs-webui:
	docker compose -f docker-compose.dev.yml logs -f open-webui

logs-middleman:
	docker compose -f docker-compose.dev.yml logs -f openwebui-middleman

# Shell access
shell-hydra:
	docker compose -f docker-compose.dev.yml exec hydra-saml-auth /bin/bash

shell-webui:
	docker compose -f docker-compose.dev.yml exec open-webui /bin/bash

shell-db:
	docker compose -f docker-compose.dev.yml exec openwebui-middleman sqlite3 /app/data/webui.db

keys-windows:
	docker compose -f docker-compose.windows.yml run --rm hydra-saml-auth sh -lc "mkdir -p /app/jwt-keys && openssl genrsa -out /app/jwt-keys/private.pem 2048 && openssl rsa -in /app/jwt-keys/private.pem -pubout -out /app/jwt-keys/public.pem"

# Clean up
clean:
	docker compose -f docker-compose.dev.yml down

reset:
	docker compose -f docker-compose.dev.yml down -v
	rm -rf jwt-keys/
	@echo "Full reset complete. Run 'make setup' to reinitialize."

# Rebuild specific services
rebuild-hydra:
	docker compose -f docker-compose.dev.yml build hydra-saml-auth
	docker compose -f docker-compose.dev.yml up -d hydra-saml-auth

rebuild-middleman:
	docker compose -f docker-compose.dev.yml build openwebui-middleman
	docker compose -f docker-compose.dev.yml up -d openwebui-middleman

# Test SAML flow
test-saml:
	@echo "Testing SAML authentication..."
	@echo "1. Visit: http://hydra.local:6969/login"
	@echo "2. You'll be redirected to mock SAML IdP"
	@echo "3. Login with: user1 / user1pass"
	@echo "4. You should be redirected back to dashboard"
	@curl -I http://hydra.local:6969/login

# Pull latest images
pull:
	docker compose -f docker-compose.dev.yml pull

# Show running containers
ps:
	docker compose -f docker-compose.dev.yml ps

# Check service health
health:
	@echo "Checking service health..."
	@curl -s -o /dev/null -w "Hydra: %{http_code}\n" http://localhost:6969/health || echo "Hydra: DOWN"
	@curl -s -o /dev/null -w "OpenWebUI: %{http_code}\n" http://localhost:3000 || echo "OpenWebUI: DOWN"
	@curl -s -o /dev/null -w "Mock SAML: %{http_code}\n" http://localhost:8080 || echo "Mock SAML: DOWN"
	@curl -s -o /dev/null -w "Middleman: %{http_code}\n" http://localhost:7070/openwebui/health || echo "Middleman: DOWN"

#############################################
# Docker Swarm Multi-Node Commands
#############################################

# Start nodes and initialize swarm
swarm-up: nodes-up swarm-init
	@echo "✓ Swarm is up and ready!"

# Initialize swarm on running nodes
swarm-init:
	@echo "Initializing swarm..."
	@bash swarm/init-swarm.sh

# Stop swarm and nodes
swarm-down:
	@echo "Stopping swarm..."
	@bash swarm/cleanup-swarm.sh

# Show swarm status dashboard
swarm-status:
	@bash scripts/swarm-status.sh

# Clean up swarm and remove volumes
swarm-clean:
	@echo "Cleaning up swarm..."
	@bash swarm/cleanup-swarm.sh
	@docker compose -f swarm/docker-compose.nodes.yml down -v

# Start DinD nodes only
nodes-up:
	@echo "Starting DinD nodes..."
	@docker compose -f swarm/docker-compose.nodes.yml up -d
	@echo "Waiting for nodes to be ready..."
	@$(SLEEP_CMD)
	@echo "✓ Nodes are running"

# Stop DinD nodes
nodes-down:
	@echo "Stopping DinD nodes..."
	@docker compose -f swarm/docker-compose.nodes.yml down

# View node logs
nodes-logs:
	@docker compose -f swarm/docker-compose.nodes.yml logs -f

# NFS server status
nfs-status:
	@echo "NFS Server Status:"
	@docker exec nfs-server exportfs -v 2>/dev/null || echo "NFS server is not running"

# Shell access to nodes
exec-hydra:
	@docker exec -it hydra-node sh

exec-chimera:
	@docker exec -it chimera-node sh

exec-cerberus:
	@docker exec -it cerberus-node sh

# Deploy a stack to swarm
deploy-stack:
	@if [ -z "$(STACK)" ] || [ -z "$(FILE)" ]; then \
		echo "Usage: make deploy-stack STACK=<name> FILE=<path>"; \
		exit 1; \
	fi
	@echo "Deploying stack $(STACK) from $(FILE)..."
	@docker exec hydra-node docker stack deploy -c $(FILE) $(STACK)

# Remove a stack from swarm
remove-stack:
	@if [ -z "$(STACK)" ]; then \
		echo "Usage: make remove-stack STACK=<name>"; \
		exit 1; \
	fi
	@echo "Removing stack $(STACK)..."
	@docker exec hydra-node docker stack rm $(STACK)

# Test node failure
test-failure:
	@if [ -z "$(NODE)" ]; then \
		echo "Usage: make test-failure NODE=<chimera|cerberus>"; \
		exit 1; \
	fi
	@echo "Simulating failure on $(NODE)-node..."
	@docker exec hydra-node docker node update --availability drain $(NODE)-node
	@echo "✓ $(NODE)-node drained. Services should redistribute."
	@echo "To restore: make restore-node NODE=$(NODE)"

# Restore a drained node
restore-node:
	@if [ -z "$(NODE)" ]; then \
		echo "Usage: make restore-node NODE=<chimera|cerberus>"; \
		exit 1; \
	fi
	@echo "Restoring $(NODE)-node..."
	@docker exec hydra-node docker node update --availability active $(NODE)-node
	@echo "✓ $(NODE)-node is now active"

#############################################
# Stack Deployment Commands
#############################################

# Build custom images for swarm
build-swarm-images:
	@echo "Building custom images..."
	@bash scripts/build-images.sh

# Deploy all stacks to swarm
deploy-all-stacks:
	@echo "Deploying all stacks to swarm..."
	@bash scripts/deploy-stacks.sh

# Remove all stacks from swarm
remove-all-stacks:
	@echo "Removing all stacks from swarm..."
	@bash scripts/remove-stacks.sh

# View service logs
swarm-logs:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Usage: make swarm-logs SERVICE=<service-name>"; \
		echo "Example: make swarm-logs SERVICE=core_hydra-saml-auth"; \
		echo ""; \
		echo "Available services:"; \
		docker exec hydra-node docker service ls --format "  - {{.Name}}"; \
		exit 1; \
	fi
	@docker exec hydra-node docker service logs -f $(SERVICE)
