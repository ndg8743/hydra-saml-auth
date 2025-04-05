#!/bin/bash
# webui-db-query.sh
# This script safely passes SQLite commands to the OpenWebUI database inside the Docker container

# The first argument is the SQL command to execute
SQL_COMMAND="$1"

# Execute the command in the container
docker exec -i open-webui sh -c "sqlite3 /app/backend/data/webui.db <<EOF
$SQL_COMMAND
EOF"

# Exit with the same status as the Docker command
exit $?